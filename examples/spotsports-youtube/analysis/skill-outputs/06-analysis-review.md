# 06 analysis-review: response to the round-1 and round-2 reviews

Skill: `skills/analysis-review/SKILL.md`. Written 2026-10-28. The round-2 response and the red-team round follow round 1.

## The reviews

Three reviews were supplied. I quote them by reference and do not reproduce them.

| Reviewer | File | Lenses | Findings |
| --- | --- | --- | --- |
| opus | `reviews/opus/review.md` | Reader, Materiality | 2 material, 3 minor, plus one small factual error |
| sol | `reviews/sol/review.md` | Method, Question | 5 material |
| gemini | `reviews/gemini/review.md` | Method | 2 material, 3 minor |

Opus and sol each say one agent ran their lenses in sequence. Gemini does not say. I did not see how any of them was run. Their severity labels are used as given.

## How each finding was handled

I re-checked every finding against `videos.sqlite` before acting. The checks are recorded in two places. The first is in `scripts/exploratory/review_probe1.py` to `review_probe5.py` (stdout only). The second is in code that `run_all.py` now runs every time, mostly `scripts/review.py` and the revised `scripts/diagnose.py`. The core observation of every finding reproduced on the data. Where my number differs from the reviewer's, the row says so. The responses below say what changed.

Count: 15 findings. **13 fixed, 2 partly fixed, 0 dismissed.** Two sub-claims inside fixed or partly fixed findings were dismissed. Each is noted in its row.

