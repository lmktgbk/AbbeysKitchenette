from __future__ import annotations

from pydantic import BaseModel


# ── Shared primitives ──────────────────────────────────────────

class DailyForecast(BaseModel):
    date: str
    units: int
    revenue: float
    lower: int
    upper: int


# ── Job schemas ────────────────────────────────────────────────

class JobSummary(BaseModel):
    id: int
    status: str
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
    total_variants: int | None
    completed: int
    failed: int
    failed_skips: list[str]
    period: int
    started_at: str | None
    completed_at: str | None
    error_message: str | None


# ── Variant result schemas ─────────────────────────────────────

class ProductScore(BaseModel):
    """Paper metrics scored at product level (dense series, 7-day holdout).

    Daily fields grade typical-day error; w_ fields grade the 7-day prep
    total (noise cancels). w_ defaults keep pre-split jobs readable.
    """
    product_id: int
    product_name: str
    variants: int
    rmse: float
    mae: float
    mse: float
    r_squared: float
    w_mae: float = 0.0
    w_mse: float = 0.0
    w_rmse: float = 0.0
    w_pred: float = 0.0
    w_actual: float = 0.0


class VariantResult(BaseModel):
    variant_id: int
    product_id: int | None = None
    product_name: str
    size_name: str
    price: float
    category_id: int
    daily_data: list[DailyForecast]
    total_units: int
    total_revenue: float
    trend: str
    days_of_data: int
    skipped: bool
    skip_reason: str | None
    # Share of parent product forecast (0-1); None on jobs before the split.
    share: float | None = None
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
