# 04 diagnose-change: is the long-form step the counting rule, and how big is it?

Skill: `skills/diagnose-change/SKILL.md`. Code: `scripts/diagnose.py` and `scripts/review.py` via `scripts/run_all.py`. Tables in `results/`. Console output of the run: `results/run_all_stdout.txt`.

Revised 2026-10-28 after analysis review (`06-analysis-review.md`). Every number below comes from the rerun under definition version 2 (balanced channel weights). Changed sections are marked **Revised after review**. A second, round-2 review changed sections 5, 9 and 10 and the diagnosis; those changes are marked **Revised after round-2 review**. No headline number moved.

Extended 2026-10-28 with a comparison against published estimates of the same change (section 11, `scripts/external.py`). It adds three tables. Every earlier table reran byte-identical.

Revised 2026-10-28 after a red-team round by three AI models (`06-analysis-review.md`, round 3). Wording only. No number or table changed. Sections 1, 3, 4, 11 and the diagnosis now separate the observed cohort contrast from its attribution, and section 11 treats the published estimates as corroboration of a different quantity. Marked **Revised after red-team review**.

## Restated metric

Long-form views at age 28-30 days, within channel, for videos whose views accrued entirely after the switch (published on or after 2026-08-31) vs entirely before (read before 2026-08-24 00:00 UTC). Two per-video measures, always together: pooled views (ratio of totals) and typical video (geometric). Channel weight n_pre·n_post/(n_pre+n_post). Source: `videos` table. Times UTC. Definition: `03-define-metric.md`.

## 1. Reproduce

The owner reported no number to reconcile. I reproduced the step three ways (`reproduce_pooled.csv`, `primary_lift.csv`):

| Long-form, age 28-30 days | Pre | Post | Post / pre |
| --- | --- | --- | --- |
| Pooled mean views, all channels | 51,902 (13,618 videos, 799 channels) | 70,900 (24,979 videos, 875 channels) | 1.37 |
| Pooled median | 7,569 | 12,986 | 1.72 |
| Pooled geometric mean | 5,891 | 12,195 | 2.07 |
| Within channel, pooled views (primary) | | | **1.74** (95% interval 1.60 to 1.94), 746 channels |
| Within channel, typical video | | | **2.13** (1.96 to 2.31) |

Shorts at age 12-14 days, same estimator: pooled 0.85 (0.62 to 1.08), typical video 0.91 (0.84 to 0.99), 554 channels.

**Added after red-team review.** The first row shows why the matching matters. A plain average over all channels gives +37% (70,900 vs 51,902). Matching each channel to itself gives +74%. Section 2 shows where the gap comes from: mostly one high-view channel that nearly stopped posting.

**Revised after review (gemini finding 2).** Version 1 weighted channels by their pre-group count and gave 1.77 and 2.43. Two channels with many pre and few post videos moved those numbers. The balanced weight removes that leverage. A Poisson fit with channel fixed effects gives 1.74 (1.60 to 1.91). Dropping the one channel with the largest version-1 numerator share gives 1.74. The SQL cross-check reproduces both weightings to four decimals (`sql_crosscheck.csv`).

**What the interval means. Revised after review (sol finding 3).** The interval comes from resampling channels. It covers which channels were sampled. It does not cover a change in underlying viewing between the May to July cohort and the September cohort, because both sides are measured at different calendar times. The size is the rule's effect only if underlying long-form viewing per video held level. For the rule's effect to fall to 25%, viewing alone would have to rise 39% on the pooled measure (1.74 / 1.25) or 70% on the typical measure (2.13 / 1.25) (`review_checks.csv`). **Revised after red-team review.** Write the contrast as C = M × D, with M the public-to-engaged multiplier on the post videos and D the change in engaged viewing. These data observe C = 1.7435 and neither part. A large counting effect and real growth can coexist: D = 1.15 gives M = 1.52. The 39% is the rise that would change the call. It is not the rise needed to rule out any change in viewing. The catalog is not a probability sample of YouTube, and resampling channels does not make a common calendar or sports shock harmless.

Measurement checks before trusting the step:

- Every pre reading is timestamped before the switch (asserted in code). Every post video was published after the buffer. Sides are set by reading time, not only by publish date.
- Same age on both sides (mean 28.8 and 29.1 days). Same channels on both sides.
- Pre readings are all `prev` readings; post readings mix `prev` and `last`. Post restricted to `prev` readings: 1.76 (1.59 to 1.95). The reading type does not drive it.
- Partial pre coverage is not selective: covered and uncovered pre-period videos in the same channel end with the same later counts (ratio 1.017, `selection_check.csv`).
- Defect rows: dropping readings stamped before ingestion leaves 1.74 unchanged. Dropping null or above-one-day durations: 1.74.

## 2. Arithmetic: within-channel vs mix

Segments are channels. Common support: 746 channels. Entry (post-only channels): 1,017 videos. Exit (pre-only): 364 videos. Reported separately, not filled with zeros. `decomposition_channel_mix.csv`:

