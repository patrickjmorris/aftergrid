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

**(c) Retained inputs are captured — when an adapter exists.** On the default route the harness owns the data
path and this step does not happen at all: the Operator's own tool runs the SQL and `aftergrid record` writes down
what it ran (ADR 0010, `docs/contracts/record.md`). `capture` is therefore optional, and a Finding whose
executions are all harness-recorded carries an empty `snapshot.inputs`, `snapshot.guarantees: [artifact_replay]`
and nothing else. The rest of this step is the adapter route.

`aftergrid capture <finding-dir> --tables a,b` runs the Instance's
configured adapter, writes **whole-table** extracts into `<finding-dir>/inputs/`, and records each in
`manifest.snapshot.inputs` with a content hash, `captured_at`, a description, and a `source` naming the adapter,
the method and the consistency the adapter actually gives. `--catalog` prints tables and columns and writes
nothing. `snapshot.guarantees` is **not** set here: capturing inputs establishes no guarantee on its own.

Capture applies no window, filter or row bound. There is no option for one on the command, in `CaptureOptions`
or in the adapter contract, and `source.method` records the read that happened (`select * from <table> …`). The
window is applied in the analysis SQL at step (d), which converts to the analytical timezone explicitly, so an
edge row is kept or dropped by the SQL and not by how wide an extract happened to be. `--description` replaces
the adapter's default wording and sits inside the content digest, so a description that calls the extract
bounded, filtered or limited is refused: the one thing provenance may not do is describe a read that did not
happen. (Extracts under `fixtures/instance/` were written by the repository's own fixture script, which does
bound its copy and says so; that is a fixture, not something `capture` can do.)

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

Every Check binds to an execution — `execution_id`, or the first execution when it names none — and runs against
that execution's retained inputs and parameters (`docs/contracts/checks-and-results.md`). `check --mode rerun`
resolves the binding the same way, so `execute` refuses a Check that resolves to no execution rather than run it
against every retained input and record an outcome the rerun cannot reproduce.

`snapshot.guarantees` records what the run observed. `artifact_replay` and `analysis_rerun` are written only
when an execution actually produced a saved result; a run that saved none leaves the list empty, because there
is no artifact to replay and no analysis to rerun.

**(e) `analysis.yaml` records what the evidence cannot.** Beside `manifest.yaml`, schema
`src/analysis/analysis.schema.json`, validated by `validateAnalysisFile(dir, manifest)` from
`src/analysis/validate.ts`. It is optional: a Finding without one is not defective, and a hand-authored exemplar
has none.

```yaml
schema_version: 0.1.0
stage: clarified|analysed       # absent means analysed; see "The two stages" below
reader_profile: <reader profile id from readers.md, or generic>
assumptions:                    # one per choice the Question did not settle
  - { id, statement, basis: operator_answer|catalog_probe|instance_document|engine_default|unverified, settled_by?, affects? }
pre_registered_comparison:      # required for an `answered` recommendation
  { statement, registered_before_cuts, registered_at?, source? }
probes:                         # exploratory looks at the catalog or the data; never evidence
  - { id, kind: exploratory, question, observed, sql_path?, changed_plan? }
execution_order:                # probe -> check -> query, in the order written and run
  - { kind: probe|check|query, id, exploratory?, post_hoc?, note? }
candidate_claims:
  - { id, sentence_draft, type, causal_basis?, numeric, answer_bearing?, evidence[], definition_refs?,
      comparison{kind,description?,pre_registered}, population, window{start,end,timezone},
      exclusions[], limitations[], material_caveat?, recheck_draft }
requested_derived:              # values the WRITER will declare in manifest.derived; cite as derived:<id>
  - { id, operation, operands[], unit, display?, description? }
requested_external_sources:     # values the WRITER will declare in manifest.external_sources; cite as ext:<id>
  - { id, kind: target|assumption|external_reference, value, unit, source{type,description,date,owner?,location?} }
outcome_recommendation:
  { outcome: answered|inconclusive|insufficient_data|needs_reframing, reason, what_would_be_needed? }
needs_input:                    # what the Analysis stopped for; each specific enough to act on
  - { kind: clarification|definition_approval|provisional_signoff|data_access|other, description, owner, requested_at?, blocks? }
```

### The two stages

`stage: clarified` is the seed `/grill-question` writes: `reader_profile`, `assumptions`,
`pre_registered_comparison`, `needs_input`. It is a **complete artifact for that stage**, `check` reports its
evidence `valid`, and `execute` reports it as a warning naming what is not filled in yet — never as an error,
because `/checked-analysis` runs `execute` at step (d) before it writes the working record.

`stage: analysed` is that working record, and it requires `probes`, `execution_order`, `candidate_claims` and
`outcome_recommendation`. A file with no `stage` is read as `analysed`, so a file written before the field
existed keeps its meaning and no file becomes a seed by omitting a line.

### The rules the shape alone does not carry

Enforced by the schema (`src/analysis/analysis.schema.json`):

- **`answered` is conditional.** It requires a `pre_registered_comparison`, at least one `answer_bearing` Claim
  carrying a `material_caveat`, and an empty `needs_input`.
- **A non-answer says what would be needed.** `inconclusive`, `insufficient_data` and `needs_reframing` are
  valid complete outcomes, and each **requires** a non-empty `what_would_be_needed` — that is what makes them
  usable rather than a shrug.
