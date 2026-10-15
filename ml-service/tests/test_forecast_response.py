"""Saved forecasts remain readable after retiring individual evaluation fields."""
import json
import unittest
from unittest.mock import AsyncMock, patch

from forecasting.routers.demand import demand_results


class ForecastResponseTest(unittest.IsolatedAsyncioTestCase):
    async def test_results_accept_new_and_legacy_scores(self):
        week = {"w_pred": 3.5, "w_actual": 4, "w_mae": 0.5, "w_mse": 0.25}
        score = {"product_id": "product", "product_name": "Coffee", "variants": 1,
                 "evaluation_version": 5, "mae": 0.2, "weeks": [week], "n_weeks": [week],
                 "variant_scores": [{"variant_id": 1, "mae": 0.2, "weeks": [week], "n_weeks": [week]}]}
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                saved = json.loads(json.dumps(score))
                if legacy:
                    for entry in [saved, *saved["variant_scores"]]:
                        entry.update(rmse=0.3, mse=0.09, r_squared=0.8)
                job = {"id": 1, "status": "completed", "total_variants": 1,
                       "completed": 1, "failed": 0, "period": 7, "started_at": None,
                       "completed_at": None, "product_scores": json.dumps([saved])}
                row = {"variant_id": 1, "product_id": "product", "product_name": "Coffee",
                       "size_name": "Regular", "price": 100, "category_id": 1,
                       "daily_data": json.dumps([{"date": "2026-10-15", "units": 0.5, "revenue": 50}]),
                       "total_units": 0.5, "total_revenue": 50, "days_of_data": 30,
                       "skipped": False, "skip_reason": None,
                       "rmse": None, "mae": None, "mse": None, "r_squared": None}
                pool = AsyncMock()
                pool.fetchrow.return_value = job
                pool.fetch.return_value = [row]
                with patch("forecasting.routers.demand.get_pool", AsyncMock(return_value=pool)):
                    response = await demand_results(job_id=1)
                payload = json.loads(response.model_dump_json())
                self.assertEqual(payload["forecasted"][0]["total_units"], 0.5)
                result = payload["job"]["product_scores"][0]
                self.assertEqual(result["variant_scores"][0]["weeks"][0], week)
                self.assertNotIn("r_squared", result)
                self.assertNotIn("rmse", result["variant_scores"][0])


if __name__ == "__main__":
    unittest.main()