| # | Reviewer | Finding (by reference) | Severity | Response | Evidence |
| --- | --- | --- | --- | --- | --- |
| O1 | opus | Finding 1: 1.77 is a views-weighted summary, wrong for restating single videos; its interval hides the spread across measures | Material | **Fixed.** The headline now gives both per-video measures with intervals: pooled 1.74 (1.60 to 1.94), typical video 2.13 (1.96 to 2.31). The multiplier option is rejected. | `quantile_ratios.csv`: post/pre is 2.71 at the 10th percentile, 2.02 at the median and 1.71 at the 95th. Opus measured 2.35 to 1.89 at the 25th to 95th percentiles, with post videos reweighted to the pre-period channel mix. |
| O2 | opus | Finding 2: an August 24 cutoff mis-scales videos published around the switch; the step sits near August 27 | Material | **Fixed.** The cohorts around the switch are measured directly. The brief says the full step starts with August 27 publishes. The recommended option needs no cutoff. *Round 2 (R2-1): it does; the 08-24 week is now split and the band left out.* | `transition_lift.csv`: publishes from 07-27 to 08-23 run 1.01 to 1.19. 08-24 to 08-26 run 1.19 (1.03 to 1.39). 08-27 to 08-30 run 1.99 (1.69 to 2.34). Within 428 channels, 08-27 to 08-29 publishes drew 1.34 times the views of 08-24 to 08-26 publishes (`review_probe4.py`). |
| O3 | opus | Finding 3 and the shape check: the ranking illustration reads as proof that the factor is right, and its pool is not "June to September" | Minor | **Fixed.** The illustration is out of the brief. The working calls it an illustration with no fair-share benchmark. The pool dates are corrected. | `ranking_illustration.csv` now records the pool: published 2026-05-08 to 07-26 and 08-31 to 09-29. |
| O4 | opus | Finding 4: "every sport, length, and channel size" overstates how uniform the lift is | Minor | **Fixed.** The claim now reads "point estimates above 1 in every segment, sizes vary". A new test compares the spread across segments with the spread at two cutovers where nothing changed. | `lift_by_segment.csv`: tennis 1.44 (1.12 to 1.72) and golf 1.34 (1.10 to 1.71) exclude 1.74. `segment_dispersion.csv`: across sports, the spread of log ratios is 0.21 at the switch, against 0.38 and 0.25 at the two null cutovers. |
| O5 | opus | Finding 5: the headline settles "which 25%" by assertion and can be repeated as a catalog total | Minor | **Fixed.** The headline says "per long-form video, at one month old". The catalog total (+12%) sits next to it with a warning not to quote 74% as a total. The total reading is the first item under "what would change the call". | `report.md`, message to the owner |
| S1 | sol | Finding 1: multiplying current counts of older videos by the factor scales views that were already counted under the new rule | Material | **Fixed.** The multiplier option is rejected, and this is one of its stated reasons. | `review_checks.csv`: 200,493 of 223,818 long-form videos published before 08-24 were last read on or after it, so their counts mix both rules. 132,461 videos have both readings after the switch. In 104 of them, ×1.74 overstates the new-rule count by more than 25% (a lower bound). Sol found 117 at ×1.77. |
| S2 | sol | Finding 2: an aggregate factor and its interval do not show that one factor fits every video | Material | **Fixed.** Removed: "every video comparable", the "off by 9% to 11%" assurance, and the "one factor can fix comparisons" premise. | `review_checks.csv`: after dividing post views by 1.74, the typical post video is still 1.22 (1.13 to 1.32) times its pre counterpart. Sol found 1.37 on version-1 weights. |
| S3 | sol | Finding 3: the 95% interval covers the matched-cohort contrast, not the causal rule effect | Material | **Partly fixed.** The interval is now labeled as channel-sampling uncertainty that assumes underlying viewing held level. The brief states the assumption and the size of rise that would break the call. A causal interval cannot be built from these data: there is no calendar-matched control and no engaged-view count. | `review_checks.csv`: long-form viewing alone would have to rise 39% (pooled) or 70% (typical) for the rule's effect to fall to 25%. In `null_comparisons.csv` the same estimator moves 0.85 to 0.97 where nothing changed. `transition_lift.csv` shows the step between the 08-26 and 08-27 publish days. |
| S4 | sol | Finding 4: the 2025 placebo uses the same algebra but not age-matched readings | Material | **Fixed.** It is relabeled "unequal ages". It is kept out of the null spread and no longer used to reject seasonality. The missing check is listed below. | `null_comparisons.csv` now carries the ages: 328.9 days (pre) vs 267.0 (post). Those match Sol's figures. Explore found no 2025 long-form readings at young ages, so an age-matched rerun is not possible. |
| S5 | sol | Finding 5: positive point estimates do not show a jump in every segment; four groups have intervals that include 1 | Material | **Fixed.** Every exception is listed, and "above 1" is kept apart from "above 1.25". Under the revised weights cricket's interval no longer includes 1. Running, cycling and videos of 60 seconds or less still do. | `lift_by_segment.csv`, pooled measure: running 1.47 (0.85 to 2.51), cycling 1.18 (0.82 to 1.81), 60 s or less 1.58 (0.64 to 3.28). Lower bounds under 1.25 also for golf, tennis and the smallest size third (1.22). On the typical-video measure only cycling's lower bound (1.12) is under 1.25. |
| G1 | gemini | Finding 1: `stock()` drops post-switch views earned before the first refetch when that refetch came after the switch | Material | **Fixed.** `stock()` now counts those views between a low bound (rate held flat back to the switch) and a high bound (first count spread evenly from publish). The cohort Gemini named was also measured directly from its day-29 lift. *Round 2 (R2-2): these are scenarios and a model, not bounds or a measurement.* | `stock_translation.csv`: 07-26 to 08-23 publishes are +4.2% (low) to +30.7% (high), against +3.0% before. The direct measurement in `review_checks.csv` is +10% (2.6% to 37.6%). All long-form: +11.6% (low) to +16.2% (high), against +11.4% before. |
| G2 | gemini | Finding 2: weighting by pre-group count gives leverage to channels with many pre and few post videos | Material | **Fixed.** Definition version 2 weights each channel by n_pre·n_post/(n_pre+n_post). That is the weight of a channel fixed-effects comparison. The old weights stay as a sensitivity. The mix term's dependence on one channel is disclosed. | Pooled 1.771 to 1.743. Typical 2.43 to 2.13. The typical-video null moves from 1.27 (1.03 to 1.69) to 1.06 (0.97 to 1.15). PPML: 1.74 (1.60 to 1.91). One channel (233 pre, 10 post videos) holds −17,105 of the −18,450 mix term (`decomposition_channel_mix.csv`). The SQL cross-check reproduces both weightings to four decimals. |
| G3 | gemini | Finding 3: one channel pulls the Shorts control down; the diff-in-diff had no interval | Minor | **Fixed.** Added a Shorts row without that channel and a jointly resampled diff-in-diff with and without it. Sub-claim dismissed: that this "resolves" the Shorts dip. The typical-video Shorts ratio stays 0.91 without the channel. | `null_comparisons.csv`: Shorts 0.85 (0.62 to 1.08), or 0.99 (0.88 to 1.11) without the channel. That channel holds 17.4% of pre-group Shorts views. `sensitivity.csv`: diff-in-diff 2.09 (1.60 to 2.82), or 1.79 (1.56 to 2.04) without it. |
| G4 | gemini | Finding 4: the timing table shows geometric ratios labeled "Ratio"; the later-growth check compares unequal windows | Minor | **Fixed.** `event_study.csv` now gives both measures under the headline weights, with weekly intervals. Later growth is shown per unit of log age and demoted to weak support, because its windows cannot be matched. | Post-switch weeks: pooled 1.64 to 2.06, typical 1.86 to 2.26. In `straddler_growth.csv` no old-base video has a second reading within 34 days. Per log age: 0.071 (old base) vs 0.054 (all new rule), 1.3 times rather than 1.7 to 2.3. |
| G5 | gemini | Finding 5: the reading inventory counts readings as videos; the 20-28 day window has a 2.3-day age gap | Minor | **Partly fixed.** The inventory now shows distinct videos. An age-matched window was added and every sensitivity row now shows mean ages. Sub-claim dismissed: that the age gap biases the 20-28 day ratio downward. The matched 26-28 day window gives the same 1.54. | `explore_standard_age_videos.csv`: 56,247 readings, 30,535 distinct long-form videos. Gemini reported 31,870; the difference is not explained and does not touch any estimate. `sensitivity.csv`: 20-28 days 1.545 (ages 26.0 vs 24.1), 26-28 days 1.541 (ages 27.2 vs 27.0). |

