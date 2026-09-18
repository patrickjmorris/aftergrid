---
name: analysis-review
description: "Challenge an analysis, notebook, chart, or memo for calculation errors, unsupported conclusions, question drift, and reader misinterpretation. Review evidence adversarially without inventing objections."
user-invocable: false
---

# Review an analysis

Review the artifact supplied: SQL and results, notebook, chart, memo, or an Engine Finding. Do not require a manifest or CLI for ordinary work. For a Finding, preserve [the Engine review procedure](references/engine-workflow.md), including current content digests and separate human publication approval.

## Identify what can actually be judged

Read the original question, intended reader, analysis, and evidence that is available. Distinguish source data, calculated results, assumptions, and author claims. Missing SQL or raw data limits verification; report the specific unverified claim instead of pretending to have rerun it or refusing all useful review.

## Apply three lenses

**Method:** Trace important numbers to their source and formula. Check numerator/denominator eligibility, pooled versus averaged rates, grain and join multiplication, exclusions, units, timezone, partial periods and cohort maturity. Inspect mixture/selection effects, uncertainty, repeated comparisons, and post-result threshold changes when relevant. Ask whether an alternative explanation produces the same observations. Causal verbs need a defensible identification strategy; association alone is insufficient. Engine mode additionally follows its narrower accepted claim contract.

**Question:** Compare the original ask with the answer's metric, population, window, and comparison. Look for cherry-picked cuts, a switched baseline, unexplained reframing, or an outcome contradicted by its own checks. Distinguish evidence against a hypothesis from a failed data pipeline. Ask what plausible observation would change the conclusion and whether it was sought, without demanding an artificial experiment for a descriptive question.

**Reader:** Read the answer and chart as the intended audience. Is the decisive caveat adjacent to the claim? Could someone repeat the headline with the wrong denominator, period, certainty, or causal meaning? Does the visual emphasize a claim the prose retreats from? A reader simulation is an agent critique, never evidence of a human's comprehension.

## Refute your own findings

For every suspected error, locate the exact claim and evidence, state the consequence, and actively look for an explanation that would make the author's choice correct. Discard objections refuted by the artifact. Keep uncertainty explicit when source access is missing. Do not pad the review with generic best practices or classify a cosmetic preference as an analytical failure.

When independent agents are available and justified by complexity, give each lens the raw artifacts without other reviewers' conclusions; reconcile duplicated objections afterward. Otherwise run separate serial passes and disclose that one agent did them. Never invent independent reviewers or model identities.

## Deliver actionable judgments

Lead with errors that would materially mislead the reader or change the decision. For each, give the location, evidence, why it matters, the narrow correction or missing observation, and any remaining uncertainty. Separate material errors from presentation improvements and limitations of the review. If no substantiated errors remain, say so; this is not approval or proof that no errors exist.

Do not rewrite the artifact unless asked. For Engine Findings, record only reviews actually performed against the current content; never re-pin an old review to edited content or call agent review human approval.
