# Long-form views and YouTube's 2026-08-24 counting change

Prepared 2026-10-28 for the Spot Sports owner. Data: `videos` table extracted 2026-10-27.

**Revised 2026-10-28 after two rounds of analysis review** (`skill-outputs/06-analysis-review.md`). Round 1: three AI-model reviews, 15 issues, 13 fixed and 2 partly fixed. The size was restated with two per-video measures, 1.74 pooled (was 1.77) and 2.13 typical (was 2.43), and the 1.77 multiplier gave way to ranking within publish week. Round 2: one AI-model review, 4 issues, all fixed. The August 24 publish week is split, the July 27 to August 26 transition band is left out, and the ranking is now a trial with a success check. The stored-total figures are relabeled as modeled scenarios. One creator's export no longer reverses the call. Percentile ratios and the 10,000-view example are described as cohort summaries. The call is still "adjust". Revised sections are marked.

**Extended 2026-10-28** with published estimates of the same change and every group the result moves. Matched on channel size, Agentio's measured ratios give 1.74 on this catalog, against 1.75 here. The brief now speaks to Spot Sports, creators and sponsors. The call is unchanged, and every earlier table reran byte-identical.

**Revised 2026-10-28 after a red-team round** by three AI models (`skill-outputs/06-analysis-review.md`, round 3). Wording only. No number, code or result changed. The +74% is now stated as a same-channel, same-age cohort contrast, with the counting rule as its leading explanation, not an established one. The old threshold is described as unpublished, with 30 seconds as the assumed proxy. The sponsor figures are a scenario under stated assumptions. Agentio is corroboration, not the same estimate. An October rerun is a stability check. The call is still "adjust".

## Message to the owner

**Adjust long-form rankings. A month-old video now shows about [74% more views](results/primary_lift.csv) than the same creators' earlier videos. YouTube's new count is the leading explanation.**

That clears your 25% line. The range, 60% to 94%, covers only which channels we had. It assumes steady viewing. Only a 39% rise in viewing would undo the call. Shorts did not rise. Outside same-play measurements, size-matched, [land close](results/lift_by_size_tier.csv).

Who should act:

- **Spot Sports.** Rankings across August 24 favor new videos: 64% of comparable videos, [77% of the top 1,000](results/group_impacts.csv). No single multiplier fits. Trial ranking each video within its publish week at one month, leaving out July 27 to August 26. Order within a week is untested. Confirm the cost.
- **Creators.** Compare across the date on YouTube's engaged views.
- **Sponsors paying per view.** In our catalog, roughly [4 in 10](results/group_impacts.csv) counted plays (37% to 48%) would not have counted before. Deals differ. Ask creators for public and engaged views on the same videos, traffic sources, and retention at the read.

Leave rankings alone only if your 25% meant total catalog views: [about 12%](results/review_checks.csv) by our model, 11% to 43% from data alone.

If October videos, rechecked in late November, show under 25%, re-diagnose. If engaged views from random creators do, reverse the call.

## Working behind the call

### 1. Decision and goal

- Who decides: the Spot Sports owner.
- Choice: change how videos are ranked or compared, or leave it.
- By when: not stated.
- Goal: rankings and comparisons that treat videos fairly. That is inferred from the ask. No target or plan was supplied, so materiality against a goal is unjudged.
- Decision threshold: more than 25% caused by the change means adjust (owner-stated).
- Limit: the owner is not available. Which "25%" they meant is unresolved (see section 3).

**Added 2026-10-28: who else this moves.** Public view counts have more users than the owner. Each group below would act differently on this result. Figures marked "theirs" come from published estimates (`external/published_estimates.csv`). The rest are ours: `group_impacts.csv`, `lift_by_size_tier.csv`, `ranking_illustration.csv`, `trial_rank_check_by_size.csv`.

| Group | What changed | How big, in their unit | What they should do | Confidence |
| --- | --- | --- | --- | --- |
| Spot Sports | Rankings and comparisons that cross 08-24 tilt toward newer videos. Long-form against Shorts tilts too: long-form rose, Shorts did not | Post-change videos are 64.4% of the matched day-29 pool and 77.3% of its top 1,000 by raw views, 1.20 times their share. Within a publish week, no tilt by channel size: the smallest tier's percentile shift minus the largest's is -0.9 points, against +3.8 and -0.6 where nothing changed | Run the trial in section 5. Do not compare raw counts across 08-24 | High that comparisons across the date tilt. Within a week, checks by sport and size pass. Videos with more feed plays may climb (theirs: feed plays 5.0, watch page 1.18); untested |
| Creators in the catalog | Public counts rose. The new count is the leading explanation. Whether viewing also changed is not observed here | A month-old video reads 1.74 times (1.60 to 1.94) the same channels' earlier videos, pooled; 2.13 for the typical video. By average views per video: under 50k 1.85, 50k to 300k 1.79, 300k+ 1.49 (ours); 1.85, 1.77, 1.49 (Agentio, theirs) | Compare videos across 08-24 on engaged views in YouTube Analytics, or only within one side of the date. Do not read or pitch the jump as audience growth unless engaged views show it. Pitch engaged views and their share of public views | High that counts rose more than 25% under 300k average views: both tiers' intervals sit above 1.5. The ordering by size is suggestive, not established here: the 300k+ tier rests on 22 channels, its interval reaches 1.22, and it reads 1.49 to 1.74 by tier definition |
| Sponsors and brands paying on public views | If the price per public view stays fixed, it buys fewer engaged views. A flat fee does not change by itself; the risk is a renewal priced on a trailing public average | A scenario, not three findings. Each figure transforms the one catalog contrast. It assumes a fixed price per public view, and that the whole contrast is the public-to-engaged multiplier. Share of a post-change count not counted as engaged views: 42.6% (37.3% to 48.4%), 53.0% for the typical video; 40.1% overall (Agentio, theirs). Cost per engaged view: 1.74 times (1.60 to 1.94). Price per public view that holds it: 57.4% of the old one (51.6% to 62.7%). Our tier figures (46.0%, 44.1%, 33.0%) carry the tier caveat above | For a real deal, use the creator's own numbers: public and engaged views on the same videos over the same window (for example days 1 to 29), traffic sources, and retention at the read timestamp. Re-base view guarantees written before 08-24 on engaged views | High that the catalog share is large: ours and every published measurement give a third to a half. Low for any one deal: the catalog figure is a contrast between cohorts, not a deal's ratio, and Agentio's ratio varies with traffic source (feeds 5.0, watch page 1.18). Engaged views are not sponsor exposure: whether a play reached a read needs retention at the read |

Left out because they would not act differently on this: Shorts creators and Shorts comparisons (Shorts already counted on play and did not rise), and readers who only see the counts (no decision of theirs was supplied).

### 2. Result in goal units

**Revised after review (opus findings 1, 3 and 5; gemini findings 1 and 2). Revised again after round-2 review (findings 2 and 4).** The owner manages views per video and the order of videos in a ranking. Every ratio below summarizes a cohort. None is a conversion factor for an individual video.

- Pooled measure, as an illustration of the cohort summary: 10,000 × 1.7435 = 17,435. Interval: 10,000 × 1.5959 = 15,959 to 10,000 × 1.9389 = 19,389. It says the weighted post-switch cohort drew 1.74 times the views of the same channels' pre-switch cohort. It does not convert any one video's count. Source: `primary_lift.csv`.
- Typical-video measure, same illustration: 10,000 × 2.1265 = 21,265 (19,630 to 23,098). 2.13 is the exponentiated weighted mean difference in ln(1 + views). It is not the median video's ratio (the matched medians differ by 2.02, table A2), and not a conversion for a 10,000-view video. Source: `primary_lift.csv`.
- Ratios between cohort percentiles, both sides on the same channel weights (`quantile_ratios.csv`): 10th percentile 409 vs 1,109 views (2.71). Median 7,264 vs 14,638 (2.02). 90th 91,635 vs 161,948 (1.77). 95th 175,033 vs 299,337 (1.71). These compare separately sorted groups of different videos. A change in the shape of the distribution would produce the same pattern, so the cause is unverified. They are not correction factors for videos of a given size.
- Ranking illustration, not evidence that any factor is right. Pool: 37,216 long-form videos with a day-29 reading in matched channels, published 2026-05-08 to 07-26 (pre) and 2026-08-31 to 09-29 (post). Post videos are 64.4% of the pool. That share is not a fair-share benchmark. In the top 1,000 by raw views they are 77.3%; after dividing post views by 1.7435, 61.3%. Top 100: 68% raw, 44% scaled. Source: `ranking_illustration.csv`. Spot Sports' actual ranking formula was not supplied.
- Modeled views added by the rule over the data's own period (2026-08-24 to the extract). Every figure in this bullet and the next assumes one factor R for every post-switch view. Post-switch long-form accrual under the flat-rate scenario is 4.13 billion views, 3.68 billion of it from videos published after the switch. The share that would not have counted under the old rule is 1 - 1/1.7435 = 42.6%: about 1.76 billion views (1.54 to 2.00 billion over R's interval; 2.36 billion under the even-spread scenario). The readings alone allow 3.85 to 12.03 billion post-switch views, so 1.64 to 5.13 billion added at R = 1.7435. Source: `stock_translation.csv`.
- **Added 2026-10-28.** Other groups' units (`group_impacts.csv`). **Revised after red-team review.** These are one scenario, not separate findings. Each transforms R = 1.7435, read as if the whole cohort contrast were the public-to-engaged multiplier, at a fixed price per public view. Share of a post-change count not counted as engaged views: 1 - 1/1.7435 = 42.6% (1 - 1/1.5959 = 37.3% to 1 - 1/1.9389 = 48.4%); typical video 1 - 1/2.1265 = 53.0%; Agentio 1 - 1/1.67 = 40.1%. Price per public view that holds cost per engaged view: 1/1.7435 = 57.4% of the old price (1/1.9389 = 51.6% to 1/1.5959 = 62.7%). The ranges cover channel sampling only. They leave out a change in viewing, the gap between this catalog and one creator, and contract terms. Top 1,000 share over pool share: 0.773 / 0.6439 = 1.20. By tier, 1 - 1/1.8511 = 46.0%, 1 - 1/1.7876 = 44.1%, 1 - 1/1.4933 = 33.0% (`lift_by_size_tier.csv`).
- The parts of the stored total, sized separately under the model: videos published after the switch gained 1.57 billion views (+74% on their stored total, by construction at R). Older videos gained 0.19 billion under the flat-rate scenario. All long-form: modeled +11.6% (flat-rate) to +16.2% (even-spread); about +12% with the 07-26 to 08-23 cohort modeled from its own day-29 ratios. The readings alone allow +10.7% to +43.4% at R = 1.7435.

