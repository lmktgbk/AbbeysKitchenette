"""Read-only forecasting investigation; application code and database rows are untouched.

Protocol: select on three June 2026 weeks; evaluate locked choices on three July
weeks. October windows already viewed by the user are diagnostic, not final tests.
Only completed/nonremoved sales are read, in a read-only repeatable-read transaction.
"""
import asyncio
from datetime import date
import gzip
import hashlib
import json
import logging
from pathlib import Path
import sys
import time

import numpy as np
import pandas as pd
from prophet import Prophet

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ml-service'))
sys.path.insert(0, str(ROOT / 'audit'))
from benchmark_forecasting import read_snapshot, errors
from legacy_prophet import build_legacy_prophet as build_prophet
from forecasting.services.demand_forecast import training_reason
from legacy_forecast_allocation import preparation_plan

OUT = ROOT / 'audit' / 'forecasting-investigation'
# 'current' is the original October 6 configuration, frozen for historical comparisons.
METHODS = ['current', 'flat_full', 'flat_26w', 'previous_week', 'weekday_8w', 'weekday_26w']
TARGETS = ['product_daily', 'product_weekly', 'variant_daily', 'variant_weekly']
TUNE_CUTOFF = date(2026, 6, 28)
TEST_CUTOFF = date(2026, 7, 26)
DIAGNOSTIC_CUTOFF = date(2026, 10, 5)
SELECTED = ['Spanish Latte', 'Caramel Macchiato', 'French Fries', 'Mini Donuts', '1.5L Softdrinks (Resale)']


def forecast(train, method):
    """Return expected units and the historical rounded whole-unit preparation plan."""
    future = pd.date_range(train.ds.max() + pd.Timedelta(days=1), periods=7)
    if training_reason(train):
        return np.zeros(7), np.zeros(7)
    if method == 'previous_week':
        raw = train.y.iloc[-7:].to_numpy(dtype=float)
    elif method.startswith('weekday_'):
        weeks = int(method.split('_')[1][:-1])
        recent = train.iloc[-weeks * 7:]
        means = recent.groupby(recent.ds.dt.dayofweek).y.mean()
        raw = np.asarray([means.get(day.dayofweek, 0) for day in future])
    else:
        history = train.iloc[-182:] if method == 'flat_26w' else train
        model = build_prophet(len(history)) if method == 'current' else Prophet(
            growth='flat', yearly_seasonality=False, weekly_seasonality=True,
            daily_seasonality=False, seasonality_mode='additive',
            seasonality_prior_scale=0.1, uncertainty_samples=0,
        )
        model.fit(history)
        raw = np.maximum(model.predict(pd.DataFrame({'ds': future})).yhat.to_numpy(), 0)
    plan = np.asarray([day[0] for day in preparation_plan(raw, [1])], dtype=float)
    return raw, plan


def evaluate(sales, cutoff, methods, label, selected_only=False):
    """Fit only prefixes; holdout dates never enter training or weekday means."""
    pools = {m: {t: {'predicted': [], 'actual': []} for t in TARGETS} for m in methods}
    raw_pools = {m: {t: {'predicted': [], 'actual': []} for t in TARGETS} for m in methods}
    details = []
    groups = list(sales.groupby('product_id'))
    if selected_only:
        groups = [(pid, h) for pid, h in groups if h.iloc[0].product_name in SELECTED]
    started = time.perf_counter()
    for index, (pid, history) in enumerate(groups, 1):
        history = history[history.ds <= pd.Timestamp(cutoff)]
        dates = pd.date_range(history.ds.min(), cutoff)
        calendar = history.pivot_table(index='ds', columns='variant_id', values='units', aggfunc='sum').reindex(dates).fillna(0)
        local = {m: {t: {'predicted': [], 'actual': []} for t in TARGETS} for m in methods}
        raw_local = {m: {t: {'predicted': [], 'actual': []} for t in TARGETS} for m in methods}
        windows = []
        for origin in range(3):
            end = len(calendar) - origin * 7
            split = end - 7
            observed = calendar.iloc[split:end].to_numpy(dtype=float)
            predictions = {m: [] for m in methods}
            expected = {m: [] for m in methods}
            for vid in calendar.columns:
                training = pd.DataFrame({'ds': dates[:split], 'y': calendar[vid].iloc[:split].to_numpy()})
                for method in methods:
                    raw, plan = forecast(training, method)
                    predictions[method].append(plan)
                    expected[method].append(raw)
            for method in methods:
                for source, destinations in [(predictions, [pools, local]), (expected, [raw_pools, raw_local])]:
                    plan = np.asarray(source[method]).T
                    pairs = {
                        'product_daily': (plan.sum(axis=1), observed.sum(axis=1)),
                        'product_weekly': ([plan.sum()], [observed.sum()]),
                        'variant_daily': (plan.flatten(), observed.flatten()),
                        'variant_weekly': (plan.sum(axis=0), observed.sum(axis=0)),
                    }
                    for target, (predicted, actual) in pairs.items():
                        for destination in destinations:
                            destination[method][target]['predicted'].extend(map(float, predicted))
                            destination[method][target]['actual'].extend(map(float, actual))
            windows.append({'from': str(dates[split].date()), 'to': str(dates[end - 1].date()),
                'actual': observed.sum(axis=1).tolist(),
                'plans': {m: np.asarray(predictions[m]).sum(axis=0).tolist() for m in methods},
                'expected': {m: np.asarray(expected[m]).sum(axis=0).tolist() for m in methods}})
        details.append({'product': history.iloc[0].product_name, 'variants': len(calendar.columns),
            'scores': {m: {t: errors(**pair) for t, pair in targets.items()} for m, targets in local.items()},
            'raw_scores': {m: {t: errors(**pair) for t, pair in targets.items()} for m, targets in raw_local.items()},
            'windows': windows})
        if index % 10 == 0 or index == len(groups):
            print(f'{label}: {index}/{len(groups)} products; {time.perf_counter()-started:.0f}s', flush=True)
    return {'cutoff': str(cutoff), 'seconds': round(time.perf_counter()-started, 2),
        'scores': {m: {t: errors(**p) for t, p in targets.items()} for m, targets in pools.items()},
        'raw_scores': {m: {t: errors(**p) for t, p in targets.items()} for m, targets in raw_pools.items()},
        'negative_daily_products': {m: sum(p['scores'][m]['product_daily']['r2'] is not None and p['scores'][m]['product_daily']['r2'] < 0 for p in details) for m in methods},
        'products': details}


