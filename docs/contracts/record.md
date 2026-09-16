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
aftergrid record <finding-dir> --tool "<name>" [--tool-version <v>] [--instance <dir>] [--json]
                 --execution <id> --result <file.json|file.csv> [--sql <file|inline>] [--params k=v ...]
               | --check <id> --outcome pass|fail|not_run|error [--evidence <file>]
```

Exactly one subject per invocation: one execution, or one Check outcome. `--tool` is **required** and never
defaulted — the name of the tool that actually ran the SQL, as the Operator says it (`psql`, `supabase mcp`,
`duckdb cli`). aftergrid has no way to know which tool a harness used, and a guessed name inside the content
digest would be provenance nobody wrote.

`record` acts on an execution or a Check the manifest **already declares** (`/checked-analysis` writes the
declaration: the query, the execution with `input_ids: []` and `mode: recorded`, the result set with its columns,
row key and types, and the Check files). It pins what a declaration says it is; it never invents one.

## What it pins

For `--execution`:

| Field | From |
| --- | --- |
| `queries[].content_hash`, `executions[].sql_hash` | The SQL text. `--sql` is a file when one exists at that path, otherwise the SQL itself; either way the **bytes** are copied into the declared query path, never linked. |
| `executions[].parameters` | The execution's recorded parameters, merged with each `--params key=value`. `analytical_timezone` is required here as everywhere: a run with none is refused. `true`, `false`, `null` and plain numbers are recorded as typed scalars; everything else is text. |
| `results[].content_hash`, `results[].row_count`, `executions[].result_hash` | The result file, rewritten into the canonical result format of `docs/contracts/checks-and-results.md` and validated against the declared columns, types, nullability and row key before anything is written. |
| `executions[].executed_by` | `{ kind: harness, tool, tool_version?, recorded_at }`. |
| `executions[].mode` | `recorded`. `adapter` and `engine_version` are **removed**: aftergrid did not run it and does not name an engine that did. |
| `snapshot.guarantees` | Exactly `[artifact_replay]`. |
| `content_digest` | Re-pinned through the shared `digestOf`. |

For `--check`: `checks[].content_hash` (the Check file), `checks[].outcome`, `checks[].executed_at`, and
`checks[].reported_by = { kind: harness, tool, tool_version?, reported_at, evidence? }`. The evidence file is
copied into `checks/evidence/<check_id>.<ext>` and pinned by hash.

An adapter run (`aftergrid execute`) sets `executed_by.kind: adapter` where it sets `adapter` and
`engine_version`. An execution with **no** `executed_by` is a manifest written before the field existed: read it
as an adapter run, never as a recorded one.

`recorded_at` and `reported_at` are volatile and excluded from the content digest, exactly as `executed_at` is,
so recording the same thing twice changes nothing the digest covers. The tool name and the evidence hash are
**not** volatile: who ran a query and what a reported outcome rests on are content.

## Result files the harness can hand over

- `.json`: the canonical result object, an object with `columns` and `rows`, or a bare array of row objects.
- `.csv`: a header row of column names plus rows. A CSV cell is text, so each value is converted by its
  **declared** type — an empty field is SQL NULL, `true`/`false` is a boolean, an integer column is a number, and
  everything else stays the string the tool wrote. A value the declared type cannot hold is reported
  (`value_type`), never coerced into something that looks right.

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
| `missing_file` | No SQL at the declared query path and no `--sql`; or the result or evidence file does not exist. |
| `unsafe_path` | Any path inside the Finding that escapes it, or passes through a symlink. Every destination goes through `safePath`; the source may be anywhere, because only its bytes arrive. |
| `incomplete` | No `--tool`, or not exactly one of `--execution` / `--check`. |

`check --mode rerun` on a recorded Finding is refused with `rerun_unavailable`, naming the executions and the
tool that ran them. It is refused rather than attempted: the alternative is a crash, or a rerun against some other
input set reported as if it had reproduced the evidence. `--mode artifact` still verifies everything it always
verified, and that answer stands.

## Exit codes

`0` clean, `1` problems found, `2` refused or a usage error, `3` not implemented — the Engine-wide codes of
`src/report.ts`. `rerun_unavailable` is a **refusal**, so `check --mode rerun` on a recorded Finding exits `2`,
not `1`: nothing is wrong with the Finding, and the question has no answer on this route.

## What the report and the render say

- Every `record` report says `sql_execution: not_performed`. That is the point of the route, not a gap.
- `check` and `record` set `checks_reported_by_agent: true` in the JSON report when any Check outcome was
  reported rather than executed, and `formatHuman` prints it as its own line. It is never folded into `evidence`.
- `check` emits a `recorded_path` note naming which executions and Checks were harness-recorded and by what, and
  a `recorded_path` warning for an execution that declares `mode: recorded` and has not been recorded yet.
- An agent-reported outcome can **lower** publication readiness and never raise it. A verified human review still
  approves what a human read; the Engine will not report outcomes it did not execute as verified, so readiness is
  `unknown` at most and the reason says why.
- The render carries one Reader-safe line among the other facts in *How we checked*: "Queries and Checks were run
  by the Operator's tool `<tool>`; aftergrid recorded them and did not rerun them." The provenance popover on
  each value says the same about where the number came from, instead of reporting a missing retained copy.

## Related contracts

`docs/contracts/analysis-directory.md` (who writes what, and the command table) ·
`docs/contracts/checks-and-results.md` (the result format and agent-reported outcomes) ·
`docs/contracts/adapters.md` (the adapter as an upgrade) · `docs/contracts/render.md` (the fact line) ·
`docs/contracts/hook.md` (non-coverage) · `docs/contracts/finding-manifest.md` (the schema additions) ·
`docs/contracts/revise.md` (what a change costs).
