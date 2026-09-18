from pathlib import Path
import csv,json,hashlib
from fractions import Fraction as F
root=Path(__file__).resolve().parents[2];p=root/'data/onboarding.csv'; rows=list(csv.DictReader(p.open()))
assert len({r['completed_onboarding'] for r in rows})==len(rows)
assert {r['completed_onboarding'] for r in rows}=={'yes','no'}
rates={};n_total=s_total=0
for row in rows:
 n,s=int(row['eligible_users']),int(row['retained_users_week4']);assert n>0 and 0<=s<=n
 rates[row['completed_onboarding']]=F(s,n);n_total+=n;s_total+=s
print(json.dumps(dict(source=str(p.relative_to(root)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),checks=dict(unique_groups=True,range_checks=True,all_rows_included=True,joins=0),rates={k:float(v) for k,v in rates.items()},observed_gap_pp=float(100*(rates['yes']-rates['no'])),relative_group_difference=float(rates['yes']/rates['no']-1),pooled_rate=float(F(s_total,n_total)),total_users=n_total,total_retained=s_total,illustrative_retained_if_everyone_had_observed_completer_rate=float(n_total*rates['yes']),illustrative_relative_total_increase=float(n_total*rates['yes']/s_total-1)),indent=2))
