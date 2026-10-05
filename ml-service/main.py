"""Compose private routes and coordinate recovery, worker shutdown, and pool cleanup."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from config import FORECAST_PORT, FORECAST_HOST
from security import require_service_key, validate_service_key
from database import close_pool
from forecasting.routers import demand
from mba.routers import association


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate credentials before recovery writes; stop supervised tasks before closing the API pool."""
    from jobs import recover_expired_jobs
    from workers import stop_workers, start_recovery
    validate_service_key()
    try:
        await recover_expired_jobs()
        start_recovery()
        yield
    finally:
        await stop_workers()
        await close_pool()


app = FastAPI(
    title="Abbey's Kitchenette ML Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Authentication applies to every business route and the private health probe.
app.include_router(demand.router, dependencies=[Depends(require_service_key)])

# ── MBA routers ────────────────────────────────
app.include_router(association.router, dependencies=[Depends(require_service_key)])


@app.get("/health", dependencies=[Depends(require_service_key)])
async def health():
    """Authenticated process health only; this does not test database or model readiness."""
    return {"status": "ok", "service": "ml-service"}


# Hosting probes cannot supply the private service credential. This endpoint
# exposes process liveness only; business routes and /health remain private.
@app.get("/livez")
async def liveness():
    """Expose minimal process liveness to hosting probes without a service credential."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=FORECAST_HOST, port=FORECAST_PORT, reload=False)
