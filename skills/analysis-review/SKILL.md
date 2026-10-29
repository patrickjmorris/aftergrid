---
name: analysis-review
description: "Challenge an analysis, notebook, chart, or memo for calculation errors, unsupported conclusions, question drift, and reader misinterpretation. Review evidence adversarially without inventing objections."
user-invocable: false
---

# Review an analysis

Review the artifact supplied: SQL and results, notebook, chart, memo, or an Engine Finding. Do not require a manifest or CLI for ordinary work. For a Finding, preserve [the Engine review procedure](references/engine-workflow.md), including current content digests and separate human publication approval.

## Identify what can actually be judged

Read the original question, intended reader, analysis, and evidence that is available. Distinguish source data, calculated results, assumptions, and author claims. Missing SQL or raw data limits verification; report the specific unverified claim instead of pretending to have rerun it or refusing all useful review. When you review from aggregates alone, list the design claims you could not check (when each side was measured, how units were matched, what a saved result contains) under their own heading as unverified. Do not let them pass silently.

## Apply four lenses

**Method:** Trace important numbers to their source and formula. Test the artifact against every section of [the rigor rules](references/rigor.md) it touches: rates and denominators, changes, mix, grain and joins, time and coverage, causal language, planned versus exploratory cuts, and executed versus proposed checks. Also inspect selection effects, uncertainty, and repeated comparisons when relevant. Ask whether an alternative explanation produces the same observations. For a before/after claim, check that the before measurements were taken before the change, and that a segment exception survives the same controls as the headline. Engine mode additionally follows its narrower accepted claim contract.

**Question:** Compare the original ask with the answer's metric, population, window, and comparison. Look for cherry-picked cuts, a switched baseline, unexplained reframing, or an outcome contradicted by its own checks. Distinguish evidence against a hypothesis from a failed data pipeline. Ask what plausible observation would change the conclusion and whether it was sought, without demanding an artificial experiment for a descriptive question.

**Reader:** Read the answer and chart as the intended audience, and apply every criterion in [the narrative criteria](references/narrative-criteria.md), the same page the writer uses. Is the decisive caveat adjacent to the claim? Could someone repeat the headline with the wrong denominator, period, certainty, or causal meaning? Does the visual emphasize a claim the prose retreats from? A reader simulation is an agent critique, never evidence of a human's comprehension.

**Materiality:** When the artifact informs a decision, ask whether the headline is big enough to matter. Is it stated in a unit the owner manages? Is it compared with normal variation, the goal, and the size of effect that would change the decision? Does a true but immaterial finding lead while the one that drives the decision sits in a parenthetical? Does the recommendation, if any, rest on the finding it cites, and is a costly or irreversible action backed by evidence of cause? Skip this lens for a purely descriptive request.

## Refute your own findings

For every suspected error, locate the exact claim and evidence, state the consequence, and actively look for an explanation that would make the author's choice correct. Discard objections refuted by the artifact. Keep uncertainty explicit when source access is missing. Do not pad the review with generic best practices or classify a cosmetic preference as an analytical failure.

When independent agents are available and justified by complexity, give each lens the raw artifacts, including row-level data when it can be shared, without other reviewers' conclusions; reconcile duplicated objections afterward. Otherwise run separate serial passes and disclose that one agent did them. Never invent independent reviewers or model identities.

## Deliver actionable judgments

Lead with errors that would materially mislead the reader or change the decision. For each, give the location, evidence, why it matters, the narrow correction or missing observation, and any remaining uncertainty. Separate material errors from presentation improvements and limitations of the review. If no substantiated errors remain, say so; this is not approval or proof that no errors exist.

Do not rewrite the artifact unless asked. When a fix adds a qualification to an owner-facing summary, say what it should replace. Review should leave the summary no longer than it found it. For Engine Findings, record only reviews actually performed against the current content; never re-pin an old review to edited content or call agent review human approval.
