"""Public forecast response contracts; retain legacy field names for existing backend/client consumers."""
from __future__ import annotations

from pydantic import BaseModel


# ── Shared primitives ──────────────────────────────────────────

class DailyForecast(BaseModel):
    date: str
    # Fractional units represent expected sales, not a preparation instruction.
    units: float
    revenue: float


# ── Job schemas ────────────────────────────────────────────────

class JobSummary(BaseModel):
    id: int
    status: str
    # Legacy name: the current product-level pipeline reports a product-group count.
    total_variants: int | None
    completed: int
    failed: int
    period: int
    started_at: str | None
    completed_at: str | None
    # Whole-menu paper metrics (product level); None on jobs before the split.
    product_scores: list[ProductScore] | None = None


class JobStatusResponse(BaseModel):
    job_id: int
    status: str
    # Legacy name: the current product-level pipeline reports a product-group count.
    total_variants: int | None
    completed: int
    failed: int
    failed_skips: list[str]
    period: int
    started_at: str | None
    completed_at: str | None
    error_message: str | None


# ── Variant result schemas ─────────────────────────────────────

class WeekScore(BaseModel):
    """One hidden-week total pair (and its errors)."""
    w_pred: float = 0.0
    w_actual: float = 0.0
    w_mae: float = 0.0
    w_mse: float = 0.0


class VariantScore(BaseModel):
    """Daily errors and hidden-week pairs; method metadata distinguishes direct and legacy models."""
    variant_id: int
    weeks: list[WeekScore] = []
    n_weeks: list[WeekScore] = []
    rmse: float | None
    mae: float | None
    mse: float | None
    r_squared: float | None


class SalesCoverage(BaseModel):
    """Recorded menu-wide coverage, without asserting that empty dates were closed or complete."""
    first_sale: str | None
    last_sale: str | None
    gap_days: int
    recent_gap_dates: list[str]
    trailing_gap_days: int | None


class ProductScore(BaseModel):
    """Paper metrics scored at product level (dense series, configurable rolling-origin
    7-day holdouts).

    Daily fields pool all origin pairs; w_ fields average the per-origin
    week totals; weeks/n_weeks carry the per-origin pairs the menu headline
    pools over (headline + range). Extended fields default for older score records.
    """
    product_id: str | int
    product_name: str
    variants: int
    training_cutoff: str | None = None
    evaluation_version: int | None = None
    forecast_method: str | None = None
    coverage: SalesCoverage | None = None
    variant_scores: list[VariantScore] = []
    rmse: float
    mae: float
    mse: float
    r_squared: float | None
    w_mae: float = 0.0
    w_mse: float = 0.0
    w_pred: float = 0.0
    w_actual: float = 0.0
    weeks: list[WeekScore] = []
    # Naive carry-forward on the same hidden tails; absent on older jobs.
    n_mae: float = 0.0
    n_mse: float = 0.0
    n_rmse: float = 0.0
    n_r_squared: float | None = None
    n_w_mae: float = 0.0
    n_w_mse: float = 0.0
    n_w_pred: float = 0.0
    n_w_actual: float = 0.0
    n_weeks: list[WeekScore] = []


class VariantResult(BaseModel):
    variant_id: int
    product_id: str | None = None
    product_name: str
    size_name: str
    price: float
    category_id: int
    daily_data: list[DailyForecast]
    total_units: float
    total_revenue: float
    days_of_data: int
    skipped: bool
    skip_reason: str | None
    # Historical allocation share on legacy runs; NULL for independent variant models.
    share: float | None = None
    current_available: bool | None = None
    rmse: float | None = None
    mae: float | None = None
    mse: float | None = None
    r_squared: float | None = None


class ForecastResultsResponse(BaseModel):
    job: JobSummary
    forecasted: list[VariantResult]
    skipped: list[VariantResult]


# ── History ────────────────────────────────────────────────────

class HistoryResponse(BaseModel):
    jobs: list[JobSummary]


# ── Ingredient need ────────────────────────────────────────────

class IngredientDailyValue(BaseModel):
    date: str
    quantity: float


class IngredientNeed(BaseModel):
    ingredient_id: str
    name: str
    unit: str
    daily_values: list[IngredientDailyValue]
    total_needed: float
    current_stock: float
    days_covered: float | None
    status: str


class IngredientsResponse(BaseModel):
    ingredients: list[IngredientNeed]
    # No recipe may be legitimate for resale; callers must review rather than
    # interpreting missing calculation inputs as sufficient inventory.
    recipe_missing_variants: list[int] = []


# ── Run endpoint responses ─────────────────────────────────────

class RunStartedResponse(BaseModel):
    status: str = "started"
    job_id: int
    message: str


class RunBusyResponse(BaseModel):
    status: str = "busy"
    message: str
    # Running job to attach to — client adopts it and shows progress
    # instead of a dead toast. None only if no running job found.
    job_id: int | None = None
