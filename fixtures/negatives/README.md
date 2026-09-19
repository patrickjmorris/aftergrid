# Negative fixtures for the evidence seam

Each directory here is a small, complete Finding with **one deliberate defect**, plus an `expected.yaml` saying what
`aftergrid check` (and, where the case is about rendering, `aftergrid render`) must report. `src/negatives.test.ts`
runs both commands on a temp copy of every case and asserts that the expected category appears at a matching
location — and that nothing else fails. A negative that fails for an unrelated reason, such as a missing review,
would prove nothing, so every other error category is rejected by the test.

The directories are **generated and committed**. Regenerate with:

```bash
node src/negatives-build.ts
```

`src/negatives-build.ts` derives every case from the three reviewed exemplars in `fixtures/instance/`, applies one
defect, and re-pins every content hash and the content digest through the shared `digestOf` / `definitionHash`. So
everything in a case is correct *except* the defect. Generation is deterministic (no clock, no randomness) and the
test proves the committed bytes are what the builder produces. Do not hand-edit a case directory.

## What these fixtures are, and are not

- **No SQL ran here.** The retained inputs are trimmed stubs (a header row and a few rows), the Snapshot declares
  only `artifact_replay`, and the recorded execution and Check outcomes and timestamps are carried over from the
  exemplar. They are fixture data, not a record of an execution in these directories. `check --mode rerun` is not
  supported on them.
- **The `recorded-*` cases carry no retained inputs at all.** They derive from the recorded-path exemplar
  (`docs/contracts/record.md`, ADR 0010), where the Operator's own tool ran every query and Check and aftergrid
  wrote down what came back. `check --mode rerun` refuses them by name with `rerun_unavailable`.
- **Nothing here was reviewed or approved.** The `reviews[]` entry names itself as a generated fixture, and no case
  carries a verified publication approval. Every render is labeled a draft.
- **No Decision records.** This Instance root (`fixtures/negatives/aftergrid.yaml`, `readers.md`, `definitions/`)
  deliberately has no `decisions/` directory: these cases are about evidence integrity, and a Decision record would
  add an unrelated failure mode.
- **No semantic scenarios.** Mix shift, an instrumentation break and a coverage gap are review concerns, not engine
  categories. They live in the Golden Questions (`fixtures/instance/analytics/golden/`), not here. See
  `docs/contracts/golden-questions.md` for the three layers.

## Layers

`expected.yaml` declares which layer the case belongs to (`docs/contracts/golden-questions.md`):
`engine_category` (a mechanical `check` category), `analytical_outcome` (an honest non-answer, which must pass), or
`review_concern` (what remains for a human once the engine has done its mechanical part).

## Controls: these must pass

| Case | Layer | Reports | Why it exists |
| --- | --- | --- | --- |
| `control-valid` | engine_category | `none` | The unmodified base every numeric case is derived from. If this fails, the base is broken, not the defect. |
| `control-non-answer` | analytical_outcome | `none` | A complete `insufficient_data` Finding whose minimum-data Check is recorded as `fail`. A non-answer is an analytical outcome, never an engine failure. |
| `falsifier-failed-inconclusive` | analytical_outcome | `none` | The pre-registered falsifier recorded `fail` and the Finding records `inconclusive`. A falsifier that fires decides the outcome; it is not an evidence failure, so `check` reports one `falsifier_failed` warning and no error, and `render` writes the page with the falsifier on it. |
| `control-prose-dates-ids` | engine_category | `none` | Memo prose with an ISO date, a timestamp, a numbered heading, manifest ids, a definition version, a file path and a `{{literal:…}}`. None is a measured quantity, so `untraced_numeral` must not fire. |
| `zero-denominator-derived` | engine_category | `none` | The web control arm has no signups, so a derived ratio divides by zero. The render says "not available" in words, never 0. The ratio is a part over a whole, so its operands are named `{ numerator, denominator }` — a division that is not a before-and-after comparison declares its direction in that vocabulary, not as a false after/baseline pair. |
| `derived-named-percent-change` | engine_category | `none` | A `percent_change` declared with named operands `{ after, baseline }`. The named form makes the direction a fact, so no `direction_unstated` warning is reported and the rendered sign is the one the manifest declares; the flipped pair would render a different number, and the case asserts that number is absent. |
| `nullable-null-not-available` | engine_category | `none` | A column declared `nullable` holds `null`. Valid evidence; renders as "not available" in prose and in the table. |
| `display-only-rounding` | engine_category | `none` | The rate column declares whole-percent display while the saved values keep full precision. The render shows whole percents once; the raw decimals never reach the page. |
| `private-field-sentinel` | engine_category | `none` | A declared but non-exported column carries the Instance's private marker. `export_policy.allowed_fields` projects the column away, so neither the marker nor the column name reaches any rendered byte and `check` reports nothing: the marker never had a path to a Reader. The refusal path is `private-marker-in-memo`. |
| `counter-metric-reported` | engine_category | `none` | No defect. The decision metric's definition names a counter-metric and the Finding reports it: a value traced to a result over the Question's own window, produced by an execution that pins the counter-metric's definition. The positive control for `counter_metric_missing`. |
| `counter-metric-not-computed` | engine_category | `none` | No defect. The counter-metric could not be computed and the Finding records that, with the reason, as `counter_metrics_reported[].not_computed`. A stated reason is a fact a method reviewer can reject; silence is what the Engine refuses. |

