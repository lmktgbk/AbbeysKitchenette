"""Original Prophet configuration for historical audit reproduction only."""
from prophet import Prophet
from legacy_prophet_holidays import philippine_holidays

def build_legacy_prophet(n_days):
    """Keep old comparison results independent of subsequent production model changes."""
    return Prophet(changepoint_prior_scale=.02, seasonality_mode="additive",
                   seasonality_prior_scale=2., weekly_seasonality=True,
                   yearly_seasonality=n_days >= 730, changepoint_range=.8,
                   interval_width=.90, uncertainty_samples=0,
                   holidays=philippine_holidays(), holidays_prior_scale=10.)
