"""Round-2 probe, finding 2: are stock()'s 'low' and 'high' accruals bounds? And the widest post-switch accrual
the timestamps allow, assuming counts never fall and were not restated (stdout only)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, iso, load_rows  # noqa: E402

rows = load_rows()
lfr = [r for r in rows if r['is_yt_short'] == 0 and r['view_count'] is not None]
n = slo = shi = 0
ex = None
for r in lfr:
    T1, T2 = r['T1'], r['T2']
    if r['P'] >= CHANGE or T1 is None or r['prev_view_count'] is None or T2 is None or T2 <= CHANGE or T2 <= T1 or T1 < CHANGE:
        continue
    v1 = r['prev_view_count']
    inc = max(0, r['view_count'] - v1)
    lo = inc + min(v1, inc / (T2 - T1) * (T1 - CHANGE))
    hi = inc + (v1 * (T1 - CHANGE) / (T1 - r['P']) if T1 > r['P'] else 0)
    if lo > hi:
        n += 1
        slo += lo
        shi += hi
        if v1 == 3596490 and r['view_count'] == 4626073:  # the reviewer's example
            ex = (r['published_at'], v1, iso(T1), r['view_count'], iso(T2), round(lo), round(hi))
print('low > high:', n, 'videos; summed low', round(slo), 'high', round(shi))
print('example', ex)
S = lo_t = hi_t = 0
for r in lfr:
    V2 = r['view_count']
    S += V2
    Tlast = r['T2'] if r['T2'] is not None else r['I']
    if r['P'] >= CHANGE:
        lo_t += V2
        hi_t += V2
        continue
    if Tlast < CHANGE:
        continue
    T1, v1 = r['T1'], r['prev_view_count']
    if r['T2'] is not None and T1 is not None and v1 is not None and T1 < r['T2'] and 0 <= v1 <= V2:
        if T1 >= CHANGE:
            lo_t += V2 - v1
            hi_t += V2
        else:
            hi_t += V2 - v1
        continue
    hi_t += V2
print('stored', S, 'post-switch accrual range', lo_t, hi_t)
R = 1.7434910333551492
for a in (lo_t, hi_t):
    add = a * (1 - 1 / R)
    print('lift', round(S / (S - add) - 1, 4))
