"""Fit product demand in a child worker, split it to variants, and persist through lease-fenced writes."""
import json
import traceback
from datetime import datetime, timezone, date, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from prophet import Prophet
from database import get_pool
from jobs import job_connection, fail_owned_job, WORKER_OWNER
from config import (
    PROPHET_CONFIG,
    YEARLY_MIN_DAYS,
    HOLDOUT_DAYS,
    SHARE_WINDOW_DAYS,
    EVAL_ORIGINS,
)
from forecasting.services.data_loader import load_variant_daily_sales
from forecasting.services.metrics import compute_metrics, naive_baseline, weekly_metrics
from forecasting.services.holidays import philippine_holidays
from forecasting.services.allocation import size_shares, preparation_plan

# Business timezone — the whole web app follows the Asia/Manila calendar day.
BUSINESS_TZ = ZoneInfo("Asia/Manila")


def business_today() -> date:
    """Manila calendar day per business clock — never host-local date."""
    return datetime.now(BUSINESS_TZ).date()

MIN_DATA_DAYS = 7
KEEP_JOBS = 10


# ── Job management ────────────────────────────────────────────

async def update_job_progress(job_id: int, completed: int, failed: int):
    """Commit product counters only while this worker still owns a live job lease."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute(
            "UPDATE forecast_jobs SET completed = $1, failed = $2 WHERE id = $3",
            completed, failed, job_id,
        )


async def complete_job(job_id: int, total: int, completed: int, failed: int, failed_skips: list, scores=None):
    """Publish terminal counters and product scores together, releasing ownership in the same transaction."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute(
            """UPDATE forecast_jobs
               SET status = 'completed', total_variants = $1, completed = $2,
                   failed = $3, failed_skips = $4, completed_at = $5, product_scores = $6,
                   lease_owner = NULL, lease_expires_at = NULL
               WHERE id = $7""",
            total, completed, failed, failed_skips, datetime.now(timezone.utc), json.dumps(scores or []), job_id,
        )


async def fail_job(job_id: int, message: str):
    """Delegate conditional failure and partial-result cleanup using this worker's owner token."""
    await fail_owned_job("forecast", job_id, WORKER_OWNER.get(), message)


async def cleanup_old_jobs():
    """Retain the latest ten terminal jobs; running jobs are excluded from deletion."""
    pool = await get_pool()
    await pool.execute("""
        DELETE FROM forecast_jobs
        WHERE status <> 'running' AND id NOT IN (
            SELECT id FROM forecast_jobs WHERE status <> 'running' ORDER BY started_at DESC LIMIT $1
        )
    """, KEEP_JOBS)


# ── Result storage ────────────────────────────────────────────
# Variant rows carry the split forecast (units/revenue for prep + ingredients).
# Product-level RMSE/MAE/MSE/R2 live on the job as product_scores JSON.
# Each write verifies the live execution lease before touching forecast data.