### 3. Materiality

**Revised after review. Revised again after round-2 review (finding 2).**

| Result | Normal variation | Goal | Owner threshold (25%) | Label |
| --- | --- | --- | --- | --- |
| Per video, pooled +74% (60% to 94%) | Four null comparisons, same estimator: points 0.85 to 0.97, intervals reaching 0.62 to 1.20. Separate diagnostics, not a calibrated envelope | No target supplied: unjudged | Above, with the whole interval | **Material** (threshold, variation) |
| Per video, typical +113% (96% to 131%) | Null comparisons: points 0.91 to 1.06, intervals reaching 0.84 to 1.15 | Unjudged | Above, with the whole interval | **Material** (threshold, variation) |
| Stored long-form total, modeled about +12% (scenarios 10.0% to 18.8%) | Not computed for the total | Unjudged | Modeled below. The readings alone allow 10.7% to 43.4%, which spans it | If the threshold means the total: below it only under the model's assumptions |
| Videos published 2025 to 07-25, own counts: modeled +0.6% to +6.1% across scenarios | n/a | Unjudged | Modeled below. The readings alone allow up to +40% | Modeled immaterial; not established |
| Videos published 07-26 to 08-23, own counts: modeled +10% from cohort ratios (2.6% to 37.6% with each cohort's interval endpoints); scenarios +4.2% to +30.7% | n/a | Unjudged | Spans it | Unjudged. Mostly in the transition band the trial leaves out |

Other groups (added 2026-10-28). Creators, sponsors and Spot Sports' rankings inherit the per-video label against normal variation: material. None supplied a threshold, so materiality against a decision line is unjudged for them.

The labels apply to the cohort contrast. Reading it as the counting rule's effect assumes underlying viewing held level. The interval reflects channel sampling, not that assumption. **Revised after red-team review.** Write the contrast as C = M × D. M is public over engaged views for the post videos; D is their engaged views over the earlier videos' old count. These data observe C = 1.7435 and neither part. A long-form-only rise in viewing of 39% (pooled) or 70% (typical) would bring M down to 25% (`review_checks.csv`). A smaller rise leaves a large counting effect: D = 1.15 gives M = 1.52. The 39% is the rise that would change the call, not the rise needed to rule out any change in viewing. The long-form nulls are summer against summer, or September against September. The Shorts control crosses the season start, but with different calendar windows and ages, and Shorts demand may move differently. No check isolates the long-form season start under an unchanged rule.

Which reading of 25% applies? The owner wrote "if long-form views went up more than 25% because of this, we'll need to adjust how we rank or compare videos." The skill says a threshold stated for a total applies to the total. Here the action it guards is comparing videos, so I apply it per video. I show the total beside it so the owner can apply it the other way. The two readings give opposite answers today, the total one only under the model. Under the model, the total keeps climbing as post-switch videos fill the catalog. It crosses 25% when post-switch views reach 0.2 / (1 - 1/1.7435) = 47% of stored long-form views. The two scenarios put today's share at 24% and 33%. The readings alone allow 23% to 71%, so the data cannot show that the total is still below 25%.

### 4. Findings ranked by decision impact

**Revised after review (opus findings 1, 2 and 4; sol findings 1, 2 and 5). Revised again after round-2 review (findings 1, 2 and 4).**

1. **Lead.** The per-video cohort contrast is above 25% on both measures: pooled +74% (60% to 94%), typical +113% (96% to 131%). It decides "adjust" under the per-video reading, if the counting rule accounts for most of it. That is the leading explanation, not an established one. **Added 2026-10-28:** published measurements of the same plays are consistent once matched on channel size, 1.74 on this catalog's mix against 1.75 here (`04-diagnose-change.md` section 11). **Added after red-team review:** matching is what finds the step. A plain average over all channels gives +37% (70,900 vs 51,902 mean views, `decomposition_channel_mix.csv`). Matching each channel to itself gives +74%. The plain average halves the step, mostly because one high-view channel nearly stopped posting (A13).
2. **Lead.** No single factor fits. After dividing post views by 1.74, the typical post video is still 1.22 times its pre counterpart. Videos published 07-27 to 08-26 got 1.0x to 1.2x on the pooled measure. Most older videos' current counts already mix both rules. Ratios between cohort percentiles run from 2.7 at the 10th percentile to 1.7 at the 95th; their cause is unverified. Segment sizes vary (pooled: golf 1.34, soccer 2.14), within the noise seen where nothing changed. This decides the form of the adjustment: a rank within cohort, not a factor.
3. Secondary. The stored total: modeled about +12% (scenarios 10% to 19%); the readings alone allow 11% to 43%. It is what a dashboard total shows. It matters only under the total reading, and there the answer depends on the model.
4. Secondary. The full step starts with videos published 08-27, three days after YouTube's date. Cause unknown. It splits the 08-24 publish week: in the same channels, that week's 08-27 to 08-30 publishes drew 1.50 times (pooled) the views of its 08-24 to 08-26 publishes. That sets the trial's cohorts.
5. Secondary. Shorts did not rise: 0.85 pooled, 0.99 without one channel that held 17% of pre-group Shorts views. After the switch, long-form and Shorts are on the same count.
6. Dropped from the brief, with reasons. The Shorts typical-video dip (0.91): unexplained, does not change the call. The 2025 placebo: unequal ages, weak evidence. The false size gradient: a regression-to-the-mean artifact, corrected. The later-growth check: its windows cannot be matched, so it is weak support. Data defects: no claim moves. The vendor estimate of about +30% cited in the first draft: it matches Agentio's forecast before the change, which Agentio's own measurement (1.67) superseded. The size gradient on the pooled measure (1.85 to 1.49 by tier): measured by Agentio, suggestive here but not established, and it does not tilt ranks within a week, so it does not change the trial.

### 5. Options

**Revised after review (opus findings 1 and 2; sol findings 1 and 2; gemini finding 1). Revised again after round-2 review (findings 1 and 4).**

| Option | Effect, in goal units | Cost | Main risk | Reversible | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1. Trial: rank long-form videos by percentile of day-29 views within publish cohort. Cohorts are Monday-start publish weeks, except that 08-27 to 08-30 is its own cohort. The transition band, published 07-27 to 08-26, is left out and flagged | If the rule kept the order of videos within each cohort, the counting change does not move cohort ranks, whatever its size. Whether it did is untested. Transition-band videos get no rank in the trial | Unknown; owner to supply | The rule may reorder videos within a cohort, for example if its lift differs by channel; percentiles cannot correct that. Loses absolute comparison across weeks and erases real week-to-week differences, seasonal ones included. Day-29 readings exist for 18% to 72% of each old-rule week's long-form publishes (mid-June to late July; most earlier weeks have none) and 98% or more of new-rule weeks. Added 2026-10-28: feed plays count 5.0 times and watch-page plays 1.18 times (Agentio, theirs), so videos with more feed plays may climb within a week. Added after red-team review: a video has no day-29 rank for its first 28 days, so the trial needs another rule for new videos, and percentiles give no all-time list across weeks | Unknown; owner to confirm | Rank preservation within each cohort. Untested: it needs per-video old-rule counts. The success check (section 6) tests consequences across sports and channel sizes, not order within a channel |
| 2. Multiply long-form counts of videos published before 08-24 by 1.74 | Equalizes pooled views only, and only for frozen day-29 readings taken before 08-24 | Unknown | After scaling, the typical post video is still 1.22 times its pre counterpart. Scales new-rule views twice in 200,493 current counts. Mis-scales 07-27 to 08-26 publishes (1.0x to 1.2x). Ratios between cohort percentiles run 1.7 to 2.7; if the rule caused that spread, one factor over-corrects big videos and under-corrects small ones. Added 2026-10-28: Agentio measured 1.49 to 1.85 by channel size; ours points the same way, though our gradient is not established | Unknown | One factor fits every video. Contradicted by the residual typical-video gap, the transition cohorts and the mixed counts |
| 3. No change | None. Newer long-form videos keep outranking older ones they did not out-draw | None | Under the per-video reading, the owner's own rule requires action, so this is not an option there | n/a | The 25% means the stored total, and the modeled total (about +12%) holds. The readings alone allow 11% to 43% |

Kind of evidence. Option 1 rests on the size and shape of the step, which are descriptive, and on an untested assumption that the rule kept each cohort's order. The rule as cause rests on timing, a control that did not move, eliminated rivals and, added 2026-10-28, published same-play measurements that are consistent once matched on size. It does not rest on a randomized or calendar-matched design. Option 1 changes a formula. It is not an irreversible commitment, but its cost is not supplied. So it is framed as a trial on one ranking with a stated success check, and the owner confirms cost and reversibility.

### 6. Recommendation and trigger

**Revised after review. Revised again after round-2 review (findings 1 and 3).** Recommend option 1 as a trial on one ranking. The finding behind it is finding 2: the cohort contrast is above 25% but no single factor fits, so a rank within cohort avoids choosing one. Whether ranks within a cohort escape the counting change depends on the rule keeping each cohort's order, and that is untested. Confidence is high that the per-video cohort contrast exceeds 25%. **Revised after red-team review.** That a large part of it is the counting rule is the leading explanation, well supported: the step's timing, the Shorts control, the eliminated rivals, and published same-play measurements that, matched on channel size, give 1.74 against 1.75 here. How much of the 74% is counting is not established. These data observe the contrast, not the public-to-engaged multiplier, and the outside match rests on another population. No calendar-matched control exists in these data. It is high that a single multiplier misfits. Whether within-cohort ranks are unaffected is unknown: consequences across sports and channel sizes are checked and pass; order within a channel is not checked.

Success check for the trial, at comparable reading ages (day 29):

- Percentile is the mid-rank of a video's day-29 views within its cohort. For each channel with videos on both sides of the switch (old-rule cohorts vs cohorts published 08-27 on), take the shift in its mean percentile. Average the shifts by sport on the balanced channel weights.
- Pass if the spread (standard deviation) of sport shifts across the switch is no wider than across the narrower of two cutovers where nothing changed. Today: 1.4 percentile points across the switch, against 3.0 (published before vs after 07-01) and 2.5 (08-31 to 09-13 vs 09-14 on). Range at the switch: cycling -1.5 to cricket +3.7 (`trial_rank_check.csv`, table A15).
- **Added 2026-10-28.** The same check by channel size (`trial_rank_check_by_size.csv`): the smallest tier's shift minus the largest's is -0.9 percentile points across the switch, against +3.8 and -0.6 where nothing changed. It passes.
- Rerun when October publishes reach day 29 in late November. A fail stops the trial. It does not by itself reverse "adjust", because a season can also move sports.
- The quantiles in table A2 are not used as validation. Separately sorted groups always have ordered quantiles, even if videos swap places.

Checkable triggers for the call, each about the catalog's long-form videos:

- If the owner confirms the 25% meant the stored catalog total, the modeled answer today is no change: about +12% (scenarios 10% to 19%). That depends on one factor for every view and on the accrual scenarios. The readings alone allow 11% to 43%, so it is not established. Under the model it flips when post-switch views pass about 47% of stored long-form views (24% to 33% now under the two scenarios).
- Spot Sports refetches long-form at day 29. October-published videos reach day 29 by late November 2026. Rerun `scripts/run_all.py` (it needs the private extract) with the post group set to October publishes. **Revised after red-team review.** This is a stability check, not a reversal. It still observes the cohort contrast, not the multiplier: a counting effect of 1.74 with engaged demand at 70% of the earlier level would read 1.22. A pooled ratio under 1.25 prompts re-diagnosis. A large ratio does not confirm the multiplier either. Today October publishes read at 20-28 days give 1.55 (1.24 to 1.93).
- Reversing the counting estimate needs representative public and engaged counts on the same videos, matched by age and window: for example, days 1 to 29 for September 2026 long-form publishes from a random sample of the 746 matched channels. If public over engaged views, on the headline's balanced channel weights, has a channel-bootstrap interval wholly below 1.25, the call reverses. Reversing the estimate is separate from stopping or changing the ranking trial, which the success check governs.
- One creator's export of views and engaged views prompts investigation, not reversal. Compare its ratio with the catalog estimate and with its sport's and size third's estimates. Check whether ordering its same-week videos by views and by engaged views agrees, which tests rank preservation for that creator. A ratio under 1.25 would challenge attribution for that creator and justify asking more creators. It cannot overturn a 746-channel contrast on its own.

This is a proposal. The owner decides. Nothing here records it as accepted.

## Supporting analysis

Everything below regenerates from the source data with one command, run from `examples/spotsports-youtube/analysis`. The extract is private and not committed, so only someone holding it can rerun this. The result tables are public:

```sh
python3 -I scripts/run_all.py
```

It reads `../data/videos.sqlite` (and `videos.csv` for reconciliation) and `external/published_estimates.csv`, writes every table in `results/`, and prints the headline numbers. The console output of the last run is in `results/run_all_stdout.txt`. `scripts/external.py` prints nothing, so that output did not change when it was added. Runtime is about a minute. Python 3 standard library only.

| File | Role |
| --- | --- |
| `scripts/common.py` | Loading, timestamp parsing, reading records, channel sport |
| `scripts/explore.py` | Data map tables (`results/explore_*.csv`) |
| `scripts/metric.py` | The metric as defined (version 2), the channel bootstrap, and the Poisson fit |
| `scripts/diagnose.py` | Reproduction, decomposition, event study, null comparisons, sensitivity, segments, later growth, ranking, stored totals |
| `scripts/review.py` | Checks added after review: percentiles, transition cohorts, segment spread, one-factor checks; after round 2, within-week contrasts, the trial's success check, and stored-total scenario checks |
| `scripts/external.py` | Added 2026-10-28: the estimate on Agentio's size tiers, the trial check by size, and each group's units |
| `scripts/crosscheck.sql` | Independent SQL version of the headline estimate, both weightings |
| `scripts/run_all.py` | Entry script |
| `scripts/exploratory/` | First-look probes and the review re-check probes, kept as a record; not inputs to `results/` |

Step-by-step skill outputs: `skill-outputs/01-grill-question.md` to `06-analysis-review.md`. Source defect notes: `data-issues/`.

### What changed after review

Round 1: three reviews by AI models (Claude Opus 5.5, GPT-6.1 Sol, Gemini 4 Argon) found 15 issues. The core observation of each reproduced on the data. 13 are fixed and 2 partly fixed. Details and evidence: `skill-outputs/06-analysis-review.md`. The changes that move a number or the call:

- Channel weights are now balanced (n_pre·n_post/(n_pre+n_post)). The pooled measure moves 1.77 to 1.74, the typical 2.43 to 2.13. Version 1 let one or two channels with many pre and few post videos set too much of each.
- Both per-video measures now lead together, and the interval is labeled as channel sampling under a stated assumption.
- The multiplier option is rejected. The post/pre ratio differs by percentile (round 2: a cohort contrast, cause unverified). Most older counts mix both rules. The cohorts around the switch were only partly lifted.
- The stored-total method now counts post-switch views earned before a video's first refetch. The four weeks before the switch move from +3% to about +10%. The catalog total moves from +11.4% to about +12%. Round 2 relabeled both as modeled.
- The 2025 placebo is relabeled as unequal-age and no longer counts against seasonality.

Round 2: one review by an AI model (GPT-6.1 Sol) found 4 issues, 3 material and 1 minor. The core observation of each reproduced. All 4 are fixed. The per-video size and the call did not change. What did:

- The August 24 publish week mixes two counting regimes. In the same channels, its 08-27 to 08-30 publishes drew 1.50 times (pooled) the views of its 08-24 to 08-26 publishes. The ranking option now splits that week at 08-27 and leaves out the transition band, publishes 07-27 to 08-26. It is a trial with a success check at day 29. Removed: the claim that it "handles late-August videos", and the claim that ordered percentiles show the rule kept videos' order.
- The stored-total "low" and "high" bounds are now named scenarios (flat-rate, even-spread). They are not bounds: for 1,183 videos the "low" accrual exceeds the "high" one. The readings alone allow +10.7% to +43.4%. About +12% is a modeled estimate, and the answer under the total reading is conditional on it. "At most", "measured" and "2% or less" are gone.
- One creator's export now prompts investigation. A reversal needs evidence about the catalog: the October rerun or engaged views from a random sample of matched channels. (Red-team round: the October rerun now prompts re-diagnosis only.)
- Percentile ratios and the 10,000-view example are described as cohort summaries, not per-video conversion factors.

Red-team round: three AI models read the deck and the analysis as a measurement statistician, a sponsor's analytics lead and a data executive. Their reviews are in `reviews/red-team-*.md`. Wording changed. No number did. What changed:

- The +74% is a cohort contrast. The counting rule is its leading explanation, not an established one. "Nobody watched more" and its kin are gone. The stable-viewing assumption sits beside the estimate, and the intervals are labeled as channel sampling only.
- The old threshold is unpublished. "Under 30 seconds" became "not counted as engaged views". The claim that added plays reached no sponsor read is removed.
- The sponsor figures are one scenario with stated assumptions. A real deal uses the creator's own engaged views, traffic sources and retention at the read.
- Agentio corroborates. It measures a different quantity, and the catalog's own size gradient is suggestive.
- The October rerun prompts re-diagnosis. A reversal needs public and engaged counts on the same videos.

### Question

Owner's ask, verbatim: "How much did this change move our long-form numbers? I just want it sized. If long-form views went up more than 25% because of this, we'll need to adjust how we rank or compare videos."

Settled by the owner: size it; act above 25%. Sharpened: by what percent did the 2026-08-24 rule raise long-form view counts per video, compared with what the old count (engaged views) would have counted for the same plays, and is that above 25%? Open: whether 25% refers to the per-video lift or the catalog total. Both are reported. Detail: `skill-outputs/01-grill-question.md`.

### Data

One table, one row per video, `video_key` unique (535,168 rows, 1,070 channels; about 900 active per month in 2026). Views are lifetime counts overwritten at each fetch. Each video keeps at most two readings plus zero at publish. The CSV matches the SQLite table exactly on rows, total views (35,711,958,856), format counts, and keys (`results/explore_csv_reconciliation.csv`).

Spot Sports refetches long-form near age 29 days and Shorts near age 13 days (`results/explore_age_histogram.csv`). That gives clean comparisons at a fixed age. Counts by side of the switch are in appendix table A11. **Revised after review:** the table now separates readings from distinct videos.

Data issues (all minor for the headline; notes in `data-issues/`):

| Issue | Size | Effect |
| --- | --- | --- |
| `prev_view_count` without its timestamp | 35,189 rows, 32,987 of them June-August 2026 Shorts | Shorts control cannot use matching calendar weeks |
| Readings stamped before `ingested_at` | 1,881 last, 5,960 earlier | Headline unchanged when dropped |
| Sport "Unassigned" stops after August 2026 | 43,752 videos | Channel's modal sport used for splits |
| Durations above one day; null view counts | 133; 4,132 | Dropped or end bands; no effect |

Limits: no engaged views; only videos still on YouTube; format null for 517 recent videos; 19,035 readings stamped after 2026-10-28 00:00 UTC although the extract is dated 2026-10-27 (likely local time); no 2025 long-form readings at young ages.

### Metric (version 2)

Long-form views at age 28-30 days, within channel. Pre: reading taken before 2026-08-24 00:00 UTC. Post: published on or after 2026-08-31 (one-week buffer). One reading per video, closest to 29 days. Channels with videos in both groups. Channel weight w_c = n_pre,c × n_post,c / (n_pre,c + n_post,c). Primary, pooled views: R = Σ w_c × mean_post,c / Σ w_c × mean_pre,c. Secondary, typical video: the same weights on mean ln(1+views). Interval: 2,000 channel bootstrap resamples. It covers channel sampling, not a change in underlying viewing between the cohorts. Status: proposed, not owner-approved. **Revised after review:** version 1 weighted by n_pre,c. Detail: `skill-outputs/03-define-metric.md`.

### Headline and cross-check

Pooled 1.74 (1.60 to 1.94). Typical video 2.13 (1.96 to 2.31). Shorts 0.85 (0.62 to 1.08) and 0.91 (0.84 to 0.99). Python and SQL agree to four decimals on both formats and both weightings. Appendix table A1.

The SQL that produced the cross-check (`scripts/crosscheck.sql`, run with `fmt=0, lo=28, hi=30` and `fmt=1, lo=12, hi=14`):

```sql
with r as (
  select video_key, channel_key, is_yt_short f, published_at p, prev_view_count_at t, prev_view_count v
  from videos where prev_view_count_at is not null and prev_view_count is not null
  union all
  select video_key, channel_key, is_yt_short, published_at, last_stats_check, view_count
  from videos where last_stats_check is not null and view_count is not null),
a as (select *, julianday(substr(t,1,19)) - julianday(substr(p,1,19)) age from r where f = :fmt),
w as (select *, row_number() over (partition by video_key order by abs(age - (:lo + :hi) / 2.0)) rn
      from a where age >= :lo and age < :hi),
g as (select channel_key,
             case when t < '2026-08-24' then 'pre' when p >= '2026-08-31' then 'post' end grp, v
      from w where rn = 1),
c as (select channel_key, sum(grp = 'pre') npre, sum(grp = 'post') npost,
             avg(case when grp = 'pre' then v end) mpre, avg(case when grp = 'post' then v end) mpost
      from g where grp is not null group by 1 having npre > 0 and npost > 0)
select count(*) channels, sum(npre) pre_videos, sum(npost) post_videos,
       sum(1.0 * npre * npost / (npre + npost) * mpost) / sum(1.0 * npre * npost / (npre + npost) * mpre) ratio_balanced,
       sum(npre * mpost) / sum(npre * mpre) ratio_pre_weights
from c;
```

### Reproduction and mix

`results/reproduce_pooled.csv`, `results/decomposition_channel_mix.csv`. Pooled over all channels, long-form at day 29: mean 51,902 to 70,900 (1.37x), median 7,569 to 12,986 (1.72x), geometric mean 5,891 to 12,195 (2.07x). Within the 746 common channels, mean views per video rose by 21,068. The within-channel term is +39,518. The mix term is -18,450. **Revised after review:** -17,105 of the mix term is one channel, whose share of videos fell from 1.8% to 0.04%. The other 745 channels contribute -1,345. Appendix table A13. **Added after red-team review.** This is why the method matters. The plain average says +37%. Matching each channel to itself says +74%.

### Comparisons where nothing changed

Same estimator, appendix table A5. Null spread: pooled 0.85 to 0.97, typical 0.91 to 1.06. These are four point estimates with different windows and channel sets, not a calibrated null distribution; their own pooled intervals reach 0.62 to 1.20. The long-form null within the new rule, 0.89 (0.81 to 0.98), excludes 1: September publishes drift down. **Revised after review:** the 2025 placebo compares counts at about 329 and 267 days old, so it is labeled unequal-age and kept out of the spread. Shorts across the switch read 0.85; without one channel that held 17.4% of pre-group Shorts views they read 0.99.

### Timing

`results/event_study.csv`, `results/transition_lift.csv`. Appendix tables A3 and A4. **Revised after review:** both measures, with weekly intervals, under the headline's weights. Version 1 showed a different geometric measure under the label "Ratio". The full step starts with videos published 2026-08-27. Publishes from 07-27 to 08-26 show 1.0x to 1.2x on the pooled measure. On the pooled measure by day, 08-26 reads 1.43 and 08-27 reads 1.83. Seasonality does not move in a day. Why the step lands three days after YouTube's date is not known.

**Revised after round-2 review.** The 2026-08-24 publish week straddles the step. Comparing its 08-27 to 08-30 publishes with its 08-24 to 08-26 publishes directly, in the same 453 channels: 1.50 pooled (1.19 to 1.87), 1.67 typical (1.52 to 1.82) (`within_week_contrast.csv`, appendix table A14). The same Thursday-to-Sunday vs Monday-to-Wednesday split in weeks under one rule ranges 0.74 to 1.41 pooled and 0.90 to 1.99 typical. The 1.99 is a week in which one channel posted a batch of zero-view videos; without that channel it reads 1.51 (`scripts/exploratory/round2_probe2.py`). So a within-week split is noisy, and the boundary at 08-27 rests on the step against the common pre group (A3) and the daily series. Transition band, from these data: publishes 07-27 to 08-26. Week 07-27 is the first whose day-29 readings were all taken after 08-24 (A4 note). Publishes through 08-26 show only partial lift, pooled 1.01 to 1.19 and typical 1.07 to 1.29 (A3). The full step starts with 08-27 publishes.

### Growth after day 29 (weak support)

`results/straddler_growth.csv`. Per unit of log age, growth after day 29 is 1.3 times as fast when the base was counted under the old rule (0.071 vs 0.054). **Revised after review:** version 1 said 1.7 to 2.3 times, from windows of unequal length (40 vs 30 days) that cannot be matched in these data. The check is consistent with the rule applying to new plays on older videos. It cannot size the effect.

### Segments

`results/lift_by_segment.csv`, `results/segment_dispersion.csv`. Appendix tables A6 and A7. **Revised after review:** point estimates are above 1 in every sport, length, and size third, but sizes vary. On the pooled measure, intervals include 1 for running, cycling, and 60 seconds or less. Tennis 1.44 (1.12 to 1.72) and golf 1.34 (1.10 to 1.71) exclude the headline 1.74. The spread across segments at the switch is no wider than at two cutovers where nothing changed. The data cannot tell real segment differences from noise.

### Sensitivity

`results/sensitivity.csv`, appendix table A8. Lowest pooled point estimate 1.46 (equal channel weights). Lowest interval bound 1.24, from October publishes read at 20-28 days. Their age-matched 26-28 day version gives 1.54 (1.27 to 1.89). Lowest typical-video bound 1.74.

### Rival explanations

| Explanation | Test | Result |
| --- | --- | --- |
| Counting rule | Timing, Shorts control, segments, cohorts around the switch; added 2026-10-28, published same-play measurements | Leading explanation for a large part of the contrast. How much is not established. Pooled 1.74 (1.60 to 1.94), typical 2.13 (1.96 to 2.31), both cohort contrasts. Agentio's measured ratios on this catalog's size mix: 1.74 |
| Sports seasonality | One-day step, off-season sports, Shorts | Not the main cause on this evidence. A part cannot be excluded. The pre group's summer includes the World Cup (06-11 to 07-19); the post group meets football and European soccer kickoffs. The long-form nulls do not cross that boundary. Football and soccer sit above golf and tennis, within null noise; basketball, mostly off-season, reads 1.90; publishes from 09-14 run 11% below 08-31 to 09-13. **Revised:** the 2025 placebo is no longer used here |
| Channel mix | Within vs mix decomposition | Rejected; mix is negative and mostly one channel |
| Length or live mix | Duration bands; median duration 756 s vs 727 s (`review_checks.csv`) | Rejected |
| Reading artifact, selective refetch, weighting | Earlier-readings-only 1.76; covered vs uncovered 1.017; defect rows dropped; PPML 1.74; version-1 weights 1.77 | Rejected |
| Shorts also changed | Shorts step | Rejected; Shorts 0.85, 0.99 without one channel. Typical-video dip (0.91) unexplained |
| Effective date | Publish windows around the switch | **Revised:** the full step starts with 08-27 publishes. Not material to the size; material to any date-keyed or week-keyed rule, so the trial splits the 08-24 week |
| Retroactive restatement | Growth of pre-switch videos after day 29 | Rejected; +6.5% by day 68 |

What would overturn the call: a long-form-only rise in underlying viewing near 39% (pooled) or 70% (typical) from May-July to September publishes, or representative engaged-view data showing engaged views rose that much. A smaller rise would shrink the counting share without changing the call.

### Stored totals and the one-factor checks

`results/stock_translation.csv`, `results/review_checks.csv`, `results/quantile_ratios.csv`. Appendix tables A2, A9 and A10. **Revised after review:** version 1 counted no post-switch views between the switch and a video's first refetch when that refetch came after the switch. The method docstring in `stock()` (`scripts/diagnose.py`) gives each accrual rule.

**Revised after round-2 review.** Every stored-total figure is modeled. Each assumes one factor R for every post-switch view and a shape for the unobserved accrual curve. The flat-rate scenario holds the refetch-to-refetch rate back to the switch. The even-spread scenario spreads the first count evenly from publish. Videos without a usable pair get their publish month's average share. Round 1 called these low and high bounds. They are not: for 1,183 paired videos the flat-rate accrual exceeds the even-spread one (40.5 million vs 33.5 million views summed). The largest such video, published 2026-03-01, read 12,849,337 on 09-25 and 15,232,436 on 10-25; the two rules give 4,925,441 and 4,379,638 post-switch views (`review_checks.csv`). The widest range the timestamps allow, if counts never fall and were not restated, is 3.85 to 12.03 billion post-switch views: +10.7% to +43.4% on the stored total at R = 1.7435. The transition cohort's +10% applies its day-29 cohort ratios to first counts. No old-rule count is observed, so it is modeled too. Its 2.6% to 37.6% plugs in the cohort interval endpoints and leaves out accrual-model uncertainty.

### Published estimates of the same change

**Added 2026-10-28.** `external/published_estimates.csv` lists them with links. They were supplied and not re-fetched. Code: `scripts/external.py`. Detail: `skill-outputs/04-diagnose-change.md` section 11. Appendix tables A16 and A17.

What each measures. Ours puts day-29 public views of post-switch videos over day-29 public views of the same channels' earlier videos. It reads the rule's effect only if viewing per video held level between those cohorts. Agentio (75,000+ videos, plays after 08-24) and Podtrac (podcast channels, 08-27 to 08-28) put public views over engaged views on the same plays. Engaged views are YouTube's name for the old count, still shown to owners. **Revised after red-team review.** YouTube has not published the old organic-view threshold. 30 seconds is the commonly assumed proxy, taken from the paid-ad convention (Agentio's methodology page, as read by the red-team measurement review; not re-fetched here). So this report says "not counted as engaged views", not "under 30 seconds".

