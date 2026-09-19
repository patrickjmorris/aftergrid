# Engine Finding mode

This reference applies only to an existing aftergrid Finding or an explicitly requested Engine workflow. It requires the complete aftergrid toolkit, including the CLI and contracts; portable use of the skill does not. Resolve repository paths below against that toolkit, not against the user's data directory.

# Revise a Finding

Presentation edits are cheap. Edits that change a number or a meaning are not, and the whole job here is to
tell the Operator which one they just asked for **before** it lands in a Finding somebody already reviewed.

`aftergrid revise` decides the class; you do the editing and the explaining. You never decide that a change is
"only cosmetic" against what the command says.

## 1. Write down what they asked for

Quote the request verbatim in your notes before touching anything. "Make it horizontal" and "lead with
retention" are presentation. "Use the other definition," "drop the web users" and "say the checklist caused it"
are not, and you will need the exact words when you explain why.

Done when the request is written down in the Operator's words.

## 2. Record the baseline

```bash
aftergrid revise <finding-dir> --pin
```

This archives the Finding as it stands into `revisions/<N>/` — manifest, memo, chart specs and the render — so
that the reviewed artifact stays reconstructable and so the next step has something to compare against. It
refuses a Finding that does not hash to the digest it pins: that state was never the reviewed one, and
`aftergrid check` says what is wrong with it.

Already pinned at this revision? It says so and writes nothing.

Done when `revisions/<N>/manifest.yaml` exists and `--pin` reported no errors.

## 3. Make the edit

Edit only these:

- `memo.md` — wording, ordering, headings.
- `charts/*.vl.json` — the chart specs. For a chart that is hard to read rather than wrong, work it with
  `/iterate-visual`, or score it yourself against
  [`skills/iterate-visual/references/visual-rubric.md`](../../iterate-visual/references/visual-rubric.md).
- `manifest.yaml` — chart and table titles, labels, descriptions, `charts[].variant_of`.

`queries/`, `checks/`, `results/` and `inputs/` are evidence. Changing one is not a revision; it is a new
Analysis, and step 5 says so.

Done when the edit the Operator asked for is on disk and nothing else is.

## 4. Classify it

```bash
aftergrid revise <finding-dir> --classify --json
```

Read `classification` and the `differences` list. Every difference carries its level, its location and the
reason. The classifier is conservative: what it cannot recognize it calls `interpretation`, so a change it
flags may still be harmless — and one it calls `presentation` may still have changed what a sentence means,
because it reads tokens and field paths, never English. Full contract, including that limit:
`docs/contracts/revise.md`.

Two things this step reports that are easy to misread:

- A difference located at `charts/<id>.vl.json` with "(against `<other>`, the chart it replaces on the page)"
  is a **Variant promotion**. Neither spec file was edited; what changed is which one the Reader sees, and it is
  judged against the one it replaces.
- Some reasons say `revise` *cannot compare* something — a domain that appeared, a key it does not model. That
  is the reason, and it is what you relay. Do not upgrade it into a statement about the image.

If the report carries errors instead — `missing_file` (a memo or chart spec the manifest names is gone),
`invalid_artifact` (a chart spec that is not JSON) — there is nothing to classify until the file is back. Fix
that first; `aftergrid check` lists everything it breaks.

Done when you can name, for the Operator, the level and at least one located reason behind it.

## 5. Branch on the class

### `presentation`

Apply it.

```bash
aftergrid revise <finding-dir> --apply
```

The Finding becomes revision N+1, revision N is archived under `revisions/<N>/`, and the Finding is re-rendered
and re-checked. Tell the Operator: the new revision number, what changed, and that **revision N's publication
approval did not carry** — it bound revision N's digest and is readable in `revisions/<N>/manifest.yaml`.
Revision N+1 is unapproved and renders as a draft until a human approves it again.

### `interpretation`

Stop and put it to the Operator before applying. Say what changed and why it is a meaning change — the located
reason from step 4, in plain words: "the axis now starts at 25%, so the bars no longer show shares"; "the Claim
went from associational to causal".

If they want it, `--apply` it. Then tell them the reviews are now stale — they bind the previous digest, and
`aftergrid check` reports them as stale rather than carrying them forward — and that **Method and Question
review are required** before this revision is published.

### `numeric`

Refuse, and say so plainly. `revise` wrote nothing. The request changes a number, a query, a retained input, an
execution or the evidence a Claim rests on, so it reopens the Analysis. How it is re-run depends on which data
path the Instance is on, and the recorded one is the default (ADR 0010).

**Recorded path** — `executions[].mode: recorded`, `snapshot.inputs` empty, the Instance's
`connection.adapter` absent or `none`. The harness re-runs the query with the tool that ran it the first time,
and `aftergrid record` writes the new run down:

```bash
aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <new-result.json> --sql <file>
```

Three things that hold here, and nothing beyond them:

- `record` **re-pins** what it is given — the SQL, the parameters, the result and their hashes, and the
  `content_digest` over them. It does **not** archive anything and does **not** bump `finding.revision`.
  `revisions/<N>/` comes from `aftergrid revise --pin` or `--apply`, and step 2 is where that happened.
- Recording into a revision that carries **any attestation** is **refused** (`stale_attestation`) — an approval,
  and equally any other kind; the refusal counts attestations, it does not read their type. Evidence is inside
  the digest an attestation binds to. Bump `finding.revision` first and record into the new revision, which is
  what the refusal itself says. Revision N stays readable in `revisions/<N>/`.
- Pin the reviewed state **before** re-recording, not after. Once the new result is recorded, a `--pin` at the
  same revision number reports `exists`, because `revisions/<N>/` already archives a different digest — the one
  somebody reviewed — and `revise` never replaces an archive with a state nobody read.

**Adapter path** — the Instance configures `duckdb` or `postgres` and the Finding holds retained inputs:

```bash
aftergrid execute <finding-dir>     # re-runs every execution and Check against the retained inputs
```

Either way the memo is then rewritten against the new results (`/write-finding`), `aftergrid check` and
`aftergrid render` run again, and the Finding goes through review again: reviews bind the previous digest and
do not carry.

Tell the Operator which file or field made it numeric, which of the two routes their Instance is on, and that
the Finding on disk is untouched by `revise`.

### `unknown`

There is no baseline, so nothing can be classified. Go back to step 2, or pass `--baseline <dir>` naming a copy
of the Finding as it was reviewed.

`--baseline` is refused for `--apply` when the copy is not the reviewed state — it does not hash to the digest
its own manifest pins (`digest`), it carries a different `finding.revision` (`needs_input`), or
`revisions/<N>/` already archives a different digest (`exists`). Applying would have replaced that archive,
which is the only copy of the artifact revision N's reviews and approvals were written against. Nothing is
written; pass the reviewed copy, or drop the flag and use `revisions/<N>/`.

Done when the Operator has been told the class, the reason and what happens next.

## 6. Hand back

Give them, in this order: the class, the revision number now on disk (or that nothing changed), what the
re-check said, and what review is still owed. Say `unknown` when something is unknown.

Two things that are never true and must never be said: that a revision inherits the previous revision's
approval, and that a presentation change has been reviewed. Neither the classifier nor `--apply` reviews
anything.