- **A causal Claim declares its design.** `type: causal` requires `causal_basis`.
- **`comparison.kind` is the manifest's enum**, value for value, because the writer copies it through unchanged.

Enforced by `validateAnalysisFile(dir, manifest)` (`src/analysis/validate.ts`):

- **`execution_order` is grouped probe, then check, then query.** A Check recorded after an analysis query is an
  error (`analysis_contract`), because a Check written after the number is known is a Check written to agree
  with it. A probe taken *after* a query — a post-hoc look — is recorded where it happened with
  `post_hoc: true`; the label is the record, and moving the step up the list is what it prevents.
- **Everything named exists.** A `check` or `query` step resolves in `manifest.checks` / `manifest.queries`, a
  `probe` step resolves in `probes`, and every evidence reference resolves: `ref:<result>.<row_key>.<column>` to
  **one row that the saved `results/*.json` actually contains** (a row key matching no row, or two, is an
  error), `derived:<id>` to `manifest.derived` or `requested_derived`, `ext:<id>` to `manifest.external_sources`
  or `requested_external_sources`. A result file that is not on disk yet is not resolved against here; the
  manifest validator is what reports a missing or corrupt result file.
- **A causal Claim is earned, not asserted.** `type: causal` with any `causal_basis` other than
  `randomised_assignment` is refused, and the remedy is to make the Claim associational.
- **A Claim's `definition_refs` are pinned.** Each resolves in `manifest.definitions` at the same version, so a
  Diagnostic grouping a Claim rests on is traced rather than assumed.

The `requested_*` lists exist because `derived` and `external_sources` are fields `/write-finding` owns: they are
empty while the Analysis directory is the Analysis directory. Naming a requested value here lets a candidate
Claim cite it without the reference dangling, and the writer turns each into the manifest entry it names.

## Who may write what

| Skill | Writes | Never touches |
| --- | --- | --- |
| `/grill-question` (user) | `manifest.question`, `manifest.reader`, proposed definition files, and the `stage: clarified` seed of `analysis.yaml` (`reader_profile`, `assumptions`, `pre_registered_comparison`, `needs_input`) | approved definition files, any evidence |
| `/checked-analysis` (model) | `inputs/`, `queries/`, `checks/`, `results/`, the evidence half of the manifest, all of `analysis.yaml` | `memo.md`, `claims`, `charts`, `reviews`, `attestations` |
| the harness, through `aftergrid record` (Operator) | on the recorded path only: `queries/*.sql`, `results/*.json`, `checks/evidence/*`, and the pinned half of `executions[]` / `results[]` / `checks[]` — `executed_by`, `mode: recorded`, `reported_by`, every hash, `snapshot.guarantees: [artifact_replay]`, the content digest | `snapshot.inputs` (nothing is retained), `claims`, `memo.md`, `reviews`, `attestations`, and `analysis_rerun` |
| `/write-finding` (model) | `memo.md`, `manifest.claims` / `charts` / `tables` / `derived` / `external_sources` / `coverage`, `finding.state: complete` and `finding.outcome` | `queries`, `checks`, `results`, `definitions`, `analysis.yaml`, and a Claim's type, comparison, population or window | Carried across unchanged (the Analysis schema uses the manifest spelling for `comparison.kind`, so nothing is renamed; the identity table in `skills/write-finding/SKILL.md` step 5 lets a checker prove it).
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
| `aftergrid capture <dir> --tables a,b` | Captures retained inputs, whole tables, no bound | `inputs/*.csv`, `snapshot.inputs`, the content digest |
| `aftergrid execute <dir>` | Runs every execution and Check on the retained inputs | `results/*.json`, the evidence hashes, Check outcomes, `snapshot.guarantees`, the content digest |
| `aftergrid record <dir> --execution <id> --result <file> --tool "<name>"` | Runs nothing: writes down one query the harness ran | `queries/*.sql`, `results/*.json`, the evidence hashes, `executed_by`, `mode: recorded`, `snapshot.guarantees: [artifact_replay]`, the content digest |
| `aftergrid record <dir> --check <id> --outcome <o> --tool "<name>"` | Runs nothing: writes down one agent-reported Check outcome | `checks/evidence/*`, `checks[].outcome` and `reported_by`, the content digest |
| `aftergrid check <dir> [--mode rerun]` | Reports syntax, content, evidence, execution and readiness as separate facts | nothing |

`execute` records evidence and never judges readiness. Publication readiness is `check`'s answer, and it needs a
human review (`docs/contracts/publication.md`).

`record` is the default route and `execute` the upgrade (ADR 0010). The two never mix inside one execution: an
execution is run by an adapter against retained inputs, or run by the harness and recorded, and the manifest says
which. `check --mode rerun` refuses a recorded Finding with `rerun_unavailable`. Full contract:
`docs/contracts/record.md`.

## What this contract does not establish

- **That a model runs the skills correctly.** The recorded runs under `fixtures/runs/` were produced by hand,
  following the skills, with no model in the loop. They are evidence about artifact shape only; a
  model-in-the-loop evaluation is a separate, later task.
- **That the numbers are right.** Passing Checks never by itself makes a Finding trustworthy (`CONTEXT.md`).
- **That an assumption recorded as `unverified` is safe.** Writing an assumption down never upgrades it.
