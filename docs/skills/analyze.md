# analyze

## What it does

Carries one question from a raw ask to a reviewed answer: clarify, inspect, plan, calculate under checks, write, challenge, and stop with a reason when the evidence runs out. Portable analysis is the default. An Engine Finding is a separate route you ask for.

It is the only orchestrator. Craft belongs to the specialist skills; `/analyze` does not redo their work.

## When to reach for it

You start it: `/analyze`. The agent will not start it on its own.

Use it when you have an ask and want the whole practice applied, including an honest “inconclusive” or “not enough data.” Use [grill-question](grill-question.md) when you only want the interview. Use a single craft skill when you already have a query, a chart, or a draft. Use [revise-finding](revise-finding.md) for feedback on a finished artifact.

## Follow the evidence, then try to break it

Read designated prior lessons before planning. Name the checks that could invalidate the result before the main query, and say what each should show. Reproduce the headline before explaining it. For a rate, inspect numerator and denominator separately. For an aggregate change, separate mix from within-group change. Label cuts made after seeing results as exploratory. Keep a log as the work happens: what each step tested, what it showed, and what it decided. Stop when the decision-relevant uncertainty is resolved, the useful evidence is exhausted, or the next step needs something you do not have.

The answer leads with what was observed, for whom and when, with the decision-changing caveat beside it. Four review lenses (method, question, reader, materiality) try to disprove the draft. Serial self-review is still self-review and must be described as such.

## Common questions

**Do I need the aftergrid CLI?** No. Start with a CSV, notebook, pasted results, or an existing connector. The Engine route needs the complete toolkit.

**Why doesn’t it call /grill-question?** User-invoked skills do not call each other. Both read the same clarification procedure.

**Is “inconclusive” a failed run?** No. Insufficient data, inconclusive, and needs-reframing are valid completed answers. A check that *errored* is a run that did not happen; a check that *failed as pre-specified* can be the answer.

**Where did checked-analysis go?** It is part of this skill now. The checks named before the main query, the analysis log, and the line between checks that ran and checks only proposed all live here. The rules about rates, joins, and causal language live in `references/rigor.md`, which several skills share.

**What if I cannot run the queries?** It delivers a runnable plan and marks every result in it unexecuted. It never fills a result with the value it expected.

**Does a clean run mean the finding is approved?** No. Agent review is not human publication approval. Portable output has no Engine verification merely because this skill produced it.

## It's working if

- The original ask is still visible next to the sharpened question.
- Material numbers point at a source, saved result, or calculation that actually ran.
- Validity checks are named before the main query, with expected behavior taken from the question or policy, not from a convenient observed value.
- Dead ends that constrain the conclusion are kept, in a log written as the work happened.
- Another person can tell whether they can rerun the calculation, only inspect saved results, or neither.
- The closing recommendation matches the claim type the design earned (descriptive, associational, or causal) and names what would change it.

## Where it fits

User-invoked Analyze-stage orchestrator. Neighbors: [diagnose-change](diagnose-change.md) for a movement-only job, [plan-analysis](plan-analysis.md) for a test sequence before execution, [analysis-review](analysis-review.md) for a draft you already have.

If you use the optional command-line tool, [this page](engine/analyze.md) covers how this skill works with it.