## Readiness: no error, but never ready

| Case | Layer | Reports | Why it exists |
| --- | --- | --- | --- |
| `forged-attestation` | review_concern | `none` | A `publication_approval` whose source is an `unverified_note`, bound to the current digest. Nothing rejects it, so **no** problem is reported and no category is emitted: `src/publication/readiness.ts` takes the `unverified_note` branch, records a reason and never calls `reject`. Readiness stays `not_ready` and the reason names the source. Whether an informal note was passed off as an approval is then a review concern. |

## Defects: these must fail

| Case | Layer | Reports | The one defect |
| --- | --- | --- | --- |
| `unresolved-reference` | engine_category | `unresolved_reference` | The answer-bearing Claim's first evidence reference names a result set that is not in the manifest. |
| `duplicate-row-key` | engine_category | `duplicate_row_key` | The first row of the primary result set is repeated, so the row key `checklist` matches two rows and every reference into it is ambiguous. The row is repeated rather than renamed so that `control` still resolves: a renamed key would also delete one, and the case would fail for `unresolved_reference` too. |
| `missing-column` | engine_category | `missing_column` | The answer-bearing Claim cites a column the result set does not declare. |
| `untraced-numeral` | engine_category | `untraced_numeral` | A data-bearing number is typed into the memo prose instead of a reference token. |
| `chart-forbidden-transform` | engine_category | `chart_subset` | The chart spec carries a top-level `transform`. A chart never computes. |
| `chart-layered-aggregate` | engine_category | `chart_subset` | A layered spec aggregates on one encoding channel and bins on another, inside the second layer. The forbidden-key walk reaches into layers. |
| `missing-memo-section` | engine_category | `template` | The Appendix section is missing, so a Reader cannot find how to rerun the numbers. |
| `claim-without-recheck` | engine_category | `schema` | The second Claim declares no Recheck policy. |
| `decision-metric-not-approved` | engine_category | `definition_not_approved` | A complete Finding names a proposed, unapproved Metric definition as its decision metric. |
| `decision-metric-approval-forged` | engine_category | `untrusted_attestation` | The manifest states an approval for its decision metric — right shape, right content hash, trusted source type — that `definitions/retained_7d.md` does not record: a different approver and a different review. An approval is granted on the definition, not by the Finding citing it. |
| `counter-metric-missing` | engine_category | `counter_metric_missing` | A complete Finding publishes a decision metric whose definition names a counter-metric, and reports neither a value for it nor a reason it could not be computed. The Goodhart gap, refused in the publication path. |
| `private-marker-in-memo` | engine_category | `export_policy` | The Instance's `export_policy.private_marker` is typed into the memo prose, where every byte is Reader-facing. `check` reports it with a line and column and `render` is refused; it is not left to the output-byte check. |
| `definition-version-not-pinned` | engine_category | `definition_version` | The Question cites a definition version the manifest does not pin. |
| `failing-reconciliation-check` | engine_category | `check_failed` | The required reconciliation Check is recorded as `fail` while the Finding still answers the Question. Render is refused. |
| `falsifier-required` | engine_category | `check_shape` | The falsifier Check is declared `required: true`, as though it were an evidence-validity condition. A falsifier decides the outcome, never validity. Render is refused. |
| `falsifier-failed-but-answered` | analytical_outcome | `analytical_outcome` | The pre-registered falsifier recorded `fail` and the Finding is still recorded as `answered`. Render is refused. |
| `snapshot-input-hash-mismatch` | engine_category | `hash_mismatch` | The pinned content hash of the first retained input does not match the file. |
| `stale-attestation` | engine_category | `stale_attestation` | A trusted `github_pr_review` approval is bound to a content digest this directory does not have. |
| `artifact-modified-after-attestation` | engine_category | `stale_attestation` | The memo was edited after the approval and the method review were recorded, without a new revision. The stale review is only a warning; the stale approval is the error. |
| `derived-cycle` | engine_category | `derived_cycle` | A derived value takes itself as an operand. |
| `derived-unit-mismatch` | engine_category | `unit_mismatch` | A `difference` is taken between a ratio and a user count. |
| `derived-named-wrong-operation` | engine_category | `derived_arity` | A `sum` declares named operands `{ after, baseline }`. Only `difference`, `ratio` and `percent_change` have a direction to declare; on any other operation the named pair claims arithmetic that does not exist. |
| `null-in-non-nullable-column` | engine_category | `null_value` | A column that is not declared `nullable` holds `null`. |
| `external-source-missing-type` | engine_category | `schema` | The typed external source has no source `type`. |
| `unsupported-schema-version` | engine_category | `schema` | The manifest declares a `schema_version` the Engine does not know. |
| `provisional-evidence` | engine_category | `provisional_evidence` | A Claim rests on a result set marked `provisional`. Render is refused, so it is never exported. |
| `recorded-agent-pass-without-evidence` | engine_category | `unevidenced_outcome` | A required Check on the recorded data path is reported `pass` by the harness and names no evidence file. `pass` is the one outcome that asserts something held, so it may only be recorded with the tool output it rests on, copied in and pinned. |
| `recorded-result-hash-mismatch` | engine_category | `hash_mismatch` | A harness-recorded execution pins a `result_hash` that is not the hash of the result set it names. aftergrid ran nothing, so the pinned hashes are the whole of what ties the recorded SQL to the recorded numbers. |

