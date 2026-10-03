import json
import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mba.services.data_loader import load_order_baskets, load_product_details, load_combo_discount
from jobs import job_connection

# Acceptance baseline (paper §evaluation), calibrated empirically 2026-09:
# a threshold sweep proved confidence >= 30% yields zero rules at 210-variant
# grain (max observed ~10%), so bars sit where the data lives — support >=
# 0.5% (>= ~60 baskets), confidence >= 8%, lift > 1.1 (above independence
# noise). Conviction >= 1.2 reported. Bundle discount is a named constant.
MIN_SUPPORT = 0.005
MIN_CONFIDENCE = 0.08
MIN_LIFT = 1.1
MIN_CONVICTION = 1.2
BUNDLE_DISCOUNT_PERCENT = 15.0
TOP_N = 20

# Temporal stability: mined on the older 80% of trading days, re-verified on
# the newest 20%. A rule is stable when the recent window keeps at least half
# the support/confidence bars with lift still above independence.
STABILITY_SUPPORT_FRAC = 0.5
STABILITY_CONF_FRAC = 0.5


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


def _compute_rules(basket: pd.DataFrame, min_support: float = MIN_SUPPORT,
                   min_confidence: float = MIN_CONFIDENCE) -> pd.DataFrame:
    """Run FP-Growth and generate 1->1 association rules.

    Acceptance bars: support >= MIN_SUPPORT, confidence >= MIN_CONFIDENCE,
    lift > MIN_LIFT (beats independence). Conviction is carried for the
    paper (implication strength, free from mlxtend). Mirror duplicates
    (A->B and B->A) collapse to the stronger direction by score.
    """
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
    rules = rules[rules["lift"] > MIN_LIFT]

    if rules.empty:
        return pd.DataFrame()

    rules["score"] = rules["confidence"] * rules["lift"]
    rules = rules.sort_values("score", ascending=False)

    # Mirror dedupe: keep the stronger direction per unordered pair so one
    # pairing never becomes two "combos".
    rules["pair"] = rules.apply(
        lambda r: tuple(sorted([r["variant_a"], r["variant_b"]])), axis=1)
    rules = rules.drop_duplicates(subset="pair", keep="first").drop(columns="pair")

    return rules[["variant_a", "variant_b", "support", "confidence", "lift",
                  "conviction"]].reset_index(drop=True)


def _verify_on_recent(recent_matrix: pd.DataFrame, variant_a: str, variant_b: str) -> dict:
    """Recompute support/confidence/lift for one pair on the recent window.

    Missing columns (item never sold recently) count as all-False: the rule
    then scores 0 and is correctly marked unstable, not silently skipped.
    """
    import numpy as np

    n = len(recent_matrix)
    if n == 0:
        return {"support": 0.0, "confidence": 0.0, "lift": 0.0}
    a = recent_matrix[variant_a].values if variant_a in recent_matrix.columns else np.zeros(n, dtype=bool)
    b = recent_matrix[variant_b].values if variant_b in recent_matrix.columns else np.zeros(n, dtype=bool)
    both = float(np.mean(a & b))
    pa = float(np.mean(a))
    pb = float(np.mean(b))
    conf = (both / pa) if pa > 0 else 0.0
    lift = (conf / pb) if pb > 0 else 0.0
    return {"support": round(both, 4), "confidence": round(conf, 4), "lift": round(lift, 2)}


def _is_stable(recent: dict, min_support: float, min_confidence: float) -> bool:
    """Stable = the recent window keeps at least half the support/confidence
    bars with lift still above independence (MIN_LIFT)."""
    return (recent["support"] >= min_support * STABILITY_SUPPORT_FRAC
            and recent["confidence"] >= min_confidence * STABILITY_CONF_FRAC
            and recent["lift"] > MIN_LIFT)

    return rules[["variant_a", "variant_b", "support", "confidence", "lift",
                  "conviction", "score"]].reset_index(drop=True)


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


def _compute_combo_price(merged_ingredients: list[dict], price_a: float, price_b: float,
                         discount_percent: float = BUNDLE_DISCOUNT_PERCENT) -> dict:
    """Combo price from the bundle discount off TOTAL price.

    Guards: break-even floor (total_cogs + 1, from real recipe costs) and
    round-to-5. No margin metric is produced — no margin-floor policy exists
    to give it decision basis; cost and floor are retained as real inputs.
    """
    total_cogs = sum(ing["line_cost"] for ing in merged_ingredients)

    min_price = round(total_cogs + 1, 2) if total_cogs > 0 else 0

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

    return {
        "price_a": round(price_a, 2),
        "price_b": round(price_b, 2),
        "total_price": round(price_a + price_b, 2),
        "bundle_price": bundle_price,
        "total_cogs": round(total_cogs, 2),
        "min_price": min_price,
        "suggested_price": suggested_price,
    }


