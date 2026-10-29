"""Shared loading and helpers. Standard library only.

Source: the extract in ../../data/ (videos.sqlite, table videos; see data/README.md), or SPOTSPORTS_EXTRACT_DIR. All times UTC.
A video has up to three usable view readings:
  R0 = (published_at, 0) implicit, R1 = (prev_view_count_at, prev_view_count), R2 = (last_stats_check, view_count).
When last_stats_check is null the brief says view_count was never refetched after ingestion, so R2 = (ingested_at, view_count).
"""
import csv
import math
import os
import sqlite3
import statistics as st
from collections import Counter, defaultdict
from datetime import datetime, timezone

EXTRACT_DIR = os.environ.get('SPOTSPORTS_EXTRACT_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data'))
DB = os.path.join(EXTRACT_DIR, 'videos.sqlite')
CSV_SRC = os.path.join(EXTRACT_DIR, 'videos.csv')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'results')


def day(s):
    """Parse a stored UTC timestamp to fractional days since the epoch."""
    if s is None:
        return None
    s = s.replace('+00', '')
    return datetime.fromisoformat(s[:26]).replace(tzinfo=timezone.utc).timestamp() / 86400


CHANGE = day('2026-08-24 00:00:00')       # YouTube's announced switch date
CHANGE_2025 = day('2025-08-24 00:00:00')  # placebo boundary, one year earlier
EXTRACT_END = day('2026-10-28 00:00:00')


def iso(d):
    return datetime.fromtimestamp(d * 86400, timezone.utc).strftime('%Y-%m-%d')


def load_rows():
    con = sqlite3.connect(DB)
    cols = ['video_key', 'channel_key', 'sport', 'is_yt_short', 'duration_seconds', 'published_at',
            'ingested_at', 'last_stats_check', 'view_count', 'prev_view_count', 'prev_view_count_at']
    rows = [dict(zip(cols, r)) for r in con.execute(f"select {','.join(cols)} from videos")]
    con.close()
    for r in rows:
        r['P'] = day(r['published_at'])
        r['I'] = day(r['ingested_at'])
        r['T1'] = day(r['prev_view_count_at'])
        r['T2'] = day(r['last_stats_check'])
    return rows


def readings(rows, include_ingest_only=False):
    """One record per timestamped view reading.
    Fields: video, channel, fmt, dur, P (publish day), T (reading day), age (days), views, kind."""
    out = []
    for r in rows:
        if r['is_yt_short'] is None:
            continue
        base = dict(video=r['video_key'], channel=r['channel_key'], fmt=r['is_yt_short'],
                    dur=r['duration_seconds'], P=r['P'], sport=r['sport'])
        if r['T1'] is not None and r['prev_view_count'] is not None:
            out.append(dict(base, T=r['T1'], age=r['T1'] - r['P'], views=r['prev_view_count'], kind='prev'))
        if r['T2'] is not None and r['view_count'] is not None:
            out.append(dict(base, T=r['T2'], age=r['T2'] - r['P'], views=r['view_count'], kind='last'))
        elif include_ingest_only and r['T2'] is None and r['view_count'] is not None:
            out.append(dict(base, T=r['I'], age=r['I'] - r['P'], views=r['view_count'], kind='ingest_only'))
    return out


def channel_sport(rows):
    """Modal non-'Unassigned' sport per channel. 'Unassigned' is a per-video tagging gap (see explore-data)."""
    c = Counter((r['channel_key'], r['sport']) for r in rows if r['sport'] != 'Unassigned')
    best = {}
    for (ch, sp), n in c.items():
        if ch not in best or n > c[(ch, best[ch])]:
            best[ch] = sp
    return best


def write_csv(name, header, rows):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in rows:
            w.writerow([round(x, 4) if isinstance(x, float) else x for x in row])
    return path


def lg(v):
    return math.log1p(v)


def gmean_ratio(diffs):
    return math.exp(st.mean(diffs)) if diffs else float('nan')
