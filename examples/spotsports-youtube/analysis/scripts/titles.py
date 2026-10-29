"""Title-based cuts. Added 2026-10-28. Needs data/titles.csv from data/titles.sql (public channel and video titles,
keyed by the same hashed ids); skipped when that file is absent. Video titles are used only to tag format and are
never written out. Channel titles are published with owner approval.

format_lift.csv        the primary long-form estimator within each title-tagged editorial format, all sports and the
                       five largest sports. Tags are keyword rules in FORMATS, applied in order; most videos stay untagged.
channel_examples.csv   the largest channels in the five largest sports (by stored long-form views; at least 5 videos on
                       each side at 28-30 days): mean views of new videos over earlier ones, with a range from
                       resampling each channel's videos.
"""
import csv
import os
import random
import re
import statistics as st
from collections import defaultdict

from common import CHANGE, EXTRACT_DIR, channel_sport, write_csv
from metric import LF_AGE, POST_START, lift, pick_reading, quantile

TITLES = os.path.join(EXTRACT_DIR, 'titles.csv')
TOP_SPORTS = ['Soccer', 'Basketball', 'Baseball', 'Hockey', 'Football']
FORMATS = [
    ('Highlights', r'\bhighlights?\b|\bbest (plays|moments)\b|\btop \d+ (plays|goals|moments)'),
    ('Full game or match', r'\bfull (game|match|race|fight)\b|\bfull broadcast\b|\breplay\b'),
    ('Press conference or interview', r'\bpress conference\b|\bpresser\b|\binterview\b|\bpost-?game\b|\bpre-?game\b|\bmedia (day|availability)\b'),
    ('Live stream or watchalong', r'\blive\b|\bwatch ?along\b|\bstream\b|\bplay-by-play\b'),
    ('Podcast or show', r'\bpodcast\b|\bep(isode)?\.? ?\d+|\bshow\b'),
    ('Analysis or preview', r'\banalysis\b|\bbreakdown\b|\bpreview\b|\bpredictions?\b|\bexplained\b|\bfilm (study|room)\b|\brankings?\b|\btakeaways\b|\bgrades?\b'),
    ('Reaction', r'\breacts?\b|\breaction\b'),
]
COLS = ['ratio_of_totals', 'rt_lo', 'rt_hi', 'typical_video', 'tv_lo', 'tv_hi', 'channels', 'pre_videos', 'post_videos']


def tag(title):
    t = (title or '').lower()
    for name, pat in FORMATS:
        if re.search(pat, t):
            return name
    return 'Untagged'


def run(rows, rd):
    if not os.path.exists(TITLES):
        return None
    vtag, ctitle = {}, {}
    with open(TITLES, newline='') as f:
        for r in csv.DictReader(f):
            vtag[r['video_key']] = tag(r['video_title'])
            ctitle[r['channel_key']] = r['channel_title']
    csport = channel_sport(rows)
    lf_pick = pick_reading(rd, 0, *LF_AGE)

    # ---------- Lift within title-tagged format ----------
    out = []
    for fmt in [n for n, _ in FORMATS] + ['Untagged']:
        pick = [x for x in lf_pick if vtag.get(x['video']) == fmt]
        for sp in ['All sports'] + TOP_SPORTS:
            chans = None if sp == 'All sports' else {c for c, s in csport.items() if s == sp}
            r = lift(rd, 0, LF_AGE, picked=pick, channels=chans, reps=500)
            if r and r['channels'] >= 10:
                out.append([fmt, sp] + [r[c] for c in COLS])
    write_csv('format_lift.csv', ['format', 'sport'] + COLS, out)

    # ---------- Named channel examples ----------
    stored = defaultdict(int)
    for r in rows:
        if r['is_yt_short'] == 0:
            stored[r['channel_key']] += r['view_count'] or 0
    pre, post = defaultdict(list), defaultdict(list)
    for x in lf_pick:
        if x['T'] < CHANGE:
            pre[x['channel']].append(x['views'])
        elif x['P'] >= POST_START:
            post[x['channel']].append(x['views'])
    rng = random.Random(20261028)
    ex = []
    for sp in TOP_SPORTS:
        chans = [c for c in pre if csport.get(c) == sp and len(pre[c]) >= 5 and len(post[c]) >= 5 and c in ctitle]
        for c in sorted(chans, key=lambda c: -stored[c])[:5]:
            a, b = pre[c], post[c]
            boots = sorted(st.mean(rng.choices(b, k=len(b))) / st.mean(rng.choices(a, k=len(a))) for _ in range(500))
            ex.append([sp, ctitle[c], len(a), len(b), st.mean(b) / st.mean(a), quantile(boots, 0.025), quantile(boots, 0.975)])
    write_csv('channel_examples.csv', ['sport', 'channel_title', 'pre_videos', 'post_videos', 'ratio_of_means', 'lo', 'hi'], ex)
    return dict(format_lift=out, channel_examples=ex)
