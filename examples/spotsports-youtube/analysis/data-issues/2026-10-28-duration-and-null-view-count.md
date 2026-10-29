# Impossible durations and missing view counts

- Status: open
- Severity: minor
- Owner: unknown (Spot Sports video metadata fetch)
- Found during: sizing the effect of YouTube's 2026-08-24 view-count change on long-form views

## Observed
- 133 long-form videos have `duration_seconds` above one day; the maximum is 12,540,852 seconds (about 145 days). 18 long-form durations are null; 1,922 are 0.
- `view_count` is null on 4,132 rows (4,092 Shorts, mostly published March to May 2026; 34 long-form).
Evidence: `explore_field_checks.csv`.

Intended behavior assumed: duration is the video length in seconds, and every stored video has a view count.

## Suspected cause
Hypothesis: live streams or premieres report elapsed time instead of length; null counts are videos whose stats call failed.

## Effect on the analysis
Rows with null view counts are dropped from any reading. Duration is used only for the by-duration check, where these rows fall in the end bands and do not move the result.

## Next check
Refetch duration for the 133 videos and see whether they are live streams.
