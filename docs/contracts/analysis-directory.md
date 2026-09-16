# The Analysis directory

An **Analysis directory is a Finding directory**. There is no second layout: `aftergrid new finding` creates it,
the checked-analysis procedure takes it through the states below, the writer turns it into a Finding, and the
reviewers read the result. This page is the contract the four skills share: what each state means, who may write
what, and where the line runs between recording evidence and judging it.

Layout: `docs/contracts/instance-layout.md`. The manifest: `docs/contracts/finding-manifest.md`. Checks and
results: `docs/contracts/checks-and-results.md`. Vocabulary: `CONTEXT.md`.

## The states, in order

**(a) The Question is filled in.** `manifest.question` carries the raw ask verbatim plus what the clarification
settled. `state: resolved` means decision, metric, population, window, primary comparison and an executable
falsifier are all present. `state: unresolved` lists the missing parts in `question.unresolved` and **leaves
those fields absent** — a falsifier is never invented to fill the field, and a threshold chosen after seeing the
numbers is a bar set to fit its own result. `state: not_answerable` is the ask that cannot be answered as posed;
its Finding's outcome is `needs_reframing`.

**(b) Definitions are pinned.** Every definition the Analysis uses appears in `manifest.definitions` with its
id, `version`, `kind` (`metric` or `diagnostic`), `lifecycle` and content hash. A proposed definition may carry
`role: supporting` and back a supporting or diagnostic Claim with its status shown. It may **not** be the
`role: decision_metric` without an approval attestation that binds the definition file's own content hash and
names a trusted source. Proposals are written to `<instance>/definitions/<id>.md` with `lifecycle: proposed` and
no `approval:` block; a file that is approved is read and never edited. Reference implementation of the exact
bytes and of the refusal: `proposeDefinition` in `src/analysis/definitions.ts`.

**(c) Retained inputs are captured.** `aftergrid capture <finding-dir> --tables a,b` runs the Instance's
configured adapter, writes bounded extracts into `<finding-dir>/inputs/`, and records each in
`manifest.snapshot.inputs` with a content hash, `captured_at`, a description, and a `source` naming the adapter,
the method and the consistency the adapter actually gives. `--catalog` prints tables and columns and writes
nothing. `snapshot.guarantees` is **not** set here: capturing inputs establishes no guarantee on its own.

Capture refuses a revision that carries attestations, because retained inputs are inside the content digest they
bind to. The answer is a new revision, never a rewritten one.

**(d) Checks come before the analysis SQL.** The applicable Checks — `invariant`, `reconciliation`,
`minimum_data`, `falsifier` — are written to `checks/*.sql` and declared in the manifest **before** the final
analysis queries are written. `aftergrid execute <finding-dir>` then runs every execution and every Check
against the retained inputs through the shared runner (`scripts/lib/sql-runner.mjs`), writes `results/*.json`
through `serializeResult`, and pins `queries[].content_hash`, `executions[].sql_hash`, `results[].content_hash`
and `row_count`, `executions[].result_hash`, `checks[].content_hash` and `outcome`, and the content digest.

`execute` never reads a live source: retained inputs are opened by `openRetained`, which hash-verifies every
extract and reports `missing_file` or `hash_mismatch` rather than fall back. The engine is chosen by
`snapshot.inputs[].source.adapter`, the same rule `check --mode rerun` uses. A Finding with no retained inputs
is refused and told to capture first.

`execute` never writes, refreshes or drops an `attestation` or a `review`. When the run would change the content
digest an attestation binds to, nothing is written at all and the report says to bump the revision. When the run
changes content that no attestation binds, the entry becomes stale and `check` reports it stale — that is the
intended path, not a failure to repair.

Engine failures and business results stay apart. A SQL error, a malformed Check result or a result that does not
match its declared columns aborts the run and writes nothing. A Check that honestly records `fail` is written
down: a failing `minimum_data` Check is how a Finding reaches outcome `insufficient_data`.

**(e) `analysis.yaml` records what the evidence cannot.** Beside `manifest.yaml`, schema
`src/analysis/analysis.schema.json`, validated by `validateAnalysisFile(dir, manifest)` from
`src/analysis/validate.ts`. It is optional: a Finding without one is not defective, and a hand-authored exemplar
has none.

```yaml
schema_version: 0.1.0
reader_profile: <reader profile id from readers.md, or generic>
assumptions:                    # one per choice the Question did not settle
  - { id, statement, basis: operator_answer|catalog_probe|instance_document|engine_default|unverified, settled_by?, affects? }
pre_registered_comparison:      # required for an `answered` recommendation
  { statement, registered_before_cuts, registered_at?, source? }
probes:                         # exploratory looks taken before the plan was committed; never evidence
  - { id, kind: exploratory, question, observed, sql_path?, changed_plan? }
execution_order:                # probe -> check -> query, in the order written and run
  - { kind: probe|check|query, id, exploratory?, note? }
candidate_claims:
  - { id, sentence_draft, type, numeric, answer_bearing?, evidence[], comparison{kind,description?,pre_registered},
      population, window{start,end,timezone}, exclusions[], limitations[], material_caveat?, recheck_draft }
outcome_recommendation:
  { outcome: answered|inconclusive|insufficient_data|needs_reframing, reason, what_would_be_needed? }
needs_input:                    # what the Analysis stopped for; each specific enough to act on
  - { kind: clarification|definition_approval|provisional_signoff|data_access|other, description, owner, requested_at?, blocks? }
```

