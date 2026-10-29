import sys; import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import *
rows=load_rows()
rd=readings(rows)
cov={x['video'] for x in rd if x['fmt']==0 and 28<=x['age']<30 and x['T']<CHANGE}
g=defaultdict(lambda: {'c':[], 'u':[]})
chan_cov=defaultdict(lambda:[0,0])
for r in rows:
    if r['is_yt_short']!=0 or r['view_count'] is None or r['T2'] is None: continue
    if not (CHANGE-70 <= r['P'] < CHANGE-29): continue
    if r['T2'] < CHANGE+1: continue
    k='c' if r['video_key'] in cov else 'u'
    g[r['channel_key']][k].append((lg(r['view_count']), r['T2']-r['P']))
    chan_cov[r['channel_key']][0 if k=='c' else 1]+=1
both=[ch for ch,v in g.items() if v['c'] and v['u']]
d=[st.mean(a for a,_ in g[ch]['c'])-st.mean(a for a,_ in g[ch]['u']) for ch in both]
print('channels with covered and uncovered pre videos:',len(both),'of',len(g))
print('covered vs uncovered, later lifetime count within channel: geo ratio',round(gmean_ratio(d),3),'median diff',round(st.median(d),3))
print('age at last reading covered',st.median(a for ch in both for _,a in g[ch]['c']),'uncovered',st.median(a for ch in both for _,a in g[ch]['u']))
full=sum(1 for v in chan_cov.values() if v[1]==0); none=sum(1 for v in chan_cov.values() if v[0]==0)
print('channels fully covered',full,'none covered',none,'mixed',len(chan_cov)-full-none)
