from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CLIENT_URL, FORECAST_PORT, FORECASTER_URL
from database import close_pool
from forecasting.routers import demand
from mba.routers import association


@asynccontextmanager
async def lifespan(app: FastAPI):
    from forecasting.services.demand_forecast import cleanup_stale_jobs
    await cleanup_stale_jobs()
    yield
    await close_pool()


app = FastAPI(
    title="Abbey's Kitchenette ML Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CLIENT_URL, FORECASTER_URL, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Forecasting routers ────────────────────────
app.include_router(demand.router)

# ── MBA routers ────────────────────────────────
app.include_router(association.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=FORECAST_PORT, reload=True)
