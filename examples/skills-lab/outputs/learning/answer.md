# Recovery reflects both a partial mix reversal and paid-channel improvement

Conversion rose from **620/10,000 = 6.2%** to **800/10,000 = 8.0%**, **+1.8 percentage points / +29.03% relative to this case's baseline**. The baseline exactly matches the first case's current period by channel. Eligible session volume stayed 10,000, while signups rose 180.

| Channel | Baseline rate | Current rate | Baseline weight | Current weight |
|---|---:|---:|---:|---:|
| Direct | 220/2,000 = 11% | 440/4,000 = 11% | 20% | 40% |
| Paid | 400/8,000 = 5% | 360/6,000 = 6% | 80% | 60% |

The earlier decline involved paid share rising from 20% to 80%. It has now fallen to 60%, so the mix moved partially back toward the higher-rate direct channel, but it did not return to the original mix. Meanwhile paid conversion rose a further point. Direct signups rose 220 because its volume doubled; paid signups fell 40 despite its improving rate because its volume fell.

Using the same exact decomposition as the first case:

- Within-channel component at baseline weights: 20% × (11%−11%) + 80% × (6%−5%) = **+0.8 pp**.
- Mix component at current rates: (40%−20%) × 11% + (60%−80%) × 6% = **+1.0 pp**.
- Total: **+1.8 pp**, exactly the pooled change. Baseline-weighted current conversion is **7.0%**, up from 6.2%.

The interaction is assigned to mix by this ordering. Equally valid orderings change the individual contribution values. These components are descriptive arithmetic, not causal shares of an intervention's effect.

The prior proposed lesson [conversion mix](lessons/conversion-mix.md) changed the [pre-execution plan](plan.md): I tested both weights and within-channel rates, rather than assuming the previous mechanism repeated. Its scope matched the unchanged channel/counting rules, common channel support and verified baseline continuity. **The diagnostic practice was applied; the old explanation was narrowed.** Recovery includes a partial mix reversal and a paid-rate improvement. A pure reverse-mix account predicts no within-channel contribution, which the +0.8 pp observed contribution contradicts. A pure rate-improvement account predicts no mix contribution, which the +1.0 pp mix contribution contradicts. Both components survive; neither establishes why behavior or traffic changed. The lesson remains proposed, without owner approval.

An additional, explicitly exploratory comparison shows current 8.0% remains 0.8 pp below the original 8.8%. The recovery is therefore partial even in aggregate.

Checks actually run: key uniqueness, exact baseline/current labels, positive integer session counts, 0 <= integer signups <= sessions, same channels in each period, exact equality of follow-up baseline to earlier current counts, and exact fractional reconciliation. Both four-row extracts were read without modification; all rows were used, no joins/exclusions/zero-filling. Comparable weeks and unchanged definitions are supplied context. Dates/timezone, late arrivals, upstream completeness and instrumentation history are unavailable. Sessions are not unique people; repeated-session dependence and channel-internal selection cannot be inspected.

Next useful observation: source/exposure or acquisition records that explain the channel-share shift and comparable user/exposure data for the paid-rate change. No intervention, cost record or user-level history is supplied, so do not attribute recovery to a product change or infer profitable acquisition. The available arithmetic resolves this question at channel level; it cannot distinguish the surviving causal explanations.

Evidence: [executed standalone Python](calculate.py), [actual stdout and input hashes](stdout.json), [actual execution log](execution-log.md), earlier [conversion answer](../conversion/answer.md). Rerun from the supplied root: `python3 outputs/learning/calculate.py`. One agent performed these checks; no human approval, independent review or experiment is claimed.