The two are different estimands. Write ours as C = M × D: M is public over engaged views on the post videos, and D is their engaged views over the earlier videos' old count. Agentio and Podtrac measure M on their own populations. Ours observes only C. C equals M only if D = 1, meaning viewing held level, and only if the multiplier transports from their creators to ours. A match is consistent with both conditions. It cannot show either. Gaps can come from channel size, traffic source, video age, content and, for ours, a change in viewing.

Size is the one we can match. Agentio's ratio falls with channel size: 1.85, 1.77 and 1.49 for average views per video under 50k, 50k to 300k, and 300k+. Its overall 1.67 implies its 300k+ tier holds at least (1.77 - 1.67) / (1.77 - 1.49) = 36% of its engaged views. That tier holds 17% of ours. Our tiers use each channel's mean old-rule count over its videos outside the estimate, so the split does not depend on the outcome. The tier measure was chosen with Agentio's figures in view. Other measures are shown in A16.

| Tier | Channels | Ours, pooled (95%) | Agentio |
| --- | --- | --- | --- |
| Under 50k | 579 | 1.85 (1.64 to 2.08) | 1.85 |
| 50k to 300k | 133 | 1.79 (1.57 to 2.08) | 1.77 |
| 300k+ | 22 | 1.49 (1.22 to 1.78) | 1.49 |
| All tiered | 734 | 1.75 (1.60 to 1.94) | 1.67; 1.74 on our tier mix |

