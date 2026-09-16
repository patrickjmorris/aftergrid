# The recorded data path

`aftergrid record` is the command for the route where **aftergrid does not run the SQL**. The Operator's harness
owns the data path — Claude Code, Cursor, Codex or ChatGPT Work with an MCP server or a CLI — and `record` writes
down what that harness ran and what came back. This is the default route (ADR 0010, *The harness owns the data
path; the Engine records what it ran*). An aftergrid adapter (`docs/contracts/adapters.md`) is the **upgrade** a
Finding gains when an Instance configures one; it is not a prerequisite for producing a Finding.

Implementation: `src/commands/record.ts`. Manifest fields: `schema/finding-manifest.schema.json`
(`executions[].executed_by`, `executions[].mode: recorded`, `checks[].reported_by`). Exemplar:
`fixtures/instance/analytics/findings/2026-09-16-price-change-cancellations-recorded`.

## The command

```
aftergrid record <finding-dir> --tool "<name>" [--tool-version <v>] [--executed-at <timestamp>]
                 [--instance <dir>] [--json]
                 --execution <id> --result <file.json|file.csv> [--sql <file|inline>] [--params k=v ...]
               | --check <id> --outcome pass|fail|not_run|error [--evidence <file>]
```

Exactly one subject per invocation: one execution, or one Check outcome. `--tool` is **required** and never
defaulted — the name of the tool that actually ran the SQL, as the Operator says it (`psql`, `supabase mcp`,
`duckdb cli`). aftergrid has no way to know which tool a harness used, and a guessed name inside the content
digest would be provenance nobody wrote.

`--executed-at` is **the harness's own execution time**, as RFC 3339 (`2026-09-16T09:12:44Z`,
`2026-09-16T05:12:44-04:00`): when the tool actually ran the query or the Check. Omit it and this moment is
recorded. It is never invented as something earlier, and anything that is not a timestamp — `last tuesday` — is
refused (`invalid_artifact`) before anything is written, rather than pinned and reported as schema-invalid by the
next `check`.

`--sql` is a file when one exists at that path, and otherwise the SQL text itself. Two arguments are refused
rather than taken as text: one that is **plainly a path to nothing** (a `.sql` name, whitespace or not; or a
directory separator with no whitespace) and one given **inline that holds no SQL statement** (no `select … from`,
leading `select`, `with … as (` or `values (` in it, so a keyword inside a directory name does not pass). Both
would otherwise be written into the declared query file as the query the harness ran, with every hash re-pinned
over it — a mistyped path is how a Finding ends up with its real query replaced by a 39-byte string that `check`
reports as valid evidence.

`record` acts on an execution or a Check the manifest **already declares** (`/checked-analysis` writes the
declaration: the query, the execution with `input_ids: []` and `mode: recorded`, the result set with its columns,
row key and types, and the Check files). It pins what a declaration says it is; it never invents one.

## What it pins

For `--execution`:

| Field | From |
| --- | --- |
| `queries[].content_hash`, `executions[].sql_hash` | The SQL text. `--sql` is a file when one exists at that path, otherwise the SQL itself; either way the **bytes** are copied into the declared query path, never linked. A path to nothing, and inline text with no SQL in it, are refused instead. |
| `executions[].parameters` | The execution's recorded parameters, merged with each `--params key=value`. `analytical_timezone` is required here as everywhere: a run with none is refused. `true`, `false`, `null` and plain numbers are recorded as typed scalars; everything else is text. |
| `results[].content_hash`, `results[].row_count`, `executions[].result_hash` | The result file, rewritten into the canonical result format of `docs/contracts/checks-and-results.md` and validated against the declared columns, types, nullability and row key before anything is written. |
| `executions[].executed_by` | `{ kind: harness, tool, tool_version?, recorded_at }`. |
| `executions[].mode` | `recorded`. `adapter` and `engine_version` are **removed**: aftergrid did not run it and does not name an engine that did. |
| `snapshot.guarantees` | Exactly `[artifact_replay]`. |
| `content_digest` | Re-pinned through the shared `digestOf`. |

