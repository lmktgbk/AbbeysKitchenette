"""Historical menu benchmark with read-only sales access and local results only.

Compare identical held-out dates. Raw-count alternatives diagnose the existing
square-root transform; they do not change the application's model or jobs.
"""
import argparse
import asyncio
from datetime import date, timedelta
import hashlib
import json
import logging
from pathlib import Path
import sys
import time
from unittest.mock import AsyncMock, patch

import asyncpg
import numpy as np
import pandas as pd
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml-service"))
from forecasting.services import data_loader
from legacy_forecast_allocation import preparation_plan
from forecasting.services.demand_forecast import build_prophet, MIN_DATA_DAYS
SHARE_WINDOW_DAYS = 30  # Historical allocation comparator; not used by production forecasting.

METHODS = ("product_sqrt", "product_raw", "variant_sqrt", "variant_raw", "same_weekday")


def _to_fit(training):
    """Preserve the previous square-root method solely for historical comparisons."""
    transformed = training.copy()
    transformed["y"] = np.sqrt(transformed.y.clip(lower=0))
    return transformed


def _from_fit(values):
    """Restore the historical comparator to demand units before scoring."""
    return np.square(np.maximum(values, 0))


def size_shares(sales, cutoff, window_days=30):
    """Learn the recent mix strictly before the forecast origin; fall back to history.

    A zero share is an estimate from recorded sales, not evidence that a variant
    cannot sell. Never learn shares from the held-out evaluation period.
    """
    cutoff = pd.Timestamp(cutoff)
    history = sales[sales["ds"] <= cutoff]
    recent = history[history["ds"] >= cutoff - pd.Timedelta(days=window_days - 1)]
    window = recent if recent["units"].sum() > 0 else history
    total = float(window["units"].sum())
    return {vid: float(group["units"].sum()) / total
            for vid, group in window.groupby("variant_id")} if total else {}


def errors(predicted, actual):
    """Report errors in original units; constant outcomes do not have defined R²."""
    predicted, actual = np.asarray(predicted, dtype=float), np.asarray(actual, dtype=float)
    if not actual.size:
        return {"observations": 0, "r2": None}
    difference = predicted - actual
    mse = float(np.mean(difference ** 2))
    variation = float(np.sum((actual - actual.mean()) ** 2))
    return {"observations": int(actual.size), "mae": float(np.mean(np.abs(difference))),
            "mse": mse, "rmse": float(np.sqrt(mse)),
            "r2": 1 - float(np.sum(difference ** 2)) / variation if variation else None,
            "actual_total": float(actual.sum()), "predicted_total": float(predicted.sum()),
            "bias": float(difference.mean())}


def fit_counts(training, sqrt):
    """Use the application's Prophet settings; change only the target transform."""
    if training.y.sum() == 0:
        return [0.0] * 7
    model = build_prophet(len(training))
    model.fit(_to_fit(training) if sqrt else training)
    forecast = model.predict(model.make_future_dataframe(periods=7)).tail(7).yhat.values
    return _from_fit(forecast).tolist() if sqrt else np.maximum(forecast, 0).tolist()


async def read_snapshot(cutoff):
    """Run the existing loader in an explicitly read-only repeatable-read transaction."""
    settings = dotenv_values(ROOT / "server" / ".env")
    connection = await asyncpg.connect(settings.get("DIRECT_URL") or settings["DATABASE_URL"],
                                      timeout=15, command_timeout=30, statement_cache_size=0)
    try:
        async with connection.transaction(readonly=True, isolation="repeatable_read"):
            with patch.object(data_loader, "get_pool", AsyncMock(return_value=connection)):
                sales = await data_loader.load_variant_daily_sales()
            # Never-sold catalog placeholders are not future observed sales.
            sales.loc[(sales.units == 0) & (sales.ds > pd.Timestamp(cutoff)), "ds"] = pd.Timestamp(cutoff)
            return sales[sales.ds <= pd.Timestamp(cutoff)].copy()
    finally:
        await connection.close()


