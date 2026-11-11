# Conversion decline: recommendation to the growth lead

**Do not roll back the signup experience on this evidence alone.** Session-to-signup conversion fell from **880/10,000 = 8.8%** in baseline to **620/10,000 = 6.2%** in current: **−2.6 percentage points**, or **−29.55% relative to baseline**. Both channels improved; the shift toward the lower-converting paid channel accounts for the pooled decline arithmetically. These data cannot establish whether a signup change occurred or what a rollback would do.

## What moved

Synthetic source: `data/conversion.csv`. Grain: one row per period and acquisition channel. Metric: signups attributed to eligible sessions / eligible sessions, not unique-person conversion. Periods are two comparable, equal-length weeks per the supplied context; calendar dates, timezone and reporting-date convention are unspecified.

| Channel | Baseline signups / sessions | Baseline rate | Current signups / sessions | Current rate | Change | Session share, baseline → current |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct | 800 / 8,000 | 10% | 220 / 2,000 | 11% | +1 pp | 80% → 20% |
| Paid | 80 / 2,000 | 4% | 400 / 8,000 | 5% | +1 pp | 20% → 80% |
| All | 880 / 10,000 | 8.8% | 620 / 10,000 | 6.2% | −2.6 pp | 100% → 100% |

Total eligible sessions stayed at 10,000; signups fell 260. Direct sessions fell 6,000 and signups fell 580; paid sessions rose 6,000 and signups rose 320. There is no net session-volume change.

## Discriminating test: channel composition

This is an **exploratory** test chosen after inspecting the supplied counts, not a preregistered comparison. A within-channel decline would support deterioration remaining after channel adjustment; higher within-channel rates alongside a lower pooled rate favor composition as the arithmetic explanation.

Hold session shares at baseline (80% direct, 20% paid), preserving the starting population mix:

`current standardized rate = 0.8 × 11% + 0.2 × 5% = 9.8%`

That is **+1 pp** above baseline's 8.8%, reversing the pooled decline. Conversely, current shares with unchanged baseline rates predict `0.2 × 10% + 0.8 × 4% = 5.2%`; observed current conversion is 6.2%, **1 pp higher**. Composition alone does not reproduce the exact result: within-channel improvements offset part of its negative contribution.

Exact decomposition, with session shares w and conversion rates r:

`Δ = Σ w_baseline × (r_current − r_baseline) + Σ (w_current − w_baseline) × r_current`

| Arithmetic contribution | Direct | Paid | Total |
| --- | ---: | ---: | ---: |
| Within-channel rate change | +0.8 pp | +0.2 pp | +1.0 pp |
| Channel-share change, valued at current rates | −6.6 pp | +3.0 pp | −3.6 pp |
| Sum | −5.8 pp | +3.2 pp | **−2.6 pp** |

At the common 10,000 sessions, these are +100 and −360 signups, summing to −260. This ordering assigns the rate/share interaction to mix. Here the net interaction is exactly zero because both channel rates increased by the same 1 pp, so reversing the ordering leaves the aggregate terms unchanged. These are accounting contributions, not causal intervention estimates.

## Hypothesis ledger after the test

| Explanation | Support / evidence against | Prediction and test | Status |
| --- | --- | --- | --- |
| Acquisition mix explains the pooled decline | Paid share rose 20% → 80%; its rate is lower in both weeks. Both channel rates improved, so pure mix with unchanged rates understates current conversion. | Standardization should remove/reverse decline; executed, 9.8% vs 8.8%. | Strongest supported arithmetic explanation, with offsetting within-channel improvement. |
| Signup experience deteriorated | No documented change or exposure; observed rates rose in both channels. | A simple across-channel deterioration predicts lower within-channel rates; that pattern is absent. Establish actual exposure, then compare randomized experiences within channel if applicable. | Simple descriptive version unsupported; causal harm remains unidentified because other shifts could mask it. |
| Measurement/coverage artifact | Context supplies equal definitions, equal lengths and exhaustive session attribution; row checks pass. No timestamps or instrumentation evidence independently establish completeness. | Audit collection, late arrivals, attribution and channel definitions against source events. | Unresolved; audit proposed, not executed. |

There is also no visibility into device, geography, campaign quality or other composition changes within each channel. Higher observed channel rates cannot prove the experience improved or was harmless.

## Checks and stopping point

Executed: four unique period/channel keys; identical channel coverage in both periods; positive integer session counts; integer signups between zero and sessions; pooled rates from summed counts; exact decomposition reconciliation. No joins, missing observed cells, exclusions or zero denominators. The supplied context establishes mutually exclusive, exhaustive session attribution; aggregates cannot independently verify session deduplication or signup eligibility.

Unavailable, therefore **not executed**: event/ingestion timestamp checks, late-arrival or cohort-maturity checks, instrumentation audit, historical placebo comparisons, unaffected controls, external estimate reconciliation, and release/exposure validation. Only two periods are supplied. Sessions can repeat people, so no independent-session significance claim or confidence interval is made. Arithmetic is exact for this file; sampling uncertainty and future performance are unestimated.

## Next step

The growth lead should first establish whether any signup experience changed and verify exposure timing and measurement completeness; this is a proposed check. Review the acquisition shift against the intended traffic plan and signup objective. No cost data or value-by-channel evidence supports cutting paid acquisition from this analysis alone.

If a real experience change is confirmed and rollback remains the decision, compare the two experiences with randomized assignment at an appropriate stable unit, analyze eligible-session conversion within channel and at fixed channel weights, and account for repeated sessions per person. Define the decision threshold from business requirements before running that test. Evidence of harm under that design, or a verified release-linked measurement/product defect, would change the rollback recommendation. Stop here because the available aggregates cannot distinguish causal rivals further.

## Reproduction

Actually ran, from DIR:

```sh
python3 -I -B analysis/calculate.py
```

`analysis/calculate.py` contains the complete calculation and assertions; `analysis/calculations.json` contains observed results, including exact decimal values. `analysis/journal.md` records the exploratory plan and observations; `analysis/command-log.md` records shell commands, including a failed logging command. Another analyst can rerun the script using only the supplied CSV and Python standard library.

Source SHA-256, verified unchanged during calculation and final review:
`200c05879fdfc0d8a8175c64332d79b517c6e0d81acd790bb0d2c806949f573b`.
