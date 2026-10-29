---
name: diagnose-change
description: "Investigate why a metric moved. Reproduce the change, separate numerator, denominator and mix effects, rank rival explanations, and run discriminating tests without mistaking decomposition for causation."
disable-model-invocation: false
user-invocable: true
---

# Diagnose a metric change

Investigate a reported jump, drop, anomaly, or discrepancy using the user's data and existing tools. Work without a CLI or Instance. The output is an explanation supported by observed tests, or a precise account of why the evidence cannot distinguish explanations.

## Reproduce before explaining

Restate metric, units, source, eligible population, time window/timezone, and baseline. Recalculate the reported movement from the smallest sufficient source and reconcile it to the reported number. Before treating the movement as behavior, run the time, coverage, and join checks in [rigor](references/rigor.md).

For a rate, show numerator, denominator, absolute percentage-point change, and relative change with a defined baseline, as the rate and change rules in [rigor](references/rigor.md) require. If reproduction fails, investigate the discrepancy first and label any explanation of the original headline provisional. Do not turn an unavailable source into an assumed root cause.

## Separate arithmetic contributions

Test whether movement comes from changes within comparable groups or a change in their weights. Compute every pooled rate as [rigor](references/rigor.md) defines it. Recompute each period with a common set of segment weights when useful, stating which weights you chose and why.

For contributions, use an exact decomposition and identify interactions rather than assigning the same movement to several factors. With segment rates `r` and denominator shares `w`, one transparent path is:

`total change = sum(w_before × (r_after − r_before)) + sum((w_after − w_before) × r_after)`.

The terms sum to the observed change when the groups form the same exhaustive partition. State that this ordering assigns the interaction to the mix term; another ordering reallocates it. A segment absent in a period has no observed rate for that period: do not fill it with zero to force the formula. Report entry/exit separately or use a justified common-support comparison. The decomposition is arithmetic, not a cause.

For funnels inspect entrants, eligibility, stage conversion and elapsed time. For totals inspect volume, value per unit, mix and coverage. Choose only dimensions with a meaningful connection to the question.

## Check the comparison before trusting it

Before attributing a step to an event, confirm that each side was measured under the condition it claims. Compare measurement timestamps, not only event or cohort dates: a reading taken after the change belongs to the after side, whatever the unit's start date. Compare units with themselves (the same customer, channel, store) at the same age or exposure when the data allows.

Run the same estimator on comparisons where nothing changed: earlier pairs of periods, the same weeks a year earlier, or a group the event should not touch. Report that spread beside the main result. A step means something only against it.

When others have published an estimate of the same change, compare yours with theirs. Different methods that land in the same place strengthen the result. A gap needs an explanation: a different population, measure, or window, or an error on one side.

A segment departs from the headline only if it departs under the headline's own controls. When a pooled segment split disagrees with its within-unit version, the split is composition, not a finding. Do not report it as an exception.

## Rank and discriminate

Keep a small hypothesis ledger: explanation, observed support, evidence against it, prediction, next discriminating test, status. Rank by current support and testability, not narrative appeal. Before each cut, say what each plausible result would change. Prefer a comparison that can rule something out over another chart consistent with everything.

After each test, record the actual observation and update the ledger. Preserve failed explanations, but do not fabricate dead ends or force a minimum number of hypotheses. Label cuts as [rigor](references/rigor.md) requires for planned and exploratory work. Re-anchor if the work starts answering a different question.

Stop when the supported explanation is sufficient for the decision, the remaining explanations predict the same available observations, or the next test needs unavailable data/authorization. Do not keep slicing until a convenient story appears.

## Report the diagnosis

Lead with the reproduced change and the best-supported explanation at its actual level of certainty. Give the calculation/decomposition, checked alternatives, surviving rivals, source/query references, and what would change the conclusion. Distinguish measurement problems, arithmetic composition, associations, and causal explanations. Recommend the smallest useful next observation or action; do not prescribe a business intervention solely from a descriptive decomposition. When the owner needs a call rather than a diagnosis, an available `make-the-call` skill takes the diagnosis from here: it ties the move to the goal, judges materiality, and weighs the options.

When working in an Engine Finding, keep the diagnosis in the existing probe/execution record and preserve its claim, falsifier, and review rules; this skill alone grants no Engine verification or approval.
