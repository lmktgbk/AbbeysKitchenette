"""Exercise real Prophet fitting with synthetic sales and mocked persistence only."""
from datetime import date
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from forecasting.services import demand_forecast as forecast
from forecasting.models.demand import ProductScore
import compare_forecast_methods as comparison


class Pipeline(unittest.IsolatedAsyncioTestCase):
    def test_comparison_uses_matching_dates_without_reading_database(self):
        rows = [dict(ds=day, variant_id=variant, units=variant, product_id="coffee", product_name="Coffee")
                for day in pd.date_range("2026-08-01", "2026-10-05") for variant in [1, 2]]
        with patch.object(comparison, "predict", return_value=[2] * 7) as predictor:
            result = comparison.compare_product(pd.DataFrame(rows), date(2026, 10, 5))
        self.assertEqual(len(result["windows"]), 3)
        self.assertEqual(len(result["variants"]), 2)
        self.assertEqual(result["product_daily"]["allocation"]["mae"], 1)
        self.assertEqual(result["product_daily"]["direct"]["mae"], 1)
        self.assertTrue(all(call.args[0].ds.max() < pd.Timestamp(result["windows"][0]["from"]) for call in predictor.call_args_list))

    async def test_real_fit_cutoff_allocation_metrics_and_revenue(self):
        rows = []
        for day in pd.date_range("2026-08-01", "2026-10-06"):
            for variant, price in [(1, 100), (2, 150)]:
                rows.append(dict(ds=day, variant_id=variant, product_id="coffee", product_name="Coffee",
                                 size_name=str(variant), price=price, category_id=1,
                                 units=10000 if day.date() == date(2026, 10, 6) else (variant + day.day % 3)))
        # Never-sold variants stay visible with a zero estimated mix.
        rows.append(dict(ds=pd.Timestamp("2026-10-05"), variant_id=3, product_id="coffee",
                         product_name="Coffee", size_name="New", price=200, category_id=1, units=0))
        captured_training = []
        original_factory = forecast.build_prophet

        def factory(days):
            model = original_factory(days)
            original_fit = model.fit

            def fit(frame):
                captured_training.append(frame.copy())
                return original_fit(frame)

            model.fit = fit
            return model

        saved, finished = AsyncMock(), AsyncMock()
        with patch.object(forecast, "business_today", return_value=date(2026, 10, 6)), \
             patch.object(forecast, "load_variant_daily_sales", AsyncMock(return_value=pd.DataFrame(rows))), \
             patch.object(forecast, "get_pool", AsyncMock(side_effect=AssertionError("Unexpected database access"))), \
             patch.object(forecast, "pool_update_total", AsyncMock()), \
             patch.object(forecast, "update_job_progress", AsyncMock()), \
             patch.object(forecast, "complete_job", finished), \
             patch.object(forecast, "save_result", saved), \
             patch.object(forecast, "save_skipped", AsyncMock(side_effect=AssertionError("Unexpected skipped product"))), \
             patch.object(forecast, "cleanup_old_jobs", AsyncMock()), \
             patch.object(forecast, "build_prophet", side_effect=factory):
            result = await forecast.run_demand_forecast(1)

        self.assertEqual(result["completed"], 1)
        self.assertEqual(result["failed"], 0)
        self.assertTrue(all(frame.ds.max() <= pd.Timestamp("2026-10-05") for frame in captured_training))
        self.assertTrue(all(frame.y.max() < 100 for frame in captured_training))
        self.assertEqual(saved.await_count, 3)
        for call in saved.await_args_list:
            _, vid, _, _, _, price, _, daily, units, revenue, _, share = call.args
            self.assertEqual([day["date"] for day in daily], [day.strftime("%Y-%m-%d") for day in pd.date_range("2026-10-06", periods=7)])
            self.assertEqual(units, sum(day["units"] for day in daily))
            self.assertEqual(revenue, units * price)
            if vid == 3:
                self.assertEqual(units, 0)
                self.assertEqual(share, 0)
        score = ProductScore(**finished.await_args.args[-1][0])
        self.assertEqual(score.training_cutoff, "2026-10-05")
        self.assertEqual(len(score.variant_scores), 3)
        self.assertEqual(len(score.weeks), len(score.n_weeks))
        self.assertEqual([week.w_actual for week in score.weeks], [week.w_actual for week in score.n_weeks])


if __name__ == "__main__":
    unittest.main(verbosity=2)
