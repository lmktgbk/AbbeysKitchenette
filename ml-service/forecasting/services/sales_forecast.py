import pandas as pd
from prophet import Prophet
from forecasting.services.data_loader import load_daily_sales
from config import PROPHET_CONFIG


async def get_sales_forecast(period: int = 14) -> dict:
    df = await load_daily_sales()

    if len(df) < 2:
        return _empty_forecast(df, period)

    daily = df.groupby("ds").agg({"revenue": "sum", "orders": "sum"}).reset_index()
    daily = daily.sort_values("ds").reset_index(drop=True)

    summary = _compute_summary(daily)

    m = Prophet(
        changepoint_prior_scale=PROPHET_CONFIG["changepoint_prior_scale"],
        seasonality_mode=PROPHET_CONFIG["seasonality_mode"],
        seasonality_prior_scale=PROPHET_CONFIG["seasonality_prior_scale"],
        weekly_seasonality=PROPHET_CONFIG["weekly_seasonality"],
        yearly_seasonality=PROPHET_CONFIG["yearly_seasonality"],
        changepoint_range=PROPHET_CONFIG["changepoint_range"],
        interval_width=PROPHET_CONFIG["interval_width"],
    )

    train = daily[["ds", "revenue"]].rename(columns={"revenue": "y"})
    m.fit(train)

    future = m.make_future_dataframe(periods=period)
    forecast_df = m.predict(future)

    forecast_points = forecast_df[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(period)
    forecast_points["ds"] = forecast_points["ds"].dt.strftime("%Y-%m-%d")

    historical = daily[["ds", "revenue", "orders"]].copy()
    historical["ds"] = historical["ds"].dt.strftime("%Y-%m-%d")

    return {
        "historical": historical.to_dict("records"),
        "forecast": forecast_points.rename(columns={"ds": "date"}).to_dict("records"),
        "summary": summary,
    }


def _compute_summary(daily: pd.DataFrame) -> dict:
    avg_rev = round(daily["revenue"].mean(), 2)

    if len(daily) >= 4:
        mid = len(daily) // 2
        first_half = daily["revenue"].iloc[:mid].mean()
        second_half = daily["revenue"].iloc[mid:].mean()
        if first_half > 0:
            pct = round(((second_half - first_half) / first_half) * 100, 1)
        else:
            pct = 0.0
        if pct > 5:
            trend = "increasing"
        elif pct < -5:
            trend = "decreasing"
        else:
            trend = "stable"
    else:
        pct = 0.0
        trend = "stable"

    daily["day_of_week"] = pd.to_datetime(daily["ds"]).dt.day_name()
    peak = daily.groupby("day_of_week")["revenue"].mean().idxmax()

    return {
        "avg_daily_revenue": avg_rev,
        "trend": trend,
        "trend_pct": pct,
        "peak_day": peak,
    }


def _empty_forecast(df: pd.DataFrame, period: int) -> dict:
    historical = []
    if not df.empty:
        tmp = df.copy()
        tmp["ds"] = tmp["ds"].dt.strftime("%Y-%m-%d")
        historical = tmp[["ds", "revenue", "orders"]].rename(columns={"ds": "date"}).to_dict("records")

    return {
        "historical": historical,
        "forecast": [],
        "summary": {
            "avg_daily_revenue": 0,
            "trend": "stable",
            "trend_pct": 0,
            "peak_day": "N/A",
        },
    }
