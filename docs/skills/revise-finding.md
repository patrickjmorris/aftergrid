# revise-finding

Apply feedback to an analytical answer while distinguishing presentation edits from changes to calculations, interpretation, and evidence. Works on ordinary memos or versioned Engine Findings.

## What it does

`/revise-finding` classifies feedback by consequence before changing the artifact. Presentation keeps meaning. Interpretation changes what the reader would conclude. Calculation changes data, filters, metric, population, or window.

The defining constraint: classify by what would change for the reader, not by how small the text edit looks. A request to make an inconclusive result “more confident” cannot be satisfied by hiding the caveat.

## When to reach for it

You invoke this by typing `/revise-finding` — the agent will not start it on its own.

Reach for it when a finished memo, chart, or Finding has feedback. Not for a draft still being written. Use [iterate-visual](iterate-visual.md) when the chart is merely hard to read. Use [checked-analysis](checked-analysis.md) when the numbers have to be rerun. Use [analysis-review](analysis-review.md) to produce the critique this skill applies.

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

User-invoked Improve-stage entry after a finished artifact. Neighbors: [write-finding](write-finding.md), [shape-narrative](shape-narrative.md), [analysis-review](analysis-review.md). The map is [ask-aftergrid](ask-aftergrid.md).

## Engine Finding reference

The following documentation describes the optional Engine route, which retains its existing checks and approval requirements.


## What it does

`/revise-finding` takes your feedback on a Finding that has already been checked — "make it horizontal", "lead
with retention", "say it more plainly" — makes the edit, and runs `aftergrid revise` to classify what you just
asked for:

- **presentation** — the same evidence reading differently. Applied as a new revision, re-rendered, re-checked.
- **interpretation** — the same numbers saying something else. Put to you first; applied on your say-so; Method
  and Question review are then required.
- **numeric** — a different number. Refused. Nothing is written, and you are told which file or field made it
  numeric and that the Analysis reopens — on the recorded path by your harness re-running the query and
  `aftergrid record` writing it down, on the adapter path by `aftergrid execute`.

It is **user-invoked** (`disable-model-invocation: true`, `policy.allow_implicit_invocation: false`). Revising
a reviewed Finding bumps its revision and drops its publication approval, so a human asks for it.

The full classification tables, and the limits of the classifier, are in
[`docs/contracts/revise.md`](../contracts/revise.md).

## When to reach for it

- A Finding has been checked, or reviewed, or approved, and you want something about it changed.
- You want to know whether an edit you are considering would reopen the analysis, before making it.
- You want to pick between two Variants of a chart.

Not for a Finding still being written — nothing is pinned yet, so there is nothing to protect. Not for a chart
that is merely hard to read: that is `/iterate-visual`, which this skill points at.

## Common questions

**Does my approval survive the revision?** No. An approval binds one content digest; revision N+1 has a
different one. The approval stays readable in `revisions/<N>/manifest.yaml`, the new revision renders as a
draft, and the report says how many attestations were dropped. Nothing is re-dated to look current.

**What happens to the reviews?** They are left exactly as they were, bound to the previous digest, and
`aftergrid check` reports each one as stale. That is the honest record: a Method review of revision 1 is not a
Method review of revision 2.

**Can I get revision 1 back?** Yes. `--pin` and `--apply` archive it under `revisions/<N>/` with its manifest,
memo, chart specs and the render it produced. Evidence files are shared across revisions and unchanged — a
change to one would have been refused — so the archive plus the Finding's `queries/`, `checks/`, `results/` and
`inputs/` reconstruct it.

**Why did it call my harmless edit "interpretation"?** The classifier is conservative: what it does not
recognise it calls interpretation. It costs you a review you may not have needed, which is the error it is
allowed to make. The `differences` list names the field that forced the class.

**Could it call something "presentation" that actually changed the meaning?** Yes. It reads field paths and
evidence tokens, not English: rewording a Claim from "came back more often than" to "came back because of"
keeps every token. Method review is what catches that, and this skill never claims to have reviewed anything.

**How do I re-run a numeric change when nothing was retained?** Your harness re-runs the query with the tool
that ran it before, and `aftergrid record <dir> --tool "<name>" --execution <id> --result <file>` writes the new
run down. `record` re-pins the SQL, the parameters, the result and the content digest; it does **not** archive
anything and does **not** bump `finding.revision`. Archiving is `aftergrid revise --pin` or `--apply`, and it
belongs **before** the re-record: afterwards a `--pin` at the same revision number reports `exists`, because
`revisions/<N>/` already holds the digest somebody reviewed. If the revision carries **any attestation** — an
approval, and equally any other kind — `record` refuses outright (`stale_attestation`) and tells you to bump
`finding.revision` and record into the new one.

**It says `unknown`.** There is no baseline to compare against. Run `aftergrid revise <dir> --pin` on the
Finding as it was reviewed, or pass `--baseline <dir>` naming a copy of it.

**It refused my `--baseline` on apply.** Applying archives the baseline as revision N, so a copy that is not the
reviewed state would replace the archive with something nobody approved. It is refused when the copy does not
hash to its own pinned digest, when it is a different revision, or when `revisions/<N>/` already holds a
different digest. Nothing is written either way.

**I picked the other Variant and it came back as interpretation.** Choosing between Variants is a taste decision
only while the two charts say the same thing. The promoted chart's spec is compared with the spec of the chart
it replaces, so a candidate whose axis is narrower, whose field binding differs or which shows less is an
interpretation change at the moment it reaches the page — the same cost that edit would have had in place.

## It's working if

- Your request is quoted back to you, and the class comes with a located reason — a file and a field, not "this
  looks cosmetic".
- A presentation change lands as revision N+1 with `revisions/<N>/` archived, and the summary says the approval
  did not carry.
- An interpretation change is put to you **before** it is applied, and afterwards you are told Method and
  Question review are required.
- A numeric request is refused, the Finding on disk is untouched, and you are given the command that reopens
  the Analysis on the path your Instance is actually on: `aftergrid record` where nothing was retained,
  `aftergrid execute` where it was.
- Nothing in the summary claims a revision is reviewed or approved.
