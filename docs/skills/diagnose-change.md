# diagnose-change

Investigate why a metric moved. Reproduce the change, separate numerator, denominator and mix effects, rank rival explanations, and run discriminating tests without mistaking decomposition for causation.

## What it does

`diagnose-change` treats a jump, drop, or discrepancy as a claim to reproduce, not a story to decorate. It recalculates the reported movement from the smallest sufficient source, then separates arithmetic contributions — within-group change versus mix — before ranking explanations.

The defining constraint: a decomposition says where the arithmetic moved. It does not say why people behaved differently, and it does not authorize a product intervention on its own.

## When to reach for it

Type `/diagnose-change`, or ask in plain language. The skill is available for explicit use and automatic discovery.

Reach for it when someone reports that a rate, total, or funnel “moved” and wants to know what to do. Use [grill-question](grill-question.md) first if the metric, window, or decision is still ambiguous. Use [plan-analysis](plan-analysis.md) when several competing explanations need an ordered test sequence before any cut. Use [analyze](analyze.md) when you want diagnosis inside a full question-to-answer run.

## Reproduce, then decompose

Restate units, population, window, and baseline. For a rate, show numerator, denominator, percentage-point change, and relative change. If reproduction fails, investigate the discrepancy first; any explanation of the original headline is then provisional.

A pooled rate is the sum of numerators over the sum of denominators, not the unweighted mean of segment rates. One transparent split is:

`total change = sum(w_before × (r_after − r_before)) + sum((w_after − w_before) × r_after)`

State that this ordering assigns the interaction to the mix term. A segment missing in one period has no observed rate: do not fill it with zero to force the formula.

The [conversion example](../examples/conversion-mix.md) is the teaching case: overall conversion falls while every channel improves.

## Common questions

**Does a mix shift mean the product is fine?** No. It means the aggregate movement is not evidence that every group got worse. Intent, device mix, or a product change can still move inside a channel. The next evidence is whatever would distinguish those remaining explanations.

**Should I keep slicing until the story is obvious?** No. Stop when the supported explanation is enough for the decision, remaining explanations predict the same available observations, or the next test needs data you do not have. New cuts after seeing a result are exploratory.

**Is this the same as checked-analysis?** [checked-analysis](checked-analysis.md) is the general execute-and-record discipline. This skill is the metric-movement playbook: reproduce, decompose, discriminate. Use both when a movement diagnosis needs retained calculations.

## It's working if

- The reported movement is recalculated from counts, with units and the baseline named.
- Mix and within-group contributions reconcile to the total, or the write-up says why they cannot.
- Failed explanations remain in the ledger instead of disappearing once an attractive story appears.
- Causal language is reserved for a design that can support it; the recommendation is the smallest next observation, not a prescribed intervention from a descriptive split.

## Where it fits

A standalone investigation skill in the Analyze stage. Neighbors: [explore-data](explore-data.md) when the grain is still unknown, [define-metric](define-metric.md) when “the metric” is several possible calculations, [analysis-review](analysis-review.md) when a completed diagnosis needs an adversary. The map is [ask-aftergrid](ask-aftergrid.md).
