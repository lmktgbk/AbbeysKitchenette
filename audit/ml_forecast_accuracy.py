"""Forecast accuracy regressions using synthetic sales; never connect to a database."""
import math
from pathlib import Path
import random
import sys
import unittest

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from forecasting.services.allocation import apportion, preparation_plan
from benchmark_forecasting import size_shares
from forecasting.services.metrics import compute_metrics, naive_baseline
from forecasting.models.demand import ProductScore


class Accuracy(unittest.TestCase):
    def test_sparse_week_keeps_demand(self):
        plan = preparation_plan([.49] * 7, [.6, .4])
        self.assertEqual(sum(map(sum, plan)), 3)
        self.assertEqual([sum(day[i] for day in plan) for i in range(2)], [2, 1])

    def test_randomized_daily_and_weekly_conservation(self):
        rng = random.Random(21)
        for _ in range(500):
            predictions = [rng.random() * 20 for _ in range(7)]
            shares = [rng.random() for _ in range(rng.randint(1, 8))]
            plan = preparation_plan(predictions, shares)
            total = math.floor(sum(predictions) + .5)
            self.assertEqual([sum(day) for day in plan], apportion(total, predictions))
            self.assertEqual([sum(day[i] for day in plan) for i in range(len(shares))], apportion(total, shares))
            self.assertTrue(all(value >= 0 and isinstance(value, int) for day in plan for value in day))

    def test_zero_week_has_no_counts(self):
        self.assertEqual(preparation_plan([0] * 7, [.6, .4]), [[0, 0]] * 7)

    def test_share_window_excludes_holdout_sales(self):
        sales = pd.DataFrame({"ds": pd.to_datetime(["2026-09-01", "2026-09-30", "2026-10-01"]),
                              "variant_id": [1, 2, 1], "units": [60, 40, 1000]})
        self.assertEqual(size_shares(sales, "2026-09-30"), {1: .6, 2: .4})
        self.assertEqual(size_shares(sales, "2026-10-30"), {1: 1.0})

    def test_share_falls_back_to_history_when_recent_sales_are_empty(self):
        sales = pd.DataFrame({"ds": pd.to_datetime(["2026-01-01", "2026-01-02"]),
                              "variant_id": [1, 2], "units": [3, 1]})
        self.assertEqual(size_shares(sales, "2026-10-01"), {1: .75, 2: .25})

    def test_negative_r2_is_not_clipped(self):
        actual = pd.DataFrame({"ds": range(7), "y": [0] * 6 + [1]})
        prediction = pd.DataFrame({"ds": range(7), "yhat": [2] * 7})
        self.assertLess(compute_metrics(prediction, actual)["r_squared"], -28)

    def test_constant_actuals_have_errors_but_no_r2(self):
        actual = pd.DataFrame({"ds": [1, 2], "y": [0, 0]})
        prediction = pd.DataFrame({"ds": [1, 2], "yhat": [2, 2]})
        metrics = compute_metrics(prediction, actual)
        self.assertEqual(metrics["mae"], 2)
        self.assertEqual(metrics["mse"], 4)
        self.assertIsNone(metrics["r_squared"])

    def test_empty_matches_have_no_metrics(self):
        actual = pd.DataFrame({"ds": [1], "y": [1]})
        prediction = pd.DataFrame({"ds": [2], "yhat": [2]})
        self.assertTrue(all(value is None for value in compute_metrics(prediction, actual).values()))

    def test_zero_week_baseline_is_a_valid_scored_observation(self):
        train = pd.DataFrame({"ds": pd.date_range("2026-09-01", periods=21), "y": [0] * 21})
        result = naive_baseline(train)
        self.assertEqual(result["w_mse"], 0)
        self.assertIsNone(result["r_squared"])

    def test_response_accepts_undefined_r2_and_allocation_scores(self):
        result = ProductScore(product_id="a", product_name="Coffee", variants=1,
                              rmse=1, mae=1, mse=1, r_squared=None, n_r_squared=None,
                              variant_scores=[dict(variant_id=1, rmse=1, mae=1, mse=1, r_squared=None)])
        self.assertIsNone(result.model_dump()["variant_scores"][0]["r_squared"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
