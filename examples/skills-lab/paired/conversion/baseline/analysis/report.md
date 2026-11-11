# Conversion decline: decision for the growth lead

**Do not roll back the signup experience on this evidence.** The aggregate decline is explained arithmetically by acquisition-channel mix; both measured channel conversion rates increased. No product change is established by the supplied evidence.

Synthetic aggregate data; two comparable weeks. Conversion = signups / eligible sessions.

| Channel | Baseline sessions → current | Baseline signups → current | Baseline conversion → current |
|---|---:|---:|---:|
| Direct | 8,000 → 2,000 | 800 → 220 | 10% → 11% |
| Paid | 2,000 → 8,000 | 80 → 400 | 4% → 5% |
| Total | 10,000 → 10,000 | 880 → 620 | 8.8% → 6.2% |

Overall conversion fell **2.6 percentage points**, or **29.55% relative**, with 260 fewer signups. Paid's share rose from 20% to 80%. Paid converted less often than direct in both periods.

Conversion chart (each block = 0.2 percentage points):

```text
                 Baseline                                                Current
Direct           ██████████████████████████████████████████████████ 10%   ███████████████████████████████████████████████████████ 11%
Paid             ████████████████████                                4%   █████████████████████████                               5%
Overall          ████████████████████████████████████████████      8.8%   ███████████████████████████████                       6.2%
```

## Competing explanation tested: channel mix

Hold baseline channel weights fixed and substitute current conversion rates:

`0.8 × 11% + 0.2 × 5% = 9.8%`, versus baseline 8.8%: **+1 pp**.

Hold baseline rates fixed and substitute current channel weights:

`0.2 × 10% + 0.8 × 4% = 5.2%`: **−3.6 pp** from mix alone.

Exact decomposition, with channel weight w and conversion rate r:

`current − baseline = Σ(w_current − w_baseline)r_baseline + Σw_current(r_current − r_baseline)`

`−2.6 pp = −3.6 pp mix + 1.0 pp within-channel improvement`.

At the common 10,000-session volume, these correspond to −360 and +100 signups, reconciling to −260. Both channel rates increased equally, so the interaction term is zero; reversing decomposition order gives the same totals. This is an aggregate/within-channel reversal consistent with Simpson's paradox.

## Limits and next step

These are descriptive reweightings, not causal estimates or forecasts. Broad channels can hide changes in audience, device, campaign or other composition. There is no random assignment, change log or user-level funnel evidence to identify signup-experience effects. Sessions are not independent people; no person-level significance claim is justified. Cost and profitability remain unknown.

The growth lead should investigate why direct sessions fell and paid sessions rose, checking acquisition and attribution records when available. Track overall conversion alongside channel shares and a fixed-mix conversion measure. Before deciding on rollback, establish whether an experience change occurred, inspect channel-specific funnel evidence, and, if warranted, run a randomized comparison with suitable user-level assignment and measurement. These are proposed checks; none was available or performed here.

## Reproduce

From DIR, run `awk -f analysis/calculate.awk data/conversion.csv`.

The executed code is `calculate.awk`; its actual output is `calculations.txt`. Input checks and the exact decomposition reconciliation passed. `command-log.md` records shell commands. No supplied `diagnose-change` skill exists in DIR; this analysis follows the case directly. Inputs were preserved; no network was used.
