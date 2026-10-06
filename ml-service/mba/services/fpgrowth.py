"""Mine variant-ID pairs in a child worker, evaluate recent support, and build priced recipe suggestions."""
import json
import math
import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mba.services.data_loader import load_order_baskets, load_product_details
from jobs import job_connection

# Application defaults; request parameters may override support/confidence/top-N.
# Lift is a strict acceptance threshold; conviction is reported, not used as a filter.
MIN_SUPPORT = 0.005
MIN_CONFIDENCE = 0.08
MIN_LIFT = 1.1
TOP_N = 20
MIN_TRAIN_BASKETS = 10
MIN_RECENT_BASKETS = 5

# Temporal stability: mined on the older 80% of trading days, re-verified on
# the newest 20%. A rule is stable when the recent window keeps at least half
# the support/confidence bars with lift still above independence.
STABILITY_SUPPORT_FRAC = 0.5
STABILITY_CONF_FRAC = 0.5


def _build_baskets(df: pd.DataFrame) -> pd.DataFrame:
    """Build one boolean row per order/variant ID: repeated lines count as presence, not sales quantity."""
    if df.empty:
        return pd.DataFrame()

    basket = (
        df.groupby(["order_id", "variant_id"])["variant_id"]
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

    Acceptance uses requested support/confidence and fixed lift > MIN_LIFT.
    Conviction is reported but does not filter acceptance. Mirror duplicates
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

    # Count directly from the mining window; rounded support cannot recover exact counts.
    rules["supporting_baskets"] = rules.apply(lambda r: int((basket[r.variant_a] & basket[r.variant_b]).sum()), axis=1)
    rules = rules[rules["supporting_baskets"] >= MIN_TRAIN_BASKETS]
    return rules[["variant_a", "variant_b", "support", "confidence", "lift",
                  "conviction", "supporting_baskets"]].reset_index(drop=True)


def _verify_on_recent(recent_matrix: pd.DataFrame, variant_a: str, variant_b: str) -> dict:
    """Recompute support/confidence/lift for one pair on the recent window.

    Missing columns (item never sold recently) count as all-False: the rule
    then scores 0 and is correctly marked unstable, not silently skipped.
    """
    import numpy as np

    n = len(recent_matrix)
    if n == 0:
        return {"support": 0.0, "confidence": 0.0, "lift": 0.0, "supporting_baskets": 0, "window_baskets": n}
    a = recent_matrix[variant_a].values if variant_a in recent_matrix.columns else np.zeros(n, dtype=bool)
    b = recent_matrix[variant_b].values if variant_b in recent_matrix.columns else np.zeros(n, dtype=bool)
    both = float(np.mean(a & b))
    pa = float(np.mean(a))
    pb = float(np.mean(b))
    conf = (both / pa) if pa > 0 else 0.0
    lift = (conf / pb) if pb > 0 else 0.0
    return {"support": both, "confidence": conf, "lift": lift,
            "supporting_baskets": int((a & b).sum()), "window_baskets": n}


def _is_stable(recent: dict, min_support: float, min_confidence: float) -> bool:
    """Stable = the recent window keeps at least half the support/confidence
    bars with lift still above independence (MIN_LIFT)."""
    return (recent.get("supporting_baskets", 0) >= MIN_RECENT_BASKETS
            and recent["support"] >= min_support * STABILITY_SUPPORT_FRAC
            and recent["confidence"] >= min_confidence * STABILITY_CONF_FRAC
            and recent["lift"] > MIN_LIFT)


def _get_variant_details(variant_id, details_by_id: dict) -> dict:
    """Read one ID-indexed recipe group, retaining unit cost precision and unknown costs."""
    variant_rows = details_by_id.get(variant_id)
    if variant_rows is None or variant_rows.empty:
        return {}

    first_row = variant_rows.iloc[0]
    ingredients = []
    for _, row in variant_rows.iterrows():
        ingredients.append({
            "ingredient_id": str(row["ingredient_id"]),
            "ingredient_name": row["ingredient_name"],
            "unit": row["unit"],
            "quantity_needed": float(row["quantity_needed"]),
            "cost_per_unit": float(row["cost_per_unit"]) if pd.notna(row["cost_per_unit"]) else None,
            "line_cost": float(row["quantity_needed"]) * float(row["cost_per_unit"]) if pd.notna(row["cost_per_unit"]) else None,
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
    """Sum shared ingredient quantities, retain A's unit/cost metadata, and sort by name.

    Units are not converted; source recipes must already use the ingredient's
    canonical unit. Neither input recipe is mutated.
    """
    merged = {}

    # Each source recipe is unique by ingredient ID. Shared ingredients retain A's metadata/cost.
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
        line_cost = ing["quantity_needed"] * ing["cost_per_unit"] if ing["cost_per_unit"] is not None else None
        result.append({**ing, "line_cost": line_cost})

    result.sort(key=lambda x: x["ingredient_name"])
    return result


def _compute_combo_price(merged_ingredients: list[dict], price_a: float, price_b: float) -> dict:
    """Default to the source prices, with no assumed discount or profit guarantee.

    Missing recipe/cost data must stay unknown, rather than implying zero cost.
    Round only presentation totals; unit costs retain their source precision.
    """
    complete = bool(merged_ingredients) and all(
        i.get("line_cost") is not None and math.isfinite(i["line_cost"]) and i["line_cost"] >= 0
        for i in merged_ingredients)
    total = round(price_a + price_b, 2)
    cost = sum(i["line_cost"] for i in merged_ingredients) if complete else None
    return {"price_a": price_a, "price_b": price_b, "total_price": total,
            "suggested_price": total, "cost_complete": complete,
            "total_cogs": round(cost, 2) if cost is not None else None,
            "ingredient_margin": round((1 - cost / total) * 100, 2) if cost is not None and total > 0 else None,
            "policy": "combined_prices"}


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
                    conviction, stable, recent_support, recent_confidence, recent_lift, evidence)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                           $18, $19, $20, $21, $22, $23)""",
                *params,
                conviction,
                rule.get("stable", False),
                rule.get("recent_support"),
                rule.get("recent_confidence"),
                rule.get("recent_lift"),
                json.dumps(rule["evidence"]),
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

    Rules are mined by variant ID (exact sizes feed combo pricing and
    recipes). Temporal split is by trading day, oldest 80% vs newest 20%.
    """
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
    # verifies. Stability is reported on every returned rule, not used to filter the list.
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

    # Rank after recent verification so unstable training winners cannot fill the list.

    # Step 7: Load product details for recipe merging
    product_details = await load_product_details()
    # IDs remain stable when products are renamed or two labels happen to match.
    # Index once so each candidate does not scan the complete recipe frame.
    details_by_id = {variant_id: group for variant_id, group in product_details.groupby("variant_id", sort=False)}

    # Step 8: Build rules list with stability verdict + pricing for ALL rules
    rules_list = []

    for idx, row in rules_df.iterrows():
        variant_a = row["variant_a"]
        variant_b = row["variant_b"]
        confidence = float(row["confidence"])
        lift = float(row["lift"])
        support = float(row["support"])
        raw_conv = float(row["conviction"])
        # Map nonfinite conviction to null so response/persistence JSON stays serializable.
        conviction = round(raw_conv, 2) if math.isfinite(raw_conv) else None

        # Get variant details
        details_a = _get_variant_details(variant_a, details_by_id)
        details_b = _get_variant_details(variant_b, details_by_id)

        if not details_a or not details_b:
            continue

        # Merge recipes and compute pricing for ALL rules
        merged_ingredients = _merge_recipes(details_a, details_b)
        price_a = details_a.get("price", 0)
        price_b = details_b.get("price", 0)
        pricing = _compute_combo_price(merged_ingredients, price_a, price_b)

        # Temporal stability verdict from the recent window.
        recent = recent_sets[(variant_a, variant_b)]
        stable = _is_stable(recent, min_support, min_confidence)

        # Retain the legacy association score for API consumers; evidence controls ranking.
        score = round(confidence * lift, 4)
        rule_entry = {
            "id": idx + 1,
            "product_a": details_a["product_name"],
            "product_b": details_b["product_name"],
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
            "suggested_name": f"{details_a['product_name']} ({details_a['size_name']}) + {details_b['product_name']} ({details_b['size_name']})",
            "merged_ingredients": merged_ingredients,
            "pricing": pricing,
            "stable": stable,
            "evidence": {"version": 1, "training_baskets": len(basket_matrix),
                         "supporting_baskets": int(row["supporting_baskets"]),
                         "recent_baskets": len(recent_matrix), "recent_supporting_baskets": recent["supporting_baskets"],
                         "recent_from": str(cut), "min_training_count": MIN_TRAIN_BASKETS, "min_recent_count": MIN_RECENT_BASKETS},
            "recent_support": recent["support"],
            "recent_confidence": recent["confidence"],
            "recent_lift": recent["lift"],
        }
        rules_list.append(rule_entry)

    # Rank by score (confidence * lift) — best promotions first
    rules_list.sort(key=lambda x: (x["stable"], x["evidence"]["recent_supporting_baskets"], x["evidence"]["supporting_baskets"], x["confidence"], x["lift"]), reverse=True)
    rules_list = rules_list[:top_n]
    # These IDs are temporary ranks; persistence generates the actual stored rule IDs.
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
