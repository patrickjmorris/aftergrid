# 03 define-metric: proposed definition, version 2

Skill: `skills/define-metric/SKILL.md`. Implementation: `scripts/metric.py`. Status: **proposed**. The owner has not approved it.

Revised 2026-10-28 after analysis review (`06-analysis-review.md`). Version 1 was never approved, so the define-metric rule is followed by proposing version 2 rather than editing the old definition silently. Changed sections are marked **Revised after review**. Version 1 stays computable as a sensitivity row. After the round-2 review, the interpretation table's rows A2, B and C were reworded (cohort summaries; stored totals modeled). The definition did not change.

After the red-team round (`06-analysis-review.md`, round 3), wording only: the old threshold is described as unpublished, the proxy's result is named a cohort contrast, and the interval is labeled as channel sampling only. The definition and every number are unchanged.

## Use

- Decision: adjust ranking and comparison of videos if long-form views rose more than 25% because of the 2026-08-24 rule (owner-stated).
- Reader: the owner.
- Unit of analysis: a long-form video at a fixed age. Unit of the result: a ratio, reported as percent lift per video.

## Business concept vs available proxy

- Concept: views counted under the new rule divided by views the old rule would have counted for the same plays.
- That old-rule count after 2026-08-24 is "engaged views," visible only to channel owners. It is not in the data. **Revised after red-team review.** YouTube has not published the old organic-view threshold. 30 seconds is the commonly assumed proxy. This file says "the old count" rather than naming a threshold.
- Proxy: within the same channel, compare videos whose views at age 28-30 days accrued entirely after the change with videos whose views at that age accrued entirely before. Everything else that differs between the two groups must be tested in diagnose-change.
- What the proxy measures. Its result is a same-channel, same-age cohort contrast C. Write C = M × D. M is public over engaged views for the post videos, which is the concept. D is the post videos' engaged views over the earlier videos' old count, a change in viewing. The proxy equals the concept only when D = 1. These data cannot observe M or D separately.

## Interpretations that give different numbers

| Interpretation | What it measures | Effect on the number |
| --- | --- | --- |
| A1. Per-video lift, pooled views (primary) | How much a group of videos' views grew, big videos counting more | 1.74 |
| A2. Per-video lift, typical video (secondary, reported beside A1) | How much the geometric-mean video's views grew, a cohort summary | 2.13. Larger; ratios between cohort percentiles are larger at low percentiles, cause unverified |
| B. Lift on the catalog's stored lifetime total | How much bigger today's long-form total is because of the rule | Modeled about +12% (scenarios 10% to 19%); the readings alone allow 11% to 43%. Most stored views belong to videos published before the change |
| C. Lift on an older video's lifetime count | How much a video published months ago moved | Modeled +0.6% to +6.1% across scenarios for videos published before late July. Modeled about +10% for the four weeks before the switch. The readings alone do not bound either tightly |

**Revised after review (opus findings 1 and 5).** Version 1 led with A1 alone and called it "the" per-view lift. A1 and A2 are both per-video measures. They differ because the post/pre ratio is not the same at every percentile. Those percentile ratios compare different videos, so whether the rule caused the difference is unverified (revised after round-2 review, finding 4). Both are now reported together, and the headline names which is which. A is still the right input for the decision. B and C are reported beside it so the owner sees why the catalog total moved less.

## Counting contract

**Pre group.** Long-form videos (`is_yt_short = 0`) with a view reading at age 28.0 to under 30.0 days, where the reading was taken before 2026-08-24 00:00 UTC. All of that video's counted views then accrued under the old rule.

**Post group.** Long-form videos published on or after 2026-08-31 00:00 UTC with a reading at age 28.0 to under 30.0 days. All accrual is under the new rule, with a one-week buffer after the switch date.

**Readings.** A reading is (`prev_view_count`, `prev_view_count_at`) or (`view_count`, `last_stats_check`). Age = reading time minus `published_at`. One reading per video: the one closest to 29.0 days. A reading with no timestamp is not a reading.

**Channel matching.** A channel counts only if it has at least one video in each group.

**Channel weight. Revised after review (gemini finding 2).** For channel c with n_pre_c pre videos and n_post_c post videos, w_c = n_pre_c × n_post_c / (n_pre_c + n_post_c). This is the weight a channel fixed-effects comparison gives. It is large only when a channel has many videos on both sides. Version 1 used w_c = n_pre_c. That let one channel with 233 pre videos and 10 post videos supply 19% of the numerator. It also let one channel with 261 mostly zero-view pre videos raise the typical-video measure from 2.18 to 2.43.

**Formulas.**

- Primary, pooled views (ratio of totals): R = Σ_c w_c × mean_post_c(views) / Σ_c w_c × mean_pre_c(views).
- Secondary, typical video: exp(Σ_c w_c × [mean_post_c ln(1+views) - mean_pre_c ln(1+views)] / Σ_c w_c).
- Lift = ratio - 1. Threshold test: lift > 0.25.

**Uncertainty. Revised after review (sol finding 3).** Bootstrap over channels, 2,000 resamples, percentile 95% interval. Channels are the independent units: videos within a channel share audience and seasonality. The interval covers which channels happened to be sampled. It does not cover a change in underlying viewing between the May to July and September cohorts. That is an assumption, tested where possible in diagnose-change. It does not cover the gap between this catalog and other creators, or between the catalog and any one deal, either. The catalog is not a probability sample of YouTube.