def benchmark(sales, cutoff, origins=3, progress=None):
    """Score whole-unit plans at product and variant levels on the same calendar."""
    pools = {method: {target: {"predicted": [], "actual": []}
                       for target in ("product_daily", "product_weekly", "variant_daily", "variant_weekly")}
             for method in METHODS}
    products, skipped = [], []
    groups = list(sales.groupby("product_id"))
    for number, (product_id, history) in enumerate(groups, 1):
        if history.units.sum() == 0:
            skipped.append({"product": history.iloc[0].product_name, "reason": "No recorded sales"})
            continue
        dates = pd.date_range(history.ds.min(), cutoff)
        calendar = history.pivot_table(index="ds", columns="variant_id", values="units", aggfunc="sum").reindex(dates).fillna(0)
        variants = list(calendar.columns)
        local = {method: {target: {"predicted": [], "actual": []} for target in pools[method]} for method in METHODS}
        windows = []
        for origin in range(origins):
            end = len(dates) - origin * 7
            split = end - 7
            if split <= MIN_DATA_DAYS:
                continue
            actual = calendar.iloc[split:end].to_numpy(dtype=int)
            training = pd.DataFrame({"ds": dates[:split], "y": calendar.iloc[:split].sum(axis=1).values})
            shares = size_shares(history, dates[split - 1], SHARE_WINDOW_DAYS)
            weights = [shares.get(vid, 0) for vid in variants]
            plans = {"product_sqrt": preparation_plan(fit_counts(training, True), weights),
                     "product_raw": preparation_plan(fit_counts(training, False), weights),
                     "same_weekday": calendar.iloc[split - 7:split].to_numpy(dtype=int)}
            for method, sqrt in [("variant_sqrt", True), ("variant_raw", False)]:
                columns = []
                for vid in variants:
                    variant_training = pd.DataFrame({"ds": dates[:split], "y": calendar[vid].iloc[:split].values})
                    columns.append([day[0] for day in preparation_plan(fit_counts(variant_training, sqrt), [1])])
                plans[method] = np.asarray(columns).T
            for method, plan in plans.items():
                plan = np.asarray(plan, dtype=int)
                pairs = {"product_daily": (plan.sum(axis=1), actual.sum(axis=1)),
                         "product_weekly": ([plan.sum()], [actual.sum()]),
                         "variant_daily": (plan.flatten(), actual.flatten()),
                         "variant_weekly": (plan.sum(axis=0), actual.sum(axis=0))}
                for target, (prediction, observed) in pairs.items():
                    for destination in (pools[method][target], local[method][target]):
                        destination["predicted"].extend(float(value) for value in prediction)
                        destination["actual"].extend(float(value) for value in observed)
            windows.append({"from": str(dates[split].date()), "to": str(dates[end - 1].date())})
        if windows:
            products.append({"product": history.iloc[0].product_name, "product_id": str(product_id),
                             "variants": len(variants), "windows": windows,
                             "scores": {method: {target: errors(**values) for target, values in targets.items()}
                                        for method, targets in local.items()}})
        else:
            skipped.append({"product": history.iloc[0].product_name, "reason": "Insufficient pre-holdout history"})
        if progress:
            progress(number, len(groups))
    snapshot = sales.sort_values(["product_id", "variant_id", "ds"]).to_csv(index=False)
    return {"cutoff": str(cutoff), "origins": origins, "dataset_sha256": hashlib.sha256(snapshot.encode()).hexdigest(),
            "data_classification": "Mixed receipt-informed synthetic history; not real-world accuracy validation",
            "scored_products": len(products), "skipped": skipped,
            "scores": {method: {target: errors(**values) for target, values in targets.items()}
                       for method, targets in pools.items()}, "products": products,
            "limitations": ["Diagnostic comparison; these periods are not an untouched final test set",
                            "Missing dates treated as zero recorded sales; availability history is unavailable",
                            "Direct variants without training sales use zero predictions",
                            "Pooled R² includes differences between product or variant volumes"]}