async def save_results_to_db(job_id: int, rules_list: list[dict], stats: dict) -> None:
    """Publish all rules and completion together; a failed insert rolls back the batch."""
    async with job_connection("mba", job_id) as pool:

        for rule in rules_list:
            conviction = rule.get("conviction")
            params = [
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
            ]
            await pool.execute(
                """INSERT INTO mba_rules
                   (job_id, product_name_a, product_name_b, product_id_a, product_id_b,
                    variant_id_a, variant_id_b, size_name_a, size_name_b,
                    support, confidence, lift, is_combo, explanation, suggested_name,
                    merged_ingredients, pricing,
                    conviction, stable, recent_support, recent_confidence, recent_lift)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                           $18, $19, $20, $21, $22)""",
                *params,
                conviction,
                rule.get("stable", False),
                rule.get("recent_support"),
                rule.get("recent_confidence"),
                rule.get("recent_lift"),
            )

        await pool.execute(
            """UPDATE mba_jobs
               SET status = 'completed',
                   total_orders = $1,
                   products_analyzed = $2,
                   combos_found = $3,
                   completed_at = NOW(), lease_owner = NULL, lease_expires_at = NULL
               WHERE id = $4""",
            stats["total_orders"],
            stats["products_analyzed"],
            stats["combos_found"],
            job_id,
        )


async def run_market_basket_analysis(
    min_support: float = MIN_SUPPORT,
    min_confidence: float = MIN_CONFIDENCE,
    top_n: int = TOP_N,
) -> dict:
    """Run the full MBA pipeline: load data → 80/20 time split → FP-Growth
    on the older window → stability re-check on the newest window → pricing.

    Rules are mined at variant level (exact sizes feed combo pricing and
    recipes). Temporal split is by trading day, oldest 80% vs newest 20%.
    """
    # Load config from settings (discount only, no margin floor)
    discount_percent = await load_combo_discount()

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

    # Step 2: Temporal split by trading day — oldest 80% mined, newest 20%
    # verifies. A rule that only existed in one good week is not promotable.
    days = sorted(baskets_df["order_date"].dt.date.unique())
    cut = days[int(len(days) * 0.8)]
    cut_ts = pd.Timestamp(cut)
    old_df = baskets_df[baskets_df["order_date"] < cut_ts]
    recent_df = baskets_df[baskets_df["order_date"] >= cut_ts]

    # Step 3: Build basket matrix on the OLD window and run FP-Growth
    basket_matrix = _build_baskets(old_df)
    if basket_matrix.empty:
        return {
            "rules": [],
            "stats": {"total_orders": 0, "products_analyzed": 0, "combos_found": 0},
        }

    # Step 4: Run FP-Growth
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

    # Step 5: Re-verify every rule on the RECENT window (same definitions).
    recent_matrix = _build_baskets(recent_df)
    recent_sets = {}
    for _, row in rules_df.iterrows():
        recent_sets[(row["variant_a"], row["variant_b"])] = _verify_on_recent(
            recent_matrix, row["variant_a"], row["variant_b"])

    # Step 6: Limit to top N rules
    rules_df = rules_df.head(top_n)

    # Step 7: Load product details for recipe merging
    product_details = await load_product_details()

    # Step 8: Build rules list with stability verdict + pricing for ALL rules
    rules_list = []

    for idx, row in rules_df.iterrows():
        variant_a = row["variant_a"]
        variant_b = row["variant_b"]
        confidence = float(row["confidence"])
        lift = float(row["lift"])
        support = float(row["support"])
        raw_conv = float(row["conviction"])
        # Conviction is inf at confidence 1.0 — unserializable, so cap it.
        import math
        conviction = round(raw_conv, 2) if math.isfinite(raw_conv) else None

        # Get variant details
        details_a = await _get_variant_details(variant_a, product_details)
        details_b = await _get_variant_details(variant_b, product_details)

        # Merge recipes and compute pricing for ALL rules
        merged_ingredients = _merge_recipes(details_a, details_b)
        price_a = details_a.get("price", 0)
        price_b = details_b.get("price", 0)
        pricing = _compute_combo_price(merged_ingredients, price_a, price_b, discount_percent)

        # Temporal stability verdict from the recent window.
        recent = recent_sets.get((variant_a, variant_b),
                                 {"support": 0.0, "confidence": 0.0, "lift": 0.0})
        stable = _is_stable(recent, min_support, min_confidence)

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
            "conviction": conviction,
            "score": score,
            "is_combo": True,
            "explanation": None,
            "suggested_name": f"{variant_a} + {variant_b}",
            "merged_ingredients": merged_ingredients,
            "pricing": pricing,
            "stable": stable,
            "recent_support": recent["support"],
            "recent_confidence": recent["confidence"],
            "recent_lift": recent["lift"],
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