Agentio's tier ratios weighted by our tiers' shares of pooled old-rule views: 0.1908 × 1.85 + 0.6402 × 1.77 + 0.1690 × 1.49 = 1.74. Ours is 1.007 times that. The two are consistent in size after this illustrative size standardization. If the rule's effect here equalled Agentio's on the same size mix, D would be 1.007, with our interval allowing 0.92 to 1.12. That is a conditional reading, not a measurement of viewing. The call needs +39% to reverse. The 300k+ match is fragile: 22 channels, 163 post videos, interval 1.22 to 1.78, and under other tier measures that tier reads 1.58, or 1.74 (1.33 to 2.26). The small and large tiers' intervals overlap. So the catalog's own size gradient is suggestive, not established. Size mix may explain the gap to Agentio's 1.67, but age, traffic source and population can differ within tiers too. A size gradient does not tilt ranks within a publish week (A17).

Other estimates. Podtrac's podcast channels read 1.56 and 1.72; our videos over 20 minutes read 1.64 to 1.70. Agentio's forecast before the change, 1.30, matches the vendor figure of about +30% the first draft set aside; Agentio's own measurement superseded it. Agentio's plays from feeds read 5.0 and from the watch page 1.18. These data have no traffic source, so that split cannot be checked here. It is the main threat to the trial's assumption that each week keeps its order. Agentio operates in creator sponsorship (red-team review, not checked here), so its figures do not come from a neutral party.

