---
title: Choose the skill that fits the work
description: Pick the route that matches the stuck point.
kicker: Workflow guide
---

Use one skill where you are stuck, or ask `analyze` to carry a question through the whole sequence. Unsure which? Start with [ask-aftergrid](../skills/ask-aftergrid.md).

Most prompts below use slash syntax; in Codex, use `$skill-name`. The original craft skills, including analysis-review, are hidden from the Claude Code slash menu, so their examples use plain-language requests.

## When you are not sure which skill fits

```text
/ask-aftergrid Conversion fell and someone wants to roll back signup.
I have a four-row CSV. Which skill should I run first, and why not
analyze the whole question in one go?
```

The useful output is one next skill, the sibling it rejected, and a prompt you can paste. [Ask-aftergrid](../skills/ask-aftergrid.md) does not start that skill. User-invoked skills do not call each other.

## When the question is still vague

“How is activation doing?” hides several decisions: which users count, what activation means, when a user has had enough time, and what someone would do with the answer.

```text
/grill-question The product lead wants to know whether activation
improved after the new onboarding flow. Help us state the decision,
population, time window, comparison, and evidence that would change
our view. Use existing metric definitions where they fit.
```

The useful output is a question another analyst could execute. If “activation” itself is disputed, use [define-metric](../skills/define-metric.md). A proposed definition remains a proposal until the responsible person accepts it.

## When the data is unfamiliar

```text
/explore-data Inspect these exported tables before we analyze retention.
Identify their grain, keys, coverage, missing values, and plausible joins.
Run bounded probes and save a data map with what remains uncertain.
```

An inventory is most useful when it contains evidence: duplicate-key counts, date coverage, join cardinality, and fields whose meaning remains unclear. Follow with [plan-analysis](../skills/plan-analysis.md) when a decision requires several comparisons.

## When a metric moved

```text
/diagnose-change MRR rose this month. Use the account snapshots to
reconcile new, expansion, contraction, and churn. Explain whether
the starting customer base grew, and what we still need before choosing
between acquisition and retention work.
```

Expect a bridge back to the reported total, not a list of interesting segments. The [revenue example](../examples/revenue-bridge.md) shows why a small positive top line can coexist with substantial losses from existing accounts.

## When you want an end-to-end analysis

```text
/analyze Should we keep the onboarding checklist? Use the supplied
cohort data, write down the comparison before looking at outcomes,
check the calculations, and produce a short memo for the product lead.
Preserve the source and save the executed code with the answer.
```

[Analyze](../skills/analyze.md) coordinates. [Checked-analysis](../skills/checked-analysis.md) supplies the checking discipline; [write-finding](../skills/write-finding.md) turns results into a readable artifact; [iterate-visual](../skills/iterate-visual.md) inspects charts; [shape-narrative](../skills/shape-narrative.md) makes the answer and material caveat clear.

## When the draft sounds too certain

```text
Use analysis-review to review this memo against its source data and executed
queries. Challenge the method, whether it answers the decision, and
what the reader might infer. Name the smallest correction needed for
each blocking issue. Do not rewrite a result to fit the headline.
```

“The calculation is correct” and “the recommendation follows” are separate judgments. Use [revise-finding](../skills/revise-finding.md) for feedback on an existing artifact; a change to a denominator needs more scrutiny than a shorter title.

## When the work taught you something reusable

```text
/learn-from-analysis We caught a session/user denominator mismatch.
Capture the scoped lesson and its evidence. Prefer a reusable check
where it can enforce the rule. Show where the next relevant analysis
will find it, and what would make the lesson no longer applicable.
```

A lesson should change a future question, check, or interpretation. It should not silently promote a provisional definition into an approved fact. [Analysis that compounds](../fieldnotes/analysis-that-compounds.md) shows the capture-and-retrieval pattern.

For the Engine’s structured evidence and publication workflow, [setup-aftergrid](../skills/setup-aftergrid.md) is a separate step. The analytical skills are useful before you adopt it.