async def verify_pipeline(sales, cutoff):
    """Run the real orchestration on a snapshot while replacing every persistence operation.

    This measures fitting time and validates response totals without creating jobs,
    orders or forecast rows. The DB snapshot connection is already closed.
    """
    from forecasting.services import demand_forecast as forecast
    from forecasting.models.demand import ProductScore

    saved, skipped, finished = AsyncMock(), AsyncMock(), AsyncMock()
    start = time.perf_counter()
    with patch.object(forecast, "business_today", return_value=cutoff + timedelta(days=1)), \
         patch.object(forecast, "load_variant_daily_sales", AsyncMock(return_value=sales)), \
         patch.object(forecast, "save_result", saved), \
         patch.object(forecast, "save_skipped", skipped), \
         patch.object(forecast, "complete_job", finished), \
         patch.object(forecast, "pool_update_total", AsyncMock()), \
         patch.object(forecast, "update_job_progress", AsyncMock()), \
         patch.object(forecast, "cleanup_old_jobs", AsyncMock()), \
         patch.object(forecast, "get_pool", AsyncMock(side_effect=AssertionError("Unexpected DB access"))), \
         patch.object(forecast, "fail_job", AsyncMock(side_effect=AssertionError("Unexpected pipeline failure"))):
        outcome = await forecast.run_demand_forecast(0)
    elapsed = time.perf_counter() - start
    scores = [ProductScore(**score).model_dump() for score in finished.await_args.args[-1]]
    for call in saved.await_args_list:
        _, _, _, _, _, price, _, days, units, revenue, _, share = call.args
        assert share is None and len(days) == 7
        assert units == sum(day["units"] for day in days)
        assert all(isinstance(day["units"], float) and day["units"] >= 0 for day in days)
        assert abs(revenue - sum(day["units"] * price for day in days)) < 1e-8
    aggregate = {}
    for target, rows in [("product_weekly", scores),
                         ("variant_weekly", [v for p in scores for v in p["variant_scores"]])]:
        weeks = [week for row in rows for week in row["weeks"]]
        baseline = [week for row in rows for week in row["n_weeks"]]
        assert [w["w_actual"] for w in weeks] == [w["w_actual"] for w in baseline]
        aggregate[target] = errors([w["w_pred"] for w in weeks], [w["w_actual"] for w in weeks])
        aggregate[target + "_baseline"] = errors([w["w_pred"] for w in baseline], [w["w_actual"] for w in baseline])
    return {"cutoff": str(cutoff), "read_only": True, "writes_mocked": True,
            "elapsed_seconds": round(elapsed, 2), "outcome": outcome,
            "forecasted_variants": saved.await_count, "skipped_variants": skipped.await_count,
            "coverage": forecast.sales_coverage(sales, cutoff), "scores": aggregate,
            "data_classification": "Mixed receipt-informed synthetic history; not real-world accuracy validation"}


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cutoff", type=date.fromisoformat, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--verify-pipeline", action="store_true", help="Run actual application pipeline with all writes mocked instead of five-method benchmark")
    args = parser.parse_args()
    # CmdStan may configure its own logger during fitting; the global threshold
    # keeps routine per-fit messages from obscuring product progress.
    logging.disable(logging.INFO)
    sales = await read_snapshot(args.cutoff)
    print(f"Read-only snapshot: {len(sales)} grouped sales rows", flush=True)
    # Close the DB connection before CPU-heavy fits; never hold a transaction during modelling.
    result = await verify_pipeline(sales, args.cutoff) if args.verify_pipeline else benchmark(sales, args.cutoff, progress=lambda done, total: print(f"Products processed: {done}/{total}", flush=True) if done % 10 == 0 or done == total else None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key not in ("products",)}, indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
