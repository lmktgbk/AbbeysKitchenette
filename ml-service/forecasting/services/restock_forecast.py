from forecasting.services.data_loader import load_ingredient_stock, load_ingredient_consumption
from config import (
    LEAD_TIME_DAYS,
    SAFETY_BUFFER,
    CRITICAL_THRESHOLD_DAYS,
    WARNING_THRESHOLD_DAYS,
)


async def get_restock_forecast() -> dict:
    stock_df = await load_ingredient_stock()
    consumption_df = await load_ingredient_consumption(days=30)

    if stock_df.empty:
        return {"ingredients": [], "critical_count": 0, "warning_count": 0, "ok_count": 0}

    merged = stock_df.merge(
        consumption_df[["ingredient_id", "daily_consumption"]],
        on="ingredient_id",
        how="left",
    )
    merged["daily_consumption"] = merged["daily_consumption"].fillna(0)

    results = []
    critical = 0
    warning = 0
    ok = 0

    for _, row in merged.iterrows():
        stock = row["current_stock"]
        daily_use = row["daily_consumption"]

        if daily_use > 0:
            days_left = round(stock / daily_use, 1)
        else:
            days_left = None

        reorder_qty = round(daily_use * LEAD_TIME_DAYS * SAFETY_BUFFER, 1) if daily_use > 0 else 0

        if days_left is not None and days_left <= CRITICAL_THRESHOLD_DAYS:
            urgency = "critical"
            critical += 1
        elif days_left is not None and days_left <= WARNING_THRESHOLD_DAYS:
            urgency = "warning"
            warning += 1
        else:
            urgency = "ok"
            ok += 1

        results.append({
            "ingredient_id": str(row["ingredient_id"]),
            "name": row["name"],
            "unit": row["unit"],
            "current_stock": round(stock, 2),
            "daily_consumption": round(daily_use, 2),
            "days_until_stockout": days_left,
            "suggested_reorder_qty": reorder_qty,
            "urgency": urgency,
        })

    urgency_order = {"critical": 0, "warning": 1, "ok": 2}
    results.sort(key=lambda x: (urgency_order.get(x["urgency"], 3), x["days_until_stockout"] or 999))

    return {
        "ingredients": results,
        "critical_count": critical,
        "warning_count": warning,
        "ok_count": ok,
    }
