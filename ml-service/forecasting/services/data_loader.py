import pandas as pd
from database import get_pool


async def load_daily_sales() -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT
            order_date::text AS ds,
            SUM(total_amount)::float AS revenue,
            COUNT(*)::int AS orders
        FROM orders
        WHERE status = 'completed'
          AND order_date IS NOT NULL
        GROUP BY order_date
        ORDER BY order_date ASC
    """)
    if not rows:
        return pd.DataFrame(columns=["ds", "revenue", "orders"])
    df = pd.DataFrame([dict(r) for r in rows])
    df["ds"] = pd.to_datetime(df["ds"])
    return df


async def load_ingredient_stock() -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT
            i.ingredient_id,
            i.ingredient_name AS name,
            i.unit,
            COALESCE(SUM(rb.quantity_left), 0)::float AS current_stock
        FROM ingredients i
        LEFT JOIN restock_batches rb ON rb.ingredient_id = i.ingredient_id
        WHERE i.is_archived = FALSE
        GROUP BY i.ingredient_id, i.ingredient_name, i.unit
        ORDER BY i.ingredient_name ASC
    """)
    if not rows:
        return pd.DataFrame(columns=["ingredient_id", "name", "unit", "current_stock"])
    return pd.DataFrame([dict(r) for r in rows])


async def load_ingredient_consumption(days: int = 30) -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch(f"""
        SELECT
            oid.ingredient_id,
            SUM(oid.quantity_deducted)::float AS total_consumed
        FROM order_ingredient_deduction oid
        JOIN orders o ON o.order_id = oid.order_id
        WHERE o.status = 'completed'
          AND oid.reversed_at IS NULL
          AND o.completed_at >= NOW() - INTERVAL '{days} days'
        GROUP BY oid.ingredient_id
    """)
    if not rows:
        return pd.DataFrame(columns=["ingredient_id", "total_consumed"])
    df = pd.DataFrame([dict(r) for r in rows])
    df["daily_consumption"] = df["total_consumed"] / days
    return df


async def load_product_sales(period_days: int = 30) -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch(f"""
        SELECT
            oi.product_id,
            p.product_name AS name,
            SUM(oi.quantity)::int AS total_sold
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        JOIN products p ON p.product_id = oi.product_id
        WHERE o.status = 'completed'
          AND o.order_date >= (CURRENT_DATE - INTERVAL '{period_days} days')
        GROUP BY oi.product_id, p.product_name
        ORDER BY total_sold DESC
    """)
    if not rows:
        return pd.DataFrame(columns=["product_id", "name", "total_sold"])
    df = pd.DataFrame([dict(r) for r in rows])
    df["daily_avg"] = round(df["total_sold"] / period_days, 1)
    return df


async def load_product_sales_split(period_days: int = 30) -> pd.DataFrame:
    half = period_days // 2
    pool = await get_pool()
    rows = await pool.fetch(f"""
        SELECT
            oi.product_id,
            p.product_name AS name,
            SUM(oi.quantity)::int AS total_sold,
            CASE
                WHEN o.order_date >= (CURRENT_DATE - INTERVAL '{half} days') THEN 'second_half'
                ELSE 'first_half'
            END AS half
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        JOIN products p ON p.product_id = oi.product_id
        WHERE o.status = 'completed'
          AND o.order_date >= (CURRENT_DATE - INTERVAL '{period_days} days')
        GROUP BY oi.product_id, p.product_name, half
    """)
    if not rows:
        return pd.DataFrame(columns=["product_id", "name", "total_sold", "half"])
    return pd.DataFrame([dict(r) for r in rows])
