# Revise contract

`aftergrid revise <finding-dir>` answers one question: what does this change to a pinned Finding cost? A
re-render, a fresh review, or a new Analysis. Implementation: `src/commands/revise.ts`, `src/revise/`. Spec
stories 22 and 23. Vocabulary: `CONTEXT.md`.

It exists because a Finding is reviewed as a whole and approved against a content digest. Once that has
happened, "just make the bars horizontal" and "just use the other definition" look identical in a diff and cost
completely different things, and an Operator should not have to be the one who notices.

## Three modes

| Mode | What it does | Writes |
| --- | --- | --- |
| `--pin` | Records the current Finding as the baseline for later comparisons, at `revisions/<N>/`. Refuses unless the directory hashes to the digest its manifest pins. | `revisions/<N>/` |
| `--classify` | Compares the working tree with the baseline and calls every difference `presentation`, `interpretation` or `numeric`. | nothing |
| `--apply` | `presentation` or `interpretation` → a new revision; `numeric` → refused. | `manifest.yaml`, `memo.md`, `revisions/<N>/`, `render/` |

`--baseline <dir>` names a copy of the reviewed Finding instead of `revisions/<N>/`; it expects the same layout
(`manifest.yaml`, `memo.md`, the chart specs at their manifest paths).

## The baseline, and why there has to be one

Evidence files carry recorded hashes in the manifest, so `revise` can tell that a query, a Check, a result or a
retained input moved without being shown the old one. `manifest.yaml`, `memo.md` and the chart specs do not:
the digest commits to them collectively, which proves *that* something changed and never *what*.

So a full classification needs the previous bytes. With no baseline and no evidence drift, `revise` reports
`classification: unknown` and a `needs_input` error naming `--pin` and `--baseline`. It does not guess, and it
does not fall back to calling everything interpretation: an Operator who is told "interpretation" acts on it,
and a guess dressed as a judgment is the failure this whole command exists to prevent.

`--pin` refuses a directory whose content does not hash to its pinned digest, because a baseline is supposed to
be the state somebody reviewed. Run `aftergrid check` first.

## The three classes

**`presentation`** — how the Finding reads, with the same evidence saying the same thing.

| What | Where |
| --- | --- |
| Chart colors, marks, sizes, axis labels and formats, sort order, legends, layered text marks | `charts/*.vl.json`, anything under `mark`, `config`, `axis`, `legend`, `view`, or a non-position `scale` |
| A widened or unchanged position-axis `scale.domain`, and the spacing keys `padding`, `paddingInner`, `paddingOuter`, `round`, `align`, `bandPosition` on a position `scale` | `charts/*.vl.json` |
| A sub-spec added that shows only fields the chart already showed — the direct-label move | `charts/*.vl.json` |
| Chart and table titles and descriptions reworded with the same evidence tokens | `charts[].title`, `tables[].title`, `finding.title`, `claims[].sentence` |
| Table column labels | `tables[].columns[].label` |
| Memo prose reworded with the same evidence tokens | `memo.md` |
| Display formatting of a derived value or external source | `derived[].display`, `external_sources[].display` |
| Adding or dropping a Variant, when the entry carrying `variant_of` names a chart that exists and shares its Claim and result set | `charts[].variant_of` |
| Choosing between Variants — one leaves the page as another takes its place, both on the same Claim and result set — **and** the promoted spec classifies as presentation against the spec it replaces | `charts[].variant_of`, `claims[].chart_ids` |

**`interpretation`** — the same numbers, saying something else. Applies, and demands review.

