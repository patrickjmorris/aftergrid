# 02 explore-data: data map

Revised 2026-10-28 after analysis review (`06-analysis-review.md`). Changed sections are marked **Revised after review**.

Skill: `skills/explore-data/SKILL.md` and its `references/data-issues.md`.
Code: `scripts/explore.py` (run through `scripts/run_all.py`). Tables: `results/explore_*.csv`. Defect notes: `data-issues/`.

## Source

One table, `videos`, in `../data/videos.sqlite`. No joins are needed, so no join risk.

## Grain and keys (observed)

- One row per video. 535,168 rows, 535,168 distinct `video_key`. The key is unique.
- 1,070 distinct `channel_key`. The brief says "about 900." Active channels per publish month run 884 to 916 in 2026 (`explore_catalog_mix_by_month.csv`), so 1,070 is the cumulative set with churn.
- The row is a snapshot, not an event log. `view_count` is a lifetime count overwritten at each fetch. Only one earlier value survives (`prev_view_count`).
- Format: 278,809 long-form, 255,842 Shorts, 517 unknown.

## Reconciliation with the CSV (observed)

The CSV is a copy, not an independent source. It matches on rows (535,168), total views (35,711,958,856), format counts (CSV uses `t`/`f`), and video keys (no difference). `explore_csv_reconciliation.csv`. No independent total exists, so the totals cannot be checked against YouTube.

## Reading inventory (observed)

The measure is overwritten, so I counted readings before designing any comparison. Each video has up to three usable readings: zero views at `published_at`, the earlier reading (`prev_view_count` at `prev_view_count_at`), and the last reading (`view_count` at `last_stats_check`, or at `ingested_at` when never refetched).

Spot Sports refetches each format at a standard age (`explore_age_histogram.csv`):

- Long-form: a reading near age 28 to 30 days. Readings at age 29 alone: 35,905 earlier readings and 25,454 last readings.
- Shorts: a reading near age 12 to 14 days.

Readings that fall cleanly before or after 2026-08-24 at the standard age, and the distinct videos behind them (`explore_reading_inventory.csv`, `explore_standard_age_videos.csv`). **Revised after review (gemini finding 5).** The first draft gave readings only. A video can have two readings in the window, so readings overstate the number of videos:

| Format | Standard age | Accrual all before (read before 2026-08-24) | Accrual all after (published on or after 2026-08-24) | Straddles |
| --- | --- | --- | --- | --- |
| Long-form | 28-30 days | 13,618 readings, 13,618 videos (all `prev`) | 56,247 readings (30,002 `prev`, 26,245 `last`), 30,535 videos | 13,933 readings and videos |
| Shorts | 12-14 days | 45,224 readings (39,438 `last`, 5,739 `prev`, 47 ingest-only), 39,876 videos | 60,913 readings, 31,042 videos | 2 |

The metric keeps one reading per video (`pick_reading`), so the double count never reached an estimate. The 47 ingest-only Shorts readings are not used by the metric.

Coverage by publish week (`explore_coverage_by_publish_week.csv`):

- Long-form before the change: a standard-age reading taken before the switch exists for 0% to 67% of videos per publish week, mid-May to late July 2026. The weeks starting 05-25, 06-01, and 06-08 have almost none. Videos published from 2026-07-27 to 2026-08-23 are read at age 29 after the change, so they straddle.
- Long-form after the change: 98% to 99.5% of videos published 2026-08-24 to 2026-09-27.
- Shorts: covered for publish weeks April to early June 2026 and September to October 2026. Mid-June to August Shorts have almost no standard-age reading. That gap comes from a defect (below).

Is the partial pre-change coverage selective? Within channel, pre-change videos with an age-29 reading and those without one end with the same later lifetime count (geometric ratio 1.017, 745 channels with both). The refetch did not pick videos by popularity. (`scripts/diagnose.py`, `results/selection_check.csv`.)

Long-form has no readings at young ages before May 2026. A year-ago test at age 29 is not possible. A year-ago test on lifetime counts is possible: 2025 videos were read in June 2026 (before the change) and in September to October 2026. **Revised after review (sol finding 4).** Those lifetime readings are not age-matched. Videos published in July 2025 were about 329 days old when read, and those published in September 2025 about 267. So the year-ago test is weak evidence on seasonality.

## Fields, units, ranges (observed)

