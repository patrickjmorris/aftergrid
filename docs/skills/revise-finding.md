# revise-finding

## What it does

Classifies feedback by consequence before changing the artifact. Presentation keeps meaning. Interpretation changes what the reader would conclude. Calculation changes data, filters, metric, population, or window.

Classify by what would change for the reader, not by how small the text edit looks. A request to make an inconclusive result “more confident” cannot be satisfied by hiding the caveat.

## When to reach for it

You start it: `/revise-finding`. The agent will not start it on its own.

Use it when a finished memo, chart, or Finding has feedback. Not for a draft still being written. Use [iterate-visual](iterate-visual.md) when the chart is merely hard to read. Use [analyze](analyze.md) when the numbers have to be rerun. Use [analysis-review](analysis-review.md) to produce the critique this skill applies.

## Three classes

A **presentation** edit retains exact values and source references, then compares revised claims with their originals. An **interpretation** edit re-evaluates evidence and caveats and needs a fresh analytical review. A **calculation** edit reruns affected computations; if access is unavailable, leave the affected conclusion unresolved.

Preserve a change record: request, edits, checks rerun, whether the conclusion moved, remaining limits. Do not claim an old review covers new evidence.

## Common questions

**Does previous approval survive?** No. An approval binds one version of the content. The new revision is a draft again.

**Why did a “harmless” edit come back as interpretation?** The portable classifier is conservative. Rewording “came back more often than” to “came back because of” can keep every digit and still change the claim type.

**Can I skip rerunning a numeric change?** No. If the data cannot be rerun, the affected conclusion stays unresolved.

## It's working if

- The class comes with a located reason, not “this looks cosmetic.”
- Presentation keeps numbers and source references byte-stable where it claims to.
- Interpretation names the review that must be redone.
- Calculation either reruns or leaves the conclusion explicitly unresolved.

## Where it fits

User-invoked Improve-stage entry after a finished artifact. Neighbors: [write-finding](write-finding.md), [analysis-review](analysis-review.md).

If you use the optional command-line tool, [this page](engine/revise-finding.md) covers how this skill works with it.
