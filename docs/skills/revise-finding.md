# revise-finding

## What it does

`/revise-finding` takes your feedback on a Finding that has already been checked — "make it horizontal", "lead
with retention", "say it more plainly" — makes the edit, and runs `aftergrid revise` to classify what you just
asked for:

- **presentation** — the same evidence reading differently. Applied as a new revision, re-rendered, re-checked.
- **interpretation** — the same numbers saying something else. Put to you first; applied on your say-so; Method
  and Question review are then required.
- **numeric** — a different number. Refused. Nothing is written, and you are told which file or field made it
  numeric and that the Analysis reopens.

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

**It says `unknown`.** There is no baseline to compare against. Run `aftergrid revise <dir> --pin` on the
Finding as it was reviewed, or pass `--baseline <dir>` naming a copy of it.

## It's working if

- Your request is quoted back to you, and the class comes with a located reason — a file and a field, not "this
  looks cosmetic".
- A presentation change lands as revision N+1 with `revisions/<N>/` archived, and the summary says the approval
  did not carry.
- An interpretation change is put to you **before** it is applied, and afterwards you are told Method and
  Question review are required.
- A numeric request is refused, the Finding on disk is untouched, and you are given the command that reopens
  the Analysis.
- Nothing in the summary claims a revision is reviewed or approved.
