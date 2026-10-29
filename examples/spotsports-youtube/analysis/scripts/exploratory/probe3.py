import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
# pairs
pairs=[]
for vk,ck,sp,f,d,p,t1,v1,t2,v2 in rows:
    if f is None or not t1 or not t2 or v1 is None or v2 is None: continue
    P=ts(p); T1=ts(t1); T2=ts(t2)
    pairs.append((vk,ck,sp,f,d,P,T1,v1,T2,v2))
def show(name, sel):
    g=[(p[9]+1)/(p[7]+1) for p in sel]
    if not g: print(name,'n=0'); return
    lg=[math.log(x) for x in g]
    print(f"{name}: n={len(g)} ch={len(set(p[1] for p in sel))} median g={st.median(g):.3f} gmean g={math.exp(st.mean(lg)):.3f} agg g={(sum(p[9] for p in sel)/sum(p[7] for p in sel)):.3f} pub {min(p[5] for p in sel)-CH:.0f}..{max(p[5] for p in sel)-CH:.0f} R2 {min(p[8] for p in sel)-CH:.0f}..{max(p[8] for p in sel)-CH:.0f}")
    return sel
for a2lo,a2hi in [(55,65),(60,70),(30,40),(31,35)]:
    print('R1 age 27-31, R2 age',a2lo,a2hi)
    S=[p for p in pairs if p[3]==0 and 27<=p[6]-p[5]<31 and a2lo<=p[8]-p[5]<a2hi and p[6]<CH and p[8]>=CH+1]
    N=[p for p in pairs if p[3]==0 and 27<=p[6]-p[5]<31 and a2lo<=p[8]-p[5]<a2hi and p[5]>=CH+1]
    T=[p for p in pairs if p[3]==0 and 27<=p[6]-p[5]<31 and a2lo<=p[8]-p[5]<a2hi and p[6]>=CH and p[5]<CH]
    show(' S straddle (V1 old, incr new)',S); show(' N all new',N); show(' T V1 mostly old, R1 after change',T)
