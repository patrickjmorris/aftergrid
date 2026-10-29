# Sport tag "Unassigned" stops appearing for videos published from September 2026

- Status: open
- Severity: minor
- Owner: unknown (Spot Sports sport tagging)
- Found during: sizing the effect of YouTube's 2026-08-24 view-count change on long-form views

## Observed
43,752 videos carry sport "Unassigned". Monthly counts rise to 10,199 in August 2026 and are 0 in September and October 2026 (`explore_catalog_mix_by_month.csv`). 730 of 1,070 channels have exactly one real sport plus some "Unassigned" videos; 30 channels are only "Unassigned" (`explore_channel_sport_shape.csv`).

```sql
select substr(published_at,1,7), sum(sport='Unassigned') from videos group by 1;
```

Intended behavior assumed: a video's sport tag follows its channel, and the tagging rule did not change over time.

## Suspected cause
Hypothesis: the tagging process changed around late August 2026, or recent videos were backfilled with real tags and older ones were not.

## Effect on the analysis
A video-level sport split across the change date would compare different tagging rules. Workaround: each channel gets its modal non-"Unassigned" sport, used only for the by-sport check.

## Next check
Re-tag a sample of pre-September "Unassigned" videos with the current process and see whether they take the channel's sport.