Results the reviewers reproduced and that still stand: the version-1 headline and its interval (all three), the SQL agreement (all three), and the selection and reading-type checks (gemini). Gemini's PPML, 1.7382, matches mine. Gemini's balanced-weight typical-video estimate, 2.1265, matches the new secondary measure exactly.

## What changed in the conclusions

- **Size.** The pooled per-video lift is 1.74, not 1.77. The typical-video lift is 2.13, not 2.43. Both intervals stay wholly above 1.25 under the stated assumption.
- **The call.** It is still "adjust". The action changes. A single multiplier is rejected for four reasons: the post/pre ratio differs by percentile (round 2: cause unverified, R2-4), current counts mix both rules, the cohorts around the switch were only partly lifted, and segment sizes vary. The recommendation is to compare each long-form video only with others published the same week, by percentile. That needs no factor.
- **Older videos.** Videos published in the four weeks before the switch gained about 10% on their stored totals, not 3%. The interval is wide. The catalog total is about +12%, not +11%. Round 2 relabeled both as modeled (R2-2).
- **Seasonality.** The 2025 placebo no longer counts against it. The one-day step at the August 26 to 27 publish boundary, and Shorts, carry that argument now.

## Claims still unverified

1. The rule's causal effect. Engaged views are owner-only, so the old-rule count after the switch is never observed. The size assumes underlying long-form viewing per video held level between May to July and September publishes.
2. Why the full step starts with August 27 publishes rather than August 24. It could be a staged rollout, a timezone or date effect, or something in the data. Not tested.
3. Whether the larger ratios at low percentiles come from the rule. The percentile comparison sets different videos side by side, so a change in the shape of the distribution would look the same.
4. Whether the lift really differs by sport. Tennis and golf sit below the headline on the pooled measure. The spread across sports is no wider than at cutovers where nothing changed. Neither a real difference nor equivalence is shown.
5. The stored-total lift. **Revised after round 2:** every figure is modeled, with one factor for every view and an accrual scenario, including the transition cohort's. The readings alone allow +10.7% to +43.4% for all long-form.
6. A year-earlier comparison at matched ages. No 2025 long-form readings exist at ages under 249 days.
7. Spot Sports' ranking formula, and the cost and reversibility of each option. None was supplied.
8. Which "25%" the owner meant. The owner is not available.
9. The Shorts typical-video dip (0.91, interval 0.84 to 0.99). It is unexplained and does not change the call.
10. The public sources cited in the first draft. There was no network access in this round.
11. Gemini's channel fixed-effects OLS estimates with age and duration controls (2.09). Not reproduced.
12. The distinct-video count gap in the inventory: 30,535 here against 31,870 from Gemini.
13. **Added after round 2.** Rank preservation within a publish cohort, the assumption behind the recommended trial. It needs per-video old-rule counts. The trial check tests one consequence across sports, not order within a channel.
14. **Added after round 2.** Why weeks under one rule show Thursday-to-Sunday vs Monday-to-Wednesday splits up to 1.41 pooled. Day-of-week effects or noise; not tested.

