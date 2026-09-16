import pandas as pd
from database import get_pool


async def load_order_baskets(min_date: str | None = None) -> pd.DataFrame:
    """Load order baskets at variant level — each row is (order_id, variant_id, variant_label, product_name, size_name)."""
    pool = await get_pool()
    where = "AND o.order_date >= $1" if min_date else ""
    params = [min_date] if min_date else []

    query = f"""
        SELECT
            o.order_id,
            pv.variant_id,
            p.product_name || ' ' || pv.size_name AS variant_label,
            p.product_name,
            pv.size_name
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        JOIN product_variants pv ON pv.variant_id = oi.variant_id
        JOIN products p ON p.product_id = pv.product_id
        WHERE o.status = 'completed'
          AND p.is_archived = FALSE
          AND pv.is_available = TRUE
          AND oi.removed_at IS NULL
          {where}
        ORDER BY o.order_id, pv.variant_id
    """
    rows = await pool.fetch(query, *params)
    if not rows:
        return pd.DataFrame(columns=["order_id", "variant_id", "variant_label", "product_name", "size_name"])
    return pd.DataFrame([dict(r) for r in rows])


async def load_product_details() -> pd.DataFrame:
    """Load product + variant + recipe + ingredient details for combo creation."""
    pool = await get_pool()
    rows = await pool.fetch("""
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
            COALESCE(
                (SELECT SUM(rb.quantity_added * rb.cost_per_unit) / SUM(rb.quantity_added)
                 FROM restock_batches rb
                 WHERE rb.ingredient_id = r.ingredient_id),
                0
            )::float AS cost_per_unit
        FROM products p
        JOIN subcategories sc ON sc.subcategory_id = p.subcategory_id
        JOIN categories c ON c.category_id = sc.category_id
        JOIN product_variants pv ON pv.product_id = p.product_id
        JOIN recipes r ON r.variant_id = pv.variant_id
        JOIN ingredients i ON i.ingredient_id = r.ingredient_id
        WHERE p.is_archived = FALSE
          AND pv.is_available = TRUE
          AND i.is_archived = FALSE
        ORDER BY p.product_id, pv.size_name, i.ingredient_name
    """)
    if not rows:
        return pd.DataFrame(columns=[
            "product_id", "product_name", "category_id", "category_name",
            "variant_id", "size_name", "price",
            "ingredient_id", "ingredient_name", "unit", "quantity_needed", "cost_per_unit",
        ])
    return pd.DataFrame([dict(r) for r in rows])


async def load_combo_discount() -> float:
    """Load combo discount percentage from system settings."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT combo_discount_percent FROM system_settings WHERE id = 1")
    if row and row["combo_discount_percent"] is not None:
        return float(row["combo_discount_percent"])
    return 15.0


async def load_margin_target() -> float:
    """Load minimum margin percentage from system settings."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT min_margin_percent FROM system_settings WHERE id = 1")
    if row and row["min_margin_percent"] is not None:
        return float(row["min_margin_percent"]) / 100
    return 0.30