async def main():
    logging.disable(logging.INFO)
    OUT.mkdir(exist_ok=True)
    snapshot_file = OUT / 'sales_snapshot.csv.gz'
    if snapshot_file.exists():
        sales = pd.read_csv(snapshot_file, parse_dates=['ds'])
    else:
        sales = await read_snapshot(DIAGNOSTIC_CUTOFF)
        sales.to_csv(snapshot_file, index=False, compression='gzip')
    raw = sales.sort_values(['product_id', 'variant_id', 'ds']).to_csv(index=False).encode()
    protocol = {'read_only': True, 'dataset_sha256': hashlib.sha256(raw).hexdigest(),
        'first_sale': str(sales.loc[sales.units > 0, 'ds'].min().date()), 'last_sale': str(sales.loc[sales.units > 0, 'ds'].max().date()),
        'recorded_units': int(sales.units.sum()), 'products': int(sales.product_id.nunique()), 'variants': int(sales.variant_id.nunique()),
        'tuning_cutoff': str(TUNE_CUTOFF), 'reserved_test_cutoff': str(TEST_CUTOFF),
        'selection_rule': 'Lowest rounded product-week MAE; RMSE tie-breaker. Same rule for best Prophet candidate.',
        'data_classification': 'Predominantly synthetic; receipt-informed popularity; not independent live accuracy validation'}
    (OUT / 'protocol.json').write_text(json.dumps(protocol, indent=2), encoding='utf-8')
    print(json.dumps(protocol), flush=True)
    tune = evaluate(sales, TUNE_CUTOFF, METHODS, 'Tuning')
    (OUT / 'tuning.json').write_text(json.dumps(tune, indent=2, allow_nan=False), encoding='utf-8')
    ranking = sorted(METHODS, key=lambda m: (tune['scores'][m]['product_weekly']['mae'], tune['scores'][m]['product_weekly']['rmse']))
    choice = ranking[0]
    prophet_choice = next(m for m in ranking if m in ['current', 'flat_full', 'flat_26w'])
    decision = {'selected': choice, 'selected_prophet': prophet_choice, 'ranking': ranking}
    (OUT / 'locked_choice.json').write_text(json.dumps(decision, indent=2), encoding='utf-8')
    print(f'Locked choices before July evaluation: {decision}', flush=True)
    test_methods = list(dict.fromkeys(['current', choice, prophet_choice, 'previous_week', 'weekday_8w', 'weekday_26w']))
    test = evaluate(sales, TEST_CUTOFF, test_methods, 'Reserved July test')
    (OUT / 'reserved_test.json').write_text(json.dumps(test, indent=2, allow_nan=False), encoding='utf-8')
    diagnostic = evaluate(sales, DIAGNOSTIC_CUTOFF, test_methods, 'October diagnostics', selected_only=True)
    (OUT / 'diagnostics.json').write_text(json.dumps(diagnostic, indent=2, allow_nan=False), encoding='utf-8')
    summary = {'protocol': protocol, 'choice': decision,
        'tuning': {key: value for key, value in tune.items() if key != 'products'},
        'reserved_test': {key: value for key, value in test.items() if key != 'products'},
        'diagnostics': diagnostic}
    # Retain the companion diagnostics for this exact frozen dataset on reruns.
    # Different snapshots must not inherit observations from a previous study.
    previous_path = OUT / 'summary.json'
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))
        if previous.get('protocol', {}).get('dataset_sha256') == protocol['dataset_sha256']:
            for key in ['stored_job_verification', 'sales_profile', 'environment', 'allocation_diagnostic']:
                if key in previous:
                    summary[key] = previous[key]
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps({'choice': decision, 'reserved_test': test['scores'], 'negative_daily_products': test['negative_daily_products']}), flush=True)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(f'Investigation failed ({type(error).__name__}); no application writes were performed.', flush=True)
        raise SystemExit(1)
