# Conversion declined despite improving rates in both channels

For the growth lead: conversion fell from 880/10,000 = **8.8%** to 620/10,000 = **6.2%**, a **2.6 percentage-point decline (29.55% relative to baseline)**. Eligible session volume was unchanged; signups fell by 260. These are session rates, not unique-person rates.

| Channel | Baseline rate | Current rate | Baseline session share | Current share |
|---|---:|---:|---:|---:|
| Direct | 800/8,000 = 10% | 220/2,000 = 11% | 80% | 20% |
| Paid | 80/2,000 = 4% | 400/8,000 = 5% | 20% | 80% |

The strongest testable rival to worsening signup performance is acquisition composition: the lower-converting paid channel became much larger. At baseline weights, current conversion would be 80% × 11% + 20% × 5% = **9.8%**, versus 8.8% before. This standardization is arithmetic, not a forecast or intervention effect.

Exact decomposition: sum(w_before × change in channel rate) = **+1.0 pp**; sum(change in channel weight × current channel rate) = **−3.6 pp**. Together they equal **−2.6 pp**. Direct contributions are +0.8 and −6.6 pp; paid contributions are +0.2 and +3.0 pp. This ordering allocates the rate/weight interaction to mix; other orderings can redistribute contributions.

| Ranked hypothesis | Prediction/test | Observed support and evidence against | Status / next discriminating evidence |
|---|---|---|---|
| 1. Composition explains the pooled decline arithmetically | Shares shift toward the lower-rate channel; fixed-weight rate does not decline | Paid share rose 20%→80%, both rates rose 1 pp, standardized rate rose 1 pp | Supported as decomposition; traffic source/quality and acquisition logs would explain why weights changed |
| 2. Broad within-channel deterioration | Comparable channel rates fall | Neither channel fell; this contradicts that descriptive prediction | Not supported at this grain; product effects could still be masked by selection or other concurrent changes; exposure-level comparison or a randomized test would discriminate |
| 3. Measurement artifact | Invalid keys/counts, changed eligibility or inconsistent periods | Key/range/common-support checks pass; equal periods/definitions are supplied | No observed artifact; upstream completeness, late arrival and instrumentation history cannot be checked here |

**Do not roll back solely on this aggregate decline.** No product change or exposure evidence is supplied, and the data do not identify a harmful signup experience. First inspect the acquisition mix change and obtain any release/exposure logs; if a signup change is actually at issue, compare randomized exposure with the same eligibility and observation window. The recommendation would change with evidence of harm within comparable exposed populations or a measurement issue that changes these counts.

Scope and checks: synthetic aggregate population, one row per period/channel, two equal-length weeks, identical session attribution definitions by case context. Calendar dates/timezone are not recorded. All four rows used, no joins/exclusions, unique keys, positive integer denominators, bounded numerators and matching channels checked by code; exact fractional reconciliation passes. Aggregate rows cannot verify deduplication upstream, late events or true population completeness. No costs, user-level records, randomization or changelog are supplied. No causal effect, statistical confidence or human decision is claimed.

Evidence: [plan](plan.md), [executed Python](calculate.py), [actual stdout](stdout.json), source `data/conversion.csv` (hash in stdout). Rerun from the supplied root: `python3 outputs/conversion/calculate.py`. The planned checks ran once; their observations are above. Stop: remaining causal explanations are indistinguishable with this extract.
