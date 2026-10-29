import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe3.py')).read().split('def show')[0])
# old long-form videos: relative daily growth per pair type, by publish month
cells=defaultdict(list)
for p in pairs:
    vk,ck,sp,f,d,P,T1,v1,T2,v2=p
    if f!=0 or T1-P<150 or v1<100 or T2-T1<20: continue
    typ='pre-post' if T1<CH and T2>=CH+1 else ('post-post' if T1>=CH+1 else 'other')
    if typ=='other': continue
    from datetime import datetime,timezone
    m=datetime.fromtimestamp(P*86400,timezone.utc).strftime('%Y-%m')
    post_days=max(0,T2-max(T1,CH)); 
    cells[(m,typ)].append(((v2-v1)/v1/(T2-T1), post_days/(T2-T1), ck, T1-P, T2-P, v1, v2, T1, T2))
for k in sorted(cells):
    L=cells[k]
    if len(L)<100: continue
    r=[x[0] for x in L]
    agg=sum(x[6]-x[5] for x in L)/sum(x[5] for x in L)/st.mean([x[8]-x[7] for x in L])
    print(k, len(L), 'ch',len(set(x[2] for x in L)), f'median rel growth/day {st.median(r)*1000:.3f}/1000  agg {agg*1000:.3f}/1000  post share {st.mean(x[1] for x in L):.2f}  age1 {st.median(x[3] for x in L):.0f} age2 {st.median(x[4] for x in L):.0f}')
