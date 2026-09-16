# Check files and result files

Conventions the manifest schema cannot express. `aftergrid check` and the DuckDB adapter must implement all of them. The fixture tooling (`scripts/fixture-tool.mjs`) implements enough of them to build and validate the exemplars and is deliberately incomplete: it does not enforce id uniqueness, exactly-one-row Check results, export allowlisting of every prose and derived reference, or result cell types beyond integer and decimal.

## Check files (`checks/<check_id>.sql`)

- One SQL statement that returns exactly one row with a boolean column `pass` and an optional text column `detail`.
- `pass = true` records outcome `pass`; `pass = false` records `fail`; `pass = NULL` records `not_run`, meaning the Check declares itself not evaluable on this data (a falsifier before its minimum-data gate, for example). A SQL error records `error`.
- A Check runs against the same retained inputs as the analysis, with the parameters of the execution named by its `execution_id`, or of the first execution when none is named. Parameters bind as `$name`.
- `required: true` Checks must record `pass` for evidence validity. A `minimum_data` Check that fails is a business result and is normally `required: false`; the Finding's outcome is then `insufficient_data`.
- `kind: falsifier` Checks carry `expected_outcome`. For an `answered` Finding the recorded outcome must equal it; `not_run` is only acceptable when the outcome is not `answered`.
- A SQL error in any Check, required or not, is invalid evidence: an `error` outcome is never a business result. Only `fail` on a `minimum_data` Check (or on an optional Check the memo explains) is.
- A Check statement is a single SELECT. Retained inputs are the only relations it may read; external file access, attach and installation of extensions are disabled in the execution sandbox, and each execution sees only the inputs its manifest entry declares.
- Artifact-verification mode does not execute Checks and reports SQL execution as not performed; it never turns a recorded `not_run` into `pass`.
- Build (and any future `check --pin`) rewrites hashes, results and outcomes only. It never creates, rebinds or refreshes an approval, a review or an attestation; those become stale and are reported as stale.

## Retained inputs

- `kind: extract` inputs are CSV files with a header row. The adapter exposes each input as a read-only relation named by its input `id`; SQL refers to `users`, `events`, `subscriptions`, never to file paths.
- The fixture tool reads every column as text (`all_varchar`) so that SQL casts are explicit and dialect-visible. The DuckDB adapter may type columns from a declared schema; either way the SQL in a Finding must cast timestamps and numbers itself.
- Timestamps in inputs are UTC ISO-8601; the analytical timezone is a parameter and every date grouping converts explicitly.

## Result files (`results/<result_id>.json`)

```json
{
  "result_id": "retention_by_arm",
  "execution_id": "ex_retention_by_arm",
  "row_key": "arm",
  "columns": ["arm", "signups", "retained", "retained_7d_rate"],
  "rows": [
    { "arm": "checklist", "signups": 624, "retained": 217, "retained_7d_rate": "0.347756" }
  ]
}
```

- `columns` lists names in the order the query returned them and must equal the manifest's declared columns.
- Value encoding by declared type: `integer` is a JSON number; `decimal` is a JSON string carrying the full precision the query produced; `date`, `timestamp`, `text` are strings; `boolean` is a JSON boolean; SQL NULL is JSON `null` and is allowed only in columns marked `nullable`.
- The file is pretty-printed with two-space indentation and a trailing newline; `content_hash` is over the file bytes.
- Row keys are the values of the `row_key` column, unique, and inside `^[A-Za-z0-9_-]{1,64}$`.
- Every cell is checked against its declared type (`value_type`), every file's `columns`, `row_key` and `execution_id` against the manifest (`result_shape`, `execution_binding`), and every result's hash against its execution's `result_hash`.
- Derived values are computed with exact decimal arithmetic on the saved strings, never with binary floating point; operand counts are checked per operation (`derived_arity`). Display formatting happens once, after the calculation.

## Display formatting

Applied once, at render, from the `display` on a column, derived value or external source:

| kind | rule |
| --- | --- |
| `integer` | thousands separators, no decimals |
| `decimal` | `decimals` places |
| `percent` | value × 100 when unit is `ratio`, `decimals` places, `%` suffix |
| `percentage_points` | value × 100 when unit is `ratio`, `decimals` places, ` pp` suffix |
| `currency_usd` | `$` prefix, two decimals |
| `date` | as written (ISO) in source; renderer may localise the label but never the value |
| `text` | as is |

Null and not-available render as "not available"; never as 0, blank or a dash without the words.

## Export and provisional policy reach everything

`export_policy.allowed_fields` governs every value that can reach a Reader: chart data, table cells, prose tokens and the operands of derived values. A reference to a column outside the allowlist fails `export_policy` wherever it appears. Provisional status propagates from results through derived values to Claims; a Claim resting on provisional evidence cannot be rendered.

`export_policy.private_marker` is the Instance's own sentinel for text that must never reach a Reader. `check` fails `export_policy`, with a line and column, when the marker appears in **memo prose**, because every byte of the memo is Reader-facing. It deliberately does not scan result files: a marker in a column outside `allowed_fields` is legitimate and the renderer projects that column away. `render` re-checks the marker against the bytes it is about to write and refuses rather than write them.

## Seam-1 negative fixtures

`fixtures/negatives/` holds one small Finding directory per deliberate defect, each with an `expected.yaml`
(`layer`, `expect`, `category`, `location_pattern`, `defect`, `description`). `src/negatives.test.ts` runs `check` —
and `render` where the case is about rendering — on a temp copy of every case, asserts the declared category appears
at a matching location, and rejects any *other* error category: a negative that fails for an unrelated reason, such
as a missing review or a stale one, proves nothing. The directories are generated and committed by
`src/negatives-build.ts`, which derives each case from a reviewed exemplar, applies one defect, and re-pins every
hash and the content digest through the shared `digestOf` / `definitionHash`, so everything is correct except the
defect. `fixtures/negatives/README.md` is the index.

