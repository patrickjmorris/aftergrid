# Some stats readings are timestamped before the video was first stored

- Status: open
- Severity: minor
- Owner: unknown (Spot Sports ingestion and refetch pipeline)
- Found during: sizing the effect of YouTube's 2026-08-24 view-count change on long-form views

## Observed
`last_stats_check < ingested_at` on 1,881 rows (815 long-form, 1,046 Shorts, 20 unknown). `prev_view_count_at < ingested_at` on 5,960 rows (543 long-form, 5,414 Shorts, 3 unknown).
Evidence: `explore_field_checks.csv`, columns `last_check_before_ingest` and `prev_reading_before_ingest`.

```sql
select is_yt_short, sum(last_stats_check < ingested_at), sum(prev_view_count_at < ingested_at) from videos group by 1;
```

Intended behavior assumed: `ingested_at` is the first time Spot Sports stored the video, so no fetch can precede it.

## Suspected cause
Hypothesis: `ingested_at` is overwritten when a video is re-ingested, or the fields come from clocks in different zones.

## Effect on the analysis
Reading ages are measured from `published_at`, not `ingested_at`, so the ages stay valid if the reading times are right. The primary estimate is recomputed without these rows as a sensitivity check (`results/sensitivity.csv`, row `drop readings stamped before ingestion`).

## Next check
For a handful of affected video_keys, compare the fetch log times with `ingested_at`.
