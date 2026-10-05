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
import benchmark_forecasting as benchmark


class Pipeline(unittest.IsolatedAsyncioTestCase):
    def test_menu_benchmark_scores_identical_observations(self):
        rows = [dict(ds=day, variant_id=variant, units=variant, product_id="coffee", product_name="Coffee")
                for day in pd.date_range("2026-08-01", "2026-09-28") for variant in [1, 2]]
        with patch.object(benchmark, "fit_counts", return_value=[1] * 7):
            result = benchmark.benchmark(pd.DataFrame(rows), date(2026, 9, 28))
        self.assertEqual(result["scored_products"], 1)
        for method in benchmark.METHODS:
            scores = result["scores"][method]
            self.assertEqual(scores["product_weekly"]["observations"], 3)
            self.assertEqual(scores["variant_weekly"]["observations"], 6)
            self.assertEqual(scores["product_weekly"]["actual_total"], 63)
        self.assertEqual(result["scores"]["same_weekday"]["product_weekly"]["mae"], 0)
        self.assertEqual(result["scores"]["product_sqrt"]["product_weekly"]["bias"], -14)
        self.assertEqual(result["scores"]["variant_sqrt"]["product_weekly"]["bias"], -7)

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

    def test_gap_notice_distinguishes_recorded_coverage_from_business_completeness(self):
        sales = pd.DataFrame({"ds": pd.to_datetime(["2026-09-28", "2026-09-29", "2026-10-03", "2026-10-05"]),
                              "units": [10, 1, 6, 0]})
        coverage = forecast.sales_coverage(sales, date(2026, 10, 5))
        self.assertEqual(coverage["last_sale"], "2026-10-03")
        self.assertEqual(coverage["trailing_gap_days"], 2)
        self.assertEqual(coverage["recent_gap_dates"], ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"])

    def test_recent_variant_is_not_fitted_using_its_siblings_older_history(self):
        dates = pd.date_range("2026-09-01", "2026-10-05")
        train = pd.DataFrame({"ds": dates, "y": [0] * (len(dates) - 1) + [1]})
        self.assertIn("Insufficient history", forecast.training_reason(train))
        with patch.object(forecast, "build_prophet", side_effect=AssertionError("Should not fit")):
            self.assertEqual(forecast.predict_units(train), [0] * 7)

    def test_negative_points_are_clipped_and_fractional_week_is_preserved(self):
        from types import SimpleNamespace
        train = pd.DataFrame({"ds": pd.date_range("2026-09-01", periods=7), "y": [1] * 7})
        model = SimpleNamespace(fit=lambda frame: None,
                                predict=lambda future: pd.DataFrame({"yhat": [-1, .4, .4, .4, .4, .4, .4]}))
        with patch.object(forecast, "build_prophet", return_value=model):
            plan = forecast.predict_units(train)
        self.assertEqual(sum(plan), 2)
        self.assertTrue(all(isinstance(value, int) and value >= 0 for value in plan))
        self.assertEqual(plan[0], 0)

    async def test_evaluation_failure_replaces_partial_forecast_with_skips(self):
        rows = [dict(ds=day, variant_id=1, product_id="coffee", product_name="Coffee",
                     size_name="Regular", price=100, category_id=1, units=1)
                for day in pd.date_range("2026-09-01", "2026-09-28")]
        saved, skipped, finished = AsyncMock(), AsyncMock(), AsyncMock()
        with patch.object(forecast, "business_today", return_value=date(2026, 9, 29)), \
             patch.object(forecast, "load_variant_daily_sales", AsyncMock(return_value=pd.DataFrame(rows))), \
             patch.object(forecast, "predict_units", return_value=[1] * 7), \
             patch.object(forecast, "evaluate_product", side_effect=RuntimeError("Evaluation failed")), \
             patch.object(forecast, "save_result", saved), \
             patch.object(forecast, "save_skipped", skipped), \
             patch.object(forecast, "complete_job", finished), \
             patch.object(forecast, "pool_update_total", AsyncMock()), \
             patch.object(forecast, "update_job_progress", AsyncMock()), \
             patch.object(forecast, "cleanup_old_jobs", AsyncMock()):
            result = await forecast.run_demand_forecast(1)
        self.assertEqual(saved.await_count, 1)
        self.assertEqual(skipped.await_count, 1)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["completed"], 0)
        self.assertEqual(finished.await_args.args[-1], [])

    async def test_real_variant_fit_cutoff_metrics_and_revenue(self):
        rows = []
        for day in pd.date_range("2026-08-01", "2026-10-06"):
            for variant, price in [(1, 100), (2, 150)]:
                rows.append(dict(ds=day, variant_id=variant, product_id="coffee", product_name="Coffee",
                                 size_name=str(variant), price=price, category_id=1,
                                 units=10000 if day.date() == date(2026, 10, 6) else (variant + day.day % 3)))
        # Never-sold variants remain visible as explicit skipped results.
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

        saved, finished, skipped = AsyncMock(), AsyncMock(), AsyncMock()
        with patch.object(forecast, "business_today", return_value=date(2026, 10, 6)), \
             patch.object(forecast, "load_variant_daily_sales", AsyncMock(return_value=pd.DataFrame(rows))), \
             patch.object(forecast, "get_pool", AsyncMock(side_effect=AssertionError("Unexpected database access"))), \
             patch.object(forecast, "pool_update_total", AsyncMock()), \
             patch.object(forecast, "update_job_progress", AsyncMock()), \
             patch.object(forecast, "complete_job", finished), \
             patch.object(forecast, "save_result", saved), \
             patch.object(forecast, "save_skipped", skipped), \
             patch.object(forecast, "cleanup_old_jobs", AsyncMock()), \
             patch.object(forecast, "build_prophet", side_effect=factory):
            result = await forecast.run_demand_forecast(1)

        self.assertEqual(result["completed"], 1)
        self.assertEqual(result["failed"], 0)
        self.assertTrue(all(frame.ds.max() <= pd.Timestamp("2026-10-05") for frame in captured_training))
        self.assertTrue(all(frame.y.max() < 100 for frame in captured_training))
        self.assertEqual(saved.await_count, 2)
        self.assertEqual(skipped.await_count, 1)
        self.assertEqual(skipped.await_args.args[1], 3)
        self.assertIn("No actual sales", skipped.await_args.args[-2])
        self.assertEqual(len(captured_training), 8)
        self.assertTrue(any(frame.y.max() == 4 for frame in captured_training))
        for call in saved.await_args_list:
            _, vid, _, _, _, price, _, daily, units, revenue, _, share = call.args
            self.assertEqual([day["date"] for day in daily], [day.strftime("%Y-%m-%d") for day in pd.date_range("2026-10-06", periods=7)])
            self.assertEqual(units, sum(day["units"] for day in daily))
            self.assertEqual(revenue, units * price)
            self.assertIsNone(share)
        score = ProductScore(**finished.await_args.args[-1][0])
        self.assertEqual(score.training_cutoff, "2026-10-05")
        self.assertEqual(score.forecast_method, "variant_prophet_raw")
        self.assertEqual(score.evaluation_version, 3)
        self.assertEqual(score.coverage.gap_days, 0)
        self.assertEqual(len(score.variant_scores), 3)
        self.assertEqual(len(score.weeks), len(score.n_weeks))
        for index, week in enumerate(score.weeks):
            self.assertEqual(week.w_pred, sum(v.weeks[index].w_pred for v in score.variant_scores))
            self.assertEqual(week.w_actual, sum(v.weeks[index].w_actual for v in score.variant_scores))
        self.assertEqual([week.w_actual for week in score.weeks], [week.w_actual for week in score.n_weeks])


if __name__ == "__main__":
    unittest.main(verbosity=2)
