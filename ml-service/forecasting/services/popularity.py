from forecasting.services.data_loader import load_product_sales, load_product_sales_split


async def get_popularity(period_days: int = 30) -> dict:
    sales_df = await load_product_sales(period_days)
    split_df = await load_product_sales_split(period_days)

    if sales_df.empty:
        return {"products": [], "period": f"{period_days}d"}

    products = sales_df.to_dict("records")

    trend_map = {}
    if not split_df.empty:
        pivoted = split_df.pivot_table(
            index=["product_id", "name"],
            columns="half",
            values="total_sold",
            aggfunc="sum",
            fill_value=0,
        ).reset_index()

        for _, row in pivoted.iterrows():
            pid = row["product_id"]
            first = row.get("first_half", 0)
            second = row.get("second_half", 0)

            if first > 0:
                pct = round(((second - first) / first) * 100, 1)
            elif second > 0:
                pct = 100.0
            else:
                pct = 0.0

            if pct > 10:
                trend = "rising"
            elif pct < -10:
                trend = "falling"
            else:
                trend = "stable"

            trend_map[pid] = {"trend": trend, "trend_pct": pct}

    result = []
    for rank, p in enumerate(products, 1):
        pid = p["product_id"]
        t = trend_map.get(pid, {"trend": "stable", "trend_pct": 0})
        result.append({
            "product_id": str(pid),
            "name": p["name"],
            "total_sold": p["total_sold"],
            "daily_avg": p["daily_avg"],
            "trend": t["trend"],
            "trend_pct": t["trend_pct"],
            "rank": rank,
        })

    return {"products": result, "period": f"{period_days}d"}
