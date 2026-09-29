import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CLIENT_URL = os.getenv("CLIENT_URL", "http://localhost:5173")
FORECAST_PORT = int(os.getenv("FORECAST_PORT", "8000"))
FORECASTER_URL = os.getenv("FORECASTER_URL", "http://localhost:5000")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

# Prophet — one config for every product. Additive because a weekend bump
# adds units (+5), not multiplies (x2), so zero-sales days stay stable.
# Stiff trend/seasonality (A/B/C comparison winner): the model tracks the
# level instead of chasing single-day spikes, which predicts week-totals
# better on intermittent series.
PROPHET_CONFIG = {
    "changepoint_prior_scale": 0.02,
    "seasonality_mode": "additive",
    "seasonality_prior_scale": 2.0,
    "weekly_seasonality": True,
    "changepoint_range": 0.8,  # fit trend on first 80%, keep tail stable
    "interval_width": 0.90,  # 90% band -> daily lower/upper
    "holidays_prior_scale": 10.0,
}

# Yearly waves are under-identified below ~730 days of history (Prophet's own
# guidance; D-test confirmed removing them lifts pooled R2 4.4% -> 28.4%).
YEARLY_MIN_DAYS = 730



# Scoring tail hidden from training. 7 days = the same horizon we deploy,
# so the paper grade matches what the kitchen actually gets.
HOLDOUT_DAYS = 7

# Size-share window: trailing days used to split a product forecast into
# sizes. Recent mix beats lifetime mix; falls back to all history.
SHARE_WINDOW_DAYS = 30

# Restock config
LEAD_TIME_DAYS = 7
SAFETY_BUFFER = 1.20  # 20% buffer
CRITICAL_THRESHOLD_DAYS = 3
WARNING_THRESHOLD_DAYS = 7
