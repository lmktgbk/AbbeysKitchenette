"""Read-only product/allocation versus direct-variant Prophet experiment.

Run separately from normal forecasting: additional fits can be expensive.
No jobs, forecasts, prices or inventory are written. Output is JSON on stdout.
"""
import argparse
import asyncio
from datetime import timedelta
from pathlib import Path
import json
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from database import close_pool
from config import HOLDOUT_DAYS
from benchmark_forecasting import SHARE_WINDOW_DAYS, _to_fit, _from_fit, size_shares
from forecasting.services.data_loader import load_variant_daily_sales
from forecasting.services.demand_forecast import build_prophet, business_today, MIN_DATA_DAYS
from legacy_forecast_allocation import preparation_plan
from forecasting.services.metrics import compute_metrics


def score(predictions, actuals):
    """Use identical observation indices for both approaches; never mix daily and weekly errors."""
    return compute_metrics(pd.DataFrame({"ds": range(len(predictions)), "yhat": predictions}),
                           pd.DataFrame({"ds": range(len(actuals)), "y": actuals}))


def predict(training):
    """Fit one historical origin, for the historical square-root comparator."""
    if training.y.sum() == 0:
        return [0] * HOLDOUT_DAYS
    model = build_prophet(len(training))
    model.fit(_to_fit(training))
    future = model.predict(model.make_future_dataframe(periods=HOLDOUT_DAYS)).tail(HOLDOUT_DAYS)
    return _from_fit(future.yhat.values).tolist()


def compare_product(sales, cutoff, origins=3):
    """Compare both methods on identical variant and product dates without choosing a winner."""
    dates = pd.date_range(sales.ds.min(), cutoff)
    units = sales.pivot_table(index="ds", columns="variant_id", values="units", aggfunc="sum").reindex(dates).fillna(0)
    variants = list(units.columns)
    allocated, direct, actual = [], [], []
    weekly_allocated, weekly_direct, weekly_actual = [], [], []
    product_allocated, product_direct, product_actual = [], [], []
    per_variant = {vid: {"allocated": [], "direct": [], "actual": []} for vid in variants}
    windows = []
    for origin in range(origins):
        end = len(dates) - origin * HOLDOUT_DAYS
        split = end - HOLDOUT_DAYS
        if split <= MIN_DATA_DAYS:
            continue
        training = pd.DataFrame({"ds": dates[:split], "y": units.iloc[:split].sum(axis=1).values})
        shares = size_shares(sales, dates[split - 1], SHARE_WINDOW_DAYS)
        allocation = preparation_plan(predict(training), [shares.get(vid, 0) for vid in variants])
        predictions = []
        for vid in variants:
            variant_training = pd.DataFrame({"ds": dates[:split], "y": units[vid].iloc[:split].values})
            predictions.append([day[0] for day in preparation_plan(predict(variant_training), [1])])
        for index, vid in enumerate(variants):
            observed = units[vid].iloc[split:end].tolist()
            estimates = [day[index] for day in allocation]
            independently_predicted = predictions[index]
            allocated.extend(estimates)
            direct.extend(independently_predicted)
            actual.extend(observed)
            weekly_allocated.append(sum(estimates))
            weekly_direct.append(sum(independently_predicted))
            weekly_actual.append(sum(observed))
            per_variant[vid]["allocated"].extend(estimates)
            per_variant[vid]["direct"].extend(independently_predicted)
            per_variant[vid]["actual"].extend(observed)
        product_allocated.extend(map(sum, allocation))
        product_direct.extend(sum(values) for values in zip(*predictions))
        product_actual.extend(units.iloc[split:end].sum(axis=1).tolist())
        windows.append({"from": dates[split].date().isoformat(), "to": dates[end - 1].date().isoformat()})
    if not windows:
        return {"product": sales.iloc[0].product_name, "status": "insufficient completed history"}
    return {
        "product": sales.iloc[0].product_name, "product_id": str(sales.iloc[0].product_id), "windows": windows,
        "pooled_variant_daily": {"allocation": score(allocated, actual), "direct": score(direct, actual)},
        "pooled_variant_weekly": {"allocation": score(weekly_allocated, weekly_actual), "direct": score(weekly_direct, weekly_actual)},
        "product_daily": {"allocation": score(product_allocated, product_actual), "direct": score(product_direct, product_actual)},
        "product_weekly": {
            method: score([sum(values[start:start + HOLDOUT_DAYS]) for start in range(0, len(values), HOLDOUT_DAYS)],
                          [sum(product_actual[start:start + HOLDOUT_DAYS]) for start in range(0, len(product_actual), HOLDOUT_DAYS)])
            for method, values in [("allocation", product_allocated), ("direct", product_direct)]
        },
        "variants": [{"variant_id": int(vid), "allocation": score(values["allocated"], values["actual"]),
                      "direct": score(values["direct"], values["actual"])} for vid, values in per_variant.items()],
    }


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product-id", required=True, help="Compare one product first to bound fitting time")
    args = parser.parse_args()
    try:
        sales = await load_variant_daily_sales()
        cutoff = business_today() - timedelta(days=1)
        sales = sales[(sales.product_id.astype(str) == args.product_id) & (sales.ds <= pd.Timestamp(cutoff))]
        if sales.empty:
            raise ValueError("No nonarchived product found for that ID")
        print(json.dumps(compare_product(sales, cutoff), indent=2, allow_nan=False))
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