async def save_result(job_id, variant_id, product_id, product_name, size_name, price,
                      category_id, daily_data, total_units, total_revenue,
                      days_of_data, share):
    """Upsert one variant result inside its live-owner transaction; model fitting is already finished."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute("""
            INSERT INTO forecast_results
                (job_id, variant_id, product_id, product_name, size_name, price, category_id,
                 daily_data, total_units, total_revenue, days_of_data, skipped, share)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE,$12)
            ON CONFLICT (job_id, variant_id) DO UPDATE SET
                daily_data = EXCLUDED.daily_data,
                total_units = EXCLUDED.total_units,
                total_revenue = EXCLUDED.total_revenue,
                product_id = EXCLUDED.product_id,
                share = EXCLUDED.share,
                skipped = FALSE, skip_reason = NULL
        """, job_id, variant_id, product_id, product_name, size_name, price,
             category_id, json.dumps(daily_data),
             total_units, total_revenue, days_of_data, share)


async def save_skipped(job_id, variant_id, product_name, size_name, price,
                       category_id, days_of_data, reason, product_id=None):
    """Replace a variant forecast with a zero-valued skip record while preserving product identity."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute("""
            INSERT INTO forecast_results
                (job_id, variant_id, product_name, size_name, price, category_id,
                 daily_data, total_units, total_revenue, trend, days_of_data, skipped, skip_reason, product_id)
            VALUES ($1,$2,$3,$4,$5,$6,'[]'::json,0,0,'stable',$7, TRUE, $8, $9)
            ON CONFLICT (job_id, variant_id) DO UPDATE SET
                skipped = TRUE, skip_reason = EXCLUDED.skip_reason,
                daily_data = '[]'::json, total_units = 0, total_revenue = 0,
                product_id = COALESCE(EXCLUDED.product_id, forecast_results.product_id)
        """, job_id, variant_id, product_name, size_name, price,
             category_id, days_of_data, reason, product_id)


# ── Prophet factory ───────────────────────────────────────────

_HOLIDAYS = None  # Cache a successful calendar; failed/empty construction is retried on the next model.


def build_prophet(n_days: int) -> Prophet:
    """Create a fresh model for each fit using shared settings and the cached holiday calendar."""
    global _HOLIDAYS
    if _HOLIDAYS is None:
        try:
            _HOLIDAYS = philippine_holidays()
        except Exception:
            _HOLIDAYS = None

    return Prophet(
        changepoint_prior_scale=PROPHET_CONFIG["changepoint_prior_scale"],
        seasonality_mode=PROPHET_CONFIG["seasonality_mode"],
        seasonality_prior_scale=PROPHET_CONFIG["seasonality_prior_scale"],
        weekly_seasonality=PROPHET_CONFIG["weekly_seasonality"],
        yearly_seasonality=n_days >= YEARLY_MIN_DAYS,  # needs ~2 full cycles to stay stable
        changepoint_range=PROPHET_CONFIG["changepoint_range"],
        interval_width=PROPHET_CONFIG["interval_width"],
        # Only point forecasts are published; avoid simulating unused uncertainty bands.
        uncertainty_samples=0,
        holidays=_HOLIDAYS,
        holidays_prior_scale=PROPHET_CONFIG["holidays_prior_scale"],
    )


FORECAST_PERIOD = 7


# ── Variance stabilization ─────────────────────────────────────
# Fit sqrt(units), then square nonnegative predictions before scoring/splitting.
# Scoring always happens in original units, so metrics stay comparable.

def _to_fit(df):
    """Copy the series and transform nonnegative counts; do not mutate the original training data."""
    out = df.copy()
    out["y"] = np.sqrt(out["y"].clip(lower=0))
    return out


def _from_fit(values):
    """Restore nonnegative demand units from model-space predictions."""
    return np.square(np.maximum(values, 0.0))


# ── Size-share split ──────────────────────────────────────────

async def run_demand_forecast(job_id: int) -> dict:
    """Fit/evaluate each product, split daily units to variants, and persist through short owned transactions."""
    period = FORECAST_PERIOD
    # Freeze the completed-day cutoff so midnight cannot change a running job.
    cutoff = business_today() - timedelta(days=1)

    try:
        df = await load_variant_daily_sales()
        if not df.empty:
            df = df[df["ds"] <= pd.Timestamp(cutoff)]

        if df.empty:
            await complete_job(job_id, 0, 0, 0, [])
            return {"job_id": job_id, "message": "No sales data found"}

        product_groups = df.groupby("product_id")
        total = len(product_groups)
        completed_count = 0
        failed_count = 0
        failed_skips = []
        product_scores = []

        await pool_update_total(job_id, total)

        for product_id, pdf in product_groups:
            try:
                product_name = pdf.iloc[0]["product_name"]
                variants = pdf.drop_duplicates("variant_id").to_dict("records")

                daily = pdf.groupby("ds")["units"].sum().reset_index()

                # Treat absent sales dates as zero demand through the last completed Manila day.
                # This is a modelling assumption; the loader cannot distinguish closure from no sales.
                all_dates = pd.date_range(start=pdf["ds"].min(), end=cutoff, freq="D")
                daily = (
                    pd.DataFrame({"ds": all_dates})
                    .merge(daily, on="ds", how="left")
                    .fillna(0)
                    .sort_values("ds")
                    .reset_index(drop=True)
                )
                daily["units"] = daily["units"].astype(int)
                days_of_data = len(daily)

                if days_of_data < MIN_DATA_DAYS or daily["units"].sum() == 0:
                    reason = (
                        f"Insufficient data ({days_of_data} days, need {MIN_DATA_DAYS})"
                        if days_of_data < MIN_DATA_DAYS
                        else "No actual sales in training data"
                    )
                    for v in variants:
                        await save_skipped(job_id, int(v["variant_id"]), product_name,
                                           v["size_name"], float(v["price"]),
                                           int(v["category_id"]), days_of_data, reason, str(product_id))
                    failed_count += 1
                    failed_skips.append(f"{product_name}: {reason}")
                    await update_job_progress(job_id, completed_count, failed_count)
                    continue

                train = daily[["ds", "units"]].rename(columns={"units": "y"})

                # Rolling-origin scoring uses non-overlapping hidden weeks (offsets 0/7/14d
                # at EVAL_ORIGINS=3; just offset 0 at =1 for fast routine
                # runs), each trained only on data before its window.
                # Daily metrics pool all pairs; weekly totals stay per-origin
                # for menu-level pooling + range. None when too short.
                ORIGIN_OFFSETS = tuple(7 * i for i in range(EVAL_ORIGINS))
                metrics = None
                week_list = []
                n_week_list = []
                n_daily_list = []
                variant_pairs = {int(v["variant_id"]): ([], []) for v in variants}
                if len(train) > HOLDOUT_DAYS + MIN_DATA_DAYS:
                    daily_preds, daily_actuals = [], []
                    for off in ORIGIN_OFFSETS:
                        end = len(train) - off
                        if end - HOLDOUT_DAYS <= MIN_DATA_DAYS:
                            continue  # older origin lacks training history
                        fit_df = train.iloc[:end - HOLDOUT_DAYS]
                        holdout_df = train.iloc[end - HOLDOUT_DAYS:end]
                        m_eval = build_prophet(len(fit_df))
                        m_eval.fit(_to_fit(fit_df))
                        eval_pred = m_eval.predict(
                            m_eval.make_future_dataframe(periods=HOLDOUT_DAYS)
                        ).tail(HOLDOUT_DAYS)[["ds", "yhat"]]
                        eval_pred["yhat"] = _from_fit(eval_pred["yhat"].values)
                        # Backtest the same integer preparation plan that we publish.
                        # Shares use only pre-origin sales, never the hidden week's mix.
                        origin_shares = size_shares(pdf, fit_df["ds"].max(), SHARE_WINDOW_DAYS)
                        variant_ids = list(variant_pairs)
                        plan = preparation_plan(eval_pred["yhat"], [origin_shares.get(vid, 0) for vid in variant_ids])
                        eval_pred["yhat"] = [sum(day) for day in plan]
                        for index, vid in enumerate(variant_ids):
                            predicted, actual = variant_pairs[vid]
                            predicted.extend(plan[day][index] for day in range(len(plan)))
                            observed = pdf[pdf["variant_id"] == vid].groupby("ds")["units"].sum()
                            actual.extend(float(observed.get(day, 0)) for day in holdout_df["ds"])
                        daily_preds.append(eval_pred)
                        daily_actuals.append(holdout_df)
                        wm = weekly_metrics(eval_pred, holdout_df)
                        week_list.append({
                            "w_pred": wm["w_pred"], "w_actual": wm["w_actual"],
                            "w_mae": wm["mae"], "w_mse": wm["mse"],
                        })
                        # Compare the same held-out dates with a no-fit same-weekday baseline.
                        nm = naive_baseline(train.iloc[:end], HOLDOUT_DAYS)
                        n_daily_list.append({k: nm[k] for k in ("mae", "mse", "rmse", "r_squared")})
                        n_week_list.append({
                            "w_pred": nm["w_pred"], "w_actual": nm["w_actual"],
                            "w_mae": nm["w_mae"], "w_mse": nm["w_mse"],
                        })
                    if daily_preds:
                        metrics = compute_metrics(
                            pd.concat(daily_preds), pd.concat(daily_actuals))

                m = build_prophet(len(train))
                m.fit(_to_fit(train))
                pred = m.predict(m.make_future_dataframe(periods=period)).tail(period)
                # Back-transform the point forecast only (bands removed: summed
                # per-variant intervals rendered lopsided and were dropped
                # from output; interval_width stays Prophet-internal).
                pred["yhat"] = _from_fit(pred["yhat"].values)

                shares = size_shares(pdf, cutoff, SHARE_WINDOW_DAYS)
                vids = [int(v["variant_id"]) for v in variants]
                share_list = [shares.get(vid, 0.0) for vid in vids]

                # Retain weekly demand when converting fractional predictions to counts.
                plan = preparation_plan(pred["yhat"], share_list)
                for day_index, (_, point) in enumerate(pred.iterrows()):
                    day_ds = point["ds"].strftime("%Y-%m-%d")
                    split = plan[day_index]
                    for k, v in enumerate(variants):
                        price = float(v["price"])
                        units = split[k]
                        v["__days"] = v.get("__days", [])
                        v["__days"].append({
                            "date": day_ds,
                            "units": units,
                            "revenue": round(units * price, 2),
                        })

                # Variant order matches share_list; direct indexing avoids a repeated linear ID search.
                for variant_index, v in enumerate(variants):
                    vid = int(v["variant_id"])
                    days = v.pop("__days", [])
                    total_units = sum(d["units"] for d in days)
                    total_revenue = round(sum(d["revenue"] for d in days), 2)
                    await save_result(
                        job_id, vid, str(product_id), product_name, v["size_name"],
                        float(v["price"]), int(v["category_id"]), days,
                        total_units, total_revenue, days_of_data,
                        round(share_list[variant_index], 4),
                    )

                if metrics:
                    # Means across scored origins double as legacy scalars;
                    # `weeks`/`n_weeks` carry the per-origin pairs the menu
                    # headline pools over (headline + range need them).
                    def _mean(rows, key):
                        """Average available origin values for legacy scalar fields, preserving four-decimal rounding."""
                        vals = [r[key] for r in rows if r.get(key) is not None]
                        return round(sum(vals) / len(vals), 4) if vals else None

                    product_scores.append({
                        "product_id": str(product_id),
                        "product_name": product_name,
                        "variants": len(variants),
                        "training_cutoff": cutoff.isoformat(),
                        "evaluation_version": 2,
                        "variant_scores": [
                            {"variant_id": vid, **compute_metrics(
                                pd.DataFrame({"ds": range(len(values[0])), "yhat": values[0]}),
                                pd.DataFrame({"ds": range(len(values[1])), "y": values[1]}))}
                            for vid, values in variant_pairs.items()
                        ],
                        **metrics,
                        "w_mae": _mean(week_list, "w_mae"),
                        "w_mse": _mean(week_list, "w_mse"),
                        "w_pred": _mean(week_list, "w_pred"),
                        "w_actual": _mean(week_list, "w_actual"),
                        "weeks": week_list,
                        "n_mae": _mean(n_daily_list, "mae"),
                        "n_mse": _mean(n_daily_list, "mse"),
                        "n_rmse": _mean(n_daily_list, "rmse"),
                        "n_r_squared": _mean(n_daily_list, "r_squared"),
                        "n_w_mae": _mean(n_week_list, "w_mae"),
                        "n_w_mse": _mean(n_week_list, "w_mse"),
                        "n_w_pred": _mean(n_week_list, "w_pred"),
                        "n_w_actual": _mean(n_week_list, "w_actual"),
                        "n_weeks": n_week_list,
                    })

                completed_count += 1

            except Exception as e:
                # Replace this product's partial forecasts with skip records before counting the failure.
                # Lost ownership still rejects these writes through job_connection.
                tb = traceback.format_exc()
                first = pdf.iloc[0]
                reason = f"{type(e).__name__}: {str(e)[:150]}"
                for v in pdf.drop_duplicates("variant_id").to_dict("records"):
                    await save_skipped(job_id, int(v["variant_id"]), product_name,
                                       v["size_name"], float(v["price"]),
                                       int(v["category_id"]), len(pdf.groupby("ds")), reason, str(product_id))
                failed_count += 1
                failed_skips.append(f"{first['product_name']}: {reason}")
                print(f"[Forecast Error] product {product_id}: {tb}")

            await update_job_progress(job_id, completed_count, failed_count)

        await complete_job(job_id, total, completed_count, failed_count, failed_skips, product_scores)
        await cleanup_old_jobs()

        return {
            "job_id": job_id,
            "total": total,
            "completed": completed_count,
            "failed": failed_count,
        }

    except Exception as e:
        await fail_job(job_id, str(e)[:500])
        raise


async def pool_update_total(job_id: int, total: int):
    """Store the number of product groups in the legacy total_variants column."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute(
            "UPDATE forecast_jobs SET total_variants = $1 WHERE id = $2",
            total, job_id,
        )
