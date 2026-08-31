import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Query

from forecasting.services.demand_forecast import run_demand_forecast
from forecasting.services.data_loader import load_recipe_map, load_current_stock
from forecasting.models.demand import (
    JobStatusResponse,
    JobSummary,
    ForecastResultsResponse,
    HistoryResponse,
    IngredientsResponse,
    IngredientNeed,
    IngredientDailyValue,
    RunStartedResponse,
    RunBusyResponse,
)
from database import get_pool

router = APIRouter(prefix="/forecast", tags=["forecast"])

_active_jobs: dict[int, asyncio.Task] = {}

DEFAULT_PERIOD = 14


async def _run_in_background(job_id: int):
    try:
        await run_demand_forecast(job_id=job_id)
    except Exception as e:
        print(f"[Background Forecast Error] job {job_id}: {e}")
        from forecasting.services.demand_forecast import fail_job
        await fail_job(job_id, str(e)[:500])
    finally:
        _active_jobs.pop(job_id, None)


@router.post("/demand/run", response_model=RunStartedResponse | RunBusyResponse)
async def start_demand_forecast(background_tasks: BackgroundTasks):
    for task in _active_jobs.values():
        if not task.done():
            return RunBusyResponse(message="A forecast job is already running")

    job_id = await _create_pending_job()
    task = asyncio.create_task(_run_in_background(job_id))
    _active_jobs[job_id] = task

    return RunStartedResponse(job_id=job_id, message="Forecast started for 14 days")


async def _create_pending_job() -> int:
    from datetime import datetime, timezone
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO forecast_jobs (status, period, started_at)
           VALUES ('running', $1, $2) RETURNING id""",
        DEFAULT_PERIOD, datetime.now(timezone.utc),
    )
    return row["id"]


@router.get("/demand/status", response_model=JobStatusResponse)
async def demand_status(job_id: int = Query(...)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM forecast_jobs WHERE id = $1", job_id,
    )
    if not row:
        return JobStatusResponse(
            job_id=job_id, status="not_found", total_variants=None,
            completed=0, failed=0, failed_skips=[], period=DEFAULT_PERIOD,
            started_at=None, completed_at=None, error_message="Job not found",
        )

    return JobStatusResponse(
        job_id=row["id"],
        status=row["status"],
        total_variants=row["total_variants"],
        completed=row["completed"],
        failed=row["failed"],
        failed_skips=row["failed_skips"] or [],
        period=row["period"],
        started_at=row["started_at"].isoformat() if row["started_at"] else None,
        completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
        error_message=row["error_message"],
    )


@router.get("/demand/results", response_model=ForecastResultsResponse)
async def demand_results(job_id: int = Query(...)):
    pool = await get_pool()
    job = await pool.fetchrow(
        "SELECT * FROM forecast_jobs WHERE id = $1", job_id,
    )
    if not job:
        return ForecastResultsResponse(
            job=JobSummary(
                id=job_id, status="not_found", total_variants=None,
                completed=0, failed=0, period=DEFAULT_PERIOD,
                started_at=None, completed_at=None,
            ),
            forecasted=[],
            skipped=[],
        )

    rows = await pool.fetch(
        "SELECT * FROM forecast_results WHERE job_id = $1 ORDER BY total_units DESC",
        job_id,
    )

    forecasted = []
    skipped = []
    for r in rows:
        daily = r["daily_data"]
        if isinstance(daily, str):
            daily = json.loads(daily)

        entry = {
            "variant_id": r["variant_id"],
            "product_name": r["product_name"],
            "size_name": r["size_name"],
            "price": float(r["price"]),
            "category_id": r["category_id"],
            "daily_data": daily,
            "total_units": r["total_units"],
            "total_revenue": float(r["total_revenue"]),
            "trend": r["trend"],
            "days_of_data": r["days_of_data"],
            "skipped": r["skipped"],
            "skip_reason": r["skip_reason"],
        }

        if r["skipped"]:
            skipped.append(entry)
        else:
            forecasted.append(entry)

    job_summary = JobSummary(
        id=job["id"],
        status=job["status"],
        total_variants=job["total_variants"],
        completed=job["completed"],
        failed=job["failed"],
        period=job["period"],
        started_at=job["started_at"].isoformat() if job["started_at"] else None,
        completed_at=job["completed_at"].isoformat() if job["completed_at"] else None,
    )

    return ForecastResultsResponse(
        job=job_summary,
        forecasted=forecasted,
        skipped=skipped,
    )


@router.get("/demand/history", response_model=HistoryResponse)
async def demand_history():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, status, total_variants, completed, failed, period, started_at, completed_at "
        "FROM forecast_jobs WHERE status IN ('completed', 'failed') ORDER BY started_at DESC LIMIT 2"
    )
    jobs = [
        JobSummary(
            id=r["id"],
            status=r["status"],
            total_variants=r["total_variants"],
            completed=r["completed"],
            failed=r["failed"],
            period=r["period"],
            started_at=r["started_at"].isoformat() if r["started_at"] else None,
            completed_at=r["completed_at"].isoformat() if r["completed_at"] else None,
        )
        for r in rows
    ]
    return HistoryResponse(jobs=jobs)


@router.get("/demand/ingredients", response_model=IngredientsResponse)
async def demand_ingredients(job_id: int = Query(...)):
    pool = await get_pool()
    result_rows = await pool.fetch(
        "SELECT variant_id, daily_data, skipped FROM forecast_results WHERE job_id = $1 AND skipped = FALSE",
        job_id,
    )
    if not result_rows:
        return IngredientsResponse(ingredients=[])

    recipe_df = await load_recipe_map()
    stock_df = await load_current_stock()

    if recipe_df.empty:
        return IngredientsResponse(ingredients=[])

    daily_needs = defaultdict(lambda: defaultdict(float))

    for r in result_rows:
        daily = r["daily_data"]
        if isinstance(daily, str):
            daily = json.loads(daily)
        vid = r["variant_id"]

        variant_recipes = recipe_df[recipe_df["variant_id"] == vid]
        for _, rec in variant_recipes.iterrows():
            ing_id = rec["ingredient_id"]
            ing_name = rec["ingredient_name"]
            unit = rec["unit"]
            qty = rec["quantity_needed"]

            for day in daily:
                key = (ing_id, ing_name, unit)
                daily_needs[key][day["date"]] += day["units"] * qty

    ingredients = []
    for (ing_id, ing_name, unit), dates in daily_needs.items():
        date_list = sorted(dates.keys())
        current_stock = 0
        if not stock_df.empty:
            match = stock_df[stock_df["ingredient_id"] == ing_id]
            if not match.empty:
                current_stock = float(match.iloc[0]["current_stock"])

        daily_values = [
            IngredientDailyValue(date=d, quantity=round(dates[d], 2))
            for d in date_list
        ]
        total_needed = round(sum(dv.quantity for dv in daily_values), 2)

        avg_daily = total_needed / len(date_list) if date_list else 0
        days_covered = round(current_stock / avg_daily, 1) if avg_daily > 0 else None

        if days_covered is not None and days_covered >= 7:
            status = "ok"
        elif days_covered is not None and days_covered >= 3:
            status = "warning"
        else:
            status = "critical"

        ingredients.append(IngredientNeed(
            ingredient_id=str(ing_id),
            name=ing_name,
            unit=unit,
            daily_values=daily_values,
            total_needed=total_needed,
            current_stock=round(current_stock, 2),
            days_covered=days_covered,
            status=status,
        ))

    ingredients.sort(key=lambda x: {"critical": 0, "warning": 1, "ok": 2}[x.status])

    return IngredientsResponse(ingredients=ingredients)
