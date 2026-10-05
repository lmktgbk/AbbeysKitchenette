"""Convert expected demand to preparation counts without losing weekly totals."""
import math

import pandas as pd


def apportion(total, weights):
    """Largest-remainder allocation; preserve the requested total with stable ties."""
    values = [max(0.0, float(value)) for value in weights]
    mass = sum(values)
    if not values or mass == 0:
        return [0] * len(values)
    exact = [total * value / mass for value in values]
    counts = [math.floor(value) for value in exact]
    order = sorted(range(len(values)), key=lambda i: exact[i] - counts[i], reverse=True)
    for i in order[:total - sum(counts)]:
        counts[i] += 1
    return counts


def preparation_plan(predictions, shares):
    """Preserve rounded weekly product demand and variant quotas across all days.

    Daily counts consume remaining variant quotas. This prevents fractional
    carry-over from creating negative allocations or exceeding a day's total.
    """
    values = [max(0.0, float(value)) for value in predictions]
    total = math.floor(sum(values) + 0.5)
    daily = apportion(total, values)
    remaining = apportion(total, shares)
    plan = []
    for count in daily:
        split = apportion(count, remaining)
        remaining = [quota - used for quota, used in zip(remaining, split)]
        plan.append(split)
    return plan


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
