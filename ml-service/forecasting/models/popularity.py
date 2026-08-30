from pydantic import BaseModel


class ProductTrend(BaseModel):
    product_id: str
    name: str
    total_sold: int
    daily_avg: float
    trend: str  # rising | stable | falling
    trend_pct: float
    rank: int


class PopularityResponse(BaseModel):
    products: list[ProductTrend]
    period: str
