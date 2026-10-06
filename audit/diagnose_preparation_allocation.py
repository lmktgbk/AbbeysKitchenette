"""Diagnostic allocation experiment only; never imports or calls database writes."""
import json,logging
from pathlib import Path
import numpy as np,pandas as pd
from investigate_forecasting import forecast,SELECTED,OUT
from forecasting.services.allocation import apportion
from benchmark_forecasting import errors
logging.disable(logging.INFO)

def balance(expected):
    """Preserve independent variant weekly quotas and coherent whole-product daily totals.

    Greedy largest-deficit transport is a simple prototype, not a proven globally
    optimal allocation or a selected forecasting method. No actuals are consulted.
    """
    matrix=np.asarray(expected,dtype=float)
    quotas=np.floor(matrix.sum(axis=0)+0.5).astype(int)
    rows=np.asarray(apportion(int(quotas.sum()),matrix.sum(axis=1)),dtype=int)
    cols=quotas.copy();counts=np.zeros(matrix.shape,dtype=int)
    for _ in range(int(quotas.sum())):
        choices=[(matrix[d,v]-counts[d,v],d,v) for d in range(7) if rows[d]>0 for v in range(matrix.shape[1]) if cols[v]>0]
        _,d,v=max(choices,key=lambda item:(item[0],-item[1],-item[2]))
        counts[d,v]+=1;rows[d]-=1;cols[v]-=1
    assert np.array_equal(counts.sum(axis=0),quotas)
    assert np.array_equal(counts.sum(axis=1),apportion(int(quotas.sum()),matrix.sum(axis=1)))
    return counts

sales=pd.read_csv(OUT/'sales_snapshot.csv.gz',parse_dates=['ds'])
result={'classification':'Post-benchmark October diagnostic; not an untouched final evaluation','method':'Current Prophet with greedy coherent preparation allocation','products':[]}
for pid,history in sales.groupby('product_id'):
    if history.iloc[0].product_name not in SELECTED:continue
    dates=pd.date_range(history.ds.min(),'2026-10-05');calendar=history.pivot_table(index='ds',columns='variant_id',values='units',aggfunc='sum').reindex(dates).fillna(0)
    pairs={m:{'predicted':[],'actual':[]} for m in ['current','balanced']};weeks=[]
    for origin in range(3):
        end=len(calendar)-origin*7;split=end-7;actual=calendar.iloc[split:end].to_numpy()
        expected=[];plans=[]
        for vid in calendar.columns:
            raw,plan=forecast(pd.DataFrame({'ds':dates[:split],'y':calendar[vid].iloc[:split].to_numpy()}),'current');expected.append(raw);plans.append(plan)
        expected=np.asarray(expected).T;current=np.asarray(plans).T;balanced=balance(expected)
        assert np.array_equal(balanced.sum(axis=0),current.sum(axis=0))
        for method,plan in [('current',current),('balanced',balanced)]:
            pairs[method]['predicted'].extend(plan.sum(axis=1));pairs[method]['actual'].extend(actual.sum(axis=1))
        weeks.append({'from':str(dates[split].date()),'to':str(dates[end-1].date()),'actual':actual.sum(axis=1).tolist(),'current':current.sum(axis=1).tolist(),'balanced':balanced.sum(axis=1).tolist(),'expected':expected.sum(axis=1).tolist()})
    row={'product':history.iloc[0].product_name,'scores':{m:errors(**p) for m,p in pairs.items()},'weeks':weeks}
    result['products'].append(row);print(row['product'],{m:round(s['rmse'],3) for m,s in row['scores'].items()},flush=True)
(OUT/'allocation_diagnostic.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