| What | Where |
| --- | --- |
| A Claim's type, comparison, population, window, exclusions, limitations, material caveat, recheck policy, answer-bearing flag | `claims[].*` |
| A sentence, title or memo whose set of evidence tokens changed | `claims[].sentence`, `charts[].title`, `memo.md` |
| A chart bound to a different field, or a field binding removed | `charts/*.vl.json` `field` |
| A position axis `scale.domain` that starts later or ends earlier than before, or one that appears, disappears or is not two numeric endpoints (`revise` says it cannot compare those, rather than asserting what they do to the image) | `charts/*.vl.json` |
| Any other key of a position channel's `scale` — `zero`, `type`, `reverse`, `clamp`, `nice`, `exponent`, `range` — because each of them decides how a value becomes a length | `charts/*.vl.json` |
| A chart entering or leaving the Reader's page, including by `variant_of` being set or cleared with nothing trading places with it | `charts[]`, `charts[].variant_of` |
| A promoted Variant whose spec differs from the spec it replaces by anything interpretation-level | `charts/*.vl.json` |
| An entry filed as a Variant of a chart that does not exist, or that binds another Claim or result set | `charts[].variant_of` |
| An encoding's measurement type, `stack`, or a sub-spec that computes something | `charts/*.vl.json` |
| The export policy, the Reader, the coverage, the outcome, the Question's wording | `export_policy`, `reader`, `coverage`, `finding.outcome`, `question` |
| The pinned renderer or house-style version | `renderer` |
| Anything `revise` does not recognize | everywhere |

**`numeric`** — a different number. Refused; nothing is written.

| What | Where |
| --- | --- |
| A retained input, a query, a Check or a result file whose bytes changed | `snapshot.inputs`, `queries/`, `checks/`, `results/` |
| Any execution, definition pin, Check outcome or snapshot guarantee — including who ran it and what an agent-reported outcome rests on (`docs/contracts/record.md`) | `executions`, `definitions`, `checks`, `snapshot` |
| A derived value's operation, operands or unit; an external source's value, unit, kind or provenance | `derived`, `external_sources` |
| The evidence a Claim rests on | `claims[].evidence` |
| The Question's falsifier or metric | `question.falsifier`, `question.metric` |

The overall classification is the most disruptive difference present. One numeric difference refuses the whole
request; one interpretation difference demands review of the whole revision.

A file `manifest.yaml` names and the Finding does not hold — `memo.md`, or any `charts[].spec_path` — produces
no difference to classify, so `revise` reports `missing_file` in every mode instead of reporting `unchanged`. A
chart spec that is not JSON is `invalid_artifact`, with the parser's message and the file's path; it is never a
stack trace out of the command.

## What a Variant costs, and when

A Variant is a `charts[]` entry carrying `variant_of`; `src/render/html.ts` keeps it off the Reader's page.
`revise` treats that literally: while a candidate is off the page it costs nothing and its spec is never
compared with anything, and the cost is charged at the moment it goes **on** the page.

- Adding or dropping one is `presentation` only when it really is a Variant — `variant_of` names a chart that
  exists in the same manifest, with the same `claim_id` and the same `result_id`. Otherwise it is different
  evidence under a Variant's name, and it is `interpretation`.
- Setting or clearing `variant_of` moves a chart off or onto the page. That is `presentation` only when another
  chart on the same Claim and result set moves the opposite way in the same revision.
- When two do trade places, the promoted chart's spec is classified **against the spec of the chart it
  replaces**, as `charts/<promoted>.vl.json`. Neither file has to have changed for the page to change, and this
  is the only comparison that sees it. A promoted Variant that truncates an axis, rebinds a field or hides a
  comparison therefore costs exactly what making that edit in place would have cost.

## The classifier is conservative, and it is not a semantic classifier

This is a contract, not a caveat. `revise` reads field paths, evidence-token multisets and chart-spec structure.
It cannot read English.

- **It over-calls.** Anything it does not recognize is `interpretation`, which costs a review that may not have
  been needed. That is the direction the error is allowed to run in.
- **It cannot catch a rewrite that keeps the tokens.** Changing "came back more often than" to "came back
  because of" keeps every token and lands in `presentation`. Nothing mechanical will catch that; the Method
  review reading each Claim sentence against its evidence is what catches it, and `docs/contracts/memo-template.md`
  says so in the same words.
- **It compares states, not intentions.** Two changes applied together are classified together; the report lists
  every difference with its own level so an Operator can see which one forced the class.
- **A `presentation` verdict is not a review.** Neither `--classify` nor `--apply` reviews anything.

## What `--apply` does

1. Classifies. `numeric` → one `reopens_analysis` error per numeric difference, exit code 2, nothing written,
   with the remedy naming `aftergrid execute <finding-dir>`.