`explore_field_checks.csv`:

- `view_count`: integer views. Null on 4,132 rows (4,092 Shorts). Zero on 21,538.
- `duration_seconds`: seconds. Long-form median about 12 minutes. 133 long-form above one day, max 12,540,852.
- `is_yt_short`: null on 517 rows, all published September and October 2026 (`explore_catalog_mix_by_month.csv`).
- Timestamps are UTC text with `+00`. 19,035 readings carry times after 2026-10-28 00:00 UTC, although the brief dates the extract 2026-10-27. Likely the extract date is local time. No analysis effect.
- 16,372 long-form rows have `ingested_at` before `published_at`, most by under an hour. Likely scheduled uploads or premieres. Ages are measured from `published_at`.
- 682 rows have a later count below the earlier count. YouTube removes invalid views, so this is expected at small scale.

## Catalog mix over time (observed)

`explore_catalog_mix_by_month.csv`:

- Shorts share of new videos: 34% to 53% by month, about 50% in mid-2026.
- Long-form share at or under 180 seconds: 11% to 18% by month. No break at August 2026.
- Sport "Unassigned" stops after August 2026 (defect note).
- Publishing volume is seasonal by sport. Football and hockey publish about 3.5 times as many videos from 2026-08-24 as in the two months before.

## Data issues (classified per the reference)

| Observation | Class | Size | Severity | Note |
| --- | --- | --- | --- | --- |
| `prev_view_count` without `prev_view_count_at` | Suspected defect | 35,189 rows; 32,987 are June to August 2026 Shorts | Minor for the headline; weakens the Shorts control | `data-issues/2026-10-28-prev-view-count-without-timestamp.md` |
| Reading stamped before `ingested_at` | Suspected defect | 1,881 last, 5,960 earlier | Minor; sensitivity run without them | `data-issues/2026-10-28-readings-before-ingestion.md` |
| "Unassigned" sport stops in September 2026 | Suspected defect | 43,752 videos | Minor; channel modal sport used | `data-issues/2026-10-28-sport-unassigned-stops.md` |
| Durations above one day; null view counts | Suspected defect | 133 durations; 4,132 null counts | Minor | `data-issues/2026-10-28-duration-and-null-view-count.md` |
| Only two stored readings per video | Limit | All rows | Shapes the design | Caveat |
| Format null for 517 recent videos | Limit | 517 rows | Minor; excluded | Caveat |
| Only videos still on YouTube | Limit | Unknown count deleted | Minor; would bias toward a smaller lift if low-view videos are deleted more | Caveat |
| No engaged views | Limit | All | No direct old-rule count after the change | Caveat |

The reference says to offer each owner a draft issue through the question tool. The owner is not available, so no issue was offered or filed. The drafts are the notes.

## Exploratory probe tied to the question (not a finding)

Within channel, long-form views at age 28-30 days were about 2.05 times as high for videos published after 2026-08-24 as for videos read before it (754 channels, equal channel weights, geometric). Shorts at age 12-14 days, same comparison: 0.99 (554 channels). Code: `scripts/exploratory/probe1.py`, stdout only; the exploratory probes are kept as a record and are not inputs to `results/`. This is a first look. It does not yet rule out seasonality, mix, or rollout timing. Those tests belong to diagnose-change.

## Observations vs inferences

- Observed: key uniqueness, counts, standard refetch ages, coverage, defects above.
- Inferred: that Spot Sports refetches long-form at about 29 days and Shorts at about 13 days by design. That `ingested_before_published` reflects scheduled uploads. That the extract date is local time.

## Answerable now

1. Long-form views at a fixed age (28-30 days) for videos whose views accrued entirely before vs entirely after the change, within channel.
2. The same for Shorts at 12-14 days, as a control, in non-matching calendar windows.
3. Growth after age 29 for videos whose first 29 days were before the change: how much the change adds to older videos' lifetime counts.
4. A 2025 same-date test on lifetime counts, at unequal ages only.

Needs more data: a matched-window Shorts control (fix the timestamp defect); the old-rule count after the change (engaged views, owner-only).

## Checks a later analysis should keep

- Compare within channel. Channel count and mix shift over time.
- Fix the reading age. Long-form views pile up in the first days.
- Use the timestamp of the reading, not of the row, to decide before vs after.
- Drop straddling readings from the clean comparison and use them only to test timing.
