import pandas as pd
from database import get_pool


async def load_variant_daily_sales() -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT
            pv.variant_id,
            pv.product_id,
            p.product_name,
            pv.size_name,
            pv.price::float AS price,
            p.category_id,
            o.order_date::text AS ds,
            SUM(oi.quantity)::int AS units
        FROM product_variants pv
        JOIN products p ON p.product_id = pv.product_id
        JOIN order_items oi ON oi.variant_id = pv.variant_id
        JOIN orders o ON o.order_id = oi.order_id
        WHERE o.status = 'completed'
          AND pv.is_available = TRUE
          AND o.order_date IS NOT NULL
        GROUP BY pv.variant_id, p.product_id, p.product_name,
                 pv.size_name, pv.price, p.category_id, o.order_date
        ORDER BY pv.variant_id, o.order_date
    """)
    if not rows:
        return pd.DataFrame(columns=[
            "variant_id", "product_id", "product_name", "size_name",
            "price", "category_id", "ds", "units",
        ])
    df = pd.DataFrame([dict(r) for r in rows])
    df["ds"] = pd.to_datetime(df["ds"])
    return df


async def load_recipe_map() -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT
            r.variant_id,
            r.ingredient_id,
            i.ingredient_name,
            i.unit,
            r.quantity_needed::float AS quantity_needed
        FROM recipes r
        JOIN ingredients i ON i.ingredient_id = r.ingredient_id
        WHERE i.is_archived = FALSE
    """)
    if not rows:
        return pd.DataFrame(columns=[
            "variant_id", "ingredient_id", "ingredient_name", "unit", "quantity_needed",
        ])
    return pd.DataFrame([dict(r) for r in rows])


async def load_current_stock() -> pd.DataFrame:
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT
            i.ingredient_id,
            i.ingredient_name,
            i.unit,
            COALESCE(SUM(rb.quantity_left), 0)::float AS current_stock
        FROM ingredients i
        LEFT JOIN restock_batches rb ON rb.ingredient_id = i.ingredient_id
        WHERE i.is_archived = FALSE
        GROUP BY i.ingredient_id, i.ingredient_name, i.unit
    """)
    if not rows:
        return pd.DataFrame(columns=["ingredient_id", "ingredient_name", "unit", "current_stock"])
    return pd.DataFrame([dict(r) for r in rows])
