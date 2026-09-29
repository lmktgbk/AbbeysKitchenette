"""Shared demand-forecast metrics: RMSE, MAE, MSE, R2 only.

Always scored on a holdout tail the model never trained on, over the
full calendar including zero-sales days. Dropping zeros inflates R2
while the real 7-day prep error gets worse.
"""

import numpy as np


def compute_metrics(pred_df, actual_df) -> dict:
    """Compare predictions vs actuals on matching dates.

    pred_df:   DataFrame with [ds, yhat]
    actual_df: DataFrame with [ds, y] or [ds, units]
    """
    actual_col = "y" if "y" in actual_df.columns else "units"
    merged = pred_df.merge(actual_df.rename(columns={actual_col: "y"}), on="ds", how="inner")

    if len(merged) < 3:
        return {"rmse": 0.0, "mae": 0.0, "mse": 0.0, "r_squared": 0.0}

    actual = merged["y"].values.astype(float)
    predicted = merged["yhat"].values.astype(float)

    mae = float(np.mean(np.abs(actual - predicted)))
    mse = float(np.mean((actual - predicted) ** 2))
    rmse = float(np.sqrt(mse))

    ss_res = float(np.sum((actual - predicted) ** 2))
    ss_tot = float(np.sum((actual - np.mean(actual)) ** 2))
    r_squared = float(1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

    return {
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "mse": round(mse, 2),
        "r_squared": round(r_squared, 4),
    }


R2_FLOOR = -1.0  # one freak bulk week scores -1, not -15


def bound_r2(r_squared: float) -> float:
    """Floor per-product R2 so a single outlier week can't sink the menu mean."""
    return max(R2_FLOOR, float(r_squared))


def weekly_metrics(eval_pred_df, holdout_df) -> dict:
    """Decision-horizon score: 7-day predicted total vs 7-day actual total.

    Same hidden week, zeros included — daily noise cancels in totals, which
    is what prep actually uses. Reuses the daily eval forecast, no refit.
    w_pred/w_actual feed the whole-menu pooled R2 (volume-weighted, immune
    to single-product -15 outliers).
    """
    pred_total = float(eval_pred_df["yhat"].sum())
    actual_col = "y" if "y" in holdout_df.columns else "units"
    actual_total = float(holdout_df[actual_col].sum())
    err = abs(actual_total - pred_total)
    mse = err ** 2
    # No per-product weekly rmse: one observation makes sqrt(err^2) == |err|,
    # so whole-menu weekly RMSE is derived as sqrt(mean w_mse) at read time.
    return {
        "mae": round(err, 2),
        "mse": round(mse, 2),
        "w_pred": round(pred_total, 2),
        "w_actual": round(actual_total, 2),
    }


def naive_baseline(train, holdout_days: int = 7) -> dict:
    """Same-weekday carry-forward scored on the identical hidden tail.

    train: DataFrame with [ds, y] sorted ascending, full calendar.
    Returns daily metrics plus weekly totals in the same shape as the
    Prophet scores, so the paper reports Prophet-vs-naive deltas.
    """
    import pandas as pd

    hist = train["y"].tolist()
    dates = train["ds"].tolist()
    split = len(hist) - holdout_days
    preds, actuals, ds = [], [], []
    for i in range(holdout_days):
        t = split + i
        preds.append(max(0.0, float(hist[t - 7])))
        actuals.append(float(hist[t]))
        ds.append(dates[t])
    pred_df = pd.DataFrame({"ds": ds, "yhat": preds})
    actual_df = pd.DataFrame({"ds": ds, "y": actuals})
    daily = compute_metrics(pred_df, actual_df)
    daily["r_squared"] = bound_r2(daily["r_squared"])
    weekly = weekly_metrics(pred_df, actual_df)
    return {
        "mae": daily["mae"],
        "mse": daily["mse"],
        "rmse": daily["rmse"],
        "r_squared": daily["r_squared"],
        "w_mae": weekly["mae"],
        "w_mse": weekly["mse"],
        "w_pred": weekly["w_pred"],
        "w_actual": weekly["w_actual"],
    }