| Term | Mean views per video |
| --- | --- |
| Common-support mean, pre | 51,248 |
| Common-support mean, post | 72,315 |
| Total change | +21,068 |
| Within-channel term, Σ w_pre × (r_post - r_pre) | +39,518 |
| Mix term, Σ (w_post - w_pre) × r_post (includes interaction) | -18,450 |
| Mix term from one channel (233 pre, 10 post videos) | -17,105 |
| Mix term from the other 745 channels | -1,345 |

The within-channel change is larger than the whole pooled change. This ordering puts the interaction in the mix term. **Revised after review (gemini finding 2).** Version 1 read the negative mix as "more videos come from channels with lower views per video". In fact one high-view channel, whose share of videos fell from 1.8% to 0.04%, makes up 93% of it. Without it the mix term is near zero. The decomposition says where the arithmetic comes from. It does not say why.

## 3. Same estimator where nothing changed

`null_comparisons.csv`, pooled and typical (95% interval):

| Comparison | In null spread | Pooled | Typical video |
| --- | --- | --- | --- |
| Long-form, published before vs after 2026-07-01, all read before the switch | yes | 0.96 (0.80 to 1.20) | 1.06 (0.97 to 1.15) |
| Long-form, published 2026-08-31 to 09-13 vs 09-14 on, all after the switch | yes | 0.89 (0.81 to 0.98) | 0.95 (0.88 to 1.01) |
| Shorts, published before vs after 2026-05-01, all read before the switch | yes | 0.97 (0.80 to 1.19) | 1.03 (0.96 to 1.10) |
| Shorts across the 2026 switch (calendar windows differ from long-form) | yes | 0.85 (0.62 to 1.08) | 0.91 (0.84 to 0.99) |
| Shorts across the switch, without the one channel holding 17% of pre views | check | 0.99 (0.88 to 1.11) | 0.91 (0.83 to 0.99) |
| Long-form 2025 placebo, unequal ages: lifetime counts read June 2026 | no | 0.88 (0.72 to 1.10) | 0.70 (0.37 to 0.97) |
| Shorts 2025 placebo, unequal ages, 48 channels | no | 2.42 (0.61 to 7.66), uninformative | 1.04 |

Null spread: pooled 0.85 to 0.97, typical 0.91 to 1.06. The long-form step is 1.74 pooled and 2.13 typical, far outside both. **Revised after red-team review.** These are four point estimates with different windows and channel sets. They are separate diagnostics, not a calibrated null distribution: their pooled intervals reach 0.62 to 1.20. The long-form September null, 0.89 (0.81 to 0.98), excludes 1. The long-form nulls are summer against summer or September against September; none crosses the late-August season start. The Shorts control does cross it, with different calendar windows and ages, and Shorts demand may move differently. No parallel trend is established.

**Revised after review (sol finding 4).** The 2025 placebo compares lifetime counts at about 329 days (July 2025 publishes) with counts at about 267 days (September 2025 publishes). It is not the headline's day-29 measurement. It is reported but kept out of the null spread and no longer used to reject seasonality. No 2025 long-form readings exist at young ages, so it cannot be rerun at matched ages.

**Revised after review (gemini finding 2).** Under version-1 weights the first long-form null read 1.27 on the typical measure. That came from one channel's batch of zero-view June uploads. Under balanced weights it reads 1.06.

## 4. Hypothesis ledger

