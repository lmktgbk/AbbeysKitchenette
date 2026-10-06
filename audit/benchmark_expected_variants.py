"""Read-only variant benchmark; select on June, lock before an August holdout.

Uses the frozen sales snapshot. No application settings or database rows change.
August is a later historical comparison, not an independent real-world trial.
"""
from pathlib import Path
import hashlib
import json
import logging
import pandas as pd
from datetime import date
from investigate_forecasting import evaluate, METHODS

OUT = Path(__file__).resolve().parent / 'variant-demand-benchmark'
OUT.mkdir(exist_ok=True)
source = Path(__file__).resolve().parent / 'forecasting-investigation/sales_snapshot.csv.gz'
sales = pd.read_csv(source, parse_dates=['ds'])
logging.disable(logging.INFO)
protocol = {'dataset_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'tuning_cutoff': '2026-06-28', 'holdout_cutoff': '2026-08-23',
            'target': 'unrounded variant-week expected units',
            'selection': 'lowest tuning variant-week MAE, then RMSE',
            'classification': 'Predominantly synthetic history; not live accuracy evidence',
            'production_changed': False}
(OUT/'protocol.json').write_text(json.dumps(protocol, indent=2))
# Reuse June fits only when their exact frozen dataset hash and method set match.
cache_dir = source.parent
if (cache_dir/'protocol.json').exists() and (cache_dir/'tuning.json').exists():
    cache_protocol = json.loads((cache_dir/'protocol.json').read_text())
    canonical = sales.sort_values(['product_id', 'variant_id', 'ds']).to_csv(index=False).encode()
    if hashlib.sha256(canonical).hexdigest() != cache_protocol['dataset_sha256']:
        raise ValueError('Cached tuning dataset differs; refusing reuse')
    tune = json.loads((cache_dir/'tuning.json').read_text())
    if tune['cutoff'] != protocol['tuning_cutoff'] or set(tune['raw_scores']) != set(METHODS):
        raise ValueError('Cached tuning configuration differs')
    print('Reused verified June fits; evaluating locked choices on August holdouts', flush=True)
else:
    tune = evaluate(sales, date(2026,6,28), METHODS, 'Variant tuning')

ranking = sorted(METHODS, key=lambda method: (tune['raw_scores'][method]['variant_weekly']['mae'], tune['raw_scores'][method]['variant_weekly']['rmse']))
prophet = next(method for method in ranking if method in ['current','flat_full','flat_26w'])
locked = {'best_overall': ranking[0], 'best_prophet': prophet, 'ranking': ranking}
(OUT/'locked_choice.json').write_text(json.dumps(locked, indent=2))
# Persist the choice before reading holdout scores; no test-driven reselection.
test = evaluate(sales, date(2026,8,23), list(dict.fromkeys(['current', prophet, ranking[0], 'previous_week'])), 'August holdout')
report = {'protocol': protocol, 'locked_choice': locked,
          'tuning': tune['raw_scores'], 'holdout': test['raw_scores']}
(OUT/'summary.json').write_text(json.dumps(report, indent=2, allow_nan=False))
print(json.dumps(report, indent=2), flush=True)