## Round 2

### The review

| Reviewer | File | Lenses | Findings |
| --- | --- | --- | --- |
| round2-sol | `reviews/round2-sol/review.md` | Method, Question, Reader, Materiality, in serial passes by one agent (its statement) | 3 material, 1 minor |

The reviewer reports regenerating all 26 result tables identically and recomputing both headline measures and intervals independently. I did not re-observe that run. The figures of its that I recomputed match, with small differences noted below. It also checked the round-1 dispositions and raised no duplicate findings. Its severity labels are used as given.

### How each finding was handled

I re-checked each finding against `videos.sqlite` before changing anything, in `scripts/exploratory/round2_probe1.py` to `round2_probe4.py` (stdout only). The checks that inform the report were then built into `scripts/review.py` and `scripts/diagnose.py`, and `scripts/run_all.py` was rerun. Among the existing tables only `stock_translation.csv` and `review_checks.csv` changed; `within_week_contrast.csv` and `trial_rank_check.csv` are new. No headline number moved.

Count: 4 findings. **4 fixed, 0 partly fixed, 0 dismissed.** The core observation of each reproduced or follows from the artifact's own terms.

| # | Finding (by reference) | Severity | Re-check on the data | Response | Evidence |
| --- | --- | --- | --- | --- | --- |
| R2-1 | Finding 1: percentiles within publish week leave the transition inside the 08-24 week; ordered quantiles do not show preserved order | Material | Reproduced exactly: 08-27 to 08-30 vs 08-24 to 08-26 publishes, 1.4993 pooled (1.19 to 1.87), 1.6709 typical (1.52 to 1.82), 453 channels, 2,111 and 3,050 videos. Added the same split for every week: under one rule it ranges 0.74 to 1.41 pooled and 0.90 to 1.99 typical. So the split alone is noisy; the step against the common pre group locates the boundary at 08-27. | **Fixed.** Transition band defined from the data as publishes 07-27 to 08-26. The 08-24 week is split at 08-27, and the band is left out of the recommended ranking and flagged. Rank preservation is stated as untested. "Handles late-August videos" and the ordered-quantile argument are removed. The recommendation is a trial on day-29 readings with a success check: sport-level percentile shifts across the switch no wider than at the narrower of two null cutovers. Today 1.4 points against 3.0 and 2.5. That pass tests one consequence across sports, not order within a channel. | `within_week_contrast.csv`, `trial_rank_check.csv`, `transition_lift.csv`; report sections 5 and 6, tables A14 and A15; `04-diagnose-change.md` sections 5 and 10 |
| R2-2 | Finding 2: the stored-total "bounds" are scenarios and do not establish a below-25% total | Material | Reproduced: 1,183 paired videos with "low" accrual above "high" (40,457,562 vs 33,545,813 summed; the reviewer had 33,546,928). The example video gives 2,125,802 vs 1,423,247 (reviewer 1,423,303). The small gaps are likely timestamp rounding; not checked. The timestamps-only range reproduces exactly: 3,848,243,541 to 12,030,319,881 post-switch views, +10.71% to +43.35% at R. | **Fixed.** Scenarios renamed flat-rate and even-spread in code and text. About +12% is labeled a modeled estimate, shown with its scenario range (10.0% to 18.8%) and the readings-alone range (10.7% to 43.4%). "Bounds", "at most", "measured" and "2% or less" are removed where they implied identified limits. The answer under the total reading is conditional on the model. The transition cohort's figure is labeled modeled; its 2.6% to 37.6% is plugged-in endpoints that omit accrual uncertainty. Not done: tighter limits, which need more readings per video or a validated accrual model. | `stock_translation.csv` (new `identified_min` and `identified_max` rows), `review_checks.csv`; report sections 2, 3 and 6, table A9; `04-diagnose-change.md` section 9 |
| R2-3 | Finding 3: one creator below 1.25 cannot reverse a catalog-wide call | Material | Follows from the artifact's own terms: the headline is a weighted contrast across 746 channels, and the analysis allows the effect to vary by channel. No data check applies. | **Fixed.** One creator's export now prompts investigation: compare it with the catalog and with its sport and size third, and check whether its same-week videos keep their order. Reversal triggers are about the catalog: the late-November rerun on October publishes, or engaged views from a random sample of matched channels whose weighted ratio has an interval wholly below 1.25. | Report section 6; `05-make-the-call.md`; `04-diagnose-change.md`, diagnosis |
| R2-4 | Finding 4: "the right factor" and the 10,000-view example overtranslate cohort contrasts | Minor | Confirmed: `quantile_ratios.csv` compares separately sorted groups, and the matched median ratio is 2.02, not 2.13. | **Fixed.** The owner text says cohort percentile ratios run 1.7 to 2.7, cause unverified. The 10,000-view figures are labeled illustrations of cohort summaries. 2.13 is described as an exponentiated weighted mean log contrast, not the median ratio. Same in skill outputs 03, 04 and 05, and in table A2's title. | Report message and sections 2, 4 and 5; table A2 |