For `--check`: `checks[].content_hash` (the Check file), `checks[].outcome`, `checks[].executed_at`, and
`checks[].reported_by = { kind: harness, tool, tool_version?, reported_at, evidence? }`. The evidence file is
copied into `checks/evidence/<check_id>.<ext>` and pinned by hash. Recording the same Check again with evidence
of another kind (`.txt` after `.json`) writes the new file and **deletes** the one the previous recording pinned:
nothing the manifest no longer names is left in the Finding outside the digest.

`executed_by.kind: adapter` is the value an adapter run means, and `aftergrid execute` does **not** write it
today: it writes `adapter`, `engine_version` and `mode: retained_rerun`, which already say an adapter ran the
query. An execution with **no** `executed_by` is therefore an adapter run — every Finding written before this
field existed, and every Finding `execute` writes now. It is never read as a recorded one. The field is `kind:
harness` or absent in practice; `adapter` exists so `execute` can start writing it without a schema change, and
a Finding that carries it means exactly what the absence means.

`recorded_at` and `reported_at` are volatile and excluded from the content digest, exactly as `executed_at` is,
so recording the same thing twice changes nothing the digest covers. The tool name and the evidence hash are
**not** volatile: who ran a query and what a reported outcome rests on are content.

## Result files the harness can hand over

- `.json`: the canonical result object, an object with `columns` and `rows`, or a bare array of row objects.
- `.csv`: a header row of column names plus rows, read as RFC 4180. A CSV cell is text, so each value is
  converted by its **declared** type — an unquoted empty field is SQL NULL, a quoted `""` is the empty string
  (the distinction `psql --csv` makes, and not one to decide for the Operator), `true`/`false` is a boolean, an
  integer column is a number when the cell is written as one (an optional `-` and digits, nothing else), and
  everything else stays the string the tool wrote. A value the declared type cannot hold is reported
  (`value_type`), never coerced into something that looks right: `7.0`, `1e3`, `0x10` and `+7` are refused rather
  than read as 7, 1000, 16 and 7. A carriage return is a line ending only before a newline; inside a field it is
  data. A row of empty cells (`,,`) is a row, and is refused by the row-key and nullability checks like any
  other; only a trailing empty **line** is not a row.

Whatever arrives, what is saved is the one canonical format. The Finding never depends on the file it was handed:
the bytes are copied in, so deleting or editing the source afterwards changes nothing.

## What is guaranteed, and what is not

`snapshot.guarantees` is exactly `[artifact_replay]`:

- **Guaranteed.** The saved result replays byte for byte. The SQL, the parameters, the result and the tool that
  produced them are pinned, and every hash is verified by `aftergrid check`. A number in the memo still traces to
  a cell in a saved result set, and a tampered result, query or evidence file is still caught.
- **Not guaranteed.** `analysis_rerun`. Nothing was retained, so nothing can be re-executed and compared. A
  manifest with a harness-recorded execution that claims `analysis_rerun` is a `false_guarantee` error.
- **Not guaranteed.** That any Check actually passed. On this path a Check outcome is **agent-reported**: the
  harness ran it and said what happened. `check` verifies the one thing a saved artifact can establish — that the
  evidence file the report names is present and still hashes to what was pinned — and nothing more.
- **Not covered.** The guardrail hook (`docs/contracts/hook.md`) inspects shell commands in Claude Code. A query
  the harness ran through an MCP server or an in-process client never passed a shell, so the guard never saw it.
  That non-coverage travels with the verdict and is stated on the Finding, not left to be inferred.
- **Not affected.** Revisit. A Finding that cannot be rerun cannot be revisited; `docs/contracts/revise.md`
  applies unchanged, and a numeric change still reopens the Analysis.

`capture` is **optional** on this route. A manifest whose executions are all harness-recorded and whose
`snapshot.inputs` is empty is valid, complete and renderable. To gain `analysis_rerun` later, capture the inputs
the analysis needs and run `aftergrid execute`: the guarantee is earned by observing it, never by asserting it.

## Refusals

None of these has a flag to get past it. Nothing is written when any of them fires.

