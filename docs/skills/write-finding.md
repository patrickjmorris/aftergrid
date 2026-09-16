# write-finding

## What it does

`/write-finding` turns a checked Analysis directory into a Finding. It reads the evidence `/checked-analysis`
pinned — the Question, the queries, the executions with their parameters and the tool that ran them, the saved
results, the Checks, any retained inputs, and `analysis.yaml` —
and writes the half a Reader meets: `memo.md` in the six fixed sections, typed Claims, a chart or a table
behind every number, and the export policy, coverage and Reader profile the render needs.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`). It is a step
inside `/analyze`, reached once the numbers are settled; an Operator asks for the Analysis, not for the memo.

The skill owns a fixed set of fields and nothing else: `memo.md`, `claims`, `charts`, `tables`, `derived`,
`external_sources`, `coverage`, `export_policy.allowed_fields`, `reader.profile`, `finding.title`,
`finding.state`, `finding.outcome`, `finding.generated_at` and `content_digest`. Queries, Checks, results,
retained inputs, executions and definitions are read-only to it, and so are `reviews` and `attestations`.
The ownership is field-level, not block-level: `export_policy.recipient_scope`, `granularity`, `delivery`
and `private_marker`, and everything in `reader` other than `profile`, are the Instance's and survive the
skill byte-identical. `private_marker` matters most, because the memo scan in `check` and the output-byte
refusal in `render` both run only when it is present.

It finishes by running `aftergrid check` and `aftergrid render`, fixing what it introduced, and stopping with
a `needs_attention` result after a third unsuccessful pass.

## When to reach for it

- `/checked-analysis` has pinned executions, results and Check outcomes, and written `analysis.yaml`.
- An Analysis reached `insufficient_data`, `inconclusive` or `needs_reframing` and the Reader is owed a
  Finding that says so.
- A Finding was reopened for a numeric change, the Analysis reran, and the memo has to be rewritten against
  the new results.

Not for: changing a number or a query (that reopens `/checked-analysis`), re-styling a chart
(`/iterate-visual`), reordering or rewording finished prose (`/shape-narrative`), or acting on Operator
feedback on a merged Finding (`/revise-finding`).

## Common questions

**Can it decide the Finding answers the question?** No. `finding.outcome` is copied from
`analysis.yaml#outcome_recommendation.outcome`. A non-answer stays a non-answer, and
`skills/write-finding/references/outcomes.md` is how each one is written honestly.

**What makes a Claim causal?** Randomised assignment, recorded by the Analysis, and nothing else in v0. No
sample size, effect size or set of controls promotes an associational Claim. The Analysis records the basis
in `candidate_claims[].comparison.description`, which its schema requires on every `associational` and
`causal` candidate. `skills/write-finding/references/claim-typing.md` has the four questions that settle a
type.

**Where do the coverage dates come from when nothing was retained?** From the recorded parameters. On the
recorded path — the default (ADR 0010), where the harness ran the queries and `aftergrid record` wrote them
down — `coverage.data_from` and `coverage.data_to` are read off the executions' own parameters, with
`data_to` coming from the recorded `executed_at` where the SQL read up to the moment it ran. On the adapter
path they come from the retained inputs, which may run wider or narrower than the Question's window. A date
that is in neither place is a `needs_input` item, never a choice the skill makes. The Appendix says which of
the two it was: on the recorded path it names the tool that ran each query and states that no copy of the data
was kept.

**Where does a threshold or a target come from?** From the Analysis, or from nowhere. A typed external
source carries the value `analysis.yaml` recorded for it; where the Analysis recorded none, the skill writes
a `needs_input` item naming the owner and stops instead of choosing one.

**Where do numbers in prose come from?** A token — `{{ref:…}}`, `{{derived:…}}` or `{{ext:…}}` — that
resolves from the pinned manifest. A bare digit in `memo.md` fails `check` with `untraced_numeral` unless it
is a date, an id, a section number, a definition version, a file path or an explicit `{{literal:…}}`.
`skills/write-finding/references/evidence-binding.md` is the working guide.

**Does a numeric Claim always need a chart?** It needs a chart *or* a table. On a phone a table is often the
better answer; the chart earns its place when the shape of the comparison is the point.

**Can it mark a Finding reviewed or approved?** No. It writes no `reviews` and no `attestations`; `check`
reports an approval nobody granted as an untrusted attestation, and publication readiness is a human's
APPROVED review verified through the API (`docs/contracts/publication.md`).

**What if a required Check failed?** That is the Analysis, not the memo. The skill reports the category and
location and stops rather than writing around it.

## It's working if

- `aftergrid check <finding-dir>` reports `evidence valid` with zero errors, and `aftergrid render` writes
  `render/finding.html` without a warning.
- The diff against the Analysis directory touches only the fields listed above: no query, Check, result,
  retained input, execution or definition changed.
- Every number on the rendered page can be traced, by clicking into the calculation, back to a saved result.
- A Finding that could not answer says so in its first sentence and contains no invented threshold, falsifier
  or number.
- `reviews` and `attestations` are as empty as they were before the skill ran.
- Recorded runs: `fixtures/runs/kpc-numeric` (a named Reader profile, `answered`, a causal Claim earned by
  randomised assignment) and `fixtures/runs/kpc-insufficient` (the generic profile, `insufficient_data`, no
  causal wording anywhere). `src/writer.test.ts` holds them to the mechanical half of the above: evidence
  validity, the field boundary down to `export_policy` and `reader` keys, answer-first structure, bound
  values and allowed columns, figure titles that state their Claim, Reader vocabulary and the absence of
  causal verbs in a non-answer. Whether a caveat is the one that matters, and whether a sentence a linter
  accepts reads honestly, is `skills/shape-narrative/references/narrative-criteria.md` and the Reader
  reviewer's, not the suite's.
- A recorded run is evidence of a contract, not of a model: both runs were written by hand, `run.yaml` says
  so, and neither reports a corrections count, because `input/` was cut out of an already-reviewed
  `output/` and nothing was produced and then corrected. The corrections number the bead asks for needs a
  model in the loop and the nightly Golden Questions, not this fixture.
