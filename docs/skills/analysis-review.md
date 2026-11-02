# analysis-review

## What it does

Tries to disprove an answer before someone acts on it. It reads through four lenses (**method**, **question**, **reader**, and **materiality**), then discards objections the artifact already refutes.

A review can change the verdict to “inconclusive.” Agreement among reviewers is evidence to weigh, not an automatic fix instruction. Agent review is never human approval.

## When to reach for it

Ask in plain language, or type `/analysis-review` in hosts that expose it. Hidden from the Claude Code slash menu. The agent may reach for it when a draft is about to be trusted.

Use it when a memo, notebook, or chart is about to inform a decision. Use [analyze](analyze.md) if the calculations have not been run. Use [revise-finding](revise-finding.md) to apply the review, not to perform it. Use [write-finding](write-finding.md) when the issue is order and wording, not whether the claim is earned.

## Four lenses, then refute yourself

**Method** traces numbers to source and formula: denominators, pooled versus averaged rates, joins, partial periods, causal verbs without identification. **Question** compares the original ask with the answer actually given. **Reader** asks what a non-SQL audience could reasonably repeat wrongly, against the same narrative criteria write-finding writes to. **Materiality** asks whether the headline is big enough to change the decision, measured against normal variation and the goal, and whether a true but minor finding is leading while the one that matters sits in a parenthetical.

For every suspected error, look for the explanation that would make the author’s choice correct. Do not pad the review with generic best practices. Independent reviewers help when the work justifies them; serial self-review must be disclosed as such. Never invent reviewer identities.

The [onboarding teaching case](../examples/causal-claim.md) is the cautionary draft: a real 20 percentage-point difference that does not identify an intervention effect.

## Common questions

**Does a blocking finding mean the analysis was wrong?** It means someone acting on the artifact as it stands would be misled. The fix is often a sentence, a denominator, or a caveat moved next to the answer.

**What if I cannot rerun the SQL?** Report the specific unverified claim. Missing source access limits verification; it does not require refusing all useful review.

**Can this approve a Finding?** No. Recording that three agent reviewers read the current content is not an attestation and not a Reader study.

## It's working if

- Material errors come first, each with location, evidence, consequence, and the narrow correction.
- Cosmetic preferences are not classified as analytical failures.
- Objections refuted by the artifact are dropped.
- If no substantiated errors remain, the review says so — and does not call that proof that none exist.

## Where it fits

Model-invoked Improve-stage craft; the pstack analog in this set. [analyze](analyze.md) reaches for it before claiming the draft is reviewed.

If you use the optional command-line tool, [this page](engine/analysis-review.md) covers how this skill works with it.
