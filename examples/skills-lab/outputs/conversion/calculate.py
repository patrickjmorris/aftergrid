from pathlib import Path
import csv, json, hashlib
from fractions import Fraction as F
root=Path(__file__).resolve().parents[2]
p=root/'data/conversion.csv'
rows=list(csv.DictReader(p.open()))
assert len({(r['period'],r['channel']) for r in rows}) == len(rows)
assert {r['period'] for r in rows} == {'baseline','current'}
data={period:{} for period in ['baseline','current']}
for r in rows:
 n,s=int(r['eligible_sessions']),int(r['signups'])
 assert n>0 and 0<=s<=n
 data[r['period']][r['channel']]=(n,s)
assert data['baseline'].keys()==data['current'].keys()
totals={t: {'sessions':sum(x[0] for x in d.values()), 'signups':sum(x[1] for x in d.values())} for t,d in data.items()}
rates={t:F(v['signups'],v['sessions']) for t,v in totals.items()}
within=mix=F(0); segments=[]
for ch in data['baseline']:
 n0,s0=data['baseline'][ch]; n1,s1=data['current'][ch]
 r0,r1=F(s0,n0),F(s1,n1); w0,w1=F(n0,totals['baseline']['sessions']),F(n1,totals['current']['sessions'])
 a,b=w0*(r1-r0),(w1-w0)*r1; within+=a; mix+=b
 segments.append(dict(channel=ch,baseline_rate=float(r0),current_rate=float(r1),baseline_weight=float(w0),current_weight=float(w1),rate_contribution_pp=float(100*a),mix_contribution_pp=float(100*b)))
assert within+mix==rates['current']-rates['baseline']
print(json.dumps(dict(source=str(p.relative_to(root)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),checks={'unique_keys':True,'same_channels':True,'range_checks':True,'exact_decomposition':True,'rows':len(rows),'joins':0,'exclusions':0},totals=totals,pooled_rates={t:float(r) for t,r in rates.items()},change_pp=float(100*(rates['current']-rates['baseline'])),relative_change=float(rates['current']/rates['baseline']-1),segments=segments,baseline_weighted_current_rate=float(rates['baseline']+within),within_pp=float(100*within),mix_pp=float(100*mix)),indent=2))
