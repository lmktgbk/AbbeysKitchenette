"""Forecast response/data-boundary regressions using isolated rows; no business database."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from forecasting.routers import demand
from forecasting.services import data_loader

A, B, C = UUID(int=1), UUID(int=2), UUID(int=3)

def job_row():
    return {"id": 10, "status": "completed", "total_variants": 1, "completed": 1,
            "failed": 0, "period": 7, "started_at": datetime(2026, 10, 5, tzinfo=timezone.utc),
            "completed_at": None, "lease_owner": "private-owner", "product_scores": None}

class ForecastResponses(unittest.IsolatedAsyncioTestCase):
    def fixture(self, rows, recipes, stock):
        """Replace every external read used by ingredient assembly and restore patches after each test."""
        pool = SimpleNamespace(fetch=AsyncMock(return_value=rows))
        patches = [patch.object(demand, "get_pool", AsyncMock(return_value=pool)),
                   patch.object(demand, "load_recipe_map", AsyncMock(return_value=pd.DataFrame(recipes))),
                   patch.object(demand, "load_current_stock", AsyncMock(return_value=pd.DataFrame(stock)))]
        for context in patches:
            context.start()
            self.addCleanup(context.stop)
        return pool

    async def test_shared_recipes_rounding_order_and_first_stock_row(self):
        self.fixture([
            {"variant_id": 1, "daily_data": '[{"date":"2026-10-06","units":1},{"date":"2026-10-05","units":3}]'},
            {"variant_id": 2, "daily_data": [{"date": "2026-10-05", "units": 2}]},
            {"variant_id": 999, "daily_data": []},
        ], [
            {"variant_id": 1, "ingredient_id": A, "ingredient_name": "Shared", "unit": "g", "quantity_needed": .333},
            {"variant_id": 1, "ingredient_id": B, "ingredient_name": "Missing stock", "unit": "g", "quantity_needed": 1},
            {"variant_id": 2, "ingredient_id": A, "ingredient_name": "Shared", "unit": "g", "quantity_needed": 1.25},
            {"variant_id": 2, "ingredient_id": C, "ingredient_name": "Zero", "unit": "g", "quantity_needed": 0},
        ], [{"ingredient_id": A, "current_stock": 11.49},
            {"ingredient_id": A, "current_stock": 999},
            {"ingredient_id": C, "current_stock": 200}])
        result = await demand.demand_ingredients(10)
        self.assertEqual([i.status for i in result.ingredients], ["critical", "warning", "ok"])
        shared = next(i for i in result.ingredients if i.ingredient_id == str(A))
        self.assertEqual([(d.date, d.quantity) for d in shared.daily_values], [("2026-10-05", 3.5), ("2026-10-06", .33)])
        self.assertEqual(shared.total_needed, 3.83)
        self.assertEqual(shared.current_stock, 11.49)
        self.assertEqual(shared.days_covered, 6.0)
        zero = next(i for i in result.ingredients if i.ingredient_id == str(C))
        self.assertIsNone(zero.days_covered)

    async def test_empty_stock_and_missing_variant_recipes(self):
        self.fixture([{"variant_id": 1, "daily_data": [{"date": "2026-10-05", "units": 2}]},
                      {"variant_id": 999, "daily_data": [{"date": "2026-10-05", "units": 100}]}],
                     [{"variant_id": 1, "ingredient_id": A, "ingredient_name": "Fixture", "unit": "g", "quantity_needed": 1}], [])
        result = await demand.demand_ingredients(10)
        self.assertEqual(len(result.ingredients), 1)
        self.assertEqual(result.ingredients[0].total_needed, 2)
        self.assertEqual(result.ingredients[0].current_stock, 0)
        self.assertEqual(result.ingredients[0].status, "critical")

    async def test_no_results_does_not_load_recipes_or_stock(self):
        self.fixture([], [], [])
        self.assertEqual((await demand.demand_ingredients(10)).ingredients, [])
        demand.load_recipe_map.assert_not_awaited()
        demand.load_current_stock.assert_not_awaited()

    async def test_no_recipes_returns_empty_needs(self):
        self.fixture([{"variant_id": 1, "daily_data": []}], [], [])
        self.assertEqual((await demand.demand_ingredients(10)).ingredients, [])

    def test_job_summary_keeps_public_fields_and_legacy_counter(self):
        summary = demand._job_summary(job_row()).model_dump()
        self.assertEqual(summary["total_variants"], 1)
        self.assertEqual(summary["started_at"], "2026-10-05T00:00:00+00:00")
        self.assertIsNone(summary["completed_at"])
        self.assertNotIn("lease_owner", summary)

    async def test_history_and_results_use_the_same_summary(self):
        pool = SimpleNamespace(fetch=AsyncMock(return_value=[job_row()]), fetchrow=AsyncMock(return_value=job_row()))
        with patch.object(demand, "get_pool", AsyncMock(return_value=pool)):
            history = await demand.demand_history()
            pool.fetch.return_value = []
            results = await demand.demand_results(10)
        self.assertEqual(history.jobs[0].model_dump(), results.job.model_dump())

    async def test_missing_job_preserves_not_found_response(self):
        pool = SimpleNamespace(fetchrow=AsyncMock(return_value=None))
        with patch.object(demand, "get_pool", AsyncMock(return_value=pool)):
            results = await demand.demand_results(99)
        self.assertEqual(results.job.status, "not_found")
        self.assertEqual(results.forecasted, [])
        self.assertEqual(results.skipped, [])

class ForecastLoaders(unittest.IsolatedAsyncioTestCase):
    async def test_empty_inputs_keep_expected_frame_columns(self):
        pool = SimpleNamespace(fetch=AsyncMock(return_value=[]))
        with patch.object(data_loader, "get_pool", AsyncMock(return_value=pool)):
            sales = await data_loader.load_variant_daily_sales()
            recipes = await data_loader.load_recipe_map()
            stock = await data_loader.load_current_stock()
        self.assertEqual(list(sales.columns), ["variant_id", "product_id", "product_name", "size_name", "price", "category_id", "ds", "units"])
        self.assertEqual(list(recipes.columns), ["variant_id", "ingredient_id", "ingredient_name", "unit", "quantity_needed"])
        self.assertEqual(list(stock.columns), ["ingredient_id", "ingredient_name", "unit", "current_stock"])

    async def test_sales_dates_become_calendar_timestamps_with_uuid_identity(self):
        rows = [{"variant_id": 1, "product_id": A, "product_name": "Fixture", "size_name": "Small",
                 "price": 10., "category_id": 1, "ds": "2026-10-05", "units": 2}]
        pool = SimpleNamespace(fetch=AsyncMock(return_value=rows))
        with patch.object(data_loader, "get_pool", AsyncMock(return_value=pool)):
            result = await data_loader.load_variant_daily_sales()
        self.assertEqual(result.iloc[0]["ds"], pd.Timestamp("2026-10-05"))
        self.assertEqual(result.iloc[0]["product_id"], A)

if __name__ == "__main__":
    unittest.main(verbosity=2)
