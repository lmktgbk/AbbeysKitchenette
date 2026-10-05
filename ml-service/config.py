"""Load private service configuration and fixed model settings; browser configuration belongs elsewhere."""
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).with_name(".env"))

ML_SERVICE_KEY = os.getenv("ML_SERVICE_KEY", "")
FORECAST_HOST = os.getenv("FORECAST_HOST", "127.0.0.1")
ML_JOB_TIMEOUT_SECONDS = int(os.getenv("ML_JOB_TIMEOUT_SECONDS", "1800"))
if not 60 <= ML_JOB_TIMEOUT_SECONDS <= 7200:
    raise ValueError("ML_JOB_TIMEOUT_SECONDS must be between 60 and 7200")

DATABASE_URL = os.getenv("DATABASE_URL")
FORECAST_PORT = int(os.getenv("PORT", os.getenv("FORECAST_PORT", "8000")))
if not 1 <= FORECAST_PORT <= 65535:
    raise ValueError("PORT/FORECAST_PORT must be between 1 and 65535")

# Shared Prophet settings: additive seasonality expresses seasonal effects in units,
# rather than multiplying the current trend level.
# Conservative priors reduce responsiveness to isolated spikes.
# These shared settings do not guarantee forecast accuracy.
PROPHET_CONFIG = {
    "changepoint_prior_scale": 0.02,
    "seasonality_mode": "additive",
    "seasonality_prior_scale": 2.0,
    "weekly_seasonality": True,
    "changepoint_range": 0.8,  # fit trend on first 80%, keep tail stable
    "interval_width": 0.90,  # retained Prophet setting; no uncertainty bands are published
    "holidays_prior_scale": 10.0,
}

# Enable yearly seasonality only after two years of calendar history.
YEARLY_MIN_DAYS = 730

# Scoring tail hidden from training. 7 days = the same horizon we deploy,
# so the paper grade matches what the kitchen actually gets.
HOLDOUT_DAYS = 7

# Rolling evaluation origins used by this application's holdout procedure.
# More origins require additional fitting; runtime depends on data and hosting capacity.
# Same code path, same hidden-week design — only the origin count changes.
EVAL_ORIGINS = max(1, int(os.getenv("FORECAST_EVAL_ORIGINS", "3")))
