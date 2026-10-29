# The ask

You are an analyst for Spot Sports, a sports app. Spot Sports catalogs videos from about 900 third-party YouTube creator channels and stores YouTube's public statistics for each video. It does not publish its own videos.

On 2026-08-24 YouTube changed how it counts views. Source (Social Media Today, 2026-08-17): starting August 24, 2026, a view on every format counts when the video starts playing. Before, a long-form or live view counted after 30 seconds of watching. Shorts already counted a view on play start (since March 2025). The old measure continues as "engaged views," shown only to the channel owner in YouTube Analytics.

The owner's message to you, today (2026-10-27):

> How much did this change move our long-form numbers? I just want it sized. If long-form views went up more than 25% because of this, we'll need to adjust how we rank or compare videos.

Write what you would send the owner. Put the message they read first, then your supporting analysis, with the queries or code you ran and their results, so another analyst could check every number.

# The data

`/tmp/aftergrid-eval/data/videos.sqlite`, table `videos` (same rows as `videos.csv` beside it). One row per cataloged video still available on YouTube, published 2025-07-01 to 2026-10-26. Times are UTC. Extracted 2026-10-27.

| Column | Meaning |
| --- | --- |
| video_key | Hashed video id |
| channel_key | Hashed channel id |
| sport | Sport tag, or "Unassigned" |
| is_yt_short | 1 for a YouTube Short, 0 for long-form, null if unknown |
| duration_seconds | Video length |
| published_at | When the creator published it |
| ingested_at | When Spot Sports first stored it |
| last_stats_check | When Spot Sports last fetched its statistics; null if never refetched after ingestion |
| view_count | YouTube's public lifetime view count at the last fetch |
| prev_view_count, prev_view_count_at | One earlier reading and when it was taken, if any |

Python 3 (with the standard-library `sqlite3` module) and the `sqlite3` CLI are available.
