"""Convert expected demand to preparation counts without losing weekly totals."""
import math



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
