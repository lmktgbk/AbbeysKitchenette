"""Shared demand-forecast metrics: RMSE, MAE, MSE, R2 only.

Callers supply held-out predictions and the full calendar, including zero-sales
days. These functions calculate scores; they do not enforce the training/holdout split.
"""

import numpy as np


def compute_metrics(pred_df, actual_df) -> dict:
    """Compare predictions vs actuals on matching dates.

    pred_df:   DataFrame with [ds, yhat]
    actual_df: DataFrame with [ds, y] or [ds, units]
    """
    # Only matching dates are scored; calendar coverage is the caller's responsibility.
    actual_col = "y" if "y" in actual_df.columns else "units"
    merged = pred_df.merge(actual_df.rename(columns={actual_col: "y"}), on="ds", how="inner")

    # No matching observations means unavailable, not zero prediction error.
    if merged.empty:
        return {"rmse": None, "mae": None, "mse": None, "r_squared": None}

    actual = merged["y"].values.astype(float)
    predicted = merged["yhat"].values.astype(float)

    mae = float(np.mean(np.abs(actual - predicted)))
    mse = float(np.mean((actual - predicted) ** 2))
    rmse = float(np.sqrt(mse))

    ss_res = float(np.sum((actual - predicted) ** 2))
    ss_tot = float(np.sum((actual - np.mean(actual)) ** 2))
    r_squared = float(1 - (ss_res / ss_tot)) if len(merged) >= 2 and ss_tot > 0 else None

    return {
        "rmse": rmse,
        "mae": mae,
        "mse": mse,
        "r_squared": r_squared,
    }


def weekly_metrics(eval_pred_df, holdout_df) -> dict:
    """Decision-horizon score: 7-day predicted total vs 7-day actual total.

    Same hidden week, zeros included — daily noise cancels in totals, which
    is the weekly demand horizon. Reuses the daily eval forecast, no refit.
    w_pred/w_actual feed client pooled R2 across product-week points.
    That pooling formula has no explicit volume weights or outlier protection.
    """
    pred_total = float(eval_pred_df["yhat"].sum())
    actual_col = "y" if "y" in holdout_df.columns else "units"
    actual_total = float(holdout_df[actual_col].sum())
    err = abs(actual_total - pred_total)
    mse = err ** 2
    # No per-product weekly rmse: one observation makes sqrt(err^2) == |err|,
    # so whole-menu weekly RMSE is derived as sqrt(mean w_mse) at read time.
    return {
        "mae": err,
        "mse": mse,
        "w_pred": pred_total,
        "w_actual": actual_total,
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



