# plan-analysis

## What it does

Produces an executable plan proportionate to the question. It recovers prior lessons, fixes the comparison, and orders tests by what they can settle — including a stopping condition — without pretending the queries have already run.

A retrieved lesson is a hypothesis to test. Retrieval that does not change a check, comparison, or stopping rule did not happen.

## When to reach for it

Type `/plan-analysis`, or ask in plain language.

Use it when the question is sharp enough to plan but the work has not started, especially when several explanations could produce the same headline. Skip it for a one-number lookup with a known definition. Use [grill-question](grill-question.md) if the estimand is still mush. Use [learn-from-analysis](learn-from-analysis.md) after a completed run.

## Lessons in, then tests that can fail

Search the user-designated lesson directory when one exists. For each hit, inspect evidence, scope, and invalidating conditions. If no store exists, proceed and do not claim retrieval.

Write the quantity to estimate before choosing cuts. For observational before/after data, distinguish describing movement from attributing it. First reproduce the headline and validate inputs; then name what each rival explanation predicts and the cheapest comparison that would weaken it. Post-hoc subgroup discovery is not confirmation.

The [lesson-reuse example](../examples/lesson-reuse.md) shows a second period that must test the earlier mix explanation instead of repeating it.

## Common questions

**Does every question need a long plan?** No. A descriptive count may need one calculation and a reconciliation. Match the ceremony to the decision.

**What if a prior lesson does not apply?** Say so, with the condition that fails. Do not force new data through an obsolete check.

**Is the plan evidence?** No. It is a commitment about what will be calculated and when to stop. Results come from [checked-analysis](checked-analysis.md).

## It's working if

- The comparison (population, window, baseline) is written before the first explanatory cut.
- Prior lessons are cited with an applicability judgment, or the plan states that none were found.
- Each planned step names the decision it informs and a stopping condition exists.
- Causal identification assumptions are listed only when the question is causal, and the plan says whether the data can test them.

## Where it fits

A Frame-stage standalone that [analyze](analyze.md) also performs internally. Neighbors: [diagnose-change](diagnose-change.md) for the movement playbook, [learn-from-analysis](learn-from-analysis.md) for the capture half of the loop. See [Analysis that compounds](../fieldnotes/analysis-that-compounds.md).
