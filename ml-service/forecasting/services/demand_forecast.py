"""Fit independent variant demand in a child worker and persist through lease-fenced writes."""
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
    HOLDOUT_DAYS,
    EVAL_ORIGINS,
)
from forecasting.services.data_loader import load_variant_daily_sales
from forecasting.services.metrics import compute_metrics, weekly_metrics

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
# Variant rows carry independent forecasts (expected units/revenue and ingredient demand).
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
                product_name = EXCLUDED.product_name, size_name = EXCLUDED.size_name,
                price = EXCLUDED.price, category_id = EXCLUDED.category_id,
                days_of_data = EXCLUDED.days_of_data, share = EXCLUDED.share,
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
                skipped = TRUE, skip_reason = EXCLUDED.skip_reason, share = NULL,
                days_of_data = EXCLUDED.days_of_data,
                daily_data = '[]'::json, total_units = 0, total_revenue = 0,
                product_id = COALESCE(EXCLUDED.product_id, forecast_results.product_id)
        """, job_id, variant_id, product_name, size_name, price,
             category_id, days_of_data, reason, product_id)


# ── Prophet factory ───────────────────────────────────────────

def build_prophet(n_days: int) -> Prophet:
    """Create the selected full-history, flat-trend model for production and holdouts.

    n_days preserves the factory interface used by audit callers. The selected
    model always disables yearly seasonality, irrespective of calendar length.
    """
    return Prophet(**PROPHET_CONFIG)


FORECAST_PERIOD = 7


def training_reason(train):
    """Require seven calendar days since the first sale; zero-only series cannot establish demand."""
    sold = train.loc[train.y > 0, "ds"]
    if sold.empty:
        return "No actual sales in training data"
    days = (train.ds.max() - sold.min()).days + 1
    return f"Insufficient history ({days} calendar days since first sale, need {MIN_DATA_DAYS})" if days < MIN_DATA_DAYS else None


def predict_units(train, period=FORECAST_PERIOD):
    """Fit unit counts and retain fractional expected demand for each future day.

    An unlearnable historical series receives a zero fallback for matched backtests;
    production marks it skipped instead. Negative Prophet point estimates are clipped.
    No database transaction is held while fitting or predicting.
    """
    if training_reason(train):
        return [0.0] * period
    model = build_prophet(len(train))
    model.fit(train)
    future = pd.DataFrame({"ds": pd.date_range(train.ds.max() + pd.Timedelta(days=1), periods=period)})
    values = np.maximum(model.predict(future).yhat.to_numpy(), 0)
    # Expected demand is a statistical average, not a whole-item preparation plan.
    # Reject non-finite model output before it can reach JSON or stored totals.
    if not np.isfinite(values).all():
        raise ValueError("Prophet returned non-finite expected demand")
    return values.astype(float).tolist()


def sales_coverage(sales, cutoff):
    """Describe recorded menu-wide gaps; absence alone cannot identify closure or incomplete entry."""
    dates = pd.DatetimeIndex(sales.loc[sales.units > 0, "ds"].unique()).sort_values()
    if dates.empty:
        return {"first_sale": None, "last_sale": None, "gap_days": 0, "recent_gap_dates": [], "trailing_gap_days": None}
    missing = pd.date_range(dates.min(), cutoff).difference(dates)
    return {"first_sale": dates.min().date().isoformat(), "last_sale": dates.max().date().isoformat(),
            "gap_days": len(missing), "recent_gap_dates": [d.date().isoformat() for d in missing[-14:]],
            "trailing_gap_days": (pd.Timestamp(cutoff) - dates.max()).days}


def week_pair(prediction, actual):
    """Store one horizon pair in the shared product/variant response shape."""
    score = weekly_metrics(pd.DataFrame({"yhat": prediction}), pd.DataFrame({"y": actual}))
    return {"w_pred": score["w_pred"], "w_actual": score["w_actual"],
            "w_mae": score["mae"], "w_mse": score["mse"]}


def evaluate_product(calendar):
    """Backtest expected variant demand on matched hidden weeks, then sum them for product scores.

    Every model sees only the history before its holdout. Zero-history/short-history
    variants use zero fallback estimates in evaluation, including their actual errors.
    Daily pairs and weekly totals are retained for both Prophet and the baseline.
    """
    dates = calendar.index
    variant_pairs = {int(vid): ([], []) for vid in calendar.columns}
    variant_weeks = {int(vid): [] for vid in calendar.columns}
    variant_baselines = {int(vid): [] for vid in calendar.columns}
    product_predictions, product_actuals, baseline_predictions = [], [], []
    weeks, baseline_weeks = [], []
    for origin in range(EVAL_ORIGINS):
        end = len(calendar) - origin * HOLDOUT_DAYS
        split = end - HOLDOUT_DAYS
        if split <= MIN_DATA_DAYS:
            continue
        actual = calendar.iloc[split:end]
        plans = []
        for vid in calendar.columns:
            train = pd.DataFrame({"ds": dates[:split], "y": calendar[vid].iloc[:split].to_numpy()})
            prediction = predict_units(train, HOLDOUT_DAYS)
            observed = actual[vid].tolist()
            baseline = calendar[vid].iloc[split - HOLDOUT_DAYS:split].tolist()
            variant_pairs[int(vid)][0].extend(prediction)
            variant_pairs[int(vid)][1].extend(observed)
            variant_weeks[int(vid)].append(week_pair(prediction, observed))
            variant_baselines[int(vid)].append(week_pair(baseline, observed))
            plans.append(prediction)
        predicted = np.asarray(plans).sum(axis=0).tolist()
        observed = actual.sum(axis=1).tolist()
        baseline = calendar.iloc[split - HOLDOUT_DAYS:split].sum(axis=1).tolist()
        product_predictions.extend(predicted)
        product_actuals.extend(observed)
        baseline_predictions.extend(baseline)
        weeks.append(week_pair(predicted, observed))
        baseline_weeks.append(week_pair(baseline, observed))
    if not weeks:
        return None

    def daily_score(prediction, actual):
        """Synthetic pair indices avoid duplicate-date joins across multiple evaluation windows."""
        return compute_metrics(pd.DataFrame({"ds": range(len(prediction)), "yhat": prediction}),
                               pd.DataFrame({"ds": range(len(actual)), "y": actual}))

    def weekly_fields(rows, prefix=""):
        """Keep legacy mean fields while preserving all origin pairs for correct pooled metrics."""
        return {prefix + key: sum(row[key] for row in rows) / len(rows)
                for key in ("w_pred", "w_actual", "w_mae", "w_mse")}

    return {**daily_score(product_predictions, product_actuals), **weekly_fields(weeks),
            "weeks": weeks, "n_weeks": baseline_weeks, **weekly_fields(baseline_weeks, "n_"),
            **{"n_" + key: value for key, value in daily_score(baseline_predictions, product_actuals).items()},
            "variant_scores": [{"variant_id": vid, **daily_score(*values),
                                "weeks": variant_weeks[vid], "n_weeks": variant_baselines[vid]}
                               for vid, values in variant_pairs.items()]}


async def run_demand_forecast(job_id: int) -> dict:
    """Fit each variant independently; product counters and response fields remain backward compatible."""
    cutoff = business_today() - timedelta(days=1)
    try:
        df = await load_variant_daily_sales()
        if not df.empty:
            df = df[df.ds <= pd.Timestamp(cutoff)].copy()
        if df.empty:
            await complete_job(job_id, 0, 0, 0, [])
            return {"job_id": job_id, "message": "No sales data found"}
        coverage = sales_coverage(df, cutoff)
        groups = df.groupby("product_id")
        total = len(groups)
        completed_count, failed_count = 0, 0
        failed_skips, product_scores = [], []
        await pool_update_total(job_id, total)
        for product_id, history in groups:
            variants = history.drop_duplicates("variant_id").to_dict("records")
            product_name = history.iloc[0].product_name
            days_of_data = 0
            try:
                # Align variants on the parent product's observed calendar. Earlier zero
                # entries mean no recorded sale, not verified historical availability.
                dates = pd.date_range(history.ds.min(), cutoff)
                calendar = history.pivot_table(index="ds", columns="variant_id", values="units", aggfunc="sum").reindex(dates).fillna(0)
                days_of_data = len(dates)
                product_saved = False
                for variant in variants:
                    vid = int(variant["variant_id"])
                    train = pd.DataFrame({"ds": dates, "y": calendar[vid].to_numpy()})
                    reason = training_reason(train)
                    if reason:
                        await save_skipped(job_id, vid, product_name, variant["size_name"], float(variant["price"]),
                                           int(variant["category_id"]), days_of_data, reason, str(product_id))
                        failed_skips.append(f"{product_name} / {variant['size_name']}: {reason}")
                        continue
                    units = predict_units(train)
                    price = float(variant["price"])
                    days = [{"date": day.date().isoformat(), "units": count, "revenue": count * price}
                            for day, count in zip(pd.date_range(pd.Timestamp(cutoff) + pd.Timedelta(days=1), periods=FORECAST_PERIOD), units)]
                    # share=NULL distinguishes independent forecasts from legacy mix allocations.
                    await save_result(job_id, vid, str(product_id), product_name, variant["size_name"], price,
                                      int(variant["category_id"]), days, sum(units),
                                      sum(day["revenue"] for day in days), days_of_data, None)
                    product_saved = True
                score = evaluate_product(calendar) if calendar.to_numpy().sum() > 0 else None
                if score:
                    product_scores.append({"product_id": str(product_id), "product_name": product_name,
                                           "variants": len(variants), "training_cutoff": cutoff.isoformat(),
                                           "evaluation_version": 5, "forecast_method": "variant_prophet_expected_flat",
                                           "coverage": coverage, **score})
                if product_saved:
                    completed_count += 1
                else:
                    failed_count += 1
            except Exception as error:
                # A product failure replaces every partial result with a skip record.
                # Ownership fencing still prevents a stale worker from publishing data.
                reason = f"{type(error).__name__}: {str(error)[:150]}"
                for variant in variants:
                    await save_skipped(job_id, int(variant["variant_id"]), product_name, variant["size_name"],
                                       float(variant["price"]), int(variant["category_id"]), days_of_data, reason, str(product_id))
                failed_count += 1
                failed_skips.append(f"{product_name}: {reason}")
                print(f"[Forecast Error] product {product_id}: {traceback.format_exc()}")
            await update_job_progress(job_id, completed_count, failed_count)
        await complete_job(job_id, total, completed_count, failed_count, failed_skips, product_scores)
        await cleanup_old_jobs()
        return {"job_id": job_id, "total": total, "completed": completed_count, "failed": failed_count}
    except Exception as error:
        await fail_job(job_id, str(error)[:500])
        raise


async def pool_update_total(job_id: int, total: int):
    """Store the number of product groups in the legacy total_variants column."""
    async with job_connection("forecast", job_id) as pool:
        await pool.execute(
            "UPDATE forecast_jobs SET total_variants = $1 WHERE id = $2",
            total, job_id,
        )