**Exclusions.** `is_yt_short` null (517). Null `view_count`. Readings without timestamps. Videos published before 2026-08-31 and read at age 28-30 on or after 2026-08-24 (they straddle the switch). Straddlers are used only to test timing.

**Not a proportion.** Numerator and denominator are view totals of different video sets in the same channels. A zero denominator cannot occur for an included channel unless every pre video has 0 views; none of the 746 included channels has that.

## Time rules

- Event time: the reading timestamp and `published_at`, UTC. Ingestion time is not used for ages.
- Switch instant: 2026-08-24 00:00 UTC. YouTube published no hour.
- Buffer: post videos start 2026-08-31. I chose one week after exploring, having seen that videos published on 2026-08-24 to 2026-08-26 show a smaller step than later ones. The choice is disclosed. Diagnose-change reports the estimate for post starts of 2026-08-24, 2026-08-27, and 2026-09-07. **Revised after review (opus finding 2).** The publish cohorts around the switch are now measured directly (`transition_lift.csv`). The full step starts with 2026-08-27 publishes, so the buffer matters for any rule keyed to a date.
- Maturity: age 28-30 days is the long-form standard refetch age. Both groups are measured at the same age. Mean ages: 28.8 days pre, 29.1 post.
- Restatements: if YouTube revised a count later, the stored reading reflects the count at fetch time. No restatement handling.

## Boundary examples (constructed from the rules; not measured)

1. Published 2026-07-24 10:00, earlier reading at 2026-08-23 08:00 (age 29.9 days): pre group.
2. Published 2026-07-28, reading at age 29 on 2026-08-26: excluded. Its first 27 days were under the old rule, the last 2 under the new rule.
3. Published 2026-08-27, reading at age 29: excluded (inside the buffer). Included in the 2026-08-24 and 2026-08-27 sensitivity runs.
4. Earlier reading at 28.2 days and last reading at 29.1 days: the 29.1-day reading is used.
5. A channel with pre videos but no post video: dropped. 53 of 799 pre channels drop this way.
6. A video with `ingested_at` 20 days after `published_at`: still eligible. Age runs from `published_at`.
7. **Added after review.** A channel with 233 pre videos and 10 post videos: weight 233 × 10 / 243 = 9.6 under version 2, against 233 under version 1.

## Illustrative example of A vs B (invented numbers, not measured)

A channel has 1,000 older videos totaling 50,000,000 views. It posts 20 new videos after the switch. Each would have drawn 10,000 views under the old rule. Each now shows 20,000.

- A, per-video lift: 20,000 / 10,000 - 1 = +100%.
- B, catalog lift: (50,000,000 + 400,000) / (50,000,000 + 200,000) - 1 = +0.4%.

Same rule, same plays. The catalog total barely moves, but every new video looks twice as big as an old one with the same viewing.

## Validity checks (run in `scripts/metric.py` and `scripts/diagnose.py`)

- One reading per video per group (enforced in `pick_reading`).
- Every pre reading time is before the switch; every post video is published on or after the buffer end (asserted in `diagnose.py`).
- Counts of channels, pre videos, post videos, views and mean reading ages per group are written with each estimate.
- Coverage of each group by publish week is in `explore_coverage_by_publish_week.csv`.
- An independent SQL version (`scripts/crosscheck.sql`) computes both weightings. It must match Python to four decimals.
- No independent total exists to reconcile against. The CSV copy matches the SQLite table.

## Counter-metric

The lift is a sizing, not a target. If the owner re-ranks on post-change views, the counter-metric is engaged views (plays that met the old threshold, unpublished, commonly assumed to be 30 seconds). A thumbnail that draws clicks and quick exits would gain under the new count while engaged viewing falls. Spot Sports cannot see engaged views for third-party channels. That gap stays open.

## Unresolved choices

1. Pooled vs typical video as the lead. Pooled leads because the owner asked whether "views went up". Both are reported, always together.
2. Whether the owner's 25% means A or B. A is recommended. B is reported beside it.
3. Live streams are inside long-form and cannot be split out.
4. Channel weights. Version 2 (balanced) is proposed. Version 1 (pre count), equal weights and a Poisson fixed-effects fit are sensitivity rows.

## Owner and status

Version 1 proposed 2026-10-28. Version 2 proposed 2026-10-28 after review. Owner approval not supplied for either. Not an approved organizational definition.

## Estimates under each version (run 2026-10-28, `scripts/run_all.py`)

| Version | Pooled views (95%) | Typical video (95%) | Shorts, pooled (95%) |
| --- | --- | --- | --- |
| 2 (balanced weights, current) | 1.74 (1.60 to 1.94) | 2.13 (1.96 to 2.31) | 0.85 (0.62 to 1.08) |
| 1 (pre-count weights) | 1.77 (1.60 to 1.94) | 2.43 (2.03 to 3.10) | 0.81 (0.60 to 1.05) |

746 channels, 13,254 pre videos, 23,962 post videos in both. Sources: `primary_lift.csv`, `sensitivity.csv`, `sql_crosscheck.csv`. Diagnose-change tests whether the long-form difference belongs to the rule.