### What changed in the conclusions

- **Size.** Unchanged: pooled 1.74 (1.60 to 1.94), typical 2.13 (1.96 to 2.31), both under the stable-viewing assumption.
- **The call.** Still "adjust". The action is now a trial: day-29 percentiles within publish cohort, the 08-24 week split at 08-27, the transition band left out, a stated success check, and an untested assumption named.
- **Stored total.** About +12% is modeled. The data alone allow 11% to 43%, so they cannot show the total is below 25%. The no-change answer under the total reading holds only under the model.
- **Triggers.** A reversal needs evidence about the catalog. One creator's export prompts a closer look.

The owner brief, in the report and `05-make-the-call.md`, was rewritten for plain language: 262 words to 199, no estimator names, one leading number. No analysis or number changed.

Extension, 2026-10-28, not a review round: published estimates of the same change were compared (`04-diagnose-change.md` section 11) and every group the result moves was named (`05-make-the-call.md`); `scripts/external.py` adds three tables, every earlier table reran byte-identical, and the call did not change.

## Round 3: red team

### The reviews

Three red-team reviews, each by an AI model reading the deck and the analysis in a persona. The models are named by the review file names. I did not see how they were run, or whether any saw another's review. Sol's severity labels are used as given.

| Reviewer | File | Persona | Read | Findings |
| --- | --- | --- | --- | --- |
| sol | `reviews/red-team-measurement-sol.md` | Measurement statistician | Deck PDF, report, skill outputs 03 to 05, result CSVs, `metric.py`, `diagnose.py`, `external.py`, and two Agentio pages online | 3 high, 3 medium |
| gemini | `reviews/red-team-brand-analytics-gemini.md` | Analytics chief at a YouTube sponsor | Deck slides 6 to 8 and `analysis/` | 5 ranked fixes, plus deck-level points |
| opus | `reviews/red-team-svp-data-opus.md` | Data executive reading a LinkedIn post | Deck | 5 ranked fixes, plus filler and trust points |