Four rules the shape alone does not carry, all enforced by `validateAnalysisFile`:

- **`execution_order` is grouped probe, then check, then query.** A Check recorded after an analysis query is an
  error (`analysis_contract`), because a Check written after the number is known is a Check written to agree
  with it.
- **Everything named exists.** A `check` or `query` step resolves in `manifest.checks` / `manifest.queries`, a
  `probe` step resolves in `probes`, and every evidence reference resolves to a result cell, a declared derived
  value or a typed external source.
- **`answered` is conditional.** It requires a `pre_registered_comparison`, at least one `answer_bearing` Claim
  carrying a `material_caveat`, and an empty `needs_input`.
- **A non-answer says what would be needed.** `inconclusive`, `insufficient_data` and `needs_reframing` are
  valid complete outcomes, and `what_would_be_needed` is what makes them usable.

## Who may write what

| Skill | Writes | Never touches |
| --- | --- | --- |
| `/grill-question` (user) | `manifest.question`, `manifest.reader`, proposed definition files, and the `reader_profile` / `assumptions` / `pre_registered_comparison` / `needs_input` seed of `analysis.yaml` | approved definition files, any evidence |
| `/checked-analysis` (model) | `inputs/`, `queries/`, `checks/`, `results/`, the evidence half of the manifest, all of `analysis.yaml` | `memo.md`, `claims`, `charts`, `reviews`, `attestations` |
| `/write-finding` (model) | `memo.md`, `manifest.claims` / `charts` / `tables` / `derived` / `external_sources` / `coverage`, `finding.state: complete` and `finding.outcome` | `queries`, `checks`, `results`, `definitions`, `analysis.yaml`, and a Claim's type, comparison, population or window |
| `/iterate-visual` (model) | `charts/*.vl.json` and `charts[]` entries (Variants via `charts[].variant_of`), then re-render and re-check | every number, and the Claim a chart states |
| `/revise-finding` (user) | a presentation change: re-render and re-check | meaning: see the classification below |
| `/analysis-review` (model) | `reviews[]` entries (`kind: method` / `question` / `reader`, `blocking[]`, `non_blocking[]`, bound to the current content digest) | `attestations[]`, and any content it is reviewing |
| `/analyze` (user) | nothing directly; it is the only orchestrator | — |

`/revise-finding` classifies every requested change before acting:

- **Presentation** — wording, ordering, chart orientation, labels. Re-render and re-check; same revision, or a
  new revision when the Finding was already reviewed. Nothing reopens.
- **Numeric or query** — a different number, cut, filter or definition. Reopens the analysis at step (d): new
  SQL, re-execute, re-check. It is never done in the memo.
- **Interpretation** — causal wording, a hidden comparison, a changed aggregation, a truncated axis. Invalidates
  the recorded reviews and requires review again, even when no digit changed.

`/analyze` orders the chain: clarify, checked-analysis, write-finding, iterate-visual, shape-narrative,
analysis-review, check. It halts on a blocking reviewer finding with a `needs_attention` artifact and on a
missing input with a `needs_input` one; it never presents a halted run as done.

## Commands

| Command | Does | Writes |
| --- | --- | --- |
| `aftergrid capture <dir> --catalog` | Reads the source catalog | nothing |
| `aftergrid capture <dir> --tables a,b` | Captures retained inputs | `inputs/*.csv`, `snapshot.inputs`, the content digest |
| `aftergrid execute <dir>` | Runs every execution and Check on the retained inputs | `results/*.json`, the evidence hashes, Check outcomes, `snapshot.guarantees`, the content digest |
| `aftergrid check <dir> [--mode rerun]` | Reports syntax, content, evidence, execution and readiness as separate facts | nothing |

`execute` records evidence and never judges readiness. Publication readiness is `check`'s answer, and it needs a
human review (`docs/contracts/publication.md`).

## What this contract does not establish

- **That a model runs the skills correctly.** The recorded runs under `fixtures/runs/` were produced by hand,
  following the skills, with no model in the loop. They are evidence about artifact shape only; a
  model-in-the-loop evaluation is a separate, later task.
- **That the numbers are right.** Passing Checks never by itself makes a Finding trustworthy (`CONTEXT.md`).
- **That an assumption recorded as `unverified` is safe.** Writing an assumption down never upgrades it.
