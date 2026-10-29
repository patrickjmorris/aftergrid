# Red-team review: Spot Sports YouTube case study

**Disposition:** I would share the analysis as a useful worked example after revisions. I would not circulate the current deck as an established causal measurement or a sponsor pricing study. Six material findings survive checking the supporting files. Three are high severity; three are medium. High means a central substantive claim needs correction; medium means the presentation or decision rule can materially mislead despite a defensible underlying calculation.

Inspected the PDF with `pdftotext -layout`; `analysis/report.md`; skill outputs 03, 04 and 05; relevant results CSVs; and `scripts/metric.py`, `diagnose.py` and `external.py`. Recomputed the transformations and tier reweighting from saved aggregate results. No row-level data accessed, no pipeline rerun, and no source files changed. Also checked the two Agentio primary-source pages linked by `external/published_estimates.csv`; that check matters for finding 2. The saved CSV alone does not disclose the threshold qualification.

## 1. High — Slides 1, 3, 6, 8 and 9: the observed +74% is earned; attributing all of it to counting, with no viewing growth, is not

**Claim attacked:** “Nobody watched more,” “no larger audience,” and “The rise is the counting rule.”

The primary result is a within-channel, age-matched contrast between different videos in different calendar periods. It is not a same-video public/engaged ratio. In standardized weighted means, write C = public_post / old_pre, M = public_post / engaged_post, and D = engaged_post / old_pre. Then C = M × D. The files observe C = 1.7435; they do not separately observe M and D in this catalog. Unique audience is not observed either.

**Strongest surviving alternative:** a substantial counting effect combined with a genuine change in long-form demand, recommendations, or content/topic mix within channels, with a different public/engaged multiplier from Agentio's population. This does not require denying the counting change. For example, D = 1.15 implies M = 1.5161: a large measurement discontinuity and real growth can coexist. The +39% sensitivity is the demand rise needed to reduce the inferred measurement lift to +25%; it is not the demand rise needed to refute “nobody watched more.”

**Attempt to refute this attack:** The evidence against an entirely organic +74% story is strong. The step is broad, survives weighting and reading checks, appears in the transition cohorts, and has outside same-play corroboration. The long-form nulls are 0.9575 and 0.8908. Shorts are 0.8462, or 0.9863 without the dominant channel. Those facts make a large counting effect the leading explanation.

**Why it survives:** The nulls do not compare the same seasonal transition under an unchanged rule. Shorts have different calendar windows, maturity ages and potentially different demand processes; no parallel-trend identification is established. The unequal-age 2025 placebo is correctly excluded in the analysis and cannot rescue that gap. The effective full step appears for August 27 publishes, not August 24: August 24–26 is 1.19, August 27–30 is 1.99. The analysis acknowledges an unknown rollout or other explanation; even its within-week checks say a large split is not unique. This supports timing evidence, not a proven overnight treatment at a known instant. Matching channels and duration does not exclude topic, quality or recommendation changes within those cells. Agentio adds support only under transport assumptions (finding 4).

Slide 9 does disclose stable viewing, which is a real mitigation. It does not make the earlier absolutes accurate, and “the match ... suggests it barely moved” is stronger than the external comparison warrants. The analysis is more candid in `04-diagnose-change.md` §§1, 3–5, 11 and Diagnosis than the headline story.

**Fix:** Lead with “Same-channel views at one month rose 74%; evidence points to a large counting effect.” Put stable underlying viewing beside the estimate. Remove the audience-growth absolute and distinguish the announced date from the catalog's observed transition. Keep the practical warning about comparisons across regimes.

## 2. High — Slides 1, 6 and 7: engaged views are treated as a verified 30-second count

**Claim attacked:** Before the change a viewer had to watch 30 seconds; 43% “never reached the 30-second mark”; none of those plays reached a sponsor read after 0:30, except skips.

