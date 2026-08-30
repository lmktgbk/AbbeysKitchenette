from fastapi import APIRouter, Query
from forecasting.services.sales_forecast import get_sales_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/sales")
async def sales_forecast(
    period: int = Query(14, ge=1, le=90, description="Forecast days"),
):
    return await get_sales_forecast(period=period)
