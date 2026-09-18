from pathlib import Path
import csv,json,hashlib
from fractions import Fraction as F
root=Path(__file__).resolve().parents[2]
def read(name):
 p=root/'data'/name;rows=list(csv.DictReader(p.open())); assert len({(r['period'],r['channel']) for r in rows})==len(rows)
 assert {r['period'] for r in rows}=={'baseline','current'}
 d={t:{} for t in ['baseline','current']}
 for r in rows:
  n,s=int(r['eligible_sessions']),int(r['signups']);assert n>0 and 0<=s<=n
  d[r['period']][r['channel']]=(n,s)
 assert d['baseline'].keys()==d['current'].keys()
 return d,{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'rows':len(rows)}
old,old_source=read('conversion.csv');data,source=read('conversion-followup.csv')
assert old['current']==data['baseline']
totals={t:dict(sessions=sum(x[0] for x in d.values()),signups=sum(x[1] for x in d.values())) for t,d in data.items()}
rates={t:F(v['signups'],v['sessions']) for t,v in totals.items()}
within=mix=F(0);segments=[]
for ch in data['baseline']:
 n0,s0=data['baseline'][ch];n1,s1=data['current'][ch]
 r0,r1=F(s0,n0),F(s1,n1);w0,w1=F(n0,totals['baseline']['sessions']),F(n1,totals['current']['sessions'])
 a,b=w0*(r1-r0),(w1-w0)*r1;within+=a;mix+=b
 segments.append(dict(channel=ch,baseline_sessions=n0,current_sessions=n1,baseline_signups=s0,current_signups=s1,baseline_rate=float(r0),current_rate=float(r1),baseline_weight=float(w0),current_weight=float(w1),within_pp=float(a*100),mix_pp=float(b*100)))
assert within+mix==rates['current']-rates['baseline']
print(json.dumps(dict(sources=[old_source,source],checks=dict(unique_period_channel_keys=True,positive_integer_denominators=True,bounded_integer_numerators=True,common_channels=True,baseline_matches_previous_current=True,exact_decomposition=True,joins=0,exclusions=0),totals=totals,pooled_rates={t:float(v) for t,v in rates.items()},change_pp=float(100*(rates['current']-rates['baseline'])),relative_change=float(rates['current']/rates['baseline']-1),segments=segments,baseline_weighted_current_rate=float(rates['baseline']+within),within_pp=float(100*within),mix_pp=float(100*mix),difference_from_original_baseline_pp=float(100*(rates['current']-F(sum(v[1] for v in old['baseline'].values()),sum(v[0] for v in old['baseline'].values()))))),indent=2))
