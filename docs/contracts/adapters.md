# Adapter contract and capability matrix

Interface: `src/adapters/contract.ts`. Capabilities are declared from evidence (the seam-2 tests in `src/adapters/*.test.ts`), never assumed. An unsupported required capability fails or takes an explicit, recorded fallback; it never reports a green capability or a zero cost.

## Behaviours every adapter implements

| Capability | Meaning |
| --- | --- |
| execute | One statement, SELECT only, named parameters bound only when the statement declares them, typed JSON-safe cells (integers as numbers, decimals/dates/timestamps as strings, booleans, null). Timestamps with time zone are rendered in UTC as `YYYY-MM-DD HH:MM:SS+00`. |
| capture | Bounded extracts of declared tables written as CSV under `inputs/`, rows in a deterministic order, content hash recorded, consistency declared (`single_transaction`, `per_table`, `unknown`). |
| open_retained | Loads hash-verified extracts into a fresh sandbox; only the listed inputs are visible; a missing or corrupt extract is an explicit error and never falls back to a live source. |
| privilege_probe | Whether the connected role can write or run DDL, or `unsupported` with the reason. |
| cost_estimate | A non-executing planner estimate in backend units, or `unknown` with a reason. `scan_rows` is the largest planned scan; `rows` is the planned output. |
| statement_guard | Admission: a read is admitted when `scan_rows` is under the cap, or, when the estimate is unknown, only because enforced resource limits apply; a row LIMIT never bounds admission. DDL, DML, multi-statement input and external file access are refused. |
| resource_limits | What the engine actually enforces, named honestly. |
| cancellation | A statement past its timeout is interrupted; the connection remains usable; the source is unchanged. |
| catalog | Tables and columns with backend types. Business units never come from here. |

## DuckDB (v0, supported)

| Capability | Status | Evidence |
| --- | --- | --- |
| execute | supported | typed cells, UTC timestamps, decimal strings |
| capture | supported | stable hashes across two captures; `order by all` |
| open_retained | supported | rerun unchanged after live mutation; corrupt → `hash_mismatch`; missing → `missing_file`; undeclared table invisible |
| privilege_probe | **unsupported** | DuckDB has no roles. Safety is `access_mode: READ_ONLY` for `.duckdb` files (engine-enforced, tested) or read-only materialisation of CSV sources with external access disabled afterwards. |
| cost_estimate | supported | `EXPLAIN (FORMAT JSON)`; `unknown` when the planner reports no cardinality |
| statement_guard | supported | DDL/DML/multi-statement/external read refused; over-cap `LIMIT 1` scan rejected |
| resource_limits | **partial** | `memory_limit` and `threads` are engine settings; the statement timeout is a process-side interrupt; no CPU or disk quota |
| cancellation | supported | interrupted within the timeout, connection reusable |
| catalog | supported | `information_schema.columns` |

Units: from evidence and definition metadata only (`results[].columns[].unit`), never from SQL types.

## Postgres (v0 target, not yet implemented)

Owned by `ag-postgres-adapter-dna`. Expected differences: `privilege_probe` supported via effective privileges; `cost_estimate` via `EXPLAIN` without `ANALYZE` in planner cost units; `resource_limits` partial (`statement_timeout` enforced, `work_mem` is per-operation tuning, hard memory bounds only with an enforcing runtime); `open_retained` restores extracts into a disposable compatible Postgres or reports rerun unavailable while artifact replay stays available.

## `check --mode rerun`

Opens retained inputs per execution (its declared `input_ids` only), re-executes every query and every Check with the recorded parameters, serialises results exactly as build does, and compares: a result whose bytes differ from `results[].content_hash` or a Check whose outcome differs from the recorded one is a `rerun_mismatch` error. The directory is never modified; `sql_execution: performed` is reported only when SQL actually ran.
