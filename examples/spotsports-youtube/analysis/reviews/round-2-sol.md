# Round-2 analysis review

material: 3

One agent applied Method, Question, Reader, and Materiality in separate serial passes. Scope: the revised report and appendix, skill outputs 02–06, production scripts/results, the supplied brief, the three named round-1 reviews, and the named row-level data. No independent reviewer or human approval is claimed. No analysis artifact was edited.

## Reproduction and disposition of round-1 findings

I executed the complete `run_all.main()` computation with bytecode generation disabled and every imported `write_csv` replaced by an in-memory CSV collector. This preserved the calculation, rounding, bootstrap seeds, SQL cross-check, and CSV reconciliation while avoiding writes to the submitted artifact or any scratch folder. **All 26 generated CSVs matched the saved CSVs, including every row and header.** Runtime was 46.7 seconds. I also independently selected the age-matched rows using SQLite and independently implemented the balanced-weight means and 2,000-draw channel bootstrap without importing the submitted metric code.

Independent results:

| Quantity | Recomputed |
| --- | ---: |
| Common long-form channels | 746 |
| Pre / post videos | 13,254 / 23,962 |
| Balanced pooled ratio | 1.7434910333551492 |
| Its channel-bootstrap interval | 1.5959142173571779–1.9388988859799932 |
| Balanced geometric (`ln(1+views)`) contrast | 2.126465210948512 |
| Its channel-bootstrap interval | 1.9630393227445198–2.3097726584578293 |

These reproduce 1.74 (1.60–1.94) and 2.13 (1.96–2.31). Both conditional sampling intervals exceed 1.25. Their interpretation as contrasts between different video cohorts, with causal sizing conditional on stable underlying viewing, is now explicitly disclosed. I do **not** re-raise the absence of a causal interval as an unanswered finding.

The round-1 response is substantially implemented, but “13 fixed” should not be read as verifying the replacement recommendation or the new stock bounds:

| Round-1 IDs | Inspection result |
| --- | --- |
| O1 | Both revised measures and intervals reproduce; blanket multiplier is rejected. The owner-facing conversion language still needs the qualification in finding 4. |
| O2 | Transition cohorts and the later step are measured and disclosed. The proposed weekly solution still combines the two regimes inside one week: finding 1. |
| O3 | Ranking exercise is labeled illustrative, the fair-share inference is removed, and pool dates match the rows. Fixed. |
| O4, S5 | Segment estimates and intervals reproduce; exceptions and the distinction between point estimates, evidence above 1, and evidence above 1.25 are supplied. Fixed. The null-dispersion exercise is descriptive, not proof of equivalence, and the artifact acknowledges that limit. |
| O5 | Per-video versus catalog-total units are now explicit. Fixed as a denominator disclosure; the strength of the catalog-total conclusion is a separate problem in finding 2. |
| S1, S2 | Mixed-accrual double-scaling is removed from the recommendation; 104 lower-bound overcorrections and the residual geometric contrast reproduce. Individual precision assurances are removed. Core fixes implemented. |
| S3 | Appropriately marked partly fixed: stable-viewing assumption, channel-sampling meaning, 39%/70% sensitivities, and missing calendar-matched control are explicit. No duplicate finding. |
| S4 | The unequal-age 2025 placebo is labeled and excluded from the null spread and seasonal argument. Fixed. |
| G1 | The previously omitted accrual interval is now included in code. Its revised totals reproduce, but the replacement is an assumption-driven calculation, not an identified bound or direct measurement: finding 2. |
| G2 | Balanced weights, old-weight sensitivity, PPML check, and concentration of the mix term are implemented and reproduce. Fixed. |
| G3 | Dominant-Shorts-channel exclusion and joint channel-resampling intervals are implemented and reproduce. Calendar mismatch remains disclosed; this is a sensitivity, not a validated causal DiD. No new material arithmetic error. |
| G4 | Timing now gives labeled pooled/geometric measures and weekly intervals. Later-growth windows are disclosed as unequal and demoted to weak support. Implemented; log-age normalization does not establish a matched comparison, and the revised text does not claim that it does. |
| G5 | Reading/video distinction and the narrower age-window sensitivity are implemented and reproduce. The 20–28-day row remains age-imbalanced and is labeled. Similar estimates after restriction support robustness, though they do not identify the age effect in an unchanged sample. No material duplicate finding. |

