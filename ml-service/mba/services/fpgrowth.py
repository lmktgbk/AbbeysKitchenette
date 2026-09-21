import json
import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mba.services.data_loader import load_order_baskets, load_product_details, load_combo_discount, load_margin_target
from database import get_pool


def _build_baskets(df: pd.DataFrame) -> pd.DataFrame:
    """Convert order items to one-hot encoded basket matrix using variant labels."""
    if df.empty:
        return pd.DataFrame()

    basket = (
        df.groupby(["order_id", "variant_label"])["variant_id"]
        .count()
        .unstack()
        .reset_index()
        .fillna(0)
        .set_index("order_id")
    )

    basket = basket.astype(bool)
    return basket


def _compute_rules(basket: pd.DataFrame, min_support: float = 0.02, min_confidence: float = 0.3) -> pd.DataFrame:
    """Run FP-Growth and generate association rules."""
    if basket.empty or basket.shape[1] < 2:
        return pd.DataFrame()

    freq_items = fpgrowth(basket, min_support=min_support, use_colnames=True, max_len=2)

    if freq_items.empty:
        return pd.DataFrame()

    rules = association_rules(freq_items, metric="confidence", min_threshold=min_confidence, num_itemsets=len(freq_items))

    rules = rules[rules["antecedents"].apply(len) == 1]
    rules = rules[rules["consequents"].apply(len) == 1]

    if rules.empty:
        return pd.DataFrame()

    rules["variant_a"] = rules["antecedents"].apply(lambda x: list(x)[0])
    rules["variant_b"] = rules["consequents"].apply(lambda x: list(x)[0])

    rules = rules[rules["variant_a"] != rules["variant_b"]]

    rules = rules.sort_values("lift", ascending=False)

    return rules[["variant_a", "variant_b", "support", "confidence", "lift"]].reset_index(drop=True)


async def _get_variant_details(variant_label: str, product_details: pd.DataFrame) -> dict:
    """Get variant details including recipes for a given variant label."""
    variant_rows = product_details[product_details["product_name"] + " " + product_details["size_name"] == variant_label]
    if variant_rows.empty:
        return {}

    first_row = variant_rows.iloc[0]
    ingredients = []
    for _, row in variant_rows.iterrows():
        ingredients.append({
            "ingredient_id": str(row["ingredient_id"]),
            "ingredient_name": row["ingredient_name"],
            "unit": row["unit"],
            "quantity_needed": float(row["quantity_needed"]),
            "cost_per_unit": round(float(row["cost_per_unit"]), 2),
            "line_cost": round(float(row["quantity_needed"]) * float(row["cost_per_unit"]), 2),
        })

    return {
        "product_id": str(first_row["product_id"]),
        "product_name": first_row["product_name"],
        "category_id": str(first_row["category_id"]),
        "category_name": first_row["category_name"],
        "variant_id": int(first_row["variant_id"]),
        "size_name": first_row["size_name"],
        "price": float(first_row["price"]),
        "ingredients": ingredients,
    }


def _merge_recipes(details_a: dict, details_b: dict) -> list[dict]:
    """Merge ingredients from two variants, deduplicating and summing quantities."""
    merged = {}

    for ing in details_a.get("ingredients", []):
        key = ing["ingredient_id"]
        merged[key] = {
            "ingredient_id": ing["ingredient_id"],
            "ingredient_name": ing["ingredient_name"],
            "unit": ing["unit"],
            "quantity_needed": ing["quantity_needed"],
            "cost_per_unit": ing["cost_per_unit"],
        }

    for ing in details_b.get("ingredients", []):
        key = ing["ingredient_id"]
        if key in merged:
            merged[key]["quantity_needed"] += ing["quantity_needed"]
        else:
            merged[key] = {
                "ingredient_id": ing["ingredient_id"],
                "ingredient_name": ing["ingredient_name"],
                "unit": ing["unit"],
                "quantity_needed": ing["quantity_needed"],
                "cost_per_unit": ing["cost_per_unit"],
            }

    result = []
    for ing in merged.values():
        line_cost = round(ing["quantity_needed"] * ing["cost_per_unit"], 2)
        result.append({**ing, "line_cost": line_cost})

    result.sort(key=lambda x: x["ingredient_name"])
    return result


def _compute_combo_price(merged_ingredients: list[dict], price_a: float, price_b: float, discount_percent: float = 15, margin_target: float = 0.30) -> dict:
    """Compute suggested combo price based on margin floor and bundle discount off TOTAL price."""
    total_cogs = sum(ing["line_cost"] for ing in merged_ingredients)

    min_price = round(total_cogs / (1 - margin_target), 2) if total_cogs > 0 else 0

    # Bundle discount off TOTAL price (not average)
    total_price = price_a + price_b
    discount = discount_percent / 100
    bundle_price = round(total_price * (1 - discount), 2)

    # Final price: higher of the two
    suggested_price = max(min_price, bundle_price)

    # Round to nearest 5
    suggested_price = round(suggested_price / 5) * 5
    if suggested_price < 5:
        suggested_price = 5

    margin = round((1 - total_cogs / suggested_price) * 100, 1) if suggested_price > 0 else 0

    return {
        "price_a": round(price_a, 2),
        "price_b": round(price_b, 2),
        "total_price": round(price_a + price_b, 2),
        "bundle_price": bundle_price,
        "total_cogs": round(total_cogs, 2),
        "min_price": min_price,
        "suggested_price": suggested_price,
        "margin_percent": margin,
    }


