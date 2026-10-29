"""Builds videos.sqlite from videos.csv (written by extract.sql). Standard library only."""
import csv
import os
import sqlite3

here = os.path.dirname(os.path.abspath(__file__))
con = sqlite3.connect(os.path.join(here, 'videos.sqlite'))
con.execute('drop table if exists videos')
con.execute('create table videos(video_key text, channel_key text, sport text, is_yt_short integer, duration_seconds integer, published_at text, ingested_at text, last_stats_check text, view_count integer, prev_view_count integer, prev_view_count_at text)')
nz = lambda x: None if x == '' else x
with open(os.path.join(here, 'videos.csv'), newline='') as f:
    r = csv.reader(f)
    next(r)
    con.executemany('insert into videos values (?,?,?,?,?,?,?,?,?,?,?)', ([nz(c[0]), nz(c[1]), c[2], None if c[3] == '' else int(c[3] == 't'), nz(c[4]), nz(c[5]), nz(c[6]), nz(c[7]), nz(c[8]), nz(c[9]), nz(c[10])] for c in r))
con.commit()
print(con.execute('select count(*) from videos').fetchone()[0], 'rows')