| # | Explanation | Prediction | Observed | Status |
| --- | --- | --- | --- | --- |
| H1 | The counting rule raised long-form counts | Step for videos whose views accrue after the switch; partial step for videos published just before; none in Shorts; positive across sports and lengths | Step between the 08-26 and 08-27 publish days; partial for 07-27 to 08-26 publishes; Shorts flat or down; every segment point estimate above 1 | **Leading explanation for a large part of the contrast. How much is not established.** The contrast, pooled 1.74 (1.60 to 1.94) and typical 2.13 (1.96 to 2.31), equals the rule's effect only under stable underlying viewing |
| H2 | Sports seasonality (fall seasons start) | Gradual rise; concentrated in sports starting seasons; also in Shorts | The step happens between consecutive publish days: pooled 1.43 on 08-26 and 1.83 on 08-27, typical 1.42 and 2.11. Sports with no fall start rise too: basketball 1.90, baseball 1.56. Shorts: 0.85. | **Not supported as the main cause. A seasonal part cannot be excluded.** **Revised after red-team review:** the pre group's summer includes the World Cup (06-11 to 07-19), and the post group meets football and European soccer kickoffs; no long-form null crosses that boundary. Football 2.12 and soccer 2.14 sit above golf 1.34 and tennis 1.44, though the spread is within null noise (section 7). Publishes from 09-14 run 11% below 08-31 to 09-13. **Revised after review:** the 2025 placebo no longer counts here |
| H3 | Channel mix | Pooled step, no within-channel step | Within-channel term exceeds the pooled change; the mix term is mostly one channel | **Rejected** |
| H4 | Content mix within channel (length, live) | Lift tied to one duration band; duration shift | Median duration 756 s pre, 727 s post (`review_checks.csv`). Every band rises: pooled 1.58 to 2.15, typical 1.94 to 2.42 | **Rejected** |
| H5 | Measurement artifact (reading type, refetch selection, timestamp defects, weighting) | Lift disappears under matched reading type, after dropping defect rows, or under other weights | 1.76 with `prev` only; selection ratio 1.017; defect drops 1.74; PPML 1.74; version-1 weights 1.77; equal weights 1.46 | **Rejected** |
| H6 | Shorts also changed, so the control is broken | Shorts step at the switch | Shorts 0.85 pooled. Without one channel that held 17.4% of pre Shorts views: 0.99. Typical 0.91 either way | **Rejected.** The typical-video Shorts dip of 9% is unexplained |
| H7 | Effective switch date differs from 2026-08-24 | Partial lift for publishes after 08-24 | **Revised after review (opus finding 2).** 08-24 to 08-26 publishes: 1.19 (1.03 to 1.39). 08-27 to 08-30: 1.99 (1.69 to 2.34) (`transition_lift.csv`) | **Supported for this catalog.** The full step starts with 08-27 publishes. The size is not affected because the post group starts 08-31. Cause unknown |
| H8 | Counts were restated retroactively | Older videos' counts jump after the switch | Videos read at age 29 before the switch grew 6.5% by about age 68 | **Rejected.** Consistent with public reports that existing counts were not restated |
| H9 | **Added after review (opus finding 1).** The lift differs by video size | Post/pre ratio varies across percentiles | 2.71 at the 10th percentile, 2.02 at the median, 1.71 to 1.83 at the 95th and 99th (`quantile_ratios.csv`) | **Observed.** Cause untested: this compares different videos, so a change in the distribution's shape would look the same |

## 5. Timing (event study)

**Revised after review (gemini finding 4).** Version 1 showed a video-weighted geometric ratio under the plain label "Ratio". `event_study.csv` now gives both headline measures with the headline's channel weights, against each channel's pre-group level, with 500-resample intervals for weeks. Pre-period cells are part of the pre-group level they are compared with.

| Publish week starting | Videos | Pooled (95%) | Typical (95%) |
| --- | --- | --- | --- |
| 2026-06-15 to 2026-07-20 (six weeks; all read before the switch except 753 videos in the last week) | 917 to 3,319 per week | 0.94 to 1.13 | 0.94 to 1.15 |
| 2026-07-27 (read after the switch) | 3,224 | 1.01 (0.78 to 1.41) | 1.04 (0.95 to 1.13) |
| 2026-08-03 | 4,551 | 1.01 (0.85 to 1.21) | 1.11 (1.02 to 1.22) |
| 2026-08-10 | 890 | 1.36 (1.04 to 1.83) | 1.28 (1.09 to 1.47) |
| 2026-08-17 | 4,335 | 1.07 (0.88 to 1.31) | 1.18 (1.07 to 1.30) |
| 2026-08-24 | 5,381 | 1.66 (1.46 to 1.96) | 1.86 (1.66 to 2.13) |
| 2026-08-31 to 2026-09-28 (five weeks) | 1,665 to 6,089 per week | 1.64 to 2.06 | 2.02 to 2.26 |

**Added after review (opus finding 2).** Publish windows around the switch, against the same pre group (`transition_lift.csv`):

| Published | Pooled (95%) | Typical (95%) | Videos |
| --- | --- | --- | --- |
| 07-27 to 08-09 | 1.01 (0.83 to 1.24) | 1.07 (1.00 to 1.15) | 7,775 |
| 08-10 to 08-19 | 1.19 (0.94 to 1.56) | 1.11 (1.01 to 1.23) | 2,663 |
| 08-20 to 08-23 | 1.05 (0.85 to 1.30) | 1.29 (1.15 to 1.49) | 2,562 |
| 08-24 to 08-26 | 1.19 (1.03 to 1.39) | 1.29 (1.19 to 1.40) | 2,181 |
| 08-27 to 08-30 | 1.99 (1.69 to 2.34) | 2.37 (2.07 to 2.79) | 3,200 |
| 08-31 on (primary post group) | 1.74 (1.59 to 1.94) | 2.13 (1.97 to 2.31) | 23,962 |

Shorts by publish week: typical 0.92 to 1.08 from mid-March to early June, 0.84 to 0.97 in September and October. No step.

Long-form views pile up early. A video published a few days before the effective switch earns most of its 29-day count under the old rule. That matches the partial lift through 08-26. Videos published 08-24 to 08-26 should be fully lifted if every play counted under the new rule from 08-24. They are not. So in this catalog the rule's effect on counts starts about 08-27, either through a staged rollout or something else. I did not test which. It does not change the size. It matters for any rule keyed to a date.

**Revised after round-2 review (finding 1).** It also matters for any rule keyed to a publish week, because the 08-24 week straddles the step. Its 08-27 to 08-30 publishes against its 08-24 to 08-26 publishes, same channels, day-29 readings (`within_week_contrast.csv`):