async def save_results_to_db(job_id: int, rules_list: list[dict], stats: dict) -> None:
    """Save MBA analysis results to the database.

    Rules are inserted BEFORE the status is updated to 'completed'.
    This prevents the client from seeing 'completed' with zero rules
    (race condition: client polls, sees completed, fetches rules, but they
    haven't been inserted yet).
    """
    pool = await get_pool()

    for rule in rules_list:
        await pool.execute(
            """INSERT INTO mba_rules
               (job_id, product_name_a, product_name_b, product_id_a, product_id_b,
                variant_id_a, variant_id_b, size_name_a, size_name_b,
                support, confidence, lift, is_combo, explanation, suggested_name,
                merged_ingredients, pricing)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)""",
            job_id,
            rule["product_a"],
            rule["product_b"],
            rule.get("product_a_id"),
            rule.get("product_b_id"),
            rule.get("variant_id_a"),
            rule.get("variant_id_b"),
            rule.get("size_name_a"),
            rule.get("size_name_b"),
            rule["support"],
            rule["confidence"],
            rule["lift"],
            rule.get("is_combo", True),
            rule.get("explanation"),
            rule.get("suggested_name"),
            json.dumps(rule.get("merged_ingredients")) if rule.get("merged_ingredients") else None,
            json.dumps(rule.get("pricing")) if rule.get("pricing") else None,
        )

    await pool.execute(
        """UPDATE mba_jobs
           SET status = 'completed',
               total_orders = $1,
               products_analyzed = $2,
               combos_found = $3,
               completed_at = NOW()
           WHERE id = $4""",
        stats["total_orders"],
        stats["products_analyzed"],
        stats["combos_found"],
        job_id,
    )


async def mark_job_failed(job_id: int, error: str) -> None:
    """Mark a job as failed with error message."""
    pool = await get_pool()
    await pool.execute(
        """UPDATE mba_jobs
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2""",
        error[:500],
        job_id,
    )


async def run_market_basket_analysis(
    min_support: float = 0.005,
    min_confidence: float = 0.3,
    top_n: int = 20,
) -> dict:
    """Run the full MBA pipeline: load data → FP-Growth → rules → explanations → pricing."""
    # Load config from settings
    discount_percent = await load_combo_discount()
    margin_target = await load_margin_target()

    # Step 1: Load order baskets (variant level)
    baskets_df = await load_order_baskets()
    if baskets_df.empty:
        return {
            "rules": [],
            "stats": {"total_orders": 0, "products_analyzed": 0, "combos_found": 0},
        }

    unique_orders = baskets_df["order_id"].nunique()
    if unique_orders < 50:
        return {
            "rules": [],
            "stats": {"total_orders": unique_orders, "products_analyzed": 0, "combos_found": 0},
        }

    # Step 2: Build basket matrix
    basket_matrix = _build_baskets(baskets_df)
    if basket_matrix.empty:
        return {
            "rules": [],
            "stats": {"total_orders": 0, "products_analyzed": 0, "combos_found": 0},
        }

    # Step 3: Run FP-Growth
    rules_df = _compute_rules(basket_matrix, min_support=min_support, min_confidence=min_confidence)
    if rules_df.empty:
        return {
            "rules": [],
            "stats": {
                "total_orders": len(baskets_df["order_id"].unique()),
                "products_analyzed": basket_matrix.shape[1],
                "combos_found": 0,
            },
        }

    # Step 4: Limit to top N rules
    rules_df = rules_df.head(top_n)

    # Step 5: Load product details for recipe merging
    product_details = await load_product_details()

    # Step 6: Build rules list with explanations + pricing for ALL rules
    rules_list = []

    for idx, row in rules_df.iterrows():
        variant_a = row["variant_a"]
        variant_b = row["variant_b"]
        confidence = float(row["confidence"])
        lift = float(row["lift"])
        support = float(row["support"])

        # Get variant details
        details_a = await _get_variant_details(variant_a, product_details)
        details_b = await _get_variant_details(variant_b, product_details)

        # Merge recipes and compute pricing for ALL rules
        merged_ingredients = _merge_recipes(details_a, details_b)
        price_a = details_a.get("price", 0)
        price_b = details_b.get("price", 0)
        pricing = _compute_combo_price(merged_ingredients, price_a, price_b, discount_percent, margin_target)

        explanation = None

        # Score for ranking: confidence * lift (how good the promotion is)
        score = round(confidence * lift, 4)
        rule_entry = {
            "id": idx + 1,
            "product_a": details_a.get("product_name", variant_a),
            "product_b": details_b.get("product_name", variant_b),
            "product_a_id": details_a.get("product_id"),
            "product_b_id": details_b.get("product_id"),
            "variant_id_a": details_a.get("variant_id"),
            "variant_id_b": details_b.get("variant_id"),
            "size_name_a": details_a.get("size_name"),
            "size_name_b": details_b.get("size_name"),
            "support": round(support, 4),
            "confidence": round(confidence, 4),
            "lift": round(lift, 2),
            "score": score,
            "is_combo": True,
            "explanation": explanation,
            "suggested_name": f"{variant_a} + {variant_b}",
            "merged_ingredients": merged_ingredients,
            "pricing": pricing,
        }
        rules_list.append(rule_entry)

    # Rank by score (confidence * lift) — best promotions first
    rules_list.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(rules_list):
        r["id"] = i + 1

    return {
        "rules": rules_list,
        "stats": {
            "total_orders": len(baskets_df["order_id"].unique()),
            "products_analyzed": basket_matrix.shape[1],
            "combos_found": len(rules_list),
        },
    }
