# diagnose-change

## What it does

Treats a jump, drop, or discrepancy as a claim to reproduce. Recalculates the reported movement, then separates mix from within-group change before ranking explanations.

A decomposition says where the arithmetic moved. It does not say why people behaved differently, and it does not authorize a product intervention on its own.

## When to reach for it

Type `/diagnose-change`, or ask in plain language.

Use it when someone reports that a rate, total, or funnel “moved” and wants to know what to do. Use [grill-question](grill-question.md) first if the metric, window, or decision is still ambiguous. Use [plan-analysis](plan-analysis.md) when several competing explanations need an ordered test sequence. Use [analyze](analyze.md) when you want diagnosis inside a full question-to-answer run.

## Reproduce, then decompose

Restate units, population, window, and baseline. For a rate, show numerator, denominator, percentage-point change, and relative change. If reproduction fails, investigate the discrepancy first; any explanation of the original headline is then provisional.

A pooled rate is the sum of numerators over the sum of denominators, not the unweighted mean of segment rates. One transparent split is:

`total change = sum(w_before × (r_after − r_before)) + sum((w_after − w_before) × r_after)`

This ordering assigns the interaction to the mix term. A segment missing in one period has no observed rate: do not fill it with zero to force the formula.

The [conversion example](../examples/conversion-mix.md) is the teaching case: overall conversion falls while every channel improves.

## What the skill changed

One recorded pair on the [conversion case](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/cases/conversion.md): the same model (Codex `gpt-6.1-sol`, high effort), the same prompt, separate directories, no answer key, 2026-11-11. One run per side. This is not a benchmark.

Both runs got the arithmetic right: 8.8% to 6.2%, both channels up 1 pp, −3.6 pp from mix and +1.0 pp within channels. Both said not to roll back. The gap was small, and it was in how each run handled the evidence.

**Without the skill** ([raw output](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/paired/conversion/baseline/analysis/report.md)):

> **Do not roll back the signup experience on this evidence.** The aggregate decline is explained arithmetically by acquisition-channel mix; both measured channel conversion rates increased.

> These are descriptive reweightings, not causal estimates or forecasts.

It decomposed the drop correctly and stated the causal limits in prose. It did not keep a list of rival explanations or say what would reverse the call.

**With the skill** ([raw output](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/paired/conversion/with-skill/analysis/report.md)):

> This is an **exploratory** test chosen after inspecting the supplied counts, not a preregistered comparison.

> Evidence of harm under that design, or a verified release-linked measurement/product defect, would change the rollback recommendation. Stop here because the available aggregates cannot distinguish causal rivals further.

It reached the same answer and added a hypothesis ledger that kept a measurement artifact open as unresolved. It also listed the checks it could not run and named what would reverse the recommendation.

[Setup, prompts, hashes and limitations](https://github.com/patrickjmorris/aftergrid/blob/main/examples/skills-lab/paired/conversion/README.md).

## Common questions

**Does a mix shift mean the product is fine?** No. It means the aggregate movement is not evidence that every group got worse. Intent, device mix, or a product change can still move inside a channel.

**Should I keep slicing until the story is obvious?** No. Stop when the supported explanation is enough for the decision, remaining explanations predict the same available observations, or the next test needs data you do not have. New cuts after seeing a result are exploratory.

**Is this the same as analyze?** [analyze](analyze.md) carries the general execute-and-record discipline from ask to answer. This skill is the metric-movement playbook: reproduce, decompose, discriminate.

## It's working if

- The reported movement is recalculated from counts, with units and the baseline named.
- Mix and within-group contributions reconcile to the total, or the write-up says why they cannot.
- Failed explanations remain in the ledger instead of disappearing once an attractive story appears.
- Causal language is reserved for a design that can support it; the recommendation is the smallest next observation, not a prescribed intervention from a descriptive split.

## Where it fits

A standalone investigation skill in the Analyze stage. Neighbors: [explore-data](explore-data.md) when the grain is still unknown, [define-metric](define-metric.md) when “the metric” is several possible calculations, [analysis-review](analysis-review.md) when a completed diagnosis needs an adversary.
