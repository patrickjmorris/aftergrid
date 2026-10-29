import sys; import os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import *
from metric import *
import time
t=time.time()
rows=load_rows(); rd=readings(rows)
print('load',time.time()-t)
for fmt,age in [(0,LF_AGE),(1,SH_AGE)]:
    t=time.time(); r=lift(rd,fmt,age,reps=500); print(fmt, {k:(round(v,3) if isinstance(v,float) else v) for k,v in r.items()}, round(time.time()-t,1))
