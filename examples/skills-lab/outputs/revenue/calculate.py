from pathlib import Path
import csv,json,hashlib
from decimal import Decimal as D
root=Path(__file__).resolve().parents[2]; p=root/'data/recurring-revenue.csv'
rows=list(csv.DictReader(p.open())); assert len({r['account_id'] for r in rows})==len(rows)
bridge={k:D(0) for k in ['entry','churn','expansion','contraction','unchanged']}; accounts=[]
baseline=current=existing=retained_gross=D(0); active0=active1=lost=0
for row in rows:
 b,c=D(row['baseline_mrr_usd']),D(row['current_mrr_usd']); assert b.is_finite() and c.is_finite() and b>=0 and c>=0
 baseline+=b;current+=c;active0+=b>0;active1+=c>0
 if b>0: existing+=c;retained_gross+=min(b,c);lost+=c==0
 cat='entry' if b==0 and c>0 else 'churn' if b>0 and c==0 else 'expansion' if c>b else 'contraction' if c<b else 'unchanged'
 bridge[cat]+=c-b;accounts.append(dict(account=row['account_id'],baseline=float(b),current=float(c),category=cat,delta=float(c-b)))
assert sum(bridge.values())==current-baseline
print(json.dumps(dict(source=str(p.relative_to(root)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),checks=dict(unique_accounts=True,finite_nonnegative=True,bridge_exact=True,rows=len(rows),joins=0,exclusions=0),baseline_mrr=float(baseline),current_mrr=float(current),delta=float(current-baseline),relative_growth=float(current/baseline-1),bridge={k:float(v) for k,v in bridge.items()},accounts=accounts,existing_current_mrr=float(existing),existing_change=float(existing-baseline),gross_mrr_retention=float(retained_gross/baseline),net_mrr_retention=float(existing/baseline),baseline_active=active0,current_active=active1,baseline_accounts_lost=lost,account_loss_fraction=lost/active0,average_mrr_per_active_baseline=float(baseline/active0),average_mrr_per_active_current=float(current/active1)),indent=2))