Public coverage from the first run, searched 2026-10-28 and not re-checked: the new count applies to future plays, existing counts were not restated, and Shorts already counted on play from March 2025. Sources consulted then: [vidIQ](https://vidiq.com/blog/post/youtube-view-count-update/), [Android Authority](https://androidauthority.com/youtube-view-count-change-3699493), [Notebookcheck](https://www.notebookcheck.net/YouTube-view-counts-change-today-one-frame-is-now-a-view.1376778.0.html), [LiveReacting](https://blog.livereacting.com/youtubes-new-view-count-rule-what-changes-august-24/), [OutlierKit](https://outlierkit.com/resources/youtube-view-count-change/), [Daring Fireball](https://daringfireball.net/linked/2026/09/18/youtube-view-counts).

### What this analysis does not claim

- It does not measure engaged views. The old-rule count after the switch is inferred, not observed. The +74% is a same-channel, same-age cohort contrast. Reading it as the counting rule's effect assumes underlying viewing held level. Its intervals cover channel sampling only.
- It does not show that nobody watched more, or that the added plays reached no sponsor read. YouTube has not published the old threshold, and these data have no retention at any read.
- The rule as cause rests on timing, a control that did not move, and the elimination of rivals. There is no randomized or calendar-matched design.
- It does not show the lift is the same for every sport or size. It does not show it differs either. Agentio measured a size gradient. The tiers here point the same way, but the largest tier rests on 22 channels and moves with the tier measure, so the gradient here is suggestive.
- The published estimates were supplied, not fetched. They cover other creators, and Agentio does not say whether its sample includes Shorts. They measure the public-to-engaged multiplier on other creators; ours is a cohort contrast. Their agreement is corroboration, not equivalence. It supports the stable-viewing assumption. It does not prove it.
- It does not measure the stored-total lift. About +12% is modeled, with one factor for every view and an accrual scenario. The readings alone allow 11% to 43%.
- It does not show the rule kept the order of videos within a publish week. The trial's check tests one consequence across sports, not the order within a channel.
- The sponsor figures (42.6%, 1.74 per engaged view, 57.4%) are one scenario on the catalog contrast. They are not any deal's economics.
- The percentile ratios (table A2) and the 10,000-view illustrations summarize cohorts. They are not conversion factors for individual videos.
- Definitions are proposed. The owner has not approved them, or the recommendation.
- Three round-1 reviews, one round-2 review and three red-team reviews were addressed (`skill-outputs/06-analysis-review.md`). Every reviewer was an AI model. That is not approval. No human review is recorded. The claims still unverified are listed there.

## Appendix: data tables

Each table is a compact view of a file in `results/`. Ratios are post over pre unless stated. Intervals are 95% channel bootstrap percentiles.

### A1. Headline, both per-video measures

Source: [primary_lift.csv](results/primary_lift.csv), [sql_crosscheck.csv](results/sql_crosscheck.csv).

| Estimate | Pooled views | Typical video | Channels | Pre videos | Post videos | Mean age pre / post (days) |
| --- | --- | --- | --- | --- | --- | --- |
| Long-form, age 28-30 days | 1.74 (1.60 to 1.94) | 2.13 (1.96 to 2.31) | 746 | 13,254 | 23,962 | 28.8 / 29.1 |
| Shorts, age 12-14 days | 0.85 (0.62 to 1.08) | 0.91 (0.84 to 0.99) | 554 | 39,485 | 28,742 | 13.5 / 13.1 |
| SQL check, long-form | 1.7435 (version-1 weights 1.7711) | | 746 | 13,254 | 23,962 | |
| SQL check, Shorts | 0.8462 (version-1 weights 0.8144) | | 554 | 39,485 | 28,742 | |

### A2. Ratios between cohort percentiles

Source: [quantile_ratios.csv](results/quantile_ratios.csv). Long-form at day 29, both sides weighted to the same channel weights. **Revised after round-2 review:** these compare separately sorted groups of different videos. They are not paired measurements, not correction factors for videos of a given size, and their cause is unverified. A change in the distribution's shape would produce the same pattern.

| Percentile | Pre views | Post views | Post / pre |
| --- | --- | --- | --- |
| 10th | 409 | 1,109 | 2.71 |
| 25th | 1,652 | 3,865 | 2.34 |
| 50th | 7,264 | 14,638 | 2.02 |
| 75th | 30,141 | 54,112 | 1.80 |
| 90th | 91,635 | 161,948 | 1.77 |
| 95th | 175,033 | 299,337 | 1.71 |
| 99th | 510,950 | 935,543 | 1.83 |

### A3. Videos published around the switch

Source: [transition_lift.csv](results/transition_lift.csv). Day-29 views against the same pre group, same channels and weights.

| Published | Pooled | Typical | Channels | Videos |
| --- | --- | --- | --- | --- |
| 07-27 to 08-09 | 1.01 (0.83 to 1.24) | 1.07 (1.00 to 1.15) | 688 | 7,775 |
| 08-10 to 08-19 | 1.19 (0.94 to 1.56) | 1.11 (1.01 to 1.23) | 541 | 2,663 |
| 08-20 to 08-23 | 1.05 (0.85 to 1.30) | 1.29 (1.15 to 1.49) | 527 | 2,562 |
| 08-24 to 08-26 | 1.19 (1.03 to 1.39) | 1.29 (1.19 to 1.40) | 522 | 2,181 |
| 08-27 to 08-30 | 1.99 (1.69 to 2.34) | 2.37 (2.07 to 2.79) | 546 | 3,200 |
| 08-31 on (primary post group) | 1.74 (1.59 to 1.94) | 2.13 (1.97 to 2.31) | 746 | 23,962 |

**Added after round-2 review.** Transition band for ranking: publishes 07-27 to 08-26. The rows from 07-27 to 08-26 show partial lift; the full step starts with 08-27. The trial leaves the band out.

### A4. By publish week

Source: [event_study.csv](results/event_study.csv). Long-form day-29 views against each channel's pre-group level. Pre-period weeks are part of that pre-group level. 500 resamples.

| Week starting | Videos | Pooled | Typical |
| --- | --- | --- | --- |
| 2026-06-15 | 1,502 | 0.99 (0.82 to 1.13) | 0.94 (0.87 to 1.00) |
| 2026-06-22 | 2,118 | 0.99 (0.83 to 1.13) | 0.95 (0.86 to 1.04) |
| 2026-06-29 | 2,176 | 1.13 (1.04 to 1.20) | 1.15 (1.06 to 1.26) |
| 2026-07-06 | 917 | 0.94 (0.81 to 1.17) | 1.04 (0.95 to 1.14) |
| 2026-07-13 | 3,181 | 0.97 (0.87 to 1.09) | 0.99 (0.94 to 1.05) |
| 2026-07-20 | 3,319 | 0.98 (0.82 to 1.12) | 1.04 (0.96 to 1.14) |
| 2026-07-27 | 3,224 | 1.01 (0.78 to 1.41) | 1.04 (0.95 to 1.13) |
| 2026-08-03 | 4,551 | 1.01 (0.85 to 1.21) | 1.11 (1.02 to 1.22) |
| 2026-08-10 | 890 | 1.36 (1.04 to 1.83) | 1.28 (1.09 to 1.47) |
| 2026-08-17 | 4,335 | 1.07 (0.88 to 1.31) | 1.18 (1.07 to 1.30) |
| 2026-08-24 | 5,381 | 1.66 (1.46 to 1.96) | 1.86 (1.66 to 2.13) |
| 2026-08-31 | 6,089 | 1.67 (1.45 to 1.95) | 2.10 (1.92 to 2.29) |
| 2026-09-07 | 5,604 | 2.06 (1.82 to 2.35) | 2.26 (2.04 to 2.50) |
| 2026-09-14 | 5,357 | 1.76 (1.55 to 1.98) | 2.09 (1.95 to 2.22) |
| 2026-09-21 | 5,247 | 1.64 (1.43 to 1.89) | 2.02 (1.83 to 2.32) |
| 2026-09-28 | 1,665 | 1.65 (1.37 to 1.91) | 2.17 (1.88 to 2.54) |

Weeks through 07-20 were read before the switch, except 753 videos in the 07-20 week, read on or just after 08-24 at day 28 to 30. Weeks 07-27 to 08-17 were read after it and straddle it. **Added after round-2 review:** the 08-24 row mixes partly lifted 08-24 to 08-26 publishes with fully lifted 08-27 to 08-30 publishes (A3). It is a timing diagnostic, not a ranking cohort; A14 splits it. Shorts, typical measure: 0.92 to 1.08 per week from mid-March to early June, 0.84 to 0.97 in September and October.

### A5. Comparisons where nothing changed

Source: [null_comparisons.csv](results/null_comparisons.csv).

| Comparison | In null spread | Pooled | Typical | Channels |
| --- | --- | --- | --- | --- |
| Long-form, published before vs after 07-01, all read before the switch | yes | 0.96 (0.80 to 1.20) | 1.06 (0.97 to 1.15) | 623 |
| Long-form, published 08-31 to 09-13 vs 09-14 on | yes | 0.89 (0.81 to 0.98) | 0.95 (0.88 to 1.01) | 757 |
| Shorts, published before vs after 05-01, all read before the switch | yes | 0.97 (0.80 to 1.19) | 1.03 (0.96 to 1.10) | 341 |
| Shorts across the switch | yes | 0.85 (0.62 to 1.08) | 0.91 (0.84 to 0.99) | 554 |
| Shorts across the switch, without the channel holding 17.4% of pre views | check | 0.99 (0.88 to 1.11) | 0.91 (0.83 to 0.99) | 553 |
| Long-form 2025 placebo, ages 329 vs 267 days | no | 0.88 (0.72 to 1.10) | 0.70 (0.37 to 0.97) | 335 |
| Shorts 2025 placebo, ages 48 vs 179 days | no | 2.42 (0.61 to 7.66) | 1.04 (0.87 to 1.27) | 48 |

### A6. Segments, within channel

Source: [lift_by_segment.csv](results/lift_by_segment.csv). Long-form, 1,000 resamples.

| Segment | Channels | Pooled | Typical |
| --- | --- | --- | --- |
| Soccer | 171 | 2.14 (1.62 to 2.84) | 2.31 (1.85 to 2.87) |
| Basketball | 93 | 1.90 (1.43 to 2.47) | 2.12 (1.65 to 2.64) |
| Baseball | 85 | 1.56 (1.48 to 1.81) | 1.97 (1.78 to 2.27) |
| Running | 68 | 1.47 (0.85 to 2.51) | 2.01 (1.62 to 2.52) |
| Hockey | 58 | 1.80 (1.57 to 2.18) | 1.94 (1.73 to 2.21) |
| Golf | 55 | 1.34 (1.10 to 1.71) | 1.87 (1.54 to 2.14) |
| Football | 49 | 2.12 (1.60 to 3.71) | 2.35 (1.92 to 2.99) |
| Tennis | 28 | 1.44 (1.12 to 1.72) | 1.87 (1.57 to 2.28) |
| General Sports | 25 | 1.56 (1.34 to 2.21) | 2.07 (1.68 to 2.50) |
| Rugby | 24 | 1.81 (1.43 to 2.26) | 2.29 (1.79 to 2.84) |
| Cricket | 19 | 1.67 (1.29 to 2.40) | 2.34 (1.83 to 3.04) |
| Cycling | 19 | 1.18 (0.82 to 1.81) | 1.39 (1.12 to 1.95) |
| Fantasy Sports | 14 | 2.04 (1.38 to 3.02) | 2.05 (1.39 to 3.00) |
| Swimming | 14 | 2.54 (1.78 to 5.67) | 2.22 (1.67 to 3.66) |
| 60 s or less | 49 | 1.58 (0.64 to 3.28) | 2.42 (1.69 to 3.12) |
| 61-180 s | 170 | 2.15 (1.45 to 3.62) | 2.39 (2.04 to 2.69) |
| 3-10 min | 348 | 1.60 (1.33 to 1.94) | 1.94 (1.78 to 2.11) |
| 10-20 min | 373 | 1.72 (1.50 to 1.99) | 1.96 (1.75 to 2.21) |
| 20-60 min | 424 | 1.70 (1.40 to 2.05) | 2.19 (1.95 to 2.52) |
| Over 60 min | 313 | 1.64 (1.41 to 1.91) | 2.03 (1.81 to 2.26) |
| Smallest third (Jan-Apr median views) | 237 | 1.56 (1.22 to 1.95) | 2.21 (1.91 to 2.68) |
| Middle third | 237 | 2.06 (1.69 to 2.46) | 2.06 (1.87 to 2.27) |
| Largest third | 239 | 1.69 (1.52 to 1.89) | 1.99 (1.80 to 2.20) |
| Same thirds, null split before vs after 07-01 | 175 to 207 | 0.81, 1.23, 1.00 | 0.96, 1.05, 1.06 |

Shorts by sport, pooled: 0.39 to 2.00. No Shorts sport has an interval wholly above 1.25.

### A7. Segment spread at the switch vs where nothing changed

Source: [segment_dispersion.csv](results/segment_dispersion.csv). Standard deviation of log ratios across segments.

| Dimension | Measure | At the switch | Null: before vs after 07-01 | Null: 08-31 to 09-13 vs 09-14 on |
| --- | --- | --- | --- | --- |
| Sport (14) | Pooled | 0.21 | 0.38 | 0.25 |
| Sport (14) | Typical | 0.14 | 0.22 | 0.16 |
| Duration (6) | Pooled | 0.11 | 0.23 | 0.66 |
| Duration (6) | Typical | 0.10 | 0.10 | 0.07 |
| Size (3) | Pooled | 0.14 | 0.21 | 0.08 |
| Size (3) | Typical | 0.05 | 0.05 | 0.05 |

### A8. Sensitivity

Source: [sensitivity.csv](results/sensitivity.csv).

| Variant | Pooled | Typical |
| --- | --- | --- |
| Primary | 1.74 (1.60 to 1.94) | 2.13 (1.96 to 2.31) |
| Version-1 weights (pre count) | 1.77 (1.60 to 1.94) | 2.43 (2.03 to 3.10) |
| Equal weight per channel | 1.46 (1.27 to 1.78) | 2.03 (1.91 to 2.15) |
| Poisson, channel fixed effects | 1.74 (1.60 to 1.91) | n/a |
| Post from 08-24 / 08-27 / 09-07 | 1.72 / 1.78 / 1.79 | 2.09 / 2.17 / 2.13 |
| Age 27-31 / 28.5-29.5 days | 1.71 / 1.74 | 2.10 / 2.19 |
| Age 20-28 days (ages 26.0 vs 24.1) | 1.55 (1.24 to 1.93) | 2.02 (1.81 to 2.31) |
| Age 26-28 days (ages 27.2 vs 27.0) | 1.54 (1.27 to 1.89) | 1.98 (1.74 to 2.35) |
| Pre group July only | 1.69 (1.53 to 1.90) | 2.06 (1.91 to 2.22) |
| Post group 09-14 on only | 1.66 (1.49 to 1.88) | 2.06 (1.89 to 2.27) |
| Drop readings stamped before ingestion | 1.74 | 2.13 |
| Drop long-form at or under 60 s | 1.73 | 2.12 |
| Drop durations over one day or null | 1.74 | 2.13 |
| Post group earlier readings only | 1.76 (1.59 to 1.95) | 2.15 (1.99 to 2.32) |
| Drop top 1% channels by pre views | 1.85 (1.66 to 2.07) | 2.14 (1.96 to 2.33) |
| Drop the channel with the largest version-1 numerator share | 1.74 (1.59 to 1.92) | 2.12 (1.97 to 2.31) |
| Long-form / Shorts, channels with both | 2.09 (1.60 to 2.82) | 2.33 (2.08 to 2.61) |
| Same, without the dominant Shorts channel | 1.79 (1.56 to 2.04) | 2.33 (2.07 to 2.61) |

### A9. Stored totals (modeled)

Source: [stock_translation.csv](results/stock_translation.csv), [review_checks.csv](results/review_checks.csv). **Revised after round-2 review:** round 1 labeled the two accrual columns low and high bounds. They are scenarios, and they cross for 1,183 paired videos. Every column assumes one factor R = 1.7435 for every post-switch view. Flat rate: the refetch-to-refetch rate held back to the switch. Even spread: the first count spread evenly from publish. Readings alone: the widest accrual the timestamps allow if counts never fall and were not restated.

| Videos | Stored views | Share | Flat-rate scenario | Even-spread scenario | Readings alone |
| --- | --- | --- | --- | --- | --- |
| Published on or after 08-24 | 3,676,114,016 | 21.7% | +74.4% | +74.4% | +74.4% |
| Published 07-26 to 08-23 | 1,030,638,645 | 6.1% | +4.2% | +30.7% | +2.9% to +74.3% |
| Published 2026-01-01 to 07-25 | 7,775,150,749 | 45.8% | +1.6% | +6.1% | +0.4% to +40.0% |
| Published 2025 | 4,481,464,795 | 26.4% | +0.6% | +2.4% | +0.3% to +25.3% |
| All long-form | 16,963,368,205 | 100% | +11.6% (10.0% to 13.4% over R's interval) | +16.2% (13.9% to 18.8%) | +10.7% to +43.4% (9.3% to 52.3% over R's interval) |

Modeled estimate, about +12.0%: the flat-rate scenario, with the 07-26 to 08-23 cohort's 20,382 paired videos (1,019,831,444 stored views) modeled from their day-29 cohort ratios (table A3) on the first count and the full factor on later growth. That cohort reads +10.2%. Plugging in each cohort's interval endpoints gives 2.6% to 37.6%; that range leaves out accrual-model uncertainty. Post-switch views as a share of stored long-form views: 24.3% (flat rate), 32.6% (even spread), 22.7% to 70.9% (readings alone). Under the model the total reaches +25% at 47%.

### A10. Applying one factor to current counts

Source: [review_checks.csv](results/review_checks.csv).

| Check | Value |
| --- | --- |
| Long-form videos published before 08-24 | 223,818 |
| Of which last read on or after 08-24 (count mixes both rules) | 200,493, holding 11,680,484,403 views |
| Published before 08-20 with both readings after the switch | 132,461; 164,394,511 views added between readings |
| Of those, ×1.74 overstates the new-rule count by more than 25% (lower bound) | 104 |
| Typical-video ratio after dividing post views by 1.74 | 1.22 (1.13 to 1.32) |
| Rise in underlying viewing that would bring the effect to 25%, pooled / typical | 1.39 / 1.70 |

### A11. Readings and videos at the standard age

Source: [explore_standard_age_videos.csv](results/explore_standard_age_videos.csv).

| Format | Accrual | Readings | Distinct videos |
| --- | --- | --- | --- |
| Long-form, 28-30 days | All before the switch | 13,618 | 13,618 |
| Long-form, 28-30 days | All after (published on or after 08-24) | 56,247 | 30,535 |
| Long-form, 28-30 days | Straddles | 13,933 | 13,933 |
| Shorts, 12-14 days | All before | 45,224 | 39,876 |
| Shorts, 12-14 days | All after | 60,913 | 31,042 |
| Shorts, 12-14 days | Straddles | 2 | 2 |

### A12. Ranking illustration

Source: [ranking_illustration.csv](results/ranking_illustration.csv). Pool: 37,216 long-form videos with a day-29 reading in matched channels, published 2026-05-08 to 07-26 and 2026-08-31 to 09-29. Post videos are 64.4% of the pool. That share is not a fair-share benchmark. The table shows only that scaling moves the list.

| Top N | Post share, raw views | Post share, post views divided by 1.74 |
| --- | --- | --- |
| 100 | 68.0% | 44.0% |
| 1,000 | 77.3% | 61.3% |
| 5,000 | 73.9% | 63.5% |

### A13. Within-channel vs mix

Source: [decomposition_channel_mix.csv](results/decomposition_channel_mix.csv). Mean views per video, 746 common channels.

| Term | Value |
| --- | --- |
| Pre mean | 51,248 |
| Post mean | 72,315 |
| Total change | +21,068 |
| Within-channel term | +39,518 |
| Mix term (includes interaction) | -18,450 |
| Mix term, one channel (233 pre, 10 post videos) | -17,105 |
| Mix term, other 745 channels | -1,345 |

### A14. Contrast inside each publish week

Source: [within_week_contrast.csv](results/within_week_contrast.csv). **Added after round-2 review.** Long-form day-29 views, same channels and balanced weights. Thursday-to-Sunday publishes over Monday-to-Wednesday publishes of the same week; first row, 08-27 to 08-30 over 08-24 to 08-26. 1,000 resamples for the first row, 500 for the others. Weeks with fewer than 30 matched channels are omitted.

| Week starting | Day-29 counts | Pooled | Typical | Channels |
| --- | --- | --- | --- | --- |
| 08-24, split at 08-27 | Straddle the step | 1.50 (1.19 to 1.87) | 1.67 (1.52 to 1.82) | 453 |
| 06-15 | Old rule | 0.74 (0.55 to 0.95) | 0.90 (0.74 to 1.07) | 113 |
| 06-22 | Old rule | 1.40 (0.86 to 2.45) | 1.99 (1.29 to 3.71) | 142 |
| 06-29 | Old rule | 1.15 (0.90 to 1.47) | 1.17 (0.98 to 1.38) | 178 |
| 07-06 | Old rule | 1.06 (0.76 to 1.82) | 1.02 (0.79 to 1.33) | 34 |
| 07-13 | Old rule | 1.29 (1.00 to 1.71) | 1.19 (0.99 to 1.43) | 288 |
| 07-20 | Old rule | 1.41 (1.14 to 1.73) | 1.23 (1.11 to 1.36) | 337 |
| 07-27 | Transition band | 0.90 (0.74 to 1.09) | 1.01 (0.93 to 1.10) | 334 |
| 08-03 | Transition band | 1.20 (0.99 to 1.46) | 1.21 (0.99 to 1.53) | 376 |
| 08-10 | Transition band | 1.48 (0.95 to 2.26) | 1.10 (0.88 to 1.37) | 107 |
| 08-17 | Transition band | 1.00 (0.73 to 1.31) | 1.25 (1.12 to 1.40) | 402 |
| 08-31 | New rule | 1.11 (0.92 to 1.30) | 1.07 (0.91 to 1.20) | 450 |
| 09-07 | New rule | 1.22 (1.00 to 1.43) | 1.08 (0.98 to 1.19) | 432 |
| 09-14 | New rule | 0.96 (0.83 to 1.15) | 0.98 (0.90 to 1.08) | 463 |
| 09-21 | New rule | 1.13 (0.93 to 1.42) | 0.99 (0.90 to 1.09) | 442 |

Weeks under one rule range 0.74 to 1.41 pooled and 0.90 to 1.99 typical. The 06-22 typical value reads 1.51 without one channel's batch of zero-view uploads (`scripts/exploratory/round2_probe2.py`). The split alone does not single out the 08-24 week. The step against the common pre group does (A3).

### A15. The trial's success check

Source: [trial_rank_check.csv](results/trial_rank_check.csv). **Added after round-2 review.** Percentile of day-29 views within ranking cohort (Monday-start publish weeks; 08-27 to 08-30 its own cohort; transition band 07-27 to 08-26 left out). Each matched channel's shift in mean percentile, averaged by sport on balanced channel weights, for the 14 sports with at least 10 channels at the switch.

| Cutover | Channels | Spread of sport shifts (SD, percentile points) | Lowest and highest sport | Spread of channel shifts (weighted SD) |
| --- | --- | --- | --- | --- |
| Switch: read before 08-24 vs published 08-27 on | 752 | 1.4 | Cycling -1.5, cricket +3.7 | 7.4 |
| Null: published before vs after 07-01, all read before 08-24 | 623 | 3.0 | Swimming -3.9, cycling +6.0 | 8.7 |
| Null: published 08-31 to 09-13 vs 09-14 on | 757 | 2.5 | Basketball -3.6, cycling +7.9 | 6.8 |

Pass rule: the switch spread is no wider than the narrower null (2.5). It passes on today's data. This tests one consequence of rank preservation, across sports. It does not test order within a channel, and a seasonal shift could fail it.

### A16. Size tiers like Agentio's

Source: [lift_by_size_tier.csv](results/lift_by_size_tier.csv). **Added 2026-10-28.** Tier: a channel's mean old-rule count per long-form video, from each video's latest reading before 08-24, over its videos outside the estimate (3 or more). 12 channels with fewer get no tier; they hold 0.7% of pooled pre views. Agentio: public over engaged views, from `external/published_estimates.csv`.

| Tier (average views per video) | Channels | Pre / post videos | Share of pooled pre views | Pooled (95%) | Typical (95%) | Not counted under the old rule | Agentio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Under 50k | 579 | 9,014 / 17,148 | 19.1% | 1.85 (1.64 to 2.08) | 2.18 (1.97 to 2.43) | 46.0% | 1.85 |
| 50k to 300k | 133 | 3,817 / 6,596 | 64.0% | 1.79 (1.57 to 2.08) | 2.00 (1.80 to 2.23) | 44.1% | 1.77 |
| 300k+ | 22 | 399 / 163 | 16.9% | 1.49 (1.22 to 1.78) | 1.98 (1.34 to 2.80) | 33.0% | 1.49 |
| All tiered | 734 | 13,230 / 23,907 | 100% | 1.75 (1.60 to 1.94) | 2.13 (1.96 to 2.32) | 42.9% | 1.67 |
| Agentio's tier ratios on our tier mix | | | | 1.74 | | 42.5% | |

| Check | Under 50k | 50k to 300k | 300k+ |
| --- | --- | --- | --- |
| Null: published before vs after 07-01, all read before 08-24, pooled | 0.97 (0.80 to 1.18) | 0.94 (0.74 to 1.16) | 0.88 (0.64 to 1.89) |
| Thresholds divided by 1.67, if Agentio's tiers count public views | 1.85 (527 channels) | 1.83 (160) | 1.58 (47) |
| Mean lifetime count of January-April 2026 publishes, mostly read after the switch | 1.82 (554) | 1.70 (120) | 1.74 (31) |
| Pre group's own day-29 mean, biased by regression to the mean | 2.25 (615) | 1.69 (109) | 1.37 (22) |

### A17. The trial's success check by channel size

Source: [trial_rank_check_by_size.csv](results/trial_rank_check_by_size.csv). **Added 2026-10-28.** Same cohorts and percentiles as A15; tiers as A16. Balanced-weight mean shift in each tier's channels' within-cohort percentile.

| Cutover | Under 50k | 50k to 300k | 300k+ | Smallest minus largest |
| --- | --- | --- | --- | --- |
| Switch: read before 08-24 vs published 08-27 on | +1.6 (579 channels) | +2.9 (133) | +2.6 (22) | -0.9 |
| Null: published before vs after 07-01 | -1.0 (473) | +1.3 (112) | -4.8 (19) | +3.8 |
| Null: published 08-31 to 09-13 vs 09-14 on | +2.2 (533) | +0.4 (120) | +2.8 (18) | -0.6 |

The gap at the switch sits inside the range where nothing changed. Small channels' videos did not climb within their weeks.

### A18. Each group's units

Source: [group_impacts.csv](results/group_impacts.csv). **Added 2026-10-28.** Arithmetic on A1 and A12. Agentio's figures are theirs. **Revised after red-team review.** The sponsor rows are one scenario: the whole cohort contrast read as the public-to-engaged multiplier, at a fixed price per public view. Intervals cover channel sampling only. The CSV also holds a row saying no added play reached a read after 0:30. It rests on a hard 30-second threshold that YouTube has not published, so it is left out here and not used.

| Group | Quantity | Ours (95%) | Agentio |
| --- | --- | --- | --- |
| Creators | Day-29 public views, post over pre, pooled | 1.74 (1.60 to 1.94) | 1.67 |
| Creators | Same, typical video | 2.13 (1.96 to 2.31) | |
| Sponsors | Share of a post-change count not counted as engaged views, 1 - 1/ratio | 42.6% (37.3% to 48.4%) | 40.1% |
| Sponsors | Same, typical video | 53.0% (49.1% to 56.7%) | |
| Sponsors | Cost per engaged view at an unchanged price per public view, new over old | 1.74 (1.60 to 1.94) | 1.67 |
| Sponsors | Price per public view that holds cost per engaged view, share of old price | 57.4% (51.6% to 62.7%) | 59.9% |
| Spot Sports | Post-change share of the matched day-29 pool | 64.4% | |
| Spot Sports | Post-change share of the top 100 / top 1,000 by raw views | 68.0% / 77.3% | |
| Spot Sports | Top 1,000 share over pool share | 1.20 | |
