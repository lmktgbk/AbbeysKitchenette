"""Isolated MBA pricing, mining and response regressions; never connect to business data."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID
import pandas as pd
from asyncpg import UndefinedColumnError, UndefinedTableError
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from mba.services import fpgrowth as mba
from mba.services import data_loader
from mba.routers import association

class BasketCalculations(unittest.TestCase):
    def test_price_rounding_cannot_cross_below_recipe_cost_floor(self):
        result = mba._compute_combo_price([{"line_cost": 31}], 15, 15)
        self.assertEqual(result["min_price"], 32)
        self.assertEqual(result["suggested_price"], 35)

    def test_price_floor_properties_across_rounding_boundaries(self):
        for cost in [0, 1, 4, 4.01, 6, 11, 31, 31.01, 34, 36.01, 99.99, 1000.01]:
            for discount in [0, 15, 100]:
                result = mba._compute_combo_price([{"line_cost": cost}], 15, 15, discount)
                self.assertGreaterEqual(result["suggested_price"], result["min_price"])
                self.assertGreaterEqual(result["suggested_price"], 5)
                self.assertEqual(result["suggested_price"] % 5, 0)

    def test_normal_nearest_five_price_remains_unchanged(self):
        result = mba._compute_combo_price([{"line_cost": 2}], 10, 20)
        self.assertEqual(result["bundle_price"], 25.5)
        self.assertEqual(result["suggested_price"], 25)

    def test_recipe_merge_sums_shared_quantity_and_preserves_first_cost(self):
        a = {"ingredients": [{"ingredient_id": "shared", "ingredient_name": "Shared", "unit": "g", "quantity_needed": 1, "cost_per_unit": 2}]}
        b = {"ingredients": [{"ingredient_id": "shared", "ingredient_name": "Shared", "unit": "g", "quantity_needed": 2, "cost_per_unit": 9},
                             {"ingredient_id": "alone", "ingredient_name": "Alone", "unit": "g", "quantity_needed": .5, "cost_per_unit": 3}]}
        result = mba._merge_recipes(a, b)
        self.assertEqual([r["ingredient_id"] for r in result], ["alone", "shared"])
        self.assertEqual(result[1]["quantity_needed"], 3)
        self.assertEqual(result[1]["line_cost"], 6)
        self.assertEqual(a["ingredients"][0]["quantity_needed"], 1)

    def test_baskets_count_presence_not_repeated_line_quantity(self):
        data = pd.DataFrame([{"order_id": 1, "variant_label": "A", "variant_id": 1},
                             {"order_id": 1, "variant_label": "A", "variant_id": 1},
                             {"order_id": 2, "variant_label": "B", "variant_id": 2}])
        result = mba._build_baskets(data)
        self.assertTrue(result.loc[1, "A"])
        self.assertFalse(result.loc[1, "B"])
        self.assertEqual(result["A"].sum(), 1)

    def test_real_mining_collapses_mirror_pair_and_keeps_metrics(self):
        matrix = pd.DataFrame({"A": [True] * 40 + [False] * 40,
                               "B": [True] * 40 + [False] * 40,
                               "C": [False] * 40 + [True] * 40})
        rules = mba._compute_rules(matrix, .1, .1)
        self.assertEqual(len(rules), 1)
        self.assertEqual({rules.iloc[0]["variant_a"], rules.iloc[0]["variant_b"]}, {"A", "B"})
        self.assertEqual(rules.iloc[0]["support"], .5)
        self.assertEqual(rules.iloc[0]["confidence"], 1)
        self.assertEqual(rules.iloc[0]["lift"], 2)

    def test_recent_missing_item_is_unstable(self):
        result = mba._verify_on_recent(pd.DataFrame({"A": [True, False]}), "A", "B")
        self.assertEqual(result, {"support": 0., "confidence": 0., "lift": 0.})
        self.assertFalse(mba._is_stable(result, .005, .08))

    def test_indexed_details_preserve_uuid_recipe_rounding_and_missing_label(self):
        row = {"product_id": UUID(int=1), "product_name": "Fixture", "category_id": 1,
               "category_name": "Fixture", "variant_id": 1, "size_name": "Small", "price": 10,
               "ingredient_id": UUID(int=2), "ingredient_name": "Ingredient", "unit": "g",
               "quantity_needed": .333, "cost_per_unit": 2.345}
        result = mba._get_variant_details("Fixture Small", {"Fixture Small": pd.DataFrame([row])})
        self.assertEqual(result["product_id"], str(UUID(int=1)))
        self.assertEqual(result["ingredients"][0]["cost_per_unit"], 2.35)
        self.assertEqual(result["ingredients"][0]["line_cost"], .78)
        self.assertEqual(mba._get_variant_details("Missing", {}), {})

class BasketResponses(unittest.IsolatedAsyncioTestCase):
    async def test_missing_optional_column_retries_only_legacy_select(self):
        pool = SimpleNamespace(fetch=AsyncMock(side_effect=[UndefinedColumnError("fixture optional column"), [{"id": 1}]]))
        rows, extended = await association._load_rule_rows(pool, 10)
        self.assertFalse(extended)
        self.assertEqual(rows, [{"id": 1}])
        self.assertEqual(pool.fetch.await_count, 2)
        self.assertIn("r.conviction", pool.fetch.call_args_list[0].args[0])
        self.assertNotIn("r.conviction", pool.fetch.call_args_list[1].args[0])
        self.assertEqual(pool.fetch.call_args_list[1].args[1], 10)

    async def test_database_outage_and_missing_table_do_not_trigger_fallback(self):
        for error in [ConnectionError("fixture outage"), UndefinedTableError("fixture table")]:
            pool = SimpleNamespace(fetch=AsyncMock(side_effect=error))
            with self.assertRaises(type(error)):
                await association._load_rule_rows(pool, 10)
            self.assertEqual(pool.fetch.await_count, 1)

    async def test_running_job_does_not_read_unpublished_rules(self):
        pool = SimpleNamespace(fetchrow=AsyncMock(return_value={"id": 10, "status": "running"}), fetch=AsyncMock())
        with patch.object(association, "get_pool", AsyncMock(return_value=pool)):
            result = await association.get_job(10)
        self.assertEqual(result["rules"], [])
        pool.fetch.assert_not_awaited()

    async def test_missing_job_retains_404(self):
        pool = SimpleNamespace(fetchrow=AsyncMock(return_value=None))
        with patch.object(association, "get_pool", AsyncMock(return_value=pool)):
            with self.assertRaises(HTTPException) as error:
                await association.get_job(99)
        self.assertEqual(error.exception.status_code, 404)

    async def test_completed_rule_json_and_ranking_response(self):
        row = {"id": 1, "product_name_a": "A", "product_name_b": "B", "product_id_a": UUID(int=1), "product_id_b": UUID(int=2),
               "variant_id_a": 1, "variant_id_b": 2, "size_name_a": "Small", "size_name_b": "Large",
               "support": .5, "confidence": 1., "lift": 2., "is_combo": True, "combo_exists": False,
               "explanation": None, "suggested_name": "A + B", "merged_ingredients": '[]', "pricing": '{"suggested_price":35}',
               "conviction": None, "stable": True, "recent_support": .5, "recent_confidence": 1., "recent_lift": 2.}
        pool = SimpleNamespace(fetchrow=AsyncMock(return_value={"id": 10, "status": "completed"}), fetch=AsyncMock(return_value=[row]))
        with patch.object(association, "get_pool", AsyncMock(return_value=pool)):
            result = await association.get_job(10)
        self.assertEqual(result["top_pair"], "A Small + B Large")
        self.assertEqual(result["rules"][0]["score"], 2.)
        self.assertEqual(result["rules"][0]["pricing"], {"suggested_price": 35})
        self.assertTrue(result["rules"][0]["stable"])

    async def test_empty_loader_and_fixed_discount_contract(self):
        pool = SimpleNamespace(fetch=AsyncMock(return_value=[]))
        with patch.object(data_loader, "get_pool", AsyncMock(return_value=pool)):
            baskets = await data_loader.load_order_baskets()
            details = await data_loader.load_product_details()
        self.assertIn("order_date", baskets.columns)
        self.assertIn("ingredient_id", details.columns)
        self.assertEqual(await data_loader.load_combo_discount(), mba.BUNDLE_DISCOUNT_PERCENT)

if __name__ == "__main__":
    unittest.main(verbosity=2)
