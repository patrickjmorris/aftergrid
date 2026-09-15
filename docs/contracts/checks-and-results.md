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