The analysis and `external.py` label the last proposition a consequence of the counting definition. It is only a consequence if the old organic-view definition really is a hard 30-second threshold.

**Attempt to refute this attack:** `03-define-metric.md`, `04-diagnose-change.md`, `05-make-the-call.md`, `group_impacts.csv` and the appendix consistently use that premise. The deck expressly handles skipping ahead, so an attack based only on skipping would fail.

**Why it survives:** The primary source linked in the external CSV explicitly says YouTube's organic engagement threshold is unpublished, and 30 seconds is an assumed proxy derived from the paid TrueView convention. Its forecast methodology repeats this limitation. See [Agentio's original methodology](https://www.agentio.com/blog/youtube-view-vs-engaged-view), “How far apart...” and “Methodology and limitations.” No inspected analysis file supplies a stronger documented threshold or a measured retention curve for this catalog. A public/engaged difference therefore does not establish the share below exactly 30 seconds, or zero exposure to a particular read. This is a flaw in the analysis premise as well as its slide translation.

**Fix:** Use “not counted as engaged views.” Remove exact 30-second and zero-read-exposure claims unless supported by an authoritative definition or actual retention at the integration timestamp. Engaged views can improve metric comparability without being a direct count of sponsor impressions.

## 3. High — Slides 6 and 7: correct reciprocal arithmetic is presented as measured per-deal economics

**Claim attacked:** 43% of a new count is non-engaged, +74% paid per qualifying view, and 57% of the old price preserves cost, expressed as what now happens to sponsors.

**Arithmetic checked:** From R = 1.7435:

- 1 − 1/R = 42.64%; transformed interval 37.34%–48.42%.
- R − 1 = 74.35%; interval 59.59%–93.89%.
- 1/R = 57.36%; transformed interval 51.58%–62.66%.

Those calculations and interval endpoint directions are correct. These are transformations of the same estimate, not three independent findings.

**Attempt to refute this attack:** The deck says “at an unchanged price per view,” and slide 6 identifies sponsors paying per view. Under that contract assumption, if the deal's public/engaged ratio is M, then spend = p × public and cost per engaged view = pM. A new public-view rate p/M preserves the previous cost per engaged view. This is sound conditional economics, not a denominator error.

**Why it survives:** R is still a weighted between-cohort contrast, not the deal's observed M. Even an exactly identified catalog-average M would not establish the ratio for one creator, integration, billing window or sponsorship portfolio. The estimator uses balanced channel weights and channel mean views; it does not represent every sponsor's purchased-view mix. `05-make-the-call.md` §2 explicitly says none of its cohort ratios is an individual-video conversion factor, yet its sponsor brief and slide 7 use one that way. Heterogeneity and real viewing changes matter before taking reciprocals.

An unchanged nominal public-view rate is a scenario, not observed contract behavior. A fixed fee for unchanged underlying delivery does not mechanically increase because the public counter changes. Nor does a higher cost per engaged view by itself establish overpayment, lost conversions or the correct fair price of a deal. “Same deal, fewer people who stayed” implies observed delivery and distinct people that these data do not measure.

**Fix:** Label all three figures “catalog illustration, assuming the entire cohort contrast is the public/engaged multiplier and the public-view rate stays fixed.” Replace “30-second” with “engaged” subject to finding 2. Use a creator's actual public/engaged ratio, integration retention and contract basis for a real renewal. Do not turn 57% into a universal repricing instruction.

## 4. Medium — Slide 5, with consequences on slides 6 and 9: the Agentio match is useful corroboration, not estimand equivalence or validated transport

**Claim attacked:** “A different method ... lands in the same place”; “By channel size, the results match”; the match suggests underlying viewing barely moved.

Our C includes changes in engagement between video cohorts; Agentio's M counts the same post-change activity under two definitions. Equality requires stable viewing here and a transportable conditional counting multiplier. A match alone cannot identify either condition.

**Attempt to refute this attack:** The slide explicitly describes the two methods and different data. It gives Agentio's unreweighted +67%, discloses the 22-channel top tier and its +49% to +74% sensitivity, and the appendix supplies intervals. The tiering uses pre-switch videos outside the headline estimate, avoiding direct reuse of its pre denominator and the most obvious regression-to-the-mean artifact. Denominator-share reweighting is the correct algebra: 0.1908×1.85 + 0.6402×1.77 + 0.1690×1.49 = 1.737944. The corresponding observed tiered contrast is 1.75, not precisely the 746-channel headline's 1.7435. The “all” bars reasonably show +75% and +74%. I do not find a numerical reweighting error or evidence that the match was fabricated.

**Why it survives:** Matching numerical cutoffs is partial harmonization. Here size is mean latest pre-switch counts on videos outside the estimate, with heterogeneous ages. The source uses average engaged views per video; the averaging-window alignment is not established. Population, video age and traffic-source mix can still differ within tiers. [Agentio's measured study](https://www.agentio.com/blog/youtube-new-view-count-60-engaged-view-rate) uses post-August-24 activity on videos published since June 1; its playback-location results also show large conditional differences. Size alone is not demonstrated to make effects transportable.

The exact-looking +49% top-tier match is especially fragile: 22 channels, 163 post videos, interval +22% to +78%; the January–April lifetime tier definition gives +74%, interval +33% to +126%. Small-tier and large-tier intervals overlap. The analysis itself says its size gradient is not established. Slide 6's “Small channels gain the most” and slide 8's certainty that size unevenness is established exceed that admission. The outside comparison supports a large counting effect; it does not establish that the original headline gap from Agentio is explained entirely by size mix or that underlying viewing changed only +0.7%.

**Fix:** Say “consistent in magnitude after illustrative size standardization.” Show the local intervals on the main comparison, retain the 22-channel caveat and sensitivity, and identify remaining age/traffic/population transport assumptions. Describe the catalog's size gradient as suggestive. There is no need to discard the cross-check.

## 5. Medium — Slides 3–5 and 7: intervals are meaningful for the cohort statistic, but not for the causal and deal claims attached to it

**Claim attacked:** readers can interpret +60% to +94% as uncertainty about the counting rule's effect, and slide 4's −15% to −3% as the established range of ordinary variation.

**Attempt to refute this attack:** `metric.py` implements a sensible channel-cluster percentile bootstrap, with 2,000 draws for the main result. Resampling channels rather than treating videos as independent is a strength. Slide 3 shows the primary intervals, slide 7 shows the 43% interval, and appendix A/A1/A8/A13 explains resampling or supplies other intervals. The transformed ranges in `group_impacts.csv` are correct. “No uncertainty is reported” would be a false attack.

**Why it survives:** The prominent ranges do not include demand confounding, transport error, uncertainty in Agentio's estimates, or variation of an individual sponsor's deal ratio. The analysis explicitly distinguishes channel sampling from stable-viewing assumptions; the main estimate slide does not. The catalog is not a probability sample of YouTube, so these are model-based descriptive sampling ranges rather than guaranteed platform-wide coverage. Common calendar or sports shocks are not made harmless by resampling channels.

Slide 4 plots four selected point estimates. Their minimum and maximum are not a 95% null distribution, and the comparisons have different windows and channel sets. Their actual intervals reach, for example, +20% for the July long-form null. This does not explain away +74%; it changes how much precision the display can claim. Slide 5's visually exact concordance omits local error bars. Slide 7 omits the +60%–94% cost and 52%–63% price ranges beside its actionable price figures.

**Fix:** Label the headline range “95% channel-bootstrap interval for the cohort contrast; excludes changes in underlying viewing.” Put error bars on slides 4 and 5 and transformed ranges alongside all sponsor outputs. Present the four checks as individual diagnostics rather than a calibrated normal-variation envelope. No broader or more elaborate bootstrap can replace identifying the missing counterfactual.

## 6. Medium — Slide 9: October's public-view contrast is not an equivalent falsification of the counting effect

**Claim attacked:** a one-month October ratio below 1.25 “reverses the call.”

**Attempt to refute this attack:** Waiting for day-29 readings fixes the younger October maturity problem. `05-make-the-call.md` §6 also proposes randomly sampled creator public/engaged data and requires its interval wholly below 1.25. It correctly rejects reversal based on one convenient creator export. These are useful improvements already present.

**Why it survives:** The October public-only rerun still observes C = M × D. If M remains 1.74 and engaged demand falls to 70% of the pre level, the new cohort contrast is 1.218. That passes the stated reversal trigger despite a continuing +74% counting discontinuity. It should challenge attribution or prompt investigation, not establish that cross-regime raw comparisons are valid. Conversely, a large future cohort contrast does not by itself confirm a large M. The main slide also drops the representative-sample weighting and interval criterion retained for the engaged-view trigger in the working file.

**Fix:** Label the October result a stability check that prompts re-diagnosis. Reserve a reversal about the counting multiplier for representative, age/window-matched public and engaged counts on the same videos, with the stated weighting and uncertainty rule. Distinguish reversing the numerical effect estimate from stopping or changing the ranking trial.

## Ranked fixes before circulation

1. **Correct the measurement definition:** remove the unsupported hard 30-second rule and zero sponsor-read exposure claim (finding 2).
2. **Separate observation from attribution:** retain +74% as the cohort contrast, qualify its causal interpretation, and remove “Nobody watched more” and “no larger audience” (finding 1).
3. **Make sponsor math an explicit scenario:** state the billing and transport assumptions; keep creator-specific retention and actual contract economics in the renewal decision (finding 3).
4. **Reframe Agentio as corroboration:** preserve the valid reweighting, expose tier sensitivity and intervals, and stop treating numerical agreement as proof of stable viewing or a proven catalog size gradient (finding 4).
5. **Put the relevant uncertainty next to the decision numbers:** show cohort-only coverage, placebo intervals and price ranges (finding 5).
6. **Repair the reversal rule:** public-only October results prompt re-diagnosis; direct representative public/engaged evidence tests the metric bridge (finding 6).

Useful next evidence, requiring creator cooperation rather than more public-view algebra: representative public and engaged counts over the same first-29-day windows, paired retention at the sponsor timestamp, and traffic-source composition. That can distinguish the metric bridge from engagement change and test whether within-week rankings preserve order.

## Attacks rejected or narrowed after checking

- **“The 43%/57% reciprocals are wrong.” Rejected.** They are correct transformations under their substantive assumptions.
- **“The Agentio total should be weighted by channel counts.” Rejected.** Denominator shares are the appropriate weights for pooling ratios of counts under the transport model.
- **“The comparison hides the vendor's +67% or the 22 channels.” Rejected.** Both are disclosed on slide 5; the problem is the strength of the interpretation and absent main-chart intervals.
- **“The headline is merely changing channel mix or one outlier.” Rejected as a sufficient explanation.** Within-channel matching, revised weights, PPML and outlier sensitivities substantially address that attack.
- **“The 2025 placebo proves no seasonality.” Rejected as a defense.** The analysis already withdraws that interpretation because ages differ; I do not count it as an unfixed computational error.
- **“They recommend a universal 1.74 correction.” Rejected.** The final recommendation is a trial using day-29 ranks within publish cohorts, excludes the transition band, and acknowledges untested rank preservation in the working files. The exact catalog ranking and sponsor value remain unvalidated, but that is not a separate retained finding here.
- **“The counting change is probably irrelevant.” Rejected.** The step, controls, sensitivity checks and outside measurements jointly support a substantial measurement break. The retained criticism concerns the claimed exact attribution, metric definition and economic scope.
