from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CLIENT_URL, FORECAST_PORT
from database import close_pool
from forecasting.routers import sales, restock, popularity


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


app = FastAPI(
    title="Abbey's Kitchenette ML Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CLIENT_URL],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Forecasting routers ────────────────────────
app.include_router(sales.router)
app.include_router(restock.router)
app.include_router(popularity.router)

# ── MBA routers (uncomment when built) ─────────
# from mba.routers import association
# app.include_router(association.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ml-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=FORECAST_PORT, reload=True)
