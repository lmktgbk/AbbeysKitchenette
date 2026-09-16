import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")
FORECAST_PORT = int(os.getenv("FORECAST_PORT", "8000"))
FORECASTER_URL = os.getenv("FORECASTER_URL", "http://localhost:5000")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Prophet config — tuned for 2 years of daily sales data
PROPHET_CONFIG = {
    "changepoint_prior_scale": 0.1,
    "seasonality_mode": "additive",
    "seasonality_prior_scale": 10.0,
    "weekly_seasonality": True,
    "yearly_seasonality": True,
    "changepoint_range": 0.8,
    "interval_width": 0.90,
}

# Restock config
LEAD_TIME_DAYS = 7
SAFETY_BUFFER = 1.20  # 20% buffer
CRITICAL_THRESHOLD_DAYS = 3
WARNING_THRESHOLD_DAYS = 7
