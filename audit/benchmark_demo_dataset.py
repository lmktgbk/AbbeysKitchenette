"""Benchmark a controlled synthetic demo; never query or modify the database."""
from pathlib import Path
from datetime import date
import sys
import json
import hashlib
import logging
import pandas as pd
from investigate_forecasting import evaluate
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'ml-service'))
from mba.services.fpgrowth import _build_baskets, _compute_rules, _verify_on_recent, _is_stable, MIN_SUPPORT, MIN_CONFIDENCE

OUT = Path(__file__).resolve().parent/'forecast-demo-dataset'
sales = pd.read_csv(OUT/'sales.csv', parse_dates=['ds'])
logging.disable(logging.INFO)
protocol = {'dataset_sha256':hashlib.sha256((OUT/'sales.csv').read_bytes()).hexdigest(),
 'tuning_cutoff':'2026-06-28','holdout_cutoff':'2026-08-23',
 'target':'Unrounded variant-week totals','selection':'Lowest June variant-week MAE, RMSE tie-breaker',
 'classification':'Controlled synthetic weekly basket quotas; not actual future accuracy', 'databaseTouched':False}
(OUT/'benchmark-protocol.json').write_text(json.dumps(protocol,indent=2))
# Use only predeclared configurations. Neither generator nor parameters are tuned to test scores.
tune=evaluate(sales,date(2026,6,28),['current','flat_full','previous_week'],'Demo June tuning')
choice=min(['current','flat_full'],key=lambda m:(tune['raw_scores'][m]['variant_weekly']['mae'],tune['raw_scores'][m]['variant_weekly']['rmse']))
(OUT/'locked-model.json').write_text(json.dumps({'choice':choice},indent=2))
test=evaluate(sales,date(2026,8,23),['current','flat_full','previous_week'],'Demo August comparison')

# MBA uses its existing production mining and recent-window verification functions.
baskets=[json.loads(line) for line in (OUT/'baskets.jsonl').read_text().splitlines()]
metadata=sales.drop_duplicates('variant_id').set_index('variant_id')
rows=[]
for basket in baskets:
 for item in basket['items']:
  v=metadata.loc[item['variant_id']]
  rows.append({'order_id':basket['id'],'order_date':basket['date'],'variant_id':item['variant_id'],
               'variant_label':f"{v.product_name} {v.size_name}"})
frame=pd.DataFrame(rows)
days=sorted(frame.order_date.unique()); split=max(1,int(len(days)*.8))
old=_build_baskets(frame[frame.order_date.isin(days[:split])]); recent=_build_baskets(frame[frame.order_date.isin(days[split:])])
rules=_compute_rules(old)
mba=[]
for _,rule in rules.iterrows():
 scores=_verify_on_recent(recent,rule.variant_a,rule.variant_b)
 mba.append({'a':rule.variant_a,'b':rule.variant_b,'support':float(rule.support),'confidence':float(rule.confidence),
             'lift':float(rule.lift),'recent':scores,'stable':bool(_is_stable(scores,MIN_SUPPORT,MIN_CONFIDENCE))})
result={'protocol':protocol,'selected_model':choice,'tuning':tune['raw_scores'],'holdout':test['raw_scores'],
        'mba':{'training_orders':len(old),'recent_orders':len(recent),'training_through':days[split-1],
               'recent_from':days[split],'min_support':MIN_SUPPORT,'min_confidence':MIN_CONFIDENCE,
               'rules':len(mba),'stable_rules':sum(r['stable'] for r in mba),'examples':mba[:20]}}
(OUT/'benchmark.json').write_text(json.dumps(result,indent=2,allow_nan=False))
print(json.dumps({'selected_model':choice,'holdout':test['raw_scores'],'mba':result['mba']},indent=2),flush=True)
