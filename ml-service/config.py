import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")
FORECAST_PORT = int(os.getenv("FORECAST_PORT", "8000"))
FORECASTER_URL = os.getenv("FORECASTER_URL", "http://localhost:5000")

# Prophet defaults — tunable as data grows
PROPHET_CONFIG = {
    "changepoint_prior_scale": 0.05,
    "seasonality_mode": "additive",
    "seasonality_prior_scale": 10.0,
    "weekly_seasonality": True,
    "yearly_seasonality": False,
    "changepoint_range": 0.8,
    "interval_width": 0.80,
}

# Restock config
LEAD_TIME_DAYS = 7
SAFETY_BUFFER = 1.20  # 20% buffer
CRITICAL_THRESHOLD_DAYS = 3
WARNING_THRESHOLD_DAYS = 7
