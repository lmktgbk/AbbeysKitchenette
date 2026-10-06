"""Read current basket/catalog inputs; no stock reservation or product creation occurs here."""
import pandas as pd
from database import get_pool

async def load_order_baskets(min_date: str | None = None) -> pd.DataFrame:
    """Load order baskets at variant level — each row is (order_id, order_date,
    variant_id, variant_label, product_name, size_name). order_date drives the
    80/20 temporal stability split (oldest 80% mined, newest 20% verified)."""
    pool = await get_pool()
    # Only a fixed SQL clause is selected here; the date itself remains a bound parameter.
    where = "AND o.order_date >= $1" if min_date else ""
    params = [min_date] if min_date else []

    query = f"""
        SELECT
            o.order_id,
            o.order_date::text AS order_date,
            pv.variant_id,
            p.product_name || ' ' || pv.size_name AS variant_label,
            p.product_name,
            pv.size_name
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        JOIN product_variants pv ON pv.variant_id = oi.variant_id
        JOIN products p ON p.product_id = pv.product_id
        WHERE o.status = 'completed'
          AND oi.removed_at IS NULL
          AND o.order_date IS NOT NULL
          {where}
        ORDER BY o.order_id, pv.variant_id
    """
    rows = await pool.fetch(query, *params)
    if not rows:
        return pd.DataFrame(columns=["order_id", "order_date", "variant_id", "variant_label", "product_name", "size_name"])
    df = pd.DataFrame([dict(r) for r in rows])
    df["order_date"] = pd.to_datetime(df["order_date"])
    return df


async def load_product_details() -> pd.DataFrame:
    """Read current active recipes and quantity-weighted historical batch costs for suggestions.

    Inner joins omit variants without recipes. Cost weighting uses all batch
    quantities added, not only remaining or unexpired stock.
    """
    pool = await get_pool()
    rows = await pool.fetch("""
        WITH ingredient_costs AS (
            SELECT ingredient_id,
                   SUM(quantity_added * cost_per_unit) / NULLIF(SUM(quantity_added), 0) AS cost_per_unit
            FROM restock_batches GROUP BY ingredient_id
        )
        SELECT
            p.product_id,
            p.product_name,
            sc.category_id,
            c.category_name,
            pv.variant_id,
            pv.size_name,
            pv.price::float AS price,
            r.ingredient_id,
            i.ingredient_name,
            i.unit,
            r.quantity_needed::float AS quantity_needed,
            ic.cost_per_unit::float AS cost_per_unit
        FROM products p
        JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
        JOIN categories c ON c.category_id = sc.category_id
        JOIN product_variants pv ON pv.product_id = p.product_id
        JOIN recipes r ON r.variant_id = pv.variant_id
        JOIN ingredients i ON i.ingredient_id = r.ingredient_id
        LEFT JOIN ingredient_costs ic ON ic.ingredient_id = r.ingredient_id
        WHERE p.is_archived = FALSE
          AND pv.is_available = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM recipes rx JOIN ingredients ix ON ix.ingredient_id=rx.ingredient_id
            WHERE rx.variant_id=pv.variant_id AND ix.is_archived=TRUE
          )
        ORDER BY p.product_id, pv.size_name, i.ingredient_name
    """)
    if not rows:
        return pd.DataFrame(columns=[
            "product_id", "product_name", "category_id", "category_name",
            "variant_id", "size_name", "price",
            "ingredient_id", "ingredient_name", "unit", "quantity_needed", "cost_per_unit",
        ])
    return pd.DataFrame([dict(r) for r in rows])
