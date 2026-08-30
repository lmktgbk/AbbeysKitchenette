from pydantic import BaseModel


class IngredientRestock(BaseModel):
    ingredient_id: str
    name: str
    unit: str
    current_stock: float
    daily_consumption: float
    days_until_stockout: float | None
    suggested_reorder_qty: float
    urgency: str  # critical | warning | ok


class RestockForecastResponse(BaseModel):
    ingredients: list[IngredientRestock]
    critical_count: int
    warning_count: int
    ok_count: int