2. Archives revision N from the **baseline**, not from the working tree: the reviewed artifact is the one
   without the edits. The archive holds `manifest.yaml`, `memo.md`, every `charts[].spec_path` and `render/`.
   With `--baseline <dir>`, archiving would overwrite `revisions/<N>/`, so it is refused and nothing is written
   when the copy does not hash to the digest its own manifest pins (`digest`), when it carries a different
   `finding.revision` than the Finding does (`needs_input`), or when `revisions/<N>/` already archives a
   different digest (`exists`; `--force` replaces it, and `--force` does not buy past the other two).
3. Sets `finding.revision` to N+1 and `finding.generated_at` to now, and bumps the `revision:` line in
   `memo.md`'s front matter so the memo and the manifest still agree.
4. Clears `attestations[]`. An attestation states that a named human approved **one content digest**; revision
   N+1 has a different digest, so revision N's approval cannot bind it. It is not rebound, not re-dated and not
   carried: it stays readable in `revisions/<N>/manifest.yaml`, and the report says how many were dropped and
   that the new revision is unapproved. Carrying it forward would leave `check` reporting `stale_attestation`
   and `render` refusing, so a legitimate draft could not even be previewed.
5. Leaves `reviews[]` exactly as it is. They bind the previous digest, which is the truth, and `check` reports
   the newest review of each kind as a `stale_review` warning — a review already behind a later one of the same
   kind is superseded history and is reported as `review_superseded` info instead
   (`docs/contracts/analysis-directory.md`). That is what "the reviews go stale" means here: nothing is edited
   to make it look current.
6. Re-pins `content_digest` with the shared `digestOf`, re-renders and re-checks, and merges both reports.
7. For `interpretation`, adds a `needs_attention` warning and a readiness reason saying Method and Question
   review are required.

## The archive, and what is not in it

`revisions/<N>/` holds what a revision can change: the manifest, the memo, the chart specs and the render that
went with them. It deliberately does **not** copy `queries/`, `checks/`, `results/` or `inputs/`: a change to
any of those is `numeric` and refused, so every revision of a Finding shares one set of evidence files, and the
archived manifest's recorded hashes still resolve against the ones in the Finding directory. Revision N is
reconstructable from `revisions/<N>/` plus the Finding's evidence, and `src/revise.test.ts` asserts that the
archived manifest still hashes against it.

`revisions/` is not part of the digest envelope and is invisible to `check` and `render`. Nothing in `revise`
overwrites an archive with a state that was never reviewed: `--pin` refuses on `exists` when `revisions/<N>/`
holds a different digest, and `--apply --baseline <dir>` refuses for the reasons listed in step 2 above rather
than replacing revision N's archive with the copy it was handed.

## Report

`ReviseReport` is the standard report plus `classification`
(`presentation | interpretation | numeric | unchanged | unknown`), `differences[]` (each with `level`,
`location`, `message`), `revision` and `archive`. Categories: `reopens_analysis` (numeric, exit 2),
`needs_input` (no baseline, or a `--baseline` of another revision), `needs_attention` (interpretation applied),
`digest` (`--pin` on an unpinned state, or a `--baseline` that does not hash to its own pinned digest),
`exists` (an archive of this revision holds a different digest; `--force` replaces it), `missing_file` (a memo
or chart spec the manifest names is gone), `invalid_artifact` (a chart spec that is not JSON).

## What this command does not do

- It does not review anything, and it never records a review or an approval.
- It does not run SQL, and it cannot tell whether a number is right — only whether it moved.
- It does not read the Instance. A Metric definition whose **file** changed under the Instance root is
  `aftergrid check`'s `hash_mismatch`, not a difference `revise` sees; `revise` classifies only the definition
  pin inside the manifest.
- It does not decide whether a revision should exist. `--apply` is a human's instruction, which is why
  `/revise-finding` is user-invoked.
- It does not touch a Decision record. A Decision binds a Finding revision, so after a bump `check` warns
  `decision_binding` — the record cites revision N and the directory holds revision N+1, and whether the
  decision still holds is the decision owner's judgment (`docs/contracts/decide.md`).
