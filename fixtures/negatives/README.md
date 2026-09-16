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

`src/negatives-build.ts` derives every case from the two reviewed exemplars in `fixtures/instance/`, applies one
defect, and re-pins every content hash and the content digest through the shared `digestOf` / `definitionHash`. So
everything in a case is correct *except* the defect. Generation is deterministic (no clock, no randomness) and the
test proves the committed bytes are what the builder produces. Do not hand-edit a case directory.

## What these fixtures are, and are not

- **No SQL ran here.** The retained inputs are trimmed stubs (a header row and a few rows), the Snapshot declares
  only `artifact_replay`, and the recorded execution and Check outcomes and timestamps are carried over from the
  exemplar. They are fixture data, not a record of an execution in these directories. `check --mode rerun` is not
  supported on them.
- **Nothing here was reviewed or approved.** The `reviews[]` entry names itself as a generated fixture, and no case
  carries a verified publication approval. Every render is labelled a draft.
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
| `control-prose-dates-ids` | engine_category | `none` | Memo prose with an ISO date, a timestamp, a numbered heading, manifest ids, a definition version, a file path and a `{{literal:…}}`. None is a measured quantity, so `untraced_numeral` must not fire. |
| `zero-denominator-derived` | engine_category | `none` | The web control arm has no signups, so a derived ratio divides by zero. The render says "not available" in words, never 0. |
| `nullable-null-not-available` | engine_category | `none` | A column declared `nullable` holds `null`. Valid evidence; renders as "not available" in prose and in the table. |
| `display-only-rounding` | engine_category | `none` | The rate column declares whole-percent display while the saved values keep full precision. The render shows whole percents once; the raw decimals never reach the page. |
| `private-field-sentinel` | engine_category | `none` | A declared but non-exported column carries the Instance's private marker. Neither the marker nor the column name may appear in any rendered byte. |

## Readiness: no error, but never ready

| Case | Layer | Reports | Why it exists |
| --- | --- | --- | --- |
| `forged-attestation` | review_concern | `untrusted_attestation` | A `publication_approval` whose source is an `unverified_note`, bound to the current digest. `check` reports no error; readiness stays `not_ready` and says the source is not trusted. Whether an informal note was passed off as an approval is then a review concern. |

## Defects: these must fail

| Case | Layer | Reports | The one defect |
| --- | --- | --- | --- |
| `unresolved-reference` | engine_category | `unresolved_reference` | The answer-bearing Claim's first evidence reference names a result set that is not in the manifest. |
| `duplicate-row-key` | engine_category | `duplicate_row_key` | Both rows of the primary result set carry the row key `checklist`, so every reference into it is ambiguous. |
| `missing-column` | engine_category | `missing_column` | The answer-bearing Claim cites a column the result set does not declare. |
| `untraced-numeral` | engine_category | `untraced_numeral` | A data-bearing number is typed into the memo prose instead of a reference token. |
| `chart-forbidden-transform` | engine_category | `chart_subset` | The chart spec carries a top-level `transform`. A chart never computes. |
| `chart-layered-aggregate` | engine_category | `chart_subset` | A layered spec aggregates on one encoding channel and bins on another, inside the second layer. The forbidden-key walk reaches into layers. |
| `missing-memo-section` | engine_category | `template` | The Appendix section is missing, so a Reader cannot find how to rerun the numbers. |
| `claim-without-recheck` | engine_category | `schema` | The second Claim declares no Recheck policy. |
| `decision-metric-not-approved` | engine_category | `definition_not_approved` | A complete Finding names a proposed, unapproved Metric definition as its decision metric. |
| `definition-version-not-pinned` | engine_category | `definition_version` | The Question cites a definition version the manifest does not pin. |
| `failing-reconciliation-check` | engine_category | `check_failed` | The required reconciliation Check is recorded as `fail` while the Finding still answers the Question. Render is refused. |
| `snapshot-input-hash-mismatch` | engine_category | `hash_mismatch` | The pinned content hash of the first retained input does not match the file. |
| `stale-attestation` | engine_category | `stale_attestation` | A trusted `github_pr_review` approval is bound to a content digest this directory does not have. |
| `artifact-modified-after-attestation` | engine_category | `stale_attestation` | The memo was edited after the approval and the method review were recorded, without a new revision. The stale review is only a warning; the stale approval is the error. |
| `derived-cycle` | engine_category | `derived_cycle` | A derived value takes itself as an operand. |
| `derived-unit-mismatch` | engine_category | `unit_mismatch` | A `difference` is taken between a ratio and a user count. |
| `null-in-non-nullable-column` | engine_category | `null_value` | A column that is not declared `nullable` holds `null`. |
| `external-source-missing-type` | engine_category | `schema` | The typed external source has no source `type`. |
| `unsupported-schema-version` | engine_category | `schema` | The manifest declares a `schema_version` the Engine does not know. |
| `provisional-evidence` | engine_category | `provisional_evidence` | A Claim rests on a result set marked `provisional`. Render is refused, so it is never exported. |

## Known limits

- `derived-unit-mismatch` is reported at location `difference` (the operation name) rather than at the derived
  entry: the shared arithmetic helper raises it before the caller can attach a manifest pointer. The category is
  right; the location is coarse, and `expected.yaml` records that honestly.
- A structural rejection (`schema`) stops validation, so those cases report exactly one error and evidence is
  `not_evaluated` rather than `invalid`. That is the contract, not a gap in the fixture.
- These fixtures exercise `check` and `render` only. `check --mode rerun`, the adapters and the Golden Questions
  have their own suites.