### Scope of this round

Wording only, in `report.md`, skill outputs 03 to 06 and `run-record.md`. No number, script or result changed. The deck is not revised in this round. Where a finding lands on a slide and the written analysis already says the right thing, the row says so and the deck change is pending.

### How each finding was handled

I checked each finding against the files before acting. What I re-checked from saved results: the naive contrast (`decomposition_channel_mix.csv`: 70,899.80 / 51,901.78 = 1.366); the reciprocals (`group_impacts.csv`); the tier reweighting (0.1908 × 1.85 + 0.6402 × 1.77 + 0.1690 × 1.49 = 1.7379); the 300k+ tier's 22 channels, 163 post videos and 1.22 to 1.78 interval, and its 1.74 (1.33 to 2.26) under the January to April measure (`lift_by_size_tier.csv`); the null intervals reaching 0.80 to 1.20 (`null_comparisons.csv`); C = M × D examples (1.7435 / 1.15 = 1.516; 1.7435 × 0.70 = 1.220). The zero-read row in `group_impacts.csv` cites "the old rule counted a view after 30 seconds" as its source, which confirms the premise sol attacks. Not checked: sol's reading of Agentio's methodology page (no network in this round), opus's statement that Agentio sells creator sponsorships, and the World Cup and season-start dates, which are general knowledge, not in these data.

Count: sol's six findings and the other two reviews' ranked fixes and points, de-duplicated into 18 rows. **10 fixed, 5 partly fixed, 3 dismissed.** Sol labels severity. Gemini and opus rank fixes without severity labels, so their rows read "Unlabeled".