Each case declares its layer (`docs/contracts/golden-questions.md`). Semantic scenarios — a mix shift, an
instrumentation break, a coverage gap — are **not** here: they are review concerns with correct numbers, and they
live in the Golden Questions (`fixtures/instance/analytics/golden/`).

| Case | Layer | `check` reports |
| --- | --- | --- |
| `control-valid` | engine_category | no error (the unmodified base) |
| `control-non-answer` | analytical_outcome | no error: a complete `insufficient_data` Finding with a `minimum_data` Check recorded `fail` |
| `control-prose-dates-ids` | engine_category | no error: dates, timestamps, numbered headings, ids, definition versions, file paths and `{{literal:…}}` are not data-bearing |
| `zero-denominator-derived` | engine_category | no error; the render says "not available", never 0 |
| `nullable-null-not-available` | engine_category | no error; a declared null renders "not available" in prose and in the table |
| `display-only-rounding` | engine_category | no error; formatting is applied once at render and the saved decimals never reach the page |
| `private-field-sentinel` | engine_category | no error; the column is outside `allowed_fields`, so the marker never had a path to a Reader and neither it nor the column name is in any rendered byte |
| `forged-attestation` | review_concern | no error, readiness `not_ready`: an `unverified_note` never counts toward publication readiness |
| `unresolved-reference` | engine_category | `unresolved_reference` |
| `duplicate-row-key` | engine_category | `duplicate_row_key` |
| `missing-column` | engine_category | `missing_column` |
| `untraced-numeral` | engine_category | `untraced_numeral` |
| `chart-forbidden-transform` | engine_category | `chart_subset` (top-level `transform`) |
| `chart-layered-aggregate` | engine_category | `chart_subset` (aggregate and bin inside a layer) |
| `missing-memo-section` | engine_category | `template` |
| `claim-without-recheck` | engine_category | `schema` |
| `decision-metric-not-approved` | engine_category | `definition_not_approved` |
| `decision-metric-approval-forged` | engine_category | `untrusted_attestation` (plus `definition_not_approved`): the manifest states an approval the definition file does not record |
| `private-marker-in-memo` | engine_category | `export_policy` at `memo.md:<line>:<col>`; `render` is refused |
| `definition-version-not-pinned` | engine_category | `definition_version` |
| `failing-reconciliation-check` | engine_category | `check_failed`; `render` is refused |
| `snapshot-input-hash-mismatch` | engine_category | `hash_mismatch` |
| `stale-attestation` | engine_category | `stale_attestation` |
| `artifact-modified-after-attestation` | engine_category | `stale_attestation` (plus a `stale_review` warning, which is never the failure by itself) |
| `derived-cycle` | engine_category | `derived_cycle` |
| `derived-unit-mismatch` | engine_category | `unit_mismatch` |
| `null-in-non-nullable-column` | engine_category | `null_value` |
| `external-source-missing-type` | engine_category | `schema` |
| `unsupported-schema-version` | engine_category | `schema` |
| `provisional-evidence` | engine_category | `provisional_evidence`; `render` is refused, so it is never exported |

### What these fixtures do not enforce

- **No SQL runs.** The retained inputs are trimmed stubs, the Snapshot declares only `artifact_replay`, and the
  recorded execution and Check outcomes and timestamps are carried over from the exemplar. They are fixture data,
  not a record of an execution in these directories; `check --mode rerun` is not supported on them.
- **No approvals, reviews or Decision records.** No case carries a verified publication approval, the `reviews[]`
  entry names itself as a generated fixture, and the Instance root has no `decisions/` directory on purpose, so a
  Decision binding can never be the reason a negative fails.
- **Location granularity is not uniform.** `unit_mismatch` is reported at the operation name (`difference`) because
  the shared arithmetic helper raises it before a manifest pointer exists; `expected.yaml` records that location as
  it is rather than pretending it is finer.
- **A structural rejection stops validation.** Validation stops at the first `schema` problem and at the first
  `ContractError` from the shared helpers in `scripts/fixture-safety.mjs`: `unsafe_path`, `path_collision`,
  `duplicate_id`, `execution_binding`, `derived_arity` and `definition_version` from `validateStructure`, and
  `unit_mismatch` from the derived arithmetic. Those cases report exactly one error and nothing after the stop is
  read — no memo check, no content digest, no readiness — so `check` reports evidence `not_evaluated`, not
  `invalid`. `schema`, `unit_mismatch`, `execution_binding` and `derived_arity` are in `check`'s STOP set, so the
  report does not claim `content: complete` for a Finding it stopped reading.
- **A fault inside a result file does not stop validation.** `result_shape`, `row_key`, `value_type`,
  `duplicate_row_key` and `null_value` in a `results/*.json` file are reported and validation continues: the
  remaining results, the Claims, the memo, the content digest and readiness are all still checked. Only a file
  whose shape cannot be read at all is skipped, because nothing below it can read its rows.
- **A definition's approval is corroborated, not verified.** `check` requires a decision metric's `lifecycle` and
  `approval` in the manifest to match the definition file's own front matter, and requires the approval to bind the
  definition's current content and to name a trusted source type. It does **not** call GitHub, check the named
  review, or compare the approver against the Instance's `publication.trusted_approvers`; that is
  `src/publication/readiness.ts`, which answers `unknown` rather than `ready` when it cannot read the review.
