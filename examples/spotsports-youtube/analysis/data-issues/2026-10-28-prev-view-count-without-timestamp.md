# prev_view_count is stored without prev_view_count_at for 35,189 videos

- Status: open
- Severity: minor (headline unaffected; it weakens the Shorts control)
- Owner: unknown (Spot Sports stats refetch pipeline)
- Found during: sizing the effect of YouTube's 2026-08-24 view-count change on long-form views

## Observed
35,189 rows have a non-null `prev_view_count` and a null `prev_view_count_at`. 33,080 are Shorts; 32,987 of those Shorts were published June to August 2026. Long-form: 2,108 rows, spread over 2025-07 to 2026-08.
Evidence: `scripts/explore.py`, results `explore_field_checks.csv` (column `prev_value_without_timestamp`) and `explore_prev_without_timestamp_by_month.csv`.

```sql
select substr(published_at,1,7), is_yt_short, count(*) from videos
where prev_view_count is not null and prev_view_count_at is null group by 1,2;
```

Intended behavior assumed: the two fields are written together, as they are for 326,402 other rows.

## Suspected cause
Hypothesis: a refetch path for Shorts in June to August 2026 wrote the value but not its timestamp.

## Effect on the analysis
A reading without a time cannot be aged, so these readings are dropped. Result: Shorts published mid-June to August 2026 have almost no reading at the standard 12-14 day age. The Shorts control compares April to early June publishes with September to October publishes, not the same calendar window as long-form.

## Next check
`select count(*) from videos where is_yt_short=1 and published_at between '2026-06-10' and '2026-08-31' and prev_view_count is not null and prev_view_count_at is null;` should drop to zero after a fix.