| # | Reviewer | Finding (by reference) | Severity | Response | Where |
| --- | --- | --- | --- | --- | --- |
| RT1 | sol 1; opus 2B, fix 3; gemini 4 | The +74% is earned as a cohort contrast; attributing all of it to counting, with no viewing growth, is not. "Nobody watched more", "no larger audience", "the rise is the rule" | High | **Fixed.** The contrast is stated as a same-channel, same-age cohort contrast, with counting as the leading explanation. C = M × D is written out, with D = 1.15 giving M = 1.52. The 39% is named as the rise that changes the call, not the rise that rules out any viewing change. Absolutes removed: "added no viewers", "without more viewers", "nearly all", "explains nearly all", "the gap is size mix", "not a change in viewing" | Report brief, sections 1, 3, 4, 6, rival table, "does not claim"; 03 proxy; 04 sections 1, 4 and diagnosis |
| RT2 | sol 2; gemini 3; opus 2B | Engaged views treated as a verified 30-second count; added plays said to reach no sponsor read | High | **Fixed.** YouTube has not published the organic threshold; 30 seconds is the assumed proxy (sol's reading of Agentio, not re-fetched). Text says "not counted as engaged views" and "the old count". The zero-read claim is removed from the brief, the sponsor row and table A18, and A18 notes why the CSV row is unused. Engaged views are named as not sponsor exposure | Report brief, section 1, published estimates, A18; 03; 04 section 11 |
| RT3 | sol 3; gemini 1, 2; opus 3 | 43%, +74% per engaged view and 57% presented as measured per-deal economics | High | **Fixed.** Labeled one scenario, three transformations of R, under two assumptions: a fixed price per public view, and the whole contrast as the public-to-engaged multiplier. Ranges given: 37.3% to 48.4%, 1.60 to 1.94, 51.6% to 62.7%, channel sampling only. A flat fee does not change by itself; the risk is a renewal on a trailing public average. A real deal uses the creator's own engaged views, traffic sources and retention at the read | Report brief, sections 1, 2, "does not claim", A18 |
| RT4 | sol 4; opus 2C, fix 1, fix 5 | Agentio match is corroboration, not estimand equivalence; 300k+ match fragile; size gradient claimed though not established; tier measure chosen after Agentio's numbers | Medium | **Fixed.** The estimand difference is explained (theirs M, ours C). "Agree" became "consistent after illustrative size standardization". The 22-channel caveat, interval and 1.49 to 1.74 tier-measure sensitivity stay. The catalog's gradient is "suggestive" wherever it appears, including the creator row and option 2. The tier measure is disclosed as chosen with Agentio in view | Report sections 1, 4, 5, published estimates; 04 section 11 |
| RT5 | sol 5; opus 3 (slide 4) | Intervals cover the cohort statistic, not causal or deal claims; four null points shown as a normal-variation range; the September null excludes 1 | Medium | **Fixed in the analysis.** Intervals labeled channel sampling only, beside each use. The nulls are named separate diagnostics with intervals reaching 0.62 to 1.20; 0.89 (0.81 to 0.98) is called out. Error bars on slides 4 and 5 are pending with the deck | Report sections 2, 3, comparisons; 03 uncertainty; 04 sections 1, 3 |
| RT6 | sol 6 | An October public-only ratio under 1.25 is not a falsification of the counting effect | Medium | **Fixed.** The rerun is a stability check that prompts re-diagnosis (1.74 × 0.70 = 1.22 shows why). Reversal needs representative public and engaged counts on the same videos, matched by age and window, with the weighting and interval rule. Reversing the estimate is kept apart from stopping the trial | Report brief, section 6; 04 next observation |
| RT7 | opus 2A, fix 2; gemini 3.3 | Seasonality not confronted: World Cup baseline against football and soccer kickoffs; nulls are summer against summer | Unlabeled; opus ranks it second | **Fixed in the analysis.** The rival table and H2 name the calendar and say no long-form null crosses it, and that Shorts cross it on different windows. The rebuttal stays: the one-day step, Shorts, basketball 1.90. A seasonal slide is pending with the deck | Report sections 3, rival table; 04 sections 3, 4 |
| RT8 | opus fix 4; opus 4 | Show what the naive read would have said: +37% against +74% | Unlabeled | **Fixed.** Added to finding 1 and the mix section of the report, and section 1 of 04 | Report sections 4 and reproduction; 04 section 1 |
| RT9 | opus 3, fix 5 | "Independent reviewers" without saying they were models; "every number reruns" though the extract is private | Unlabeled | **Fixed.** Reviewers are named as AI models in the report, this file and the run record. Reruns are scoped to whoever holds the private extract; result tables are public | Report header, "what changed", supporting analysis, "does not claim"; `run-record.md` |
| RT10 | gemini 2.3 (platform) | Trial gives no rank for a video's first 28 days and no list across weeks | Unlabeled | **Fixed.** Added to option 1's risks | Report section 5 |
| RT11 | gemini 4 (creators) | Creator advice is generic; creators should pitch engaged views and their share of public views | Unlabeled | **Partly fixed.** The creator row now says to pitch engaged views and their share. A dedicated creator card is a deck item, pending | Report section 1 |
| RT12 | gemini 1.4, fix 2 | A buyer needs an exact verification spec | Unlabeled | **Partly fixed.** The ask is named: public and engaged views on the same videos over the same window (for example days 1 to 29), traffic sources, and retention at the read timestamp. Exact YouTube Studio export names are left out: I could not verify them without network access | Report brief, section 1 |
| RT13 | gemini 3.4, fix 3; opus 2A | Deck says "keep July 27 to August 26 in a group of their own"; the report leaves the band out | Unlabeled | **Partly fixed.** The written analysis already leaves the band out and flags it. No change here. The deck wording is pending | Report section 5 (unchanged) |
| RT14 | gemini 3.1, 3.2, fix 4 | "Overnight" and the event-study chart's mixed 08-24 week hide the 08-27 start and the +12% catalog total | Unlabeled | **Partly fixed.** The written analysis states the 08-27 start, splits the 08-24 week (A14) and puts the +12% total beside the per-video figure. No change here. The deck's cover and chart are pending | Report sections 4, timing, A4 note (unchanged) |
| RT15 | gemini 3.5; gemini 2.3 | Within-week feed-play bias could reorder videos; rank preservation is assumed | Unlabeled | **Partly fixed.** Already named as the main threat to the trial's assumption, and untested. No change here. Nothing in these data can test it | Report sections 1, 5, published estimates (unchanged) |
| RT16 | gemini fix 1, fix 2 | Replace the single 57% with a tier rate table: 54%, 56%, 67% | Unlabeled | **Dismissed.** The catalog's own size gradient is not established: the 300k+ tier rests on 22 channels and moves 1.49 to 1.74 with the tier measure. A tier table would carry more precision than the data have, and Agentio's tiers are another population. The fix that fits the evidence is the creator's own ratio, which the sponsor row now asks for | Report section 1 |
| RT17 | gemini 3 (sizing); opus 4, fix 4 | Size the stakes in money: eCPM, flat-fee inflation, partner payouts, a dollar figure for Spot Sports | Unlabeled | **Dismissed.** No price, contract, payout or ranking-formula input was supplied. make-the-call forbids inventing a dollar figure. The owner and the decision are already named; cost stays "unknown; owner to supply" | Report sections 1, 5 (unchanged) |
| RT18 | opus 3, fix 5 (slides 1, 2, 3, 10); gemini fix 5 | Deck filler and framing: generic opener, unexplained +25% line on slide 2, two headline numbers on slide 3, internal pitch mixed with the industry playbook | Unlabeled | **Dismissed for this round.** These are deck-only presentation choices, and the deck is out of scope here. The written brief already leads with one number and explains the 25% line where it first appears | Deck, not changed |

### Dismissed sub-claims

- Opus calls the tier match "luck, not validation". Narrowed: the overall reweighting is principled (weights are shares of old-rule views), and sol finds no numerical error. The fragility is the 300k+ tier, which the text now says.
- Gemini's tier figures label 54% to 67% as "fair" rates. Dismissed: they are Agentio's engaged-view rates, and our tier ratios carry the gradient caveat.
- Gemini says "most mid-to-macro integrations are flat fees". Not checked: no contract data was supplied. The flat-fee case is added as a scenario without the prevalence claim.

### What changed in the conclusions

- **Size.** Unchanged: pooled 1.74 (1.60 to 1.94), typical 2.13 (1.96 to 2.31). Now named as cohort contrasts.
- **Attribution.** Counting is the leading explanation for a large part. How much is not established. These data observe C, not M.
- **Sponsors.** One catalog scenario with stated assumptions and ranges. A deal needs the creator's own numbers.
- **Outside estimates.** Corroboration of a different quantity. The catalog's size gradient is suggestive.
- **Triggers.** The October rerun prompts re-diagnosis. Reversal needs same-video public and engaged counts.
- **The call.** Still "adjust", with the same trial.

The owner brief held its length: 212 words before, 213 after (plain count, link targets stripped). Each qualification replaced an absolute.

### Claims still unverified, added in round 3

15. The old organic-view threshold. YouTube has not published it, per sol's reading of Agentio's methodology page, which I did not re-fetch.
16. How much of the 74% is the counting rule. These data observe C = M × D and neither part.
17. Whether Agentio's multiplier transports to this catalog within size tiers, given differences in age, traffic source and population.
18. Opus's statement that Agentio sells creator sponsorships.
