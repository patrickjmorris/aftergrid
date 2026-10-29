"""explore-data: grain, fields, coverage, reading inventory, catalog mix, CSV reconciliation."""
import csv
import math
from collections import Counter, defaultdict

from common import (CHANGE, CSV_SRC, EXTRACT_END, iso, load_rows, readings, write_csv)

FMT = {0: 'long-form', 1: 'short', None: 'unknown'}


def run(rows=None):
    rows = rows or load_rows()
    out = {}

    # 1. Grain and keys
    n = len(rows)
    nv = len({r['video_key'] for r in rows})
    nc = len({r['channel_key'] for r in rows})
    ov = [('rows', n), ('distinct video_key', nv), ('distinct channel_key', nc),
          ('published_at min', min(r['published_at'] for r in rows)),
          ('published_at max', max(r['published_at'] for r in rows)),
          ('last_stats_check max', max(r['last_stats_check'] for r in rows if r['last_stats_check'])),
          ('readings stamped after 2026-10-28 00:00 UTC',
           sum(1 for r in rows if (r['T2'] or 0) >= EXTRACT_END) + sum(1 for r in rows if (r['T1'] or 0) >= EXTRACT_END))]
    write_csv('explore_overview.csv', ['item', 'value'], ov)
    out['overview'] = dict(ov)

    # 2. Field checks by format
    fc = []
    for f in (0, 1, None):
        g = [r for r in rows if r['is_yt_short'] == f]
        fc.append([FMT[f], len(g), sum(r['view_count'] or 0 for r in g),
                   sum(r['view_count'] is None for r in g), sum(r['view_count'] == 0 for r in g),
                   sum(r['duration_seconds'] is None for r in g), sum((r['duration_seconds'] or 0) > 86400 for r in g),
                   max((r['duration_seconds'] or 0) for r in g),
                   sum(r['T2'] is None for r in g), sum(r['prev_view_count'] is not None for r in g),
                   sum(r['prev_view_count'] is not None and r['T1'] is None for r in g),
                   sum(r['T2'] is not None and r['T2'] < r['I'] for r in g),
                   sum(r['T1'] is not None and r['T1'] < r['I'] for r in g),
                   sum(r['I'] < r['P'] for r in g),
                   sum(r['prev_view_count'] is not None and r['view_count'] is not None and r['prev_view_count'] > r['view_count'] for r in g)])
    write_csv('explore_field_checks.csv',
              ['format', 'rows', 'sum_view_count', 'view_count_null', 'view_count_zero', 'duration_null',
               'duration_gt_1day', 'duration_max', 'never_refetched', 'has_prev', 'prev_value_without_timestamp',
               'last_check_before_ingest', 'prev_reading_before_ingest', 'ingested_before_published', 'count_decreased'], fc)
    out['field_checks'] = fc

    # prev value without timestamp, by publish month and format
    pm = Counter()
    for r in rows:
        if r['prev_view_count'] is not None and r['T1'] is None:
            pm[(r['published_at'][:7], FMT[r['is_yt_short']])] += 1
    write_csv('explore_prev_without_timestamp_by_month.csv', ['publish_month', 'format', 'rows'],
              sorted([k[0], k[1], v] for k, v in pm.items()))

    # 3. Reading inventory: format x kind x side of change x age band
    def band(a):
        for lo, hi, lab in [(0, 1, '0-1d'), (1, 3, '1-3d'), (3, 7, '3-7d'), (7, 12, '7-12d'), (12, 14, '12-14d'),
                            (14, 28, '14-28d'), (28, 30, '28-30d'), (30, 60, '30-60d'), (60, 180, '60-180d')]:
            if lo <= a < hi:
                return lab
        return '180d+' if a >= 180 else 'negative'
    inv = Counter()
    rd = readings(rows, include_ingest_only=True)
    for x in rd:
        side = 'before 2026-08-24' if x['T'] < CHANGE else ('2026-08-24' if x['T'] < CHANGE + 1 else 'after 2026-08-24')
        clean = 'accrual all before' if x['T'] < CHANGE else ('accrual all after' if x['P'] >= CHANGE else 'straddles')
        inv[(FMT[x['fmt']], x['kind'], side, clean, band(x['age']))] += 1
    write_csv('explore_reading_inventory.csv', ['format', 'reading', 'reading_side', 'accrual', 'age_band', 'readings'],
              sorted([*k, v] for k, v in inv.items()))
    out['inventory'] = inv
    # Readings vs distinct videos at each format's standard age: a video can have two readings in the window.
    std = defaultdict(lambda: [0, set()])
    for x in rd:
        lo, hi = (28, 30) if x['fmt'] == 0 else (12, 14)
        if lo <= x['age'] < hi:
            k = (FMT[x['fmt']], 'accrual all before' if x['T'] < CHANGE else ('accrual all after' if x['P'] >= CHANGE else 'straddles'))
            std[k][0] += 1
            std[k][1].add(x['video'])
    write_csv('explore_standard_age_videos.csv', ['format', 'accrual', 'readings', 'distinct_videos'],
              sorted([*k, v[0], len(v[1])] for k, v in std.items()))

    # Age at reading histogram (days) for the two standard refetch ages
    hist = Counter()
    for x in rd:
        if 0 <= x['age'] < 46:
            hist[(FMT[x['fmt']], x['kind'], int(x['age']), x['T'] < CHANGE)] += 1
    write_csv('explore_age_histogram.csv', ['format', 'reading', 'age_day', 'read_before_change', 'readings'],
              sorted([k[0], k[1], k[2], int(k[3]), v] for k, v in hist.items()))

    # 4. Coverage by publish week: share of videos with a reading at the standard age
    vids = defaultdict(set)
    cov = defaultdict(set)
    covpre = defaultdict(set)
    for r in rows:
        if r['is_yt_short'] is not None and r['P'] >= CHANGE - 7 * 22:
            vids[(r['is_yt_short'], math.floor((r['P'] - CHANGE) / 7))].add(r['video_key'])
    for x in rd:
        lo, hi = (28, 30) if x['fmt'] == 0 else (12, 14)
        if lo <= x['age'] < hi:
            k = (x['fmt'], math.floor((x['P'] - CHANGE) / 7))
            cov[k].add(x['video'])
            if x['T'] < CHANGE:
                covpre[k].add(x['video'])
    cw = []
    for k in sorted(vids):
        f, w = k
        cw.append([FMT[f], w, iso(CHANGE + 7 * w), len(vids[k]), len(cov[k] & vids[k]),
                   len(cov[k] & vids[k]) / len(vids[k]), len(covpre[k] & vids[k])])
    write_csv('explore_coverage_by_publish_week.csv',
              ['format', 'publish_week_rel_change', 'week_start', 'videos', 'with_standard_age_reading',
               'share', 'standard_age_reading_before_change'], cw)
    out['coverage'] = cw

    # 5. Catalog mix by publish month
    mm = defaultdict(list)
    for r in rows:
        mm[r['published_at'][:7]].append(r)
    mix = []
    for m in sorted(mm):
        g = mm[m]
        lf = [r for r in g if r['is_yt_short'] == 0]
        mix.append([m, len(g), len({r['channel_key'] for r in g}), sum(r['is_yt_short'] is None for r in g),
                    sum(r['is_yt_short'] == 1 for r in g) / len(g), len(lf),
                    sum((r['duration_seconds'] or 0) <= 180 for r in lf) / max(1, len(lf)),
                    sum(r['sport'] == 'Unassigned' for r in g)])
    write_csv('explore_catalog_mix_by_month.csv',
              ['publish_month', 'videos', 'channels', 'format_null', 'short_share', 'long_form_videos',
               'long_form_share_le_180s', 'sport_unassigned'], mix)
    out['mix'] = mix

    # Channel sport structure: channels carry one real sport plus 'Unassigned' on some videos
    cs = defaultdict(set)
    for r in rows:
        cs[r['channel_key']].add(r['sport'])
    shape = Counter((len(s - {'Unassigned'}), 'Unassigned' in s) for s in cs.values())
    write_csv('explore_channel_sport_shape.csv', ['real_sports_on_channel', 'has_unassigned_videos', 'channels'],
              sorted([k[0], int(k[1]), v] for k, v in shape.items()))

    # 6. CSV reconciliation (same rows claimed)
    n_csv = 0
    sum_csv = 0
    fmt_csv = Counter()
    keys = set()
    with open(CSV_SRC, newline='') as f:
        for rec in csv.DictReader(f):
            n_csv += 1
            keys.add(rec['video_key'])
            sum_csv += int(rec['view_count']) if rec['view_count'] else 0
            fmt_csv[rec['is_yt_short']] += 1
    sq_keys = {r['video_key'] for r in rows}
    rec = [('rows', n, n_csv), ('sum view_count', sum(r['view_count'] or 0 for r in rows), sum_csv),
           ('long-form rows (0 / f)', sum(r['is_yt_short'] == 0 for r in rows), fmt_csv['f']),
           ('short rows (1 / t)', sum(r['is_yt_short'] == 1 for r in rows), fmt_csv['t']),
           ('format null rows', sum(r['is_yt_short'] is None for r in rows), fmt_csv['']),
           ('video_key symmetric difference', len(sq_keys ^ keys), len(sq_keys ^ keys))]
    write_csv('explore_csv_reconciliation.csv', ['check', 'sqlite', 'csv'], rec)
    out['reconcile'] = rec
    return out


if __name__ == '__main__':
    o = run()
    for k in ('overview', 'reconcile'):
        print(k, o[k])