## Remaining findings

### 1. Material — Percentiles within publish week do not handle the transition inside that week

**Locations:** `report.md:16`, `:79`, `:87`; the corresponding recommendation in `skill-outputs/05-make-the-call.md`; the final paragraph of section 10 in `skill-outputs/04-diagnose-change.md`.

**Claim and evidence.** The owner is told the weekly-percentile option “handles late-August videos.” The option table says it handles the partly lifted cohorts without a factor. Yet the report's own publish week beginning August 24 contains both August 24–26 videos, with pooled contrast **1.190**, and August 27–30 videos, with contrast **1.985**. These are 2,181 and 3,200 videos respectively. Both groups are placed in the same weekly reference distribution.

An independent direct comparison, using the same [28,30)-day selection and balanced channel weights but matching these two groups to each other, yields **1.4993 pooled and 1.6709 geometric**, across **453 common channels, 2,111 early-week videos and 3,050 late-week videos**. This is not a comparison of separately standardized baseline ratios. It confirms a substantial within-week contrast exists in the data the recommendation would rank together.

A percentile transformation preserves the raw ordering within its reference week. It cannot remove a date-specific counting advantage *inside that week*. Also, the section-10 assertion that observed percentiles establish preserved order is invalid: separately sorted distributions necessarily have ordered quantiles, even if individual videos would exchange ranks under the two rules.

**Refutation attempted.** A trial is appropriate given unknown production costs, and weekly percentiles can absorb a common monotone transformation applied to every video in a week. Neither observation establishes that assumption for this transition week. The direct 1.4993 contrast is observational and does not establish that all of it is caused by the counting rule. If the report attributes it to the rule, weekly percentiles leave that distortion inside the week; if it is real viewing variation, the claimed corrective benefit is unverified. I am not claiming percentiles are generally unusable.

**Consequence and narrow correction.** Keep the option as a trial for cohorts with a plausibly common counting regime. Split or quarantine the August 24–30 transition week, explicitly retain the unverified rank-preservation assumption, and remove the assertion that the proposed weekly grouping already handles late August. A trial should check its intended ranking behavior at comparable reading ages rather than treating the marginal quantiles as validation. This is a remaining gap in O2's proposed remedy, not a request to restore the rejected multiplier.

### 2. Material — The new stored-total “bounds” are scenarios, so they do not establish a below-25% catalog effect

**Locations:** `report.md:11`, `:22`, `:54–55`, `:91`, appendix A9; `scripts/diagnose.py:352–409`; `scripts/review.py:60–78`; section 9 of `skill-outputs/04-diagnose-change.md`.

**Claim and evidence.** The owner gets an approximately 12% catalog increase, a “2% or less” dismissal of older videos, and an unconditional no-change answer if 25% meant the total. Supporting text calls the accrual estimates low/high bounds and says older cohorts moved “at most” 6.1%. However, the code extrapolates the later refetch rate backward for its low case, spreads the first count evenly from publication for its high case, and imputes missing pairs from the publication month's average. These require assumptions about the unobserved accrual curve and its representativeness. They are not bounds supplied by the readings.

This is demonstrable on the supplied rows: **1,183 paired long-form videos have the code's own “low” accrual above its “high” accrual** (summed low 40,457,562 versus high 33,546,928). For one video published December 5, 2025, the two readings are 3,596,490 on September 25 and 4,626,073 on October 25. The formulas return **2,125,802 low versus 1,423,303 high** post-switch views. Falling-rate assumptions do not hold for every observed video.

As a separate identification check, retain the report's common R = 1.743491 and assume nondecreasing counts without retroactive restatement. A pre-switch video with both readings after the switch can have post-switch accrual anywhere from its observed increment to its current count; if the readings straddle the switch, it can range from zero to the increment. Last readings before the switch have zero accrual, and post-switch publications have all their views after it. Use [0,current count] for cases without a usable ordered pair, including decreasing-count cases. Across the catalog these deliberately broad timestamp-compatible endpoints are **3,848,243,541–12,030,319,881 post-switch views**, on 16,963,368,205 stored views. Applying the report's own `added=A*(1-1/R)` gives **10.71%–43.35%** stock lift. This is an identification range under that common-factor model, not a confidence interval or a claim that 43% is likely. It shows why the narrower 11.6%–16.2% figures need accrual assumptions to exclude 25%.

