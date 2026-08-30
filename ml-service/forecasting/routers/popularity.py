from fastapi import APIRouter, Query
from forecasting.services.popularity import get_popularity

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/popularity")
async def popularity(
    period: int = Query(30, ge=7, le=180, description="Analysis period in days"),
):
    return await get_popularity(period_days=period)
