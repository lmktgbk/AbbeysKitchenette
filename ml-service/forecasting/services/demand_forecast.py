import json
import traceback
from datetime import datetime, timezone, date, timedelta
import pandas as pd
from prophet import Prophet
from database import get_pool
from config import PROPHET_CONFIG
from forecasting.services.data_loader import (
    load_variant_daily_sales,
    load_recipe_map,
    load_current_stock,
)

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

async def save_result(job_id, variant_id, product_name, size_name, price,
                      category_id, daily_data, total_units, total_revenue,
                      trend, days_of_data, metrics=None):
    pool = await get_pool()
    rmse = metrics.get("rmse", 0) if metrics else 0
    mae = metrics.get("mae", 0) if metrics else 0
    mse = metrics.get("mse", 0) if metrics else 0
    r_squared = metrics.get("r_squared", 0) if metrics else 0
    await pool.execute("""
        INSERT INTO forecast_results
            (job_id, variant_id, product_name, size_name, price, category_id,
             daily_data, total_units, total_revenue, trend, days_of_data, skipped,
             rmse, mae, mse, r_squared)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE,$12,$13,$14,$15)
        ON CONFLICT (job_id, variant_id) DO UPDATE SET
            daily_data = EXCLUDED.daily_data,
            total_units = EXCLUDED.total_units,
            total_revenue = EXCLUDED.total_revenue,
            trend = EXCLUDED.trend,
            rmse = EXCLUDED.rmse,
            mae = EXCLUDED.mae,
            mse = EXCLUDED.mse,
            r_squared = EXCLUDED.r_squared
    """, job_id, variant_id, product_name, size_name, price,
         category_id, json.dumps(daily_data),
         total_units, total_revenue, trend, days_of_data,
         rmse, mae, mse, r_squared)


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
    """Compare first-half vs second-half of Prophet's forecast (yhat).

    Uses median instead of mean to be robust against single-day outliers.
    Threshold raised to 15% to avoid false positives from daily oscillation.
    """
    import numpy as np

    yhat = pred_df["yhat"].values

    if len(yhat) < 4:
        return "stable"

    mid = len(yhat) // 2
    first_half = float(np.median(yhat[:mid]))
    second_half = float(np.median(yhat[mid:]))

    if first_half == 0:
        return "stable"

    pct = ((second_half - first_half) / first_half) * 100

    if pct > 15:
        return "increasing"
    elif pct < -15:
        return "decreasing"
    return "stable"


# ── Evaluation metrics ────────────────────────────────────────

