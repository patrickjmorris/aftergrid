"""define-metric: the long-form view-count lift, implemented exactly as specified in 03-define-metric.md (version 2).

Lift at a fixed age, within channel:
  pre group  = videos of the format with a reading at age [AGE_LO, AGE_HI) days taken before 2026-08-24 00:00 UTC
  post group = videos of the format published on or after POST_START with a reading at age [AGE_LO, AGE_HI)
  one reading per video: the one closest to the window midpoint
  channels enter only if they have at least one video in each group

  channel weight w_c (version 2, 'balanced') = n_pre_c * n_post_c / (n_pre_c + n_post_c),
    the weight a channel fixed-effects comparison gives. Version 1 used w_c = n_pre_c ('pre'), which let a
    channel with many pre videos and few post videos set much of the result. 'pre' and 'equal' stay as sensitivities.
  ratio_of_totals (pooled views) = sum_c w_c * mean_post_c(views) / sum_c w_c * mean_pre_c(views)
  typical_video                  = exp( sum_c w_c * [mean_post_c(ln(1+v)) - mean_pre_c(ln(1+v))] / sum_c w_c )
  lift = ratio - 1
Uncertainty: bootstrap over channels (resample channels with replacement), percentile 95% interval.
The interval covers sampling of channels for this matched-cohort comparison. It does not cover a change in
underlying viewing between the cohorts; that is an assumption tested in diagnose-change.
"""
import math
import random
from collections import defaultdict

from common import CHANGE

LF_AGE = (28.0, 30.0)
SH_AGE = (12.0, 14.0)
POST_START = CHANGE + 7  # 2026-08-31 00:00 UTC; one-week rollout buffer
WEIGHTS = 'balanced'


def weight(n_pre, n_post, scheme):
    if scheme == 'balanced':
        return n_pre * n_post / (n_pre + n_post)
    if scheme == 'pre':
        return n_pre
    if scheme == 'equal':
        return 1.0
    raise ValueError(scheme)


def pick_reading(reads, fmt, age_lo, age_hi):
    """One reading per video inside the age window, closest to the midpoint."""
    mid = (age_lo + age_hi) / 2
    best = {}
    for x in reads:
        if x['fmt'] == fmt and age_lo <= x['age'] < age_hi:
            b = best.get(x['video'])
            if b is None or abs(x['age'] - mid) < abs(b['age'] - mid):
                best[x['video']] = x
    return list(best.values())


def groups(picked, pre_rule, post_rule):
    pre = defaultdict(list)
    post = defaultdict(list)
    for x in picked:
        if pre_rule(x):
            pre[x['channel']].append(x['views'])
        elif post_rule(x):
            post[x['channel']].append(x['views'])
    chans = sorted(set(pre) & set(post))
    return {c: (pre[c], post[c]) for c in chans}, pre, post


def channel_stats(g):
    """Per channel: n_pre, mean_pre, mean_post, mean log pre, mean log post, n_post."""
    out = {}
    for c, (a, b) in g.items():
        out[c] = (len(a), sum(a) / len(a), sum(b) / len(b),
                  sum(math.log1p(v) for v in a) / len(a), sum(math.log1p(v) for v in b) / len(b), len(b))
    return out


def estimate(cs, chans=None, weights=WEIGHTS):
    """Return (ratio_of_totals, typical_video) under the given channel weights."""
    chans = chans if chans is not None else list(cs)
    num = den = wl = w = 0.0
    for c in chans:
        n, mpre, mpost, lpre, lpost, m = cs[c]
        k = weight(n, m, weights)
        num += k * mpost
        den += k * mpre
        wl += k * (lpost - lpre)
        w += k
    return (num / den if den else float('nan'), math.exp(wl / w) if w else float('nan'))


def ppml(cs, chans=None, iters=200):
    """Poisson pseudo-maximum likelihood with channel fixed effects on level views: the R solving
    sum_c Ypost_c = R * sum_c n_post_c * (Ypre_c + Ypost_c) / (n_pre_c + n_post_c * R)."""
    chans = chans if chans is not None else list(cs)
    R = 1.0
    for _ in range(iters):
        num = den = 0.0
        for c in chans:
            n, mpre, mpost, _, _, m = cs[c]
            num += m * mpost
            den += m * (n * mpre + m * mpost) / (n + m * R)
        R_new = num / den
        if abs(R_new - R) < 1e-12:
            return R_new
        R = R_new
    return R


def quantile(xs, p):
    return xs[int(p * (len(xs) - 1))]


def bootstrap(cs, reps=2000, seed=20261028, weights=WEIGHTS):
    rng = random.Random(seed)
    chans = list(cs)
    tot, typ = [], []
    for _ in range(reps):
        s = [chans[rng.randrange(len(chans))] for _ in chans]
        a, b = estimate(cs, s, weights)
        tot.append(a)
        typ.append(b)
    tot.sort()
    typ.sort()
    return (quantile(tot, 0.025), quantile(tot, 0.975)), (quantile(typ, 0.025), quantile(typ, 0.975))


def bootstrap_ppml(cs, reps=500, seed=20261028):
    rng = random.Random(seed)
    chans = list(cs)
    out = sorted(ppml(cs, [chans[rng.randrange(len(chans))] for _ in chans], iters=60) for _ in range(reps))
    return quantile(out, 0.025), quantile(out, 0.975)


def lift(reads, fmt, age, pre_rule=None, post_rule=None, reps=2000, channels=None, picked=None, weights=WEIGHTS):
    """Return a dict with point estimates, intervals, counts and mean reading ages.
    picked: optional pre-selected readings (one per video); otherwise chosen by format and age window."""
    pre_rule = pre_rule or (lambda x: x['T'] < CHANGE)
    post_rule = post_rule or (lambda x: x['P'] >= POST_START)
    if picked is None:
        picked = pick_reading(reads, fmt, *age)
    g, pre, post = groups(picked, pre_rule, post_rule)
    if channels is not None:
        g = {c: v for c, v in g.items() if c in channels}
    cs = channel_stats(g)
    if not cs:
        return None
    tot, typ = estimate(cs, weights=weights)
    (tl, th), (yl, yh) = bootstrap(cs, reps, weights=weights) if reps else ((float('nan'),) * 2, (float('nan'),) * 2)
    ages = ([], [])
    for x in picked:
        if x['channel'] in g:
            if pre_rule(x):
                ages[0].append(x['age'])
            elif post_rule(x):
                ages[1].append(x['age'])
    return dict(ratio_of_totals=tot, rt_lo=tl, rt_hi=th, typical_video=typ, tv_lo=yl, tv_hi=yh,
                channels=len(cs), pre_videos=sum(v[0] for v in cs.values()), post_videos=sum(v[5] for v in cs.values()),
                pre_channels_all=len(pre), post_channels_all=len(post),
                pre_views=sum(sum(a) for a, _ in g.values()), post_views=sum(sum(b) for _, b in g.values()),
                zero_view_pre_channels=sum(1 for a, _ in g.values() if sum(a) == 0),
                pre_age_mean=sum(ages[0]) / len(ages[0]), post_age_mean=sum(ages[1]) / len(ages[1]), cs=cs, g=g)
