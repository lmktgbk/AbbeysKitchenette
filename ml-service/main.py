from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from config import FORECAST_PORT, FORECAST_HOST
from security import require_service_key, validate_service_key
from database import close_pool
from forecasting.routers import demand
from mba.routers import association


@asynccontextmanager
async def lifespan(app: FastAPI):
    from forecasting.services.demand_forecast import cleanup_stale_jobs
    validate_service_key()
    try:
        await cleanup_stale_jobs()
        yield
    finally:
        await close_pool()


app = FastAPI(
    title="Abbey's Kitchenette ML Service",
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(require_service_key)],
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Authentication applies to every business route and the private health probe.
app.include_router(demand.router)

# ── MBA routers ────────────────────────────────
app.include_router(association.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=FORECAST_HOST, port=FORECAST_PORT, reload=False)