def compute_metrics(pred_series, actual_series):
    """Compare in-sample predictions against actuals.

    Args:
        pred_series: DataFrame with columns [ds, yhat] (predicted values)
        actual_series: DataFrame with columns [ds, y] or [ds, units] (actual values)
    Returns:
        dict with rmse, mae, mse, r_squared
    """
    import numpy as np

    actual_col = "y" if "y" in actual_series.columns else "units"
    merged = pred_series.merge(actual_series.rename(columns={actual_col: "y"}), on="ds", how="inner")

    if len(merged) < 3:
        return {"rmse": 0.0, "mae": 0.0, "mse": 0.0, "r_squared": 0.0}

    actual = merged["y"].values.astype(float)
    predicted = merged["yhat"].values.astype(float)

    mae = float(np.mean(np.abs(actual - predicted)))
    mse = float(np.mean((actual - predicted) ** 2))
    rmse = float(np.sqrt(mse))

    ss_res = float(np.sum((actual - predicted) ** 2))
    ss_tot = float(np.sum((actual - np.mean(actual)) ** 2))
    r_squared = float(1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

    return {
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "mse": round(mse, 2),
        "r_squared": round(r_squared, 4),
    }


FORECAST_PERIOD = 7


# ── Main pipeline ─────────────────────────────────────────────

async def run_demand_forecast(job_id: int | None = None) -> dict:
    period = FORECAST_PERIOD
    if job_id is None:
        job_id = await create_job(period)

    try:
        df = await load_variant_daily_sales()

        if df.empty:
            await complete_job(job_id, 0, 0, 0, [])
            return {"job_id": job_id, "message": "No sales data found"}

        variant_groups = df.groupby("variant_id")
        total = len(variant_groups)
        completed_count = 0
        failed_count = 0
        failed_skips = []

        await pool_update_total(job_id, total)

        for variant_id, vdf in variant_groups:
            try:
                row = vdf.iloc[0]
                product_name = row["product_name"]
                size_name = row["size_name"]
                price = float(row["price"])
                category_id = int(row["category_id"])

                daily = vdf.groupby("ds")["units"].sum().reset_index()

                # Fill in missing calendar days with zeros so Prophet sees the
                # full picture: many zero-days + occasional sales spikes.
                all_dates = pd.date_range(start=vdf["ds"].min(), end=date.today(), freq="D")
                daily = (
                    pd.DataFrame({"ds": all_dates})
                    .merge(daily, on="ds", how="left")
                    .fillna(0)
                    .sort_values("ds")
                    .reset_index(drop=True)
                )
                daily["units"] = daily["units"].astype(int)

                days_of_data = len(daily)

                if days_of_data < MIN_DATA_DAYS:
                    reason = f"Insufficient data ({days_of_data} days, need {MIN_DATA_DAYS})"
                    await save_skipped(job_id, variant_id, product_name, size_name,
                                       price, category_id, days_of_data, reason)
                    failed_count += 1
                    failed_skips.append(f"{product_name} {size_name}: {reason}")
                    await update_job_progress(job_id, completed_count, failed_count)
                    continue

                if daily["units"].sum() == 0:
                    reason = "No actual sales in training data"
                    await save_skipped(job_id, variant_id, product_name, size_name,
                                       price, category_id, days_of_data, reason)
                    failed_count += 1
                    failed_skips.append(f"{product_name} {size_name}: {reason}")
                    await update_job_progress(job_id, completed_count, failed_count)
                    continue

                m = Prophet(
                    changepoint_prior_scale=PROPHET_CONFIG["changepoint_prior_scale"],
                    seasonality_mode=PROPHET_CONFIG["seasonality_mode"],
                    seasonality_prior_scale=PROPHET_CONFIG["seasonality_prior_scale"],
                    weekly_seasonality=PROPHET_CONFIG["weekly_seasonality"],
                    yearly_seasonality=PROPHET_CONFIG["yearly_seasonality"],
                    changepoint_range=PROPHET_CONFIG["changepoint_range"],
                    interval_width=PROPHET_CONFIG["interval_width"],
                )

                train = daily[["ds", "units"]].rename(columns={"units": "y"})

                # Pad training data to today so forecast starts from today,
                # not from the last order date. Cap gap to MAX_PAD_DAYS.
                today = pd.Timestamp(date.today())
                last_data_date = train["ds"].max()
                if last_data_date < today:
                    gap_days = (today - last_data_date).days
                    if gap_days > MAX_PAD_DAYS:
                        cutoff = last_data_date - timedelta(days=MAX_PAD_DAYS)
                        train = train[train["ds"] >= cutoff]
                        gap_days = MAX_PAD_DAYS
                    pad = pd.DataFrame({
                        "ds": pd.date_range(last_data_date + timedelta(days=1), today),
                        "y": [0] * gap_days,
                    })
                    train = pd.concat([train, pad], ignore_index=True)

                m.fit(train)

                future = m.make_future_dataframe(periods=period)
                full_pred = m.predict(future)
                pred = full_pred.tail(period)

                # In-sample evaluation on full calendar (including zero-sales days)
                hist_pred = full_pred[full_pred["ds"].isin(daily["ds"])][["ds", "yhat"]]
                metrics = compute_metrics(hist_pred, daily)

                daily_data = []
                total_units = 0
                total_revenue = 0.0

                for _, p in pred.iterrows():
                    units = max(0, round(float(p["yhat"])))
                    lower = max(0, round(float(p["yhat_lower"])))
                    upper = max(0, round(float(p["yhat_upper"])))
                    revenue = round(units * price, 2)
                    daily_data.append({
                        "date": p["ds"].strftime("%Y-%m-%d"),
                        "units": units,
                        "revenue": revenue,
                        "lower": lower,
                        "upper": upper,
                    })
                    total_units += units
                    total_revenue += revenue

                trend = compute_trend(pred)

                await save_result(
                    job_id, variant_id, product_name, size_name, price,
                    category_id, daily_data, total_units, total_revenue,
                    trend, days_of_data, metrics,
                )

                completed_count += 1

            except Exception as e:
                tb = traceback.format_exc()
                reason = f"{type(e).__name__}: {str(e)[:150]}"
                await save_skipped(job_id, variant_id,
                                   vdf.iloc[0]["product_name"],
                                   vdf.iloc[0]["size_name"],
                                   float(vdf.iloc[0]["price"]),
                                   int(vdf.iloc[0]["category_id"]),
                                   len(vdf.groupby("ds")), reason)
                failed_count += 1
                failed_skips.append(f"{vdf.iloc[0]['product_name']} {vdf.iloc[0]['size_name']}: {reason}")
                print(f"[Forecast Error] variant {variant_id}: {tb}")

            await update_job_progress(job_id, completed_count, failed_count)

        await complete_job(job_id, total, completed_count, failed_count, failed_skips)
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
