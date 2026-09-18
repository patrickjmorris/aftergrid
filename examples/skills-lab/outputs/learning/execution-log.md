# Actual execution order

1. Executed first conversion analysis and saved its stdout/answer in `../conversion/`.
2. Searched existing output notes for conversion/mix/session/grain; no existing lesson store was present. Saved proposed lesson `lessons/conversion-mix.md` from the actual result.
3. Retrieved and read that lesson, then saved `plan.md` before reading or calculating `data/conversion-followup.csv`.

The tool transcript establishes order; exact wall-clock timestamps are not recorded here. Results below will be appended after execution; planned predictions are in the unchanged plan.

4. Read follow-up CSV after saving the plan; wrote and ran `calculate.py` once and saved actual stdout to `stdout.json`.
5. Planned validity checks passed: unique period/channel keys, exact period labels, positive integer denominators, bounded integer numerators, common channel support, and follow-up baseline identical to the earlier current counts. All rows used, no joins or exclusions. Supplied counting/comparability rules remain assumptions about upstream data.
6. Planned pooled reproduction: 620/10,000 = 6.2% to 800/10,000 = 8.0%, +1.8 pp / +29.03% relative. Recovery reproduced; total session volume unchanged.
7. Planned discriminating cut: direct share rose 20%→40%; paid fell 80%→60%. Direct rate stayed 11%; paid rose 5%→6%. Reverse mix direction contributes, but unchanged within-channel performance is contradicted by paid's improvement.
8. Planned decomposition: baseline-weighted rate change +0.8 pp; current-rate-valued mix +1.0 pp; exact sum +1.8 pp. Same ordering as first case. Diagnostic lesson applied; a claim that recovery is solely the previous mechanism in reverse is narrowed/rejected.
9. Exploratory context comparison after planned calculation: recovery to 8.0% remains 0.8 pp below the original 8.8% baseline. This extra comparison is descriptive, not a new causal test.
10. Stopped: the remaining causal explanations require unavailable user/exposure, changelog or other source evidence. No intervention, approval or human decision is inferred. Saved observed answer in `answer.md`.