| Category | When |
| --- | --- |
| `stale_attestation` | The revision carries attestations, and recorded evidence is inside the content digest they bind to. Bump `finding.revision` and record into the new revision — the same rule `capture` applies. |
| `unevidenced_outcome` | An agent-reported Check outcome is `pass` and names no evidence file. `pass` is the one outcome that asserts something held, so it may only be recorded with the artifact the tool produced. `fail`, `not_run` and `error` may carry one and do not have to. |
| `execution_binding` | The execution declares retained inputs. Those extracts are what `execute` reads; a recorded execution read the Operator's source, and saying otherwise would put a false provenance in the digest. Clear `input_ids`, or run `execute`. |
| `result_shape`, `value_type`, `row_key`, `duplicate_row_key`, `null_value` | The result does not match its declared shape. The same `validateResult` the adapter path uses. |
| `sql_parameter` | No `analytical_timezone`, or a `--params` argument that is not `key=value`. |
| `unresolved_reference` | `--execution` or `--check` names something the manifest does not declare. |
| `missing_file` | No SQL at the declared query path and no `--sql`; a `--sql` argument that looks like a file path (a `.sql` name, or a directory separator without whitespace) with no file there; or the result or evidence file does not exist. |
| `invalid_artifact` | `--sql` given inline with no SQL statement shape in it (a bare keyword is not one); or an `--executed-at` that is not an RFC 3339 timestamp. |
| `unsafe_path` | Any path inside the Finding that escapes it, or passes through a symlink. Every destination goes through `safePath`; the source may be anywhere, because only its bytes arrive. |
| `incomplete` | No `--tool`, or not exactly one of `--execution` / `--check`. |

`check --mode rerun` on a recorded Finding is refused with `rerun_unavailable`, naming the executions and the
tool that ran them. It is refused rather than attempted: the alternative is a crash, or a rerun against some other
input set reported as if it had reproduced the evidence. `--mode artifact` still verifies everything it always
verified, and that answer stands.

## Exit codes

`0` clean, `1` problems found, `2` refused or a usage error, `3` not implemented — the Engine-wide codes of
`src/report.ts`. Code `2` is for the small set of categories `src/report.ts` lists as refusals (`exists`,
`reopens_analysis`, `rerun_unavailable`), not for every refusal in the table above: `check --mode rerun` on a
recorded Finding exits `2`, because nothing is wrong with the Finding and the question has no answer on this
route, while a `record` that refuses — `stale_attestation`, `unevidenced_outcome`, `execution_binding`,
`missing_file`, `invalid_artifact` — reports the error and exits `1`. A usage error caught by the CLI before
`record` runs (no `--tool`, not exactly one subject) still exits `2`.

## What the report and the render say

- Every `record` report says `sql_execution: not_performed`. That is the point of the route, not a gap.
- `checks_reported_by_agent: true` in the JSON report says a Check outcome was reported rather than executed, and
  `formatHuman` prints it as its own line. It is never folded into `evidence`. `check` sets it from the manifest,
  so it is true whenever any Check in the Finding carries a `reported_by`. `record` sets it on the invocation
  that wrote such an outcome — a `record --execution` report never carries it, even in a Finding whose Checks are
  all agent-reported. The Finding-wide answer is `check`'s.
- `check` emits a `recorded_path` note naming which executions and Checks were harness-recorded and by what, and
  a `recorded_path` warning for an execution that declares `mode: recorded` and has not been recorded yet.
- An agent-reported outcome can **lower** publication readiness and never raise it. A verified human review still
  approves what a human read; the Engine will not report outcomes it did not execute as verified, so readiness is
  `unknown` at most and the reason says why.
- The render carries one Reader-safe line among the other facts in *How we checked*: "Queries and Checks were run
  by the Operator's tool `<tool>`; aftergrid recorded them and did not rerun them." The provenance popover on
  each value says the same about where the number came from, instead of reporting a missing retained copy. The
  **Data** fact beside it reports what was kept, which on this route is nothing: "No copy of the data was kept.
  The saved results replay byte for byte; the queries cannot be rerun here."

## Related contracts

`docs/contracts/analysis-directory.md` (who writes what, and the command table) ·
`docs/contracts/checks-and-results.md` (the result format and agent-reported outcomes) ·
`docs/contracts/adapters.md` (the adapter as an upgrade) · `docs/contracts/render.md` (the fact line) ·
`docs/contracts/hook.md` (non-coverage) · `docs/contracts/finding-manifest.md` (the schema additions) ·
`docs/contracts/revise.md` (what a change costs).
