"""Spawn-safe synthetic workers. No fixture opens a production database connection."""
import os
import time


def burn_cpu(started):
    if os.name != "nt":
        os.setsid()
    started.set()
    until = time.monotonic() + 2
    while time.monotonic() < until:
        sum(value * value for value in range(1000))


def forecast_fixture(output):
    from uuid import uuid4
    import pandas as pd
    from forecasting.services import demand_forecast as forecast
    from workers import _worker_main
    results = []
    completion = []
    product_id = uuid4()
    dates = pd.date_range(end=forecast.business_today(), periods=100)
    data = pd.DataFrame([
        {"product_id": product_id, "product_name": "Fixture", "variant_id": variant,
         "size_name": "Small" if variant == 1 else "Large", "price": 10 if variant == 1 else 20,
         "category_id": 1, "ds": day, "units": 2 if variant == 1 else 1}
        for day in dates for variant in [1, 2]
    ])

    async def load():
        return data

    async def noop(*args):
        pass

    async def save(*args):
        assert args[2] == str(product_id)
        results.append({"variant_id": args[1], "price": args[5], "days": args[7], "units": args[8], "revenue": args[9]})

    async def complete(*args):
        completion.append({"completed": args[2], "failed": args[3], "scores": args[5]})

    async def unexpected_skip(*args):
        raise AssertionError("Synthetic product must produce a usable forecast")

    forecast.load_variant_daily_sales = load
    forecast.pool_update_total = noop
    forecast.update_job_progress = noop
    forecast.cleanup_old_jobs = noop
    forecast.save_result = save
    forecast.complete_job = complete
    forecast.save_skipped = unexpected_skip
    forecast.fail_job = noop
    _worker_main("forecast", 1, uuid4(), {})
    output.put({"results": results, "completion": completion})


def mba_fixture(output):
    from uuid import uuid4
    import pandas as pd
    from mba.services import fpgrowth as mba
    from workers import _worker_main
    ingredient = uuid4()
    details = pd.DataFrame([
        {"product_id": uuid4(), "product_name": "Fixture " + label, "variant_id": index,
         "size_name": "Small", "price": price, "category_id": 1, "category_name": "Fixture",
         "ingredient_id": ingredient, "ingredient_name": "Shared ingredient", "unit": "g",
         "quantity_needed": 1, "cost_per_unit": 2}
        for index, (label, price) in enumerate([("A", 10), ("B", 20), ("C", 5)], start=1)
    ])
    baskets = pd.DataFrame([
        {"order_id": order, "order_date": pd.Timestamp("2026-01-01") + pd.Timedelta(days=order // 8),
         "variant_id": variant, "variant_label": "Fixture " + "ABC"[variant - 1] + " Small"}
        for order in range(80) for variant in ([1, 2] if order % 2 == 0 else [3])
    ])
    published = []
    async def load_baskets():
        return baskets
    async def load_details():
        return details
    async def discount():
        return 15
    async def save(job_id, rules, stats):
        published.append({"rules": rules, "stats": stats})
    mba.load_order_baskets = load_baskets
    mba.load_product_details = load_details
    mba.load_combo_discount = discount
    mba.save_results_to_db = save
    _worker_main("mba", 1, uuid4(), {"min_support": 0.1, "min_confidence": 0.1, "top_n": 5})
    output.put(published[0])
