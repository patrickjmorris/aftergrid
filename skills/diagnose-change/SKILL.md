---
name: diagnose-change
description: "Investigate why a metric moved. Reproduce the change, separate numerator, denominator and mix effects, rank rival explanations, and run discriminating tests without mistaking decomposition for causation."
disable-model-invocation: false
user-invocable: true
---

# Diagnose a metric change

Investigate a reported jump, drop, anomaly, or discrepancy using the user's data and existing tools. Work without a CLI or Instance. The output is an explanation supported by observed tests, or a precise account of why the evidence cannot distinguish explanations.

## Reproduce before explaining

Restate metric, units, source, eligible population, time window/timezone, and baseline. Recalculate the reported movement from the smallest sufficient source and reconcile it to the reported number. Check late arrivals, incomplete periods, instrumentation/schema changes, duplicated records, joins, and definition changes before treating the movement as behavior.

For a rate, show numerator, denominator, absolute percentage-point change, and relative change with a defined baseline. If reproduction fails, investigate the discrepancy first and label any explanation of the original headline provisional. Do not turn an unavailable source into an assumed root cause.

## Separate arithmetic contributions

Test whether movement comes from changes within comparable groups or a change in their weights. A pooled rate is `sum(numerator) / sum(denominator)`, not the unweighted mean of segment rates. Recompute each period with a common set of segment weights when useful, stating which weights you chose and why. A rate can decline overall while every segment improves.

For contributions, use an exact decomposition and identify interactions rather than assigning the same movement to several factors. With segment rates `r` and denominator shares `w`, one transparent path is:

`total change = sum(w_before × (r_after − r_before)) + sum((w_after − w_before) × r_after)`.

The terms sum to the observed change when the groups form the same exhaustive partition. State that this ordering assigns the interaction to the mix term; another ordering reallocates it. A segment absent in a period has no observed rate for that period: do not fill it with zero to force the formula. Report entry/exit separately or use a justified common-support comparison. Decomposition describes where arithmetic movement comes from; it does not establish why people behaved differently.

For funnels inspect entrants, eligibility, stage conversion and elapsed time. For totals inspect volume, value per unit, mix and coverage. Choose only dimensions with a meaningful connection to the question.

## Rank and discriminate

Keep a small hypothesis ledger: explanation, observed support, evidence against it, prediction, next discriminating test, status. Rank by current support and testability, not narrative appeal. Before each cut, say what each plausible result would change. Prefer a comparison that can rule something out over another chart consistent with everything.

After each test, record the actual observation and update the ledger. Preserve failed explanations, but do not fabricate dead ends or force a minimum number of hypotheses. New cuts after seeing a result are exploratory. Re-anchor if the work starts answering a different question.

Stop when the supported explanation is sufficient for the decision, the remaining explanations predict the same available observations, or the next test needs unavailable data/authorization. Do not keep slicing until a convenient story appears.

## Report the diagnosis

Lead with the reproduced change and the best-supported explanation at its actual level of certainty. Give the calculation/decomposition, checked alternatives, surviving rivals, source/query references, and what would change the conclusion. Distinguish measurement problems, arithmetic composition, associations, and causal explanations. Recommend the smallest useful next observation or action; do not prescribe a business intervention solely from a descriptive decomposition.

When working in an Engine Finding, keep the diagnosis in the existing probe/execution record and preserve its claim, falsifier, and review rules; this skill alone grants no Engine verification or approval.
