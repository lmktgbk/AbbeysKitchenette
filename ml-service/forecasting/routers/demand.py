"""Expose private forecast reads and translate stored forecasts into current recipe/stock needs."""
import json
from collections import defaultdict

from fastapi import APIRouter, Query

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
from jobs import admit_job
from workers import launch_job

router = APIRouter(prefix="/forecast", tags=["forecast"])

DEFAULT_PERIOD = 7


def _job_summary(row, product_scores=None):
    """Select the public job fields and format timestamps without exposing lease ownership."""
    return JobSummary(
        id=row["id"], status=row["status"], total_variants=row["total_variants"],
        completed=row["completed"], failed=row["failed"], period=row["period"],
        started_at=row["started_at"].isoformat() if row["started_at"] else None,
        completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
        product_scores=product_scores,
    )


@router.post("/demand/run", response_model=RunStartedResponse | RunBusyResponse)
async def start_demand_forecast():
    """Attach to an admitted running job or launch its new owner; model work stays off the API loop."""
    job_id, owner = await admit_job("forecast")
    if owner is None:
        return RunBusyResponse(message="A forecast job is already running. Attached to it.", job_id=job_id)
    launch_job("forecast", job_id, owner)
    return RunStartedResponse(job_id=job_id, message="Forecast started for 7 days")


@router.get("/demand/status", response_model=JobStatusResponse)
async def demand_status(job_id: int = Query(...)):
    """Report stored progress; legacy total_variants/completed/failed fields count products in this pipeline."""
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
    """Partition persisted variant rows and attach product-level evaluation scores; fitting is not performed here."""
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

    # Running jobs can have partial variant rows; the returned job status tells callers whether publication finished.
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

        # product_id/share exist only on jobs after the product-level split.
        keys = set(r.keys())
        entry = {
            "variant_id": r["variant_id"],
            "product_id": str(r["product_id"]) if "product_id" in keys and r["product_id"] is not None else None,
            "product_name": r["product_name"],
            "size_name": r["size_name"],
            "price": float(r["price"]),
            "category_id": r["category_id"],
            "daily_data": daily,
            "total_units": r["total_units"],
            "total_revenue": float(r["total_revenue"]),
            "days_of_data": r["days_of_data"],
            "skipped": r["skipped"],
            "skip_reason": r["skip_reason"],
            "share": float(r["share"]) if "share" in keys and r["share"] is not None else None,
            "rmse": float(r["rmse"]) if r["rmse"] is not None else None,
            "mae": float(r["mae"]) if r["mae"] is not None else None,
            "mse": float(r["mse"]) if r["mse"] is not None else None,
            "r_squared": float(r["r_squared"]) if r["r_squared"] is not None else None,
        }

        if r["skipped"]:
            skipped.append(entry)
        else:
            forecasted.append(entry)

    # product_scores rides on the job row (SELECT * picks it up when migrated).
    product_scores = None
    if "product_scores" in set(job.keys()) and job["product_scores"]:
        raw = job["product_scores"]
        try:
            product_scores = json.loads(raw) if isinstance(raw, str) else list(raw)
        except Exception:
            product_scores = None

    job_summary = _job_summary(job, product_scores)

    return ForecastResultsResponse(
        job=job_summary,
        forecasted=forecasted,
        skipped=skipped,
    )


@router.get("/demand/history", response_model=HistoryResponse)
async def demand_history():
    """Return the latest two terminal jobs using the same summary contract as the results endpoint."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, status, total_variants, completed, failed, period, started_at, completed_at "
        "FROM forecast_jobs WHERE status IN ('completed', 'failed') ORDER BY started_at DESC LIMIT 2"
    )
    jobs = [_job_summary(row) for row in rows]
    return HistoryResponse(jobs=jobs)


@router.get("/demand/ingredients", response_model=IngredientsResponse)
async def demand_ingredients(job_id: int = Query(...)):
    """Multiply saved variant-day units by current recipes and compare demand with current batch stock."""
    pool = await get_pool()
    result_rows = await pool.fetch(
        "SELECT variant_id, daily_data, skipped FROM forecast_results WHERE job_id = $1 AND skipped = FALSE",
        job_id,
    )
    if not result_rows:
        return IngredientsResponse(ingredients=[])

    # Use current recipes and stock, not a historical inventory snapshot of the selected job.
    recipe_df = await load_recipe_map()
    stock_df = await load_current_stock()

    if recipe_df.empty:
        return IngredientsResponse(ingredients=[])

    # Index once per response, instead of scanning the full recipe and stock frames repeatedly.
    # Preserve recipe order and the first stock row, matching the original lookup behavior.
    recipes_by_variant = {vid: group for vid, group in recipe_df.groupby("variant_id", sort=False)}
    stock_by_ingredient = (
        stock_df.drop_duplicates("ingredient_id").set_index("ingredient_id")["current_stock"].to_dict()
        if not stock_df.empty else {}
    )
    daily_needs = defaultdict(lambda: defaultdict(float))

    for r in result_rows:
        daily = r["daily_data"]
        if isinstance(daily, str):
            daily = json.loads(daily)
        vid = r["variant_id"]

        variant_recipes = recipes_by_variant.get(vid)
        if variant_recipes is None:
            continue
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
        current_stock = float(stock_by_ingredient.get(ing_id, 0))

        # Round each day before summing, preserving the API's existing quantity contract.
        daily_values = [
            IngredientDailyValue(date=d, quantity=round(dates[d], 2))
            for d in date_list
        ]
        total_needed = round(sum(dv.quantity for dv in daily_values), 2)

        avg_daily = total_needed / len(date_list) if date_list else 0
        days_covered = round(current_stock / avg_daily, 1) if avg_daily > 0 else None

        if total_needed <= 0.01:
            status = "ok"
        elif days_covered is not None and days_covered >= 7:
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
