"""Entry point. Regenerates every table in results/ from the source data.

Usage: python3 -I scripts/run_all.py   (from examples/spotsports-youtube/analysis; about two minutes)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sqlite3  # noqa: E402

import diagnose  # noqa: E402
import explore  # noqa: E402
import external  # noqa: E402
import review  # noqa: E402
import sports  # noqa: E402
import titles  # noqa: E402
from common import DB, load_rows, readings, write_csv  # noqa: E402


def fmt(r):
    return (f"ratio of totals {r['ratio_of_totals']:.3f} [{r['rt_lo']:.3f}, {r['rt_hi']:.3f}]; "
            f"typical video {r['typical_video']:.3f} [{r['tv_lo']:.3f}, {r['tv_hi']:.3f}]; "
            f"{r['channels']} channels, {r['pre_videos']} pre, {r['post_videos']} post")


def show(tag, s):
    print(tag, '|', s[0], '|', ' '.join(str(round(v, 3)) if isinstance(v, float) else str(v) for v in s[1:]))


def main():
    rows = load_rows()
    explore.run(rows)
    rd = readings(rows)
    res = diagnose.run(rows, rd)
    review.run(rows, rd, res)
    external.run(rows, rd, res)  # comparison with published estimates; writes tables, prints nothing
    sports.run(rows, rd)  # sports and channel cuts for the deck appendix; writes tables, prints nothing
    titles.run(rows, rd)  # format and named-channel cuts; needs data/titles.csv, skipped without it
    print('long-form primary:', fmt(res['lf']))
    print('shorts control   :', fmt(res['sh']))
    for s in res['sens']:
        show('sensitivity', s)
    for s in res['nulls']:
        show('null       ', s)
    for s in res['stock']:
        if s[2] == 'point':
            print('stock       |', s[0], '| accrual', s[1], '| post-switch share', round(s[7], 3), '| lift on stored total', round(s[9], 3))
    for s in res['transition']:
        show('transition ', s)
    for s in res['within_week']:
        show('within week', s)
    for s in res['trial_check']:
        show('trial check', s)
    for s in res['dispersion']:
        show('dispersion ', s)
    for s in res['checks']:
        show('check      ', s)
    # independent SQL cross-check of the primary estimate and the Shorts control
    sql = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crosscheck.sql')).read()
    con = sqlite3.connect(DB)
    cc = []
    for label, f, lo, hi, py in (('long-form 28-30d', 0, 28.0, 30.0, res['lf']), ('shorts 12-14d', 1, 12.0, 14.0, res['sh'])):
        ch, npre, npost, rt, rt_v1 = con.execute(sql, {'fmt': f, 'lo': lo, 'hi': hi}).fetchone()
        cc.append([label, ch, py['channels'], npre, py['pre_videos'], npost, py['post_videos'], rt, py['ratio_of_totals'], rt_v1])
        print('sql check   |', label, '| sql', round(rt, 4), ch, npre, npost, '| python', round(py['ratio_of_totals'], 4),
              py['channels'], py['pre_videos'], py['post_videos'], '| sql version-1 weights', round(rt_v1, 4))
    write_csv('sql_crosscheck.csv', ['estimate', 'sql_channels', 'py_channels', 'sql_pre_videos', 'py_pre_videos',
                                     'sql_post_videos', 'py_post_videos', 'sql_ratio_of_totals', 'py_ratio_of_totals',
                                     'sql_ratio_version1_weights'], cc)
    print('tables written to', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'results')))


if __name__ == '__main__':
    main()
