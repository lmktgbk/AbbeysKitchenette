from fastapi import APIRouter
from forecasting.services.restock_forecast import get_restock_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/restock")
async def restock_forecast():
    return await get_restock_forecast()
