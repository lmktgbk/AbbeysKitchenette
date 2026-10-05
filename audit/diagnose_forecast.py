"""Read-only forecast diagnosis; print aggregates without customer or credential data."""
import argparse
import asyncio
from datetime import date, timedelta
import json
from pathlib import Path
import statistics

import asyncpg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


async def diagnose(job_id):
    """Use a read-only snapshot so every summary describes the same database state."""
    settings = dotenv_values(ROOT / "server" / ".env")
    connection = await asyncpg.connect(settings.get("DIRECT_URL") or settings["DATABASE_URL"],
                                      timeout=15, command_timeout=30, statement_cache_size=0)
    try:
        async with connection.transaction(isolation="repeatable_read", readonly=True):
            job = await connection.fetchrow("SELECT id,status,started_at,completed_at,product_scores FROM forecast_jobs WHERE id=$1", job_id)
            if not job:
                raise ValueError("Forecast job not found")
            scores = json.loads(job["product_scores"]) if isinstance(job["product_scores"], str) else job["product_scores"]
            daily = await connection.fetch("""SELECT o.order_date::text AS day,
                COUNT(DISTINCT o.order_id)::int AS orders, SUM(oi.quantity)::int AS units
                FROM orders o JOIN order_items oi ON oi.order_id=o.order_id
                WHERE o.status='completed' AND oi.removed_at IS NULL
                GROUP BY o.order_date ORDER BY o.order_date""")
            catalog = await connection.fetchrow("""SELECT COUNT(DISTINCT p.product_id)::int AS products,
                COUNT(pv.variant_id)::int AS variants FROM products p
                JOIN product_variants pv ON pv.product_id=p.product_id WHERE NOT p.is_archived""")
            cutoff_text = next((score.get("training_cutoff") for score in scores if score.get("training_cutoff")), None)
            cutoff_date = date.fromisoformat(cutoff_text) if cutoff_text else date.today()
            recorded = {date.fromisoformat(row["day"]): dict(row) for row in daily if row["day"]}
            recent_dates = [cutoff_date - timedelta(days=offset) for offset in range(20, -1, -1)]
            result = {"job": {key: str(job[key]) for key in ["id", "status", "started_at", "completed_at"]},
                      "catalog": dict(catalog), "history": {
                          "first_recorded_day": str(min(recorded)) if recorded else None,
                          "last_recorded_day": str(max(recorded)) if recorded else None,
                          "days_with_sales": len(recorded),
                          "completed_orders": sum(row["orders"] for row in daily),
                          "recent_calendar": [recorded.get(day, {"day": str(day), "orders": 0, "units": 0,
                                                                 "note": "No recorded completed sales; cause unknown"}) for day in recent_dates],
                      }, "weeks": []}
            for index in range(max((len(score.get("weeks", [])) for score in scores), default=0)):
                pairs = [(score, score["weeks"][index]) for score in scores if len(score.get("weeks", [])) > index]
                actual = [pair[1]["w_actual"] for pair in pairs]
                predicted = [pair[1]["w_pred"] for pair in pairs]
                mean = statistics.mean(actual)
                variation = sum((value - mean) ** 2 for value in actual)
                errors = [(prediction - observed) ** 2 for prediction, observed in zip(predicted, actual)]
                cutoff = pairs[0][0].get("training_cutoff")
                end = date.fromisoformat(cutoff) - timedelta(days=7 * index) if cutoff else None
                largest = sorted(zip(pairs, errors), key=lambda value: value[1], reverse=True)[:8]
                result["weeks"].append({"origin": index, "from": str(end - timedelta(days=6)) if end else None,
                    "to": str(end), "products": len(actual), "actual_units": sum(actual),
                    "predicted_units": sum(predicted), "zero_actual_products": sum(value == 0 for value in actual),
                    "actual_variation": variation, "squared_error": sum(errors),
                    "r2": 1 - sum(errors) / variation if variation else None,
                    "mae": statistics.mean(abs(p-a) for p,a in zip(predicted, actual)),
                    "largest_errors": [{"product": pair[0]["product_name"], "actual": pair[1]["w_actual"],
                                        "predicted": pair[1]["w_pred"], "squared_error": error} for pair,error in largest]})
            return result
    finally:
        await connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-id", type=int, default=4)
    args = parser.parse_args()
    print(json.dumps(asyncio.run(diagnose(args.job_id)), indent=2))
