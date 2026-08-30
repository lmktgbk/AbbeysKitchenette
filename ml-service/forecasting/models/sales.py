from pydantic import BaseModel


class DailySales(BaseModel):
    date: str
    revenue: float
    orders: int


class ForecastPoint(BaseModel):
    date: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class SalesForecastSummary(BaseModel):
    avg_daily_revenue: float
    trend: str  # increasing | decreasing | stable
    trend_pct: float
    peak_day: str


class SalesForecastResponse(BaseModel):
    historical: list[DailySales]
    forecast: list[ForecastPoint]
    summary: SalesForecastSummary