The “measured” transition-stock figure is likewise inferred: `review.py` applies cohort ratios to first readings and the common R to subsequent growth. No counterfactual old-rule reading is observed. Applying marginal bootstrap endpoints through that formula does not measure accrual-model uncertainty. Finally, the owner-facing “2% or less” drops even the artifact's own high-scenario results of 2.4% and 6.1%.

**Refutation attempted.** The missed interval identified in G1 really is included now, all revised arithmetic reproduces, and declining view rates can make these useful planning scenarios. The assumptions are described in the method text. That justifies showing the scenarios; it does not justify presenting them as data bounds, directly measured lift, or an unconditional below-threshold result. I do not infer that the actual catalog effect exceeds 25%.

**Consequence and narrow correction.** Label approximately 12% as a modeled estimate under a common effect and an accrual scenario; show the scenario range beside it. Replace “bounds,” “measured,” “at most,” and the 2% cap where they imply identified limits. Make the no-change conclusion under the catalog-total interpretation conditional on those assumptions. Tighter actual bounds need additional historical readings or a defensible, validated accrual model.

### 3. Material — One creator below 1.25 cannot reverse a catalog-wide decision

**Locations:** `report.md:20`, `:92`; matching trigger in `skill-outputs/05-make-the-call.md`.

**Claim and evidence.** The trigger says that if **one creator's** September long-form export has views/engaged views below 1.25, “the step is not the rule and the call reverses.” The headline is a weighted contrast across 746 channels, and the revised analysis explicitly rejects assuming one common per-video factor. A below-threshold ratio in one channel is compatible with an above-threshold catalog effect. No representativeness condition, channel selection rule, or aggregation sufficient to bridge those populations is supplied.

**Refutation attempted.** Such an export is a useful first direct observation, can challenge attribution for that creator, and can expose weaknesses in the model. It would refute a universal claim that every video gained over 25%. That is not the revised catalog estimand, and the artifact already says segment effects need not be equal. Thus it cannot be the stated decisive falsifier.

**Consequence and narrow correction.** Make one export a trigger to investigate and update the inference, not to reverse the whole decision. A reversal needs evidence relevant to the target population and weighting, or a narrower decision restricted to that creator. This does not require an artificial experiment.

### 4. Minor — Owner-facing “right factors” and the 10,000-view example still overtranslate cohort contrasts

**Locations:** `report.md:11`, `:17`, `:39–41`, `:67`, `:80`; corresponding passages in skill outputs 03 and 05. Compare the explicit limitation in `skill-outputs/06-analysis-review.md`, unverified claim 3.

**Claim and evidence.** “The right factor runs 1.7x to 2.7x by video size” treats ratios between separately sorted pre/post percentiles as correction factors for videos of known size. They are not paired measurements of the same videos or the same plays. The response correctly acknowledges that a changed distribution could produce those percentile ratios without a size-dependent counting effect. That caveat is lost in the owner's rejection reason. Similarly, “10,000 old-rule views now show as … 21,300 for a typical video” can be repeated as an individual conversion; 2.13 is an exponentiated weighted mean-log contrast, not a measured conditional conversion for a 10,000-view video or a median-video ratio (the matched median ratio is about 2.02).

**Refutation attempted.** The headline arithmetic is correct; the stable-viewing caveat is now explicit; the 10,000 figures can be read as hypothetical illustrations of the standardized measures. The mixed-accrual and transition arguments independently justify rejecting the blanket multiplier. Consequently this is a reader-facing overstatement, not an arithmetic failure or a reason to change that rejection.

**Narrow correction.** Say “the observed ratios between cohort percentiles range from 1.7 to 2.7; their cause is unverified,” and describe the 10,000 calculation as an illustration of cohort summaries, not a conversion for an individual video. Keep the sampling-versus-causal qualification already added; no duplicate S3 finding is needed.

## Limits of this review

The public sources from the original run were not re-verified; the supplied brief was the rule-change premise. Engaged views, a contemporaneous matched control, deleted/private videos, the production ranking formula, and implementation costs are unavailable. The proposed percentile ranking was not run against an existing production ranking or tested with a human reader. No conclusion here is owner approval or proof that all other errors are absent.
