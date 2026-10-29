import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
def es(f, lo, hi, base_lo, base_hi, wk_range):
    c=[r for r in reads if r[3]==f and lo<=r[6]-r[5]<hi]
    base=defaultdict(list)
    for r in c:
        w=math.floor(r[5]-CH)//7
        if base_lo<=w<=base_hi and r[6]<CH: base[r[1]].append(math.log1p(r[7]))
    base={k:st.mean(v) for k,v in base.items()}
    byw=defaultdict(list)
    for r in c:
        if r[1] in base: byw[math.floor(r[5]-CH)//7].append(math.log1p(r[7])-base[r[1]])
    print(f'fmt {f} age {lo}-{hi} baseline weeks {base_lo}..{base_hi} channels {len(base)}')
    print('  '+' '.join(f'{w}:{len(byw[w])}:{math.exp(st.mean(byw[w])):.2f}' for w in wk_range if len(byw[w])>=30))
es(1,12,14,-21,-11,range(-22,8))
es(1,7,12,-12,-2,range(-22,8))
es(1,14,30,-10,-4,range(-22,8))
es(1,30,60,-14,-9,range(-30,8))
es(1,1,3,-12,-2,range(-30,10))
