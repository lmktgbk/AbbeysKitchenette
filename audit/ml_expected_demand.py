"""Expected-demand regressions: fractional forecasts must survive scoring and API serialization."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, Mock
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ml-service'))
from forecasting.services.demand_forecast import predict_units, evaluate_product
from forecasting.services.metrics import weekly_metrics
from forecasting.models.demand import DailyForecast

class ExpectedDemand(unittest.TestCase):
    def test_fractional_output_and_negative_clipping(self):
        train = pd.DataFrame({'ds': pd.date_range('2026-01-01', periods=14), 'y': [1]*14})
        model = Mock()
        model.predict.return_value = pd.DataFrame({'yhat': [-.2, .49, .49, .49, .49, .49, .49]})
        with patch('forecasting.services.demand_forecast.build_prophet', return_value=model):
            result = predict_units(train)
        self.assertEqual(result, [0., .49, .49, .49, .49, .49, .49])
        self.assertAlmostEqual(sum(result), 2.94)
        self.assertEqual(model.predict.call_args.args[0].ds.iloc[0], pd.Timestamp('2026-01-15'))
        self.assertEqual(DailyForecast(date='2026-01-15', units=.49, revenue=63.7).model_dump()['units'], .49)

    def test_nonfinite_predictions_are_rejected(self):
        train = pd.DataFrame({'ds': pd.date_range('2026-01-01', periods=14), 'y': [1]*14})
        model = Mock(); model.predict.return_value = pd.DataFrame({'yhat': [np.nan]*7})
        with patch('forecasting.services.demand_forecast.build_prophet', return_value=model):
            with self.assertRaises(ValueError): predict_units(train)

    def test_holdout_uses_fractional_predictions_and_training_prefix(self):
        calendar = pd.DataFrame({1: [1]*42, 2: [2]*42}, index=pd.date_range('2026-01-01', periods=42))
        def prediction(train, period):
            self.assertLess(train.ds.max(), calendar.index[-7])
            return [.123456789]*period
        with patch('forecasting.services.demand_forecast.predict_units', side_effect=prediction):
            score = evaluate_product(calendar)
        self.assertAlmostEqual(score['weeks'][0]['w_pred'], .123456789*14)
        self.assertAlmostEqual(score['variant_scores'][0]['weeks'][0]['w_pred'], .123456789*7)
        weekly = weekly_metrics(pd.DataFrame({'yhat':[.123456789]*7}), pd.DataFrame({'y':[1]*7}))
        self.assertAlmostEqual(weekly['mse'], (7-.123456789*7)**2)

if __name__ == '__main__': unittest.main()
