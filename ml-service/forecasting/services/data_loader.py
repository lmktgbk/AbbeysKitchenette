"""Read forecast inputs in grouped queries; no fitting or inventory mutation occurs here."""
import pandas as pd
from database import get_pool


async def load_variant_daily_sales() -> pd.DataFrame:
    """Read completed, nonremoved sales for nonarchived products without discarding unavailable variant history."""
    # Include never-sold catalog variants as zero rows so they are visible in results.
    # Other missing dates are filled by the pipeline; availability does not erase sales.
    pool = await get_pool()
    rows = await pool.fetch("""
        WITH sales AS (
            SELECT oi.variant_id, o.order_date,
                   SUM(oi.quantity)::int AS units
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id
            WHERE o.status = 'completed'
              AND oi.removed_at IS NULL
              AND o.order_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
            GROUP BY oi.variant_id, o.order_date
        )
        SELECT pv.variant_id, pv.product_id, p.product_name,
               pv.size_name, pv.price::float AS price, sc.category_id,
               COALESCE(s.order_date, (NOW() AT TIME ZONE 'Asia/Manila')::date - 1)::text AS ds,
               COALESCE(s.units, 0)::int AS units
        FROM product_variants pv
        JOIN products p ON p.product_id = pv.product_id
        JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
        LEFT JOIN sales s ON s.variant_id = pv.variant_id
        WHERE p.is_archived = FALSE
        ORDER BY pv.variant_id, s.order_date
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
    """Read current recipe quantities for nonarchived ingredients; this is not a forecast-time snapshot."""
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
    """Sum remaining batch quantities for nonarchived ingredients, including batches without an expiry filter."""
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
