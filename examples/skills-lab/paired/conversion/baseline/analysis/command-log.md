# Command log

1. `mkdir analysis`
2. `printf ... > analysis/command-log.md` (initialize this log with the first commands)
3. `cat case.md`
4. `rg --files --hidden -g '!analysis/**' .`
5. `ls -la .`
6. `cat data/conversion.csv`

7. `cat > analysis/calculate.awk <<'AWK' … AWK` — created the calculation code preserved verbatim in `analysis/calculate.awk`.
8. `awk -f analysis/calculate.awk data/conversion.csv > analysis/calculations.txt`
9. `cat analysis/calculations.txt`

Log maintenance: each invocation also appends its commands to this file using `cat >> analysis/command-log.md <<'EOF'`. Commands 1–3 were executed in one invocation; 5–6 in one invocation. No network commands were run.

10. `cat > analysis/report.md <<'REPORT' ... REPORT` — report payload is preserved verbatim below.
11. `cat analysis/calculate.awk >> analysis/command-log.md` — expand command 7's exact AWK payload in this log.
12. `cat analysis/report.md >> analysis/command-log.md` — expand command 10's exact report payload in this log.
13. `wc -l analysis/report.md analysis/calculate.awk analysis/calculations.txt analysis/command-log.md`

Command 2's exact initialization command was:
```sh
printf '%s\n' '# Command log' '' '1. `mkdir analysis`' '2. `printf ... > analysis/command-log.md` (initialize this log with the first commands)' '3. `cat case.md`' > analysis/command-log.md
```
All logging writes used shell heredocs as described above; they only wrote this output log. Commands are listed in execution order; expanded payloads follow as supporting detail.

Command 7 AWK payload:
BEGIN { FS=","; OFS="\t" }
NR==1 {
  if ($0 != "period,channel,eligible_sessions,signups") { bad=1; exit }
  next
}
{
  p=$1; c=$2
  if (NF!=4 || (p!="baseline" && p!="current") || c=="" ||
      $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ || $3<=0 || $4>$3 || seen[p,c]++) {
    bad=1; exit
  }
  channels[c]=1
  n[p,c]=$3; y[p,c]=$4
  total_n[p]+=$3; total_y[p]+=$4
  rows++
}
END {
  if (bad || rows!=4 || total_n["baseline"]<=0 || total_n["current"]<=0) {
    print "ERROR: invalid input"; exit 1
  }
  for (c in channels) {
    if (!seen["baseline",c] || !seen["current",c]) {
      print "ERROR: unmatched channels"; exit 1
    }
  }
  print "Validated: four unique period/channel rows; positive session counts; integer signups within sessions; matched channels."
  print "period", "sessions", "signups", "conversion_pct"
  printf "baseline\t%d\t%d\t%.4f\n", total_n["baseline"], total_y["baseline"], 100*total_y["baseline"]/total_n["baseline"]
  printf "current\t%d\t%d\t%.4f\n", total_n["current"], total_y["current"], 100*total_y["current"]/total_n["current"]
  print "channel", "baseline_weight_pct", "current_weight_pct", "baseline_rate_pct", "current_rate_pct", "rate_change_pp", "mix_contribution_pp", "within_contribution_pp"
  for (c in channels) {
    w0=n["baseline",c]/total_n["baseline"]
    w1=n["current",c]/total_n["current"]
    r0=y["baseline",c]/n["baseline",c]
    r1=y["current",c]/n["current",c]
    fixed_base+=w0*r1
    fixed_current+=w1*r0
    mix+=(w1-w0)*r0
    within+=w1*(r1-r0)
    interaction+=(w1-w0)*(r1-r0)
    printf "%s\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\n", c, 100*w0, 100*w1, 100*r0, 100*r1, 100*(r1-r0), 100*(w1-w0)*r0, 100*w1*(r1-r0)
  }
  base=total_y["baseline"]/total_n["baseline"]
  curr=total_y["current"]/total_n["current"]
  printf "Observed change: %.4f percentage points; %.4f percent relative; %+d signups.\n", 100*(curr-base), 100*(curr/base-1), total_y["current"]-total_y["baseline"]
  printf "Baseline weights, current rates: %.4f%%.\n", 100*fixed_base
  printf "Current weights, baseline rates: %.4f%%; %.0f counterfactual signups at current volume.\n", 100*fixed_current, fixed_current*total_n["current"]
  printf "Exact decomposition (baseline rates for mix; current weights for within): mix %+.4f pp, within %+.4f pp, sum %+.4f pp.\n", 100*mix, 100*within, 100*(mix+within)
  printf "Interaction term: %.4f pp.\n", 100*interaction
  printf "At equal 10000-session volumes: mix %+.0f signups; within %+.0f signups.\n", mix*total_n["current"], within*total_n["current"]
  residual=curr-base-mix-within
  if (residual>0.000000001 || residual< -0.000000001) {
    print "ERROR: decomposition does not reconcile"; exit 1
  }
  print "PASS: decomposition reconciles with observed change."
}

Command 10 REPORT payload:
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
