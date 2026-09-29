import json
import traceback
from datetime import datetime, timezone, date, timedelta
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from prophet import Prophet
from database import get_pool
from config import (
    PROPHET_CONFIG,
    YEARLY_MIN_DAYS,
    HOLDOUT_DAYS,
    SHARE_WINDOW_DAYS,
)
from forecasting.services.data_loader import load_variant_daily_sales
from forecasting.services.metrics import bound_r2, compute_metrics, naive_baseline, weekly_metrics
from forecasting.services.holidays import philippine_holidays

# Business timezone — the whole web app follows the Asia/Manila calendar day.
BUSINESS_TZ = ZoneInfo("Asia/Manila")


def business_today() -> date:
    """Manila calendar day per business clock — never host-local date."""
    return datetime.now(BUSINESS_TZ).date()

MIN_DATA_DAYS = 7
KEEP_JOBS = 2
MAX_PAD_DAYS = 30


# ── Job management ────────────────────────────────────────────

async def create_job(period: int) -> int:
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO forecast_jobs (status, period, started_at)
           VALUES ('running', $1, $2)
           RETURNING id""",
        period,
        datetime.now(timezone.utc),
    )
    return row["id"]


async def update_job_progress(job_id: int, completed: int, failed: int):
    pool = await get_pool()
    await pool.execute(
        "UPDATE forecast_jobs SET completed = $1, failed = $2 WHERE id = $3",
        completed, failed, job_id,
    )


async def complete_job(job_id: int, total: int, completed: int, failed: int, failed_skips: list):
    pool = await get_pool()
    await pool.execute(
        """UPDATE forecast_jobs
           SET status = 'completed', total_variants = $1, completed = $2,
               failed = $3, failed_skips = $4, completed_at = $5
           WHERE id = $6""",
        total, completed, failed, failed_skips, datetime.now(timezone.utc), job_id,
    )


async def save_product_scores(job_id: int, scores: list):
    """Whole-menu paper metrics live on the job row; ignored on old DBs."""
    pool = await get_pool()
    try:
        await pool.execute(
            "UPDATE forecast_jobs SET product_scores = $1 WHERE id = $2",
            json.dumps(scores), job_id,
        )
    except Exception:
        pass  # column not migrated yet — variant rows still hold the forecast


async def fail_job(job_id: int, message: str):
    pool = await get_pool()
    await pool.execute(
        "UPDATE forecast_jobs SET status = 'failed', error_message = $1, completed_at = $2 WHERE id = $3",
        message, datetime.now(timezone.utc), job_id,
    )


async def cleanup_old_jobs():
    pool = await get_pool()
    await pool.execute("""
        DELETE FROM forecast_jobs
        WHERE id NOT IN (
            SELECT id FROM forecast_jobs ORDER BY started_at DESC LIMIT $1
        )
    """, KEEP_JOBS)


async def cleanup_stale_jobs():
    pool = await get_pool()
    await pool.execute(
        """UPDATE forecast_jobs
           SET status = 'failed', error_message = 'Process restarted before completion',
               completed_at = $1
           WHERE status = 'running'""",
        datetime.now(timezone.utc),
    )


# ── Result storage ────────────────────────────────────────────
# Variant rows carry the split forecast (units/revenue for prep + ingredients).
# Product-level RMSE/MAE/MSE/R2 live on the job as product_scores JSON.
# product_id/share ride along when the columns exist; old DBs fall back.

async def save_result(job_id, variant_id, product_id, product_name, size_name, price,
                      category_id, daily_data, total_units, total_revenue,
                      trend, days_of_data, share):
    pool = await get_pool()
    try:
        await pool.execute("""
            INSERT INTO forecast_results
                (job_id, variant_id, product_id, product_name, size_name, price, category_id,
                 daily_data, total_units, total_revenue, trend, days_of_data, skipped, share)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, FALSE,$13)
            ON CONFLICT (job_id, variant_id) DO UPDATE SET
                daily_data = EXCLUDED.daily_data,
                total_units = EXCLUDED.total_units,
                total_revenue = EXCLUDED.total_revenue,
                trend = EXCLUDED.trend,
                product_id = EXCLUDED.product_id,
                share = EXCLUDED.share
        """, job_id, variant_id, product_id, product_name, size_name, price,
             category_id, json.dumps(daily_data),
             total_units, total_revenue, trend, days_of_data, share)
    except Exception:
        # Columns product_id/share not migrated yet — store the forecast only.
        await pool.execute("""
            INSERT INTO forecast_results
                (job_id, variant_id, product_name, size_name, price, category_id,
                 daily_data, total_units, total_revenue, trend, days_of_data, skipped)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE)
            ON CONFLICT (job_id, variant_id) DO UPDATE SET
                daily_data = EXCLUDED.daily_data,
                total_units = EXCLUDED.total_units,
                total_revenue = EXCLUDED.total_revenue,
                trend = EXCLUDED.trend
        """, job_id, variant_id, product_name, size_name, price,
             category_id, json.dumps(daily_data),
             total_units, total_revenue, trend, days_of_data)


async def save_skipped(job_id, variant_id, product_name, size_name, price,
                       category_id, days_of_data, reason):
    pool = await get_pool()
    await pool.execute("""
        INSERT INTO forecast_results
            (job_id, variant_id, product_name, size_name, price, category_id,
             daily_data, total_units, total_revenue, trend, days_of_data, skipped, skip_reason)
        VALUES ($1,$2,$3,$4,$5,$6,'[]'::json,0,0,'stable',$7, TRUE, $8)
        ON CONFLICT (job_id, variant_id) DO UPDATE SET
            skipped = TRUE, skip_reason = EXCLUDED.skip_reason
    """, job_id, variant_id, product_name, size_name, price,
         category_id, days_of_data, reason)


# ── Trend computation ─────────────────────────────────────────

def compute_trend(pred_df) -> str:
    """First-half vs second-half median of yhat; 15% band avoids oscillation noise."""
    import numpy as np

    yhat = pred_df["yhat"].values

    if len(yhat) < 4:
        return "stable"

    mid = len(yhat) // 2
    first_half = float(np.median(yhat[:mid]))
    second_half = float(np.median(yhat[mid:]))

    if first_half == 0:
        return "stable"

    # Sub-unit wobble (e.g. 0.3 -> 0.5/day) is apportionment noise, not a
    # trend — without this floor every thin product reads "rising/falling".
    if abs(second_half - first_half) < 0.5:
        return "stable"

    pct = ((second_half - first_half) / first_half) * 100

    if pct > 15:
        return "increasing"
    elif pct < -15:
        return "decreasing"
    return "stable"


# ── Prophet factory ───────────────────────────────────────────

_HOLIDAYS = None  # built once per process; spans data years + forecast tail


def build_prophet(n_days: int) -> Prophet:
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
        holidays=_HOLIDAYS,
        holidays_prior_scale=PROPHET_CONFIG["holidays_prior_scale"],
    )


FORECAST_PERIOD = 7


# ── Variance stabilization (E-test winner, now the default) ───────
# Spiky count data behaves better in square-root space, so the model fits
# sqrt(units) and predictions are squared back before scoring/splitting.
# Scoring always happens in original units, so metrics stay comparable.

def _to_fit(df):
    out = df.copy()
    out["y"] = np.sqrt(out["y"].clip(lower=0))
    return out


def _from_fit(values):
    return np.square(np.maximum(values, 0.0))


# ── Size-share split ──────────────────────────────────────────

def size_shares(vdf: pd.DataFrame, product_total: float) -> dict:
    """Trailing-window share per variant; falls back to all history, then even split."""
    window = vdf[vdf["ds"] >= vdf["ds"].max() - pd.Timedelta(days=SHARE_WINDOW_DAYS)]
    if window["units"].sum() == 0:
        window = vdf
    total = float(window["units"].sum())
    if total == 0 or product_total == 0:
        n = vdf["variant_id"].nunique()
        return {vid: 1.0 / n for vid in vdf["variant_id"].unique()}
    return {
        vid: float(g["units"].sum()) / total
        for vid, g in window.groupby("variant_id")
    }


def split_units(product_units: int, shares: list[float]) -> list[int]:
    """Largest-remainder split so variant units always sum to the product total."""
    exact = [product_units * s for s in shares]
    out = [int(x) for x in exact]
    remainder = product_units - sum(out)
    order = sorted(range(len(shares)), key=lambda i: exact[i] - out[i], reverse=True)
    for i in order[:max(0, remainder)]:
        out[i] += 1
    return out


# ── Main pipeline ─────────────────────────────────────────────
# Predict at PRODUCT level (dense series), split to sizes by share.
# Revenue uses real variant prices; ingredients use real variant recipes.

async def run_demand_forecast(job_id: int | None = None) -> dict:
    period = FORECAST_PERIOD
    if job_id is None:
        job_id = await create_job(period)

    try:
        df = await load_variant_daily_sales()

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

                # Full calendar with zeros: missing days are true zero demand,
                # dropping them inflates R2 while real prep error gets worse.
                all_dates = pd.date_range(start=pdf["ds"].min(), end=business_today(), freq="D")
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
                                           int(v["category_id"]), days_of_data, reason)
                    failed_count += 1
                    failed_skips.append(f"{product_name}: {reason}")
                    await update_job_progress(job_id, completed_count, failed_count)
                    continue

                train = daily[["ds", "units"]].rename(columns={"units": "y"})

                # Pad to today so the forecast starts today, not at the last
                # order date. Cap the gap so dead products don't train on zeros.
                today = pd.Timestamp(business_today())
                if train["ds"].max() < today:
                    if (today - train["ds"].max()).days > MAX_PAD_DAYS:
                        train = train[train["ds"] >= train["ds"].max() - timedelta(days=MAX_PAD_DAYS)]
                    pad_dates = pd.date_range(train["ds"].max() + timedelta(days=1), today)
                    pad = pd.DataFrame({"ds": pad_dates, "y": [0] * len(pad_dates)})
                    train = pd.concat([train, pad], ignore_index=True)

                # Rolling 3-origin scoring (Prophet's recommended 3-cutoff
                # procedure): three non-overlapping hidden weeks (offsets
                # 0/7/14d), each trained only on data before its window.
                # Daily metrics pool all pairs; weekly totals stay per-origin
                # for menu-level pooling + range. None when too short.
                # R2 is floored per product so one freak bulk week can't
                # sink the menu mean.
                ORIGIN_OFFSETS = (0, 7, 14)
                metrics = None
                week_list = []
                n_week_list = []
                n_daily_list = []
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
                        daily_preds.append(eval_pred)
                        daily_actuals.append(holdout_df)
                        wm = weekly_metrics(eval_pred, holdout_df)
                        week_list.append({
                            "w_pred": wm["w_pred"], "w_actual": wm["w_actual"],
                            "w_mae": wm["mae"], "w_mse": wm["mse"],
                        })
                        # Same hidden window, zero fitting cost — the
                        # comparator the paper needs for Prophet-vs-naive.
                        nm = naive_baseline(train.iloc[:end], HOLDOUT_DAYS)
                        n_daily_list.append({k: nm[k] for k in ("mae", "mse", "rmse", "r_squared")})
                        n_week_list.append({
                            "w_pred": nm["w_pred"], "w_actual": nm["w_actual"],
                            "w_mae": nm["w_mae"], "w_mse": nm["w_mse"],
                        })
                    if daily_preds:
                        metrics = compute_metrics(
                            pd.concat(daily_preds), pd.concat(daily_actuals))
                        metrics["r_squared"] = bound_r2(metrics["r_squared"])

                m = build_prophet(len(train))
                m.fit(_to_fit(train))
                pred = m.predict(m.make_future_dataframe(periods=period)).tail(period)
                # Back-transform point + interval together (square is monotonic,
                # so lower <= yhat <= upper is preserved for E).
                for col in ("yhat", "yhat_lower", "yhat_upper"):
                    pred[col] = _from_fit(pred[col].values)
                trend = compute_trend(pred)

                shares = size_shares(pdf, float(daily["units"].sum()))
                vids = [int(v["variant_id"]) for v in variants]
                share_list = [shares.get(vid, 0.0) for vid in vids]

                # Week-aware apportionment with fractional backlog: on 1-unit
                # days daily largest-remainder starves every minority size
                # (a 45% share still rounds to 0), so fractions carry forward
                # instead — weekly size totals match shares within 1 unit
                # while each daily product total stays exact.
                days_plan = []
                for _, p in pred.iterrows():
                    days_plan.append({
                        "ds": p["ds"].strftime("%Y-%m-%d"),
                        "units": max(0, round(float(p["yhat"]))),
                        "lower": max(0, round(float(p["yhat_lower"]))),
                        "upper": max(0, round(float(p["yhat_upper"]))),
                    })
                backlog = [0.0] * len(variants)
                for i, day in enumerate(days_plan):
                    p_units = day["units"]
                    day_ds = day["ds"]
                    exact = [s * p_units + backlog[k] for k, s in enumerate(share_list)]
                    give = [max(0, int(x)) for x in exact]
                    remainder = p_units - sum(give)
                    order = sorted(range(len(variants)),
                                   key=lambda k: exact[k] - give[k], reverse=True)
                    for k in order[:max(0, remainder)]:
                        give[k] += 1
                    backlog = [exact[k] - give[k] for k in range(len(variants))]
                    split = give
                    # Interval band follows each size's share of the product band.
                    lowers = split_units(day["lower"], share_list)
                    uppers = split_units(day["upper"], share_list)
                    for k, v in enumerate(variants):
                        price = float(v["price"])
                        units = split[k]
                        v["__days"] = v.get("__days", [])
                        v["__days"].append({
                            "date": day_ds,
                            "units": units,
                            "revenue": round(units * price, 2),
                            "lower": lowers[k],
                            "upper": uppers[k],
                        })

                for v in variants:
                    vid = int(v["variant_id"])
                    days = v.pop("__days", [])
                    total_units = sum(d["units"] for d in days)
                    total_revenue = round(sum(d["revenue"] for d in days), 2)
                    await save_result(
                        job_id, vid, int(product_id), product_name, v["size_name"],
                        float(v["price"]), int(v["category_id"]), days,
                        total_units, total_revenue, trend, days_of_data,
                        round(share_list[vids.index(vid)], 4),
                    )

                if metrics:
                    # Means across scored origins double as legacy scalars;
                    # `weeks`/`n_weeks` carry the per-origin pairs the menu
                    # headline pools over (headline + range need them).
                    def _mean(rows, key):
                        vals = [r[key] for r in rows if r.get(key) is not None]
                        return round(sum(vals) / len(vals), 4) if vals else 0.0

                    product_scores.append({
                        "product_id": int(product_id),
                        "product_name": product_name,
                        "variants": len(variants),
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
                tb = traceback.format_exc()
                first = pdf.iloc[0]
                reason = f"{type(e).__name__}: {str(e)[:150]}"
                for v in pdf.drop_duplicates("variant_id").to_dict("records"):
                    await save_skipped(job_id, int(v["variant_id"]), product_name,
                                       v["size_name"], float(v["price"]),
                                       int(v["category_id"]), len(pdf.groupby("ds")), reason)
                failed_count += 1
                failed_skips.append(f"{first['product_name']}: {reason}")
                print(f"[Forecast Error] product {product_id}: {tb}")

            await update_job_progress(job_id, completed_count, failed_count)

        await complete_job(job_id, total, completed_count, failed_count, failed_skips)
        await save_product_scores(job_id, product_scores)
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
    pool = await get_pool()
    await pool.execute(
        "UPDATE forecast_jobs SET total_variants = $1 WHERE id = $2",
        total, job_id,
    )