| Comparison | Pooled (95%) | Typical (95%) | Channels | Videos, early / late |
| --- | --- | --- | --- | --- |
| 08-27..08-30 vs 08-24..08-26 | 1.50 (1.19 to 1.87) | 1.67 (1.52 to 1.82) | 453 | 2,111 / 3,050 |
| Thursday-Sunday vs Monday-Wednesday, 6 weeks under the old rule (06-15 to 07-20) | 0.74 to 1.41 | 0.90 to 1.99 | 34 to 337 | |
| Same split, 4 weeks under the new rule (08-31 to 09-21) | 0.96 to 1.22 | 0.98 to 1.08 | 432 to 463 | |
| Same split, 4 transition-band weeks (07-27 to 08-17) | 0.90 to 1.48 | 1.01 to 1.25 | 107 to 402 | |

The reviewer's 1.4993 and 1.6709 on 453 channels reproduce exactly. The split is noisy in weeks under one rule. The 06-22 week's 1.99 comes mostly from one channel's batch of zero-view uploads; without it, 1.51 (`scripts/exploratory/round2_probe2.py`). So the split alone does not single out the 08-24 week. What does is the step against the common pre group: 1.19 and 1.29 for 08-24 to 08-26 publishes, 1.99 and 2.37 for 08-27 to 08-30, and the daily series.

Transition band, defined from these data: publishes 07-27 to 08-26. Week 07-27 is the first whose day-29 readings were all taken after 08-24. Through 08-26 the lift is partial (pooled 1.01 to 1.19, typical 1.07 to 1.29) and rises with publish date. From 08-27 it is full. The 07-20 week holds 753 videos read on or just after 08-24 at day 28 to 30; at most their last two days of plays fell under the new rule, so it stays an old-rule week.

## 6. Growth after day 29 (weak support)

`straddler_growth.csv`. Growth from about age 29 to about age 60 to 68. **Revised after review (gemini finding 4).** The groups' elapsed windows differ (40 vs 30 days). They cannot be matched: no video in the first group has a second reading within 34 days of its first. Growth is also shown per unit of log age, k = ln(growth) / ln(age 2 / age 1).

| Group | Videos | Elapsed days | Aggregate growth | Without largest video | Per log age |
| --- | --- | --- | --- | --- | --- |
| First 29 days under the old rule (read at 29 before the switch) | 2,782 | 39.8 | +6.5% | +6.6% | 0.071 |
| First 15+ days under the old rule (published 07-26 to 08-08) | 8,002 | 30.6 | +9.0% | +7.3% | 0.121 |
| All under the new rule (published on or after 08-24) | 4,245 | 30.1 | +3.9% | +3.6% | 0.054 |

Per unit of log age, growth on an old-rule base is 1.3 times growth on a new-rule base, not 1.7 to 2.3 times as version 1 said. That is consistent with the rule applying to new plays on older videos. It cannot size the effect. These later plays are a small part of an older video's lifetime count.

## 7. Segments under the headline's own controls

All within channel (`lift_by_segment.csv`). **Revised after review (opus finding 4, sol finding 5).** Version 1 said the jump "shows in every sport, length, and channel size" and that no segment departed from the headline. Both overstated. Point estimates are above 1 in every segment. Sizes vary, and some intervals are wide.

Pooled (95%) and typical (95%):

| Sport | Channels | Pooled | Typical |
| --- | --- | --- | --- |
| Soccer | 171 | 2.14 (1.62 to 2.84) | 2.31 (1.85 to 2.87) |
| Basketball | 93 | 1.90 (1.43 to 2.47) | 2.12 (1.65 to 2.64) |
| Baseball | 85 | 1.56 (1.48 to 1.81) | 1.97 (1.78 to 2.27) |
| Running | 68 | 1.47 (0.85 to 2.51) | 2.01 (1.62 to 2.52) |
| Hockey | 58 | 1.80 (1.57 to 2.18) | 1.94 (1.73 to 2.21) |
| Golf | 55 | 1.34 (1.10 to 1.71) | 1.87 (1.54 to 2.14) |
| Football | 49 | 2.12 (1.60 to 3.71) | 2.35 (1.92 to 2.99) |
| Tennis | 28 | 1.44 (1.12 to 1.72) | 1.87 (1.57 to 2.28) |
| Cycling | 19 | 1.18 (0.82 to 1.81) | 1.39 (1.12 to 1.95) |
| Cricket | 19 | 1.67 (1.29 to 2.40) | 2.34 (1.83 to 3.04) |
| Four others, 14 to 25 channels each | | 1.56 to 2.54 | 2.05 to 2.29 |