## Known limits

- `derived-unit-mismatch` is reported at location `difference` (the operation name) rather than at the derived
  entry: the shared arithmetic helper raises it before the caller can attach a manifest pointer. The category is
  right; the location is coarse, and `expected.yaml` records that honestly.
- A structural rejection stops validation, so those cases report exactly one error and evidence is
  `not_evaluated` rather than `invalid`. It is not only `schema`: the shared helpers in
  `scripts/fixture-safety.mjs` raise `unsafe_path`, `path_collision`, `duplicate_id`, `execution_binding`,
  `derived_arity` and `definition_version` the same way, and `unit_mismatch` comes out of the derived arithmetic,
  so `derived-unit-mismatch` stops too. A fault inside a *result file* (`result_shape`, `row_key`, `value_type`,
  `duplicate_row_key`, `null_value`) does **not** stop validation any more: it is reported and the memo, the
  content digest and readiness are still checked, which is what `duplicate-row-key` and
  `null-in-non-nullable-column` rely on.
- `check` verifies that a definition's `lifecycle` and `approval` in a manifest match the definition file, and
  nothing more. It does not verify the approval against the named GitHub review or the Instance's trusted
  approvers; that is `src/publication` (readiness), and no fixture here carries a verified approval.
- These fixtures exercise `check` and `render` only. `check --mode rerun`, the adapters and the Golden Questions
  have their own suites.