- Duration, pooled: 60 s or less 1.58 (0.64 to 3.28, 49 channels), 61-180 s 2.15, 3-10 min 1.60, 10-20 min 1.72, 20-60 min 1.70, over 60 min 1.64. Typical: 1.94 to 2.42.
- Channel size by an independent measure (median lifetime views of the channel's January-April 2026 long-form videos): smallest third 1.56 (1.22 to 1.95), middle 2.06 (1.69 to 2.46), largest 1.69 (1.52 to 1.89). Typical: 2.21, 2.06, 1.99. Sorting on the pre-period mean itself gives a false gradient (3.34, 2.62, 1.68) from regression to the mean.

Above 1 vs above 1.25. On the pooled measure, intervals include 1 for running, cycling, and 60 s or less. Lower bounds fall below 1.25 also for golf, tennis, and the smallest size third. On the typical measure, only cycling's lower bound (1.12) is below 1.25. Tennis and golf intervals exclude 1.74 on the pooled measure.

**Added after review.** Do segments differ more than chance allows? I compared the spread of segment lifts at the switch with the spread at two cutovers where nothing changed, using the same estimator and segments (`segment_dispersion.csv`). Standard deviation of log ratios across segments:

| Dimension | Measure | At the switch | Null: before vs after 07-01 | Null: 08-31 to 09-13 vs 09-14 on |
| --- | --- | --- | --- | --- |
| Sport (14) | Pooled | 0.21 | 0.38 | 0.25 |
| Sport (14) | Typical | 0.14 | 0.22 | 0.16 |
| Duration (6) | Pooled | 0.11 | 0.23 | 0.66 |
| Duration (6) | Typical | 0.10 | 0.10 | 0.07 |
| Size (3) | Pooled | 0.14 | 0.21 | 0.08 |
| Size (3) | Typical | 0.05 | 0.05 | 0.05 |

In every row the spread at the switch is no wider than at least one null cutover. The segment differences are within the noise these data show when nothing changed. That does not prove the lift is the same everywhere. It means the data cannot tell. A single factor is not validated either way.

## 8. Sensitivity

`sensitivity.csv`. Pooled (95%) and typical. **Revised after review:** balanced weights throughout, mean reading ages on every row, and new rows marked "added".

| Variant | Pooled | Typical |
| --- | --- | --- |
| Primary | 1.74 (1.60 to 1.94) | 2.13 (1.96 to 2.31) |
| Version-1 weights (pre count), added | 1.77 (1.60 to 1.94) | 2.43 (2.03 to 3.10) |
| Equal weight per channel | 1.46 (1.27 to 1.78) | 2.03 (1.91 to 2.15) |
| Poisson with channel fixed effects, added | 1.74 (1.60 to 1.91) | n/a |
| Post from 08-24 / 08-27 / 09-07 | 1.72 / 1.78 / 1.79 | 2.09 / 2.17 / 2.13 |
| Age 27-31 / 28.5-29.5 days | 1.71 / 1.74 | 2.10 / 2.19 |
| Age 20-28 days (post readings 2 days younger) | 1.55 (1.24 to 1.93) | 2.02 (1.81 to 2.31) |
| Age 26-28 days, ages matched, added | 1.54 (1.27 to 1.89) | 1.98 (1.74 to 2.35) |
| Pre group July only | 1.69 (1.53 to 1.90) | 2.06 |
| Post group 09-14 on only | 1.66 (1.49 to 1.88) | 2.06 |
| Drop top 1% channels by pre views | 1.85 (1.66 to 2.07) | 2.14 |
| Drop the channel with the largest version-1 numerator share, added | 1.74 (1.59 to 1.92) | 2.12 |
| Drop long-form at or under 60 s | 1.73 | 2.12 |
| Long-form / Shorts, channels with both, jointly resampled, added interval | 2.09 (1.60 to 2.82) | 2.33 (2.08 to 2.61) |
| Same, without the dominant Shorts channel, added | 1.79 (1.56 to 2.04) | 2.33 (2.07 to 2.61) |

Lowest pooled point estimate: 1.46 (equal weights). Lowest interval bound: 1.24, in the 20-28 day window, whose post group is the later and smaller October set. **Revised after review (gemini finding 5).** That window's post readings are 2 days younger than its pre readings. The age-matched 26-28 day window gives the same 1.54 (1.27 to 1.89). So the age gap does not explain the lower value. The October cohort is lower on both. The lowest typical-video bound is 1.74.

## 9. Stored totals (what the change did to today's numbers)

`stock_translation.csv`. **Revised after review (gemini finding 1).** Version 1 counted no post-switch views for an older video between the switch and its first refetch whenever that refetch came after the switch. That covered 20,382 of 20,899 videos published 07-26 to 08-23. Those views are now modeled two ways.

**Revised after round-2 review (finding 2).** Round 1 called the two ways low and high bounds and the cohort calculation "measured". All three are models. Every figure assumes one factor R for every post-switch view. Flat-rate scenario: the refetch-to-refetch rate held back to the switch. Even-spread scenario: the first count spread evenly from publish. Videos without a usable pair take their publish month's average share. The scenarios cross: for 1,183 paired videos the flat-rate accrual exceeds the even-spread one (40,457,562 vs 33,545,813 views summed; `review_checks.csv`). The reviewer's example reproduces: a video published 2025-12-05, read 3,596,490 on 09-25 and 4,626,073 on 10-25, gets 2,125,802 flat-rate and 1,423,247 even-spread (the reviewer had 1,423,303 and a summed 33,546,928; the small gap is likely timestamp rounding, not checked). The transition cohort's figure applies each publish window's day-29 cohort ratio (section 5) to the first count and R to later growth. No old-rule count is observed. Plugging in the cohort interval endpoints gives 2.6% to 37.6%, which leaves out accrual-model uncertainty.

The data alone, assuming counts never fall and were not restated, bound post-switch accrual only loosely. A stored count read before the switch has none. A video published after it has all its views after. A pair with both readings after the switch allows [V2 - V1, V2]; a pair straddling it allows [0, V2 - V1]; no usable pair allows [0, V2]. The reviewer's totals reproduce exactly: 3,848,243,541 to 12,030,319,881 post-switch views.

| Videos | Stored long-form views | Flat rate | Even spread | Readings alone |
| --- | --- | --- | --- | --- |
| Published on or after 2026-08-24 | 3.68 billion (21.7%) | +74% (60% to 94% over R's interval) | same | same |
| Published 2026-07-26 to 08-23 | 1.03 billion (6.1%) | +4.2%; +10% from cohort ratios | +30.7% | +2.9% to +74.3% |
| Published 2026-01-01 to 07-25 | 7.78 billion (45.8%) | +1.6% | +6.1% | +0.4% to +40.0% |
| Published 2025 | 4.48 billion (26.4%) | +0.6% | +2.4% | +0.3% to +25.3% |
| **All long-form** | 16.96 billion | **+11.6% (10.0% to 13.4% over R's interval); about +12% with cohort ratios** | **+16.2% (13.9% to 18.8%)** | **+10.7% to +43.4% (9.3% to 52.3%)** |

So about +12% is a modeled estimate, with a scenario range of 10.0% to 18.8%. The readings alone allow 10.7% to 43.4% at R, which spans 25%. Under the model the stored total is below 25%, and it crosses 25% when post-switch views reach 0.2 / (1 - 1/1.7435) = 47% of stored long-form views. The scenarios put today's share at 24% and 33%; the readings alone allow 23% to 71%. Tighter limits would need more historical readings per video or an accrual model validated against videos with dense readings, and these data have neither.

## 10. Applying one factor to current counts

**Added after review (sol finding 1, sol finding 2, opus finding 1).** Version 1 proposed multiplying counts of pre-switch videos by the factor. Three checks against that (`review_checks.csv`, `quantile_ratios.csv`):

- 200,493 of 223,818 long-form videos published before 08-24 were last read on or after it. Their current counts already include new-rule views. Multiplying them scales those views twice. Among 132,461 videos published before 08-20 with both readings after the switch, ×1.74 overstates the new-rule count by more than 25% for at least 104.
- After dividing post views by 1.74, the typical post video is still 1.22 (1.13 to 1.32) times the typical pre video. One factor cannot equalize both measures.
- The post/pre ratio runs from 2.71 at the 10th percentile to 1.71 at the 95th. Any one factor over-corrects big videos or under-corrects small ones.

**Revised after round-2 review (finding 1).** A rank within publish cohort avoids choosing a factor. It removes the counting change only if the rule kept the order of videos within each cohort, and that is untested: it needs per-video old-rule counts, which only channel owners see. Round 1 said the observed percentiles show the order was kept. That was wrong. Separately sorted groups always have ordered quantiles, even if videos swap places. Two further limits. A cohort that mixes regimes keeps its within-cohort distortion, which is why the 08-24 week is split at 08-27 and the transition band (07-27 to 08-26) is left out. And ranking current lifetime counts mixes regimes in every pre-switch video, so the ranking should use day-29 readings.

One consequence of rank preservation can be checked now, at day 29 (`trial_rank_check.csv`). If the rule kept order across channels within a cohort, sports should not move within the ranking across the switch more than where nothing changed. Each matched channel's mean within-cohort percentile shift, averaged by sport on balanced weights, spreads 1.4 percentile points (standard deviation, 14 sports) across the switch, against 3.0 and 2.5 at the two null cutovers. That passes. It does not test order within a channel. A season can also move sports, so a later failure would need a second look before blaming the rule.

## 11. Published estimates of the same change

**Added 2026-10-28.** Sources: `../external/published_estimates.csv`, supplied with their links and not re-fetched (no network in this step). Code: `external.py`. Tables: `lift_by_size_tier.csv`, `trial_rank_check_by_size.csv`.

What each measures:

| Estimate | Numerator over denominator | Same plays on both sides? | Population | Window |
| --- | --- | --- | --- | --- |
| Ours | Day-29 public views of videos published 08-31 on, over day-29 public views of the same channels' videos read before 08-24 | No. Different videos, published months apart | 746 sports channels in this catalog, long-form | Each video's first 29 days |
| Agentio, measured | Public views over engaged views | Yes | 75,000+ videos from creators connected to Agentio, published since 06-01. Categories and whether Shorts are included are not stated | Plays after 08-24; published 09-03 |
| Podtrac, measured | Views over engaged views | Yes | YouTube podcast channels, 84.2M views | Two days, 08-27 to 08-28 |
| Agentio, modeled | Forecast from 30-second view-through in retention data | n/a | 35,800 videos published June to July | Before the change |

Why they might agree. Both ratios put the new count over the old one. Engaged views are YouTube's name for the old count, still reported to channel owners. **Revised after red-team review.** YouTube has not published the old organic-view threshold. 30 seconds is the commonly assumed proxy, from the paid-ad convention (Agentio's methodology page, as read by the red-team measurement review; not re-fetched here). Agentio and Podtrac count the same plays both ways, so they need no assumption about viewing. They measure M, the public-to-engaged multiplier, on their populations. Ours observes C = M × D (section 1). C equals their M only if D = 1 here and the multiplier transports from their creators to ours. A match is consistent with both. It cannot establish either.

Why they might not:

- Channel size. Agentio's ratio falls with size: 1.85 under 50k average views per video, 1.77 at 50k to 300k, 1.49 at 300k+. Both headline ratios weight views, so the mix of channel sizes moves them. Agentio's overall 1.67 sits below its two smaller tiers, so its 300k+ tier must hold at least (1.77 - 1.67) / (1.77 - 1.49) = 36% of its engaged views. That tier holds 17% of ours (below).
- Traffic source. Agentio: plays from feeds and recommendations read 5.0, plays from the watch page 1.18. These data have no traffic source.
- Age. Ours covers the first 29 days. Agentio's covers every post-switch play on videos up to about three months old.
- Viewing. A change in viewing between cohorts enters ours and not theirs.

**The cut that makes it fair: our estimate on Agentio's size tiers.** Tier measure: a channel's mean old-rule count per long-form video, from each video's latest reading before 08-24, over its videos outside the estimate (3 or more). It uses pre-period views only, and none of the estimate's own pre readings, so it does not build in regression to the mean (section 7). 734 of 746 channels get a tier. The other 12 hold 0.7% of pooled pre views.

| Tier (average views per video) | Channels | Pre / post videos | Share of pooled pre views | Ours, pooled (95%) | Ours, typical (95%) | Agentio |
| --- | --- | --- | --- | --- | --- | --- |
| Under 50k | 579 | 9,014 / 17,148 | 19.1% | 1.85 (1.64 to 2.08) | 2.18 (1.97 to 2.43) | 1.85 |
| 50k to 300k | 133 | 3,817 / 6,596 | 64.0% | 1.79 (1.57 to 2.08) | 2.00 (1.80 to 2.23) | 1.77 |
| 300k+ | 22 | 399 / 163 | 16.9% | 1.49 (1.22 to 1.78) | 1.98 (1.34 to 2.80) | 1.49 |
| All tiered channels | 734 | 13,230 / 23,907 | 100% | 1.75 (1.60 to 1.94) | 2.13 (1.96 to 2.32) | 1.67 |

On this catalog's size mix, Agentio's tier ratios give 0.1908 × 1.85 + 0.6402 × 1.77 + 0.1690 × 1.49 = 1.74. Weights: each tier's share of our pooled old-rule views, since both ratios divide by old-rule views. Our same 734 channels give 1.75. Ours over theirs: 1.007. The two are consistent in size after this illustrative size standardization. Size mix accounts for the gap to Agentio's headline 1.67 on this calculation. Age, traffic source and population can still differ within tiers, so other differences may contribute. **Added after red-team review.** The tier measure was chosen after Agentio's figures were in hand. The other measures below are the check on that choice.

Checks on the cut (`lift_by_size_tier.csv`):

- Where nothing changed. Same tiers, published before vs after 07-01, all read before the switch: 0.97 (0.80 to 1.18), 0.94 (0.74 to 1.16), 0.88 (0.64 to 1.89). Every interval includes 1.
- Other tier measures. Thresholds divided by 1.67, in case Agentio's tiers count public views: 1.85, 1.83, 1.58. Mean lifetime count of the channel's January-April 2026 publishes, mostly read after the switch: 1.82, 1.70, 1.74 (1.33 to 2.26). The pre group's own day-29 mean, which builds in regression to the mean: 2.25, 1.69, 1.37.
- So the two smaller tiers hold across measures (1.82 to 1.85; 1.70 to 1.83). The 300k+ tier rests on 22 channels and 163 post videos. It moves from 1.49 to 1.74 with the tier measure, and its interval overlaps the smallest tier's. A size gradient in our data alone is not established. Agentio's is measured. Ours points the same way, which is suggestive.
- The typical-video measure shows little gradient (2.18, 2.00, 1.98). There is no published counterpart for it.
- Does the gradient move ranks within a publish week? Using the trial's ranking cohorts (section 10), the shift in mean within-cohort percentile is +1.6 points for the smallest tier and +2.6 for the largest: a gap of -0.9 points. Where nothing changed the gap is +3.8 and -0.6 (`trial_rank_check_by_size.csv`). No tilt toward small channels beyond noise. Ranks follow typical videos, whose tier ratios are nearly equal.

The other published estimates:

- Podtrac, podcast channels: 1.56 for playlist episodes, 1.72 for other videos, in the first days after the change. Our long videos: 20-60 minutes 1.70 (1.40 to 2.05), over 60 minutes 1.64 (1.41 to 1.91) (`lift_by_segment.csv`). Consistent, on a different population and window.
- Agentio's forecast before the change, 1.30, came from retention curves. Agentio's own measurement after the change came in at 1.67. The first draft set aside a vendor estimate of about +30% for long-form. That figure matches this forecast, and measurement has superseded it.
- Every measured point estimate, ours and theirs, is above 1.25: 1.49 to 1.85 by tier, 1.56 to 1.72 for podcasts. Our 300k+ interval reaches 1.22.

What the comparison changes:

- The main untested assumption gains outside support, not proof. Suppose the rule's effect on these channels equals Agentio's on the same size mix. Then D = 1.7500 / 1.7379 = 1.007, a +0.7% change in viewing. Our interval allows 1.5957 / 1.7379 = 0.92 to 1.938 / 1.7379 = 1.12, so -8% to +12%. That is a conditional reading. It does not measure viewing. Reversing the call needs a 39% rise. A change in viewing and a difference in the rule's effect between populations could offset. They would have to offset in all three tiers. The ranges cover our channel sampling only, not Agentio's error or the transport assumption.
- The size of the effect depends on where plays come from. Agentio's traffic-source split (theirs, 1.18 to 5.0) is a plausible mechanism for why one factor does not fit (section 10). It is also the main threat to rank preservation within a week. Two videos in the same week with different shares of feed plays get different lifts. The size check above does not test that. No data here can.
- Nothing in the comparison argues for a lower size. Matched on size, the measured outside ratio and ours are consistent.
- Agentio operates in creator sponsorship (red-team review, not checked here). Its figures do not come from a neutral party.

## Diagnosis

**Revised after review. Revised again after red-team review.** The observation: at one month old, a long-form video published after the switch shows about 1.74 times the views of the same channel's videos before it on the pooled measure (+74%, 95% interval +60% to +94%). On the typical-video measure it is 2.13 times (+113%, +96% to +131%). That is a same-channel, same-age cohort contrast. The intervals cover channel sampling only. The attribution: a large counting effect is the leading explanation. That the whole contrast is counting assumes underlying viewing held level, and nothing in these data observes that directly. Every pooled sensitivity point estimate is at least +46%. The one interval reaching below +25% (to +24%) comes from the October cohort at earlier ages. **Added 2026-10-28.** Published measurements that count the same plays both ways are consistent once matched on channel size: Agentio's tier ratios give 1.74 on this catalog's size mix, against 1.75 here (section 11). That corroborates. It measures a different quantity on other creators.

Kinds of evidence, kept separate:

- Measurement: the step is best explained by a change in how YouTube counts. A change in viewing alongside it is not ruled out. Inferred, not observed.
- Arithmetic: the within-channel change accounts for all of it. The mix term is mostly one channel.
- Causal: the rule is the cause by timing (a one-day step at the 08-26 to 08-27 publish boundary), a control that did not move (Shorts), and elimination of measurement and mix rivals. There is no randomized design and no calendar-matched control. A seasonal part is not excluded.
- Shape: one factor does not fit. After dividing by 1.74 the typical post video is still 1.22 times its pre counterpart, the transition cohorts are partly lifted, and current counts mix both rules. Ratios between cohort percentiles are larger at low percentiles (2.71 at the 10th, 1.71 at the 95th), but they compare different videos, so whether the rule caused that is unverified. **Revised after round-2 review (finding 4).** Version 2 said "the lift is larger for low-view videos". Segment differences sit within null noise.

What would change the call: a long-form-only rise in underlying viewing of about 39% from May-July to September publishes (70% for the typical video) that Shorts did not show. Or representative engaged-view data showing engaged views also rose that much. A smaller rise would shrink the rule's share without changing the call.

Smallest useful next observation. **Revised after round-2 review (finding 3).** Engaged views for September 2026 long-form videos from a random sample of the 746 matched channels. Views over engaged views, on the headline's channel weights, reads the rule's effect directly for the catalog. One creator's export is a useful first look: it can challenge attribution for that creator and show whether its same-week videos keep their order. It cannot settle the catalog-wide contrast, because the analysis already allows the effect to vary by channel. Either needs creators' cooperation, which an agent cannot get. Without it, the late-November rerun on October publishes at day 29 is the next catalog-wide observation. **Revised after red-team review.** That rerun is a stability check, not a reversal test. It still observes C, not M: with M at 1.74 and engaged demand at 70% of the earlier level, it would read 1.22. A result under 1.25 prompts re-diagnosis. Reversing the counting estimate needs representative public and engaged counts on the same videos, matched by age and window. The rerun needs the private extract.
