# Adapter contract and capability matrix

Interface: `src/adapters/contract.ts`. Capabilities are declared from evidence (the seam-2 tests in `src/adapters/*.test.ts`), never assumed. An unsupported required capability fails or takes an explicit, recorded fallback; it never reports a green capability or a zero cost.

## Behaviours every adapter implements

| Capability | Meaning |
| --- | --- |
| execute | One statement, SELECT only, named parameters bound only when the statement declares them, typed JSON-safe cells (integers as numbers, decimals/dates/timestamps as strings, booleans, null). Timestamps with time zone are rendered in UTC as `YYYY-MM-DD HH:MM:SS+00`. |
| capture | Bounded extracts of declared tables written as CSV under `inputs/`, rows in a deterministic order, content hash recorded, consistency declared (`single_transaction`, `per_table`, `unknown`). |
| open_retained | Loads hash-verified extracts into a fresh sandbox; only the listed inputs are visible; a missing or corrupt extract is an explicit error and never falls back to a live source. |
| privilege_probe | Whether the connected role can write or run DDL, or `unsupported` with the reason. |
| cost_estimate | A non-executing planner estimate in backend units, or `unknown` with a reason. `scan_rows` is the largest planned scan; `rows` is the planned output. `unit` names the planner model the numbers came from (`estimated_rows` for DuckDB, `planner_cost` for Postgres, which also carries the planner's abstract `cost`), never an accuracy claim. |
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

## Postgres (v0, supported)

Implementation `src/adapters/postgres.ts`. Evidence: `src/adapters/postgres.test.ts`, which provisions its own disposable instance with `initdb`/`pg_ctl` and loads the fixture warehouse into it. The matrix below was produced on PostgreSQL 14.18. Where those binaries are absent the server-backed tests are **skipped with the reason printed** — never faked, and never counted as evidence for this table.

| Capability | Status | Evidence |
| --- | --- | --- |
| execute | supported | typed cells (int as a number when safe, `numeric` as its exact text, UTC `timestamptz`, dates and booleans, null distinct from zero); `$name` mapped to `$1..$n` in first-use order, bound only where the statement declares it |
| capture | supported | identical hashes across two captures; one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction, asserted across two tables with a commit landing between them; null / empty string / comma / quote / CR-LF / decimal round trip losslessly; a `json` column (no ordering operator) is captured by ordering on its text rendering; a column name a rerun could not restore is refused at capture, naming the column |
| open_retained | **partial** | extracts restored into a disposable Postgres (`initdb` → `pg_ctl` → `CREATE TABLE` from the recorded types → `COPY … FROM` → read-only role); rerun unchanged after the live source was mutated; corrupt → `hash_mismatch`; missing → `missing_file`; undeclared table invisible; a recorded type the fresh instance does not have (enum, domain, composite) restored as text and named in the admission; **no local runtime → `runtime_unavailable`**, never the live source |
| privilege_probe | supported | `has_table_privilege` for INSERT/UPDATE/DELETE/TRUNCATE over tables, views and materialised views, `has_schema_privilege`/`has_database_privilege` for CREATE, `pg_roles` for superuser/createdb; a writable role reports `can_write: true`, a read-only role `false`, and a role holding INSERT on a view over a table it can only read reports `true` |
| cost_estimate | supported | `EXPLAIN (FORMAT JSON)` without `ANALYZE`; `unit: planner_cost`; `unknown` with the planner's reason when planning fails |
| statement_guard | supported | DDL/DML/multi-statement/`COPY`/`SELECT … INTO`/`EXPLAIN`/external-file functions refused **bare and double-quoted**; an over-cap scan rejected even under `LIMIT 1`, including when wrapped in `query_to_xml`; the source row count unchanged afterwards |
| resource_limits | **partial** | `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout` are enforced by the server; `memory_limit` is applied as `work_mem` (per-operation tuning, not a cap) and a value `work_mem` cannot take is refused with `resource_limit`, never dropped; no hard memory or CPU bound is claimed |
| cancellation | supported | a runaway scan is cancelled at its timeout (`57014`) and the session answers the next statement; a statement that fails inside the capture transaction rolls it back, so the session is not left aborted |
| catalog | supported | `information_schema.columns` for the configured schema |

### Connection and credentials

`PostgresAdapter` takes the **name** of an environment variable (`connection_string_env`), never a connection string: a literal URL is refused at construction, and a missing variable is a `missing_credential` error naming the variable only. No credential reaches a file, a report location or an error message.

### What actually stops a write

Three independent layers, in this order:

1. the token guard below (a filter, and the only one that produces a readable refusal);
2. `SET default_transaction_read_only = on` on every session, which fails writes with `25006` even for a privileged role;
3. the connected role's own grants — the enforced boundary. The rerun instance goes further: its analysis role holds `CONNECT`, `USAGE` and `SELECT` and nothing else, with `CREATE` revoked from `PUBLIC`.

Every authored statement is also sent over the extended query protocol, where the server itself refuses multiple commands.

### The statement guard, and what it does **not** enforce

The guard is a conservative tokenizer (`guard()` in `src/adapters/postgres.ts`), not a Postgres parser. It understands line and block comments, string literals, dollar quoting and quoted identifiers, splits top-level statements on `;`, requires exactly one statement starting with `SELECT` or `WITH`, and refuses a denylist of statement keywords and of functions that reach outside the query (`pg_read_file`, `lo_import`, `dblink`, `set_config`, `query_to_xml`, `pg_sleep`, …).

It is deliberately blunt, and it errs towards false refusals:

- a **statement keyword** from the denylist is refused wherever it appears outside a literal or a quoted identifier — a column literally named `analyze`, `end` or `into` must be double-quoted;
- a **denied function** is refused bare *and* double-quoted, because Postgres resolves `"pg_read_file"` and `pg_read_file` to the same function; a column named after one is refused with it, which is the side this errs on. (Until the 2026-09-15 review the guard only saw bare words, so `select "pg_read_file"(…)` was admitted, and so was `select "query_to_xml"(…)` — which also walked past the admission cap, since `EXPLAIN` plans the call and not the SQL string it runs.)
- escape (`E'…'`), unicode (`U&'…'`) and bit-string (`B'…'`, `X'…'`) literals are refused outright, because their escaping rules are not modelled;
- positional parameters (`$1`) are refused; analysis SQL uses `$name`;
- row-level lock clauses other than `FOR UPDATE` are not specifically refused — they cannot write, and the read-only session and role stop them anyway;
- it does **not** validate that a statement is semantically read-only, and the function list is a denylist: a function outside it that runs SQL of its own would still be planned as one call, so the admission cap bounds the authored statement, not everything a function it calls might scan. Nothing in aftergrid relies on the guard alone: layers 2 and 3 above are what a test asserts.

### Admission

`EXPLAIN (FORMAT JSON)` without `ANALYZE` plans but never executes. `scan_rows` is the largest `Plan Rows` anywhere in the plan, so a `Limit` node never bounds admission; `rows` is the root node's `Plan Rows` and `cost` its `Total Cost`. An estimate the planner cannot give is `unknown` with its reason, and an unknown estimate is admitted **only** on the documented fallback (`unknown_estimate_with_enforced_limits`) with the enforced limits recorded in the admission. Planner estimates depend on table statistics: on a never-`ANALYZE`d table Postgres estimates from page counts, and admission then reads that guess, not the truth.

### Capture

One `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction covers every table, so the extracts are one consistent view (`consistency: single_transaction`). Each table is read as `select * from <schema>.<table> order by 1,2,…,n` and written with the shared lossless CSV writer (`scripts/lib/sql-runner.mjs`): a NULL is an empty unquoted field, an empty string is `""`. Ordering is by every column left to right, which makes the hash stable on one server; it depends on the server's collation, so hashes are comparable across instances only under the same collation. A column whose type has no default ordering operator (`json`, `xml`, `point`, …) is ordered by `<column>::text` instead — still deterministic, and recorded in `source.method` — rather than failing the capture. Schema reads and that orderability probe happen **before** the transaction opens, and a statement that does fail inside it rolls the transaction back.

A column whose name does not match `^[a-z][a-z0-9_]{0,63}$` is refused at capture, naming `<table>.<column>`: a rerun restores columns by name through the shared identifier rule, so capturing one would mint a hashed extract that could never be reopened.

Alongside the hash, capture records the server version and each column's name, `information_schema` type and nullability — in the `description` (which the Finding manifest schema carries) and in the optional `runtime` field of `RetainedInput` (which it does not; `schema/finding-manifest.schema.json` rejects unknown keys under `snapshot.inputs`). A rerun of an extract with no recorded `runtime` restores every column as `text` and says so in the admission's estimate reason.

### Rerun (`open_retained`)

Hashes are verified before anything is started. Then the Engine provisions a throwaway instance — `initdb` into a temp directory, started by `pg_ctl` on a private unix socket with **no TCP listener** — creates the tables from the recorded column types, loads the verified CSVs with server-side `COPY … FROM`, creates the SELECT-only analysis role, and stops and deletes the whole instance on `close()` — or on process exit, if the caller never gets there.

A recorded type the fresh instance does not have — an enum, domain or composite, which lives in the source database and not in `pg_catalog` — is restored as `text` (the extract holds its text rendering) and every such substitution is named in the admission's estimate reason. It is an explicit, recorded fallback, not a silent one, and not the `type "mood" does not exist` failure it used to be. This provisioning is an Engine path; agent-issued SQL never reaches it.

When `initdb`/`pg_ctl` are not on `PATH` (or `AFTERGRID_PG_BINDIR`), rerun fails with `runtime_unavailable` saying that SQL rerun is unavailable here while saved-result artifact replay remains possible (`check --mode artifact`). There is no fallback to the live source, ever.

### Not claimed

- No hard memory or CPU bound. `work_mem` is per-operation tuning; a query can use several times it, and only a hosting runtime (a container memory limit, a cgroup) can bound the backend.
- No disk quota, no temp-file limit, no connection-count limit beyond the server's own.
- `pg_cancel_backend` from a second connection is a backstop for `statement_timeout`, not a second guarantee: if it cannot connect, the server-side timeout is still what stops the statement.
- Cross-instance hash stability under different collations or server versions is not claimed; capture hashes are evidence about one source.
- The privilege probe reads relation privileges only. `EXECUTE` on a `SECURITY DEFINER` routine is not probed, so `can_write: false` is a statement about tables, views and materialised views, and the `detail` string says so.
- A dropped connection (server restart, proxy idle kill, `pg_terminate_backend`) is reported as `runtime_unavailable` on the next call and the session is not reusable; the adapter does not reconnect or replay.
- Restoring a column as `text` preserves its bytes, not its type semantics: ordering and comparison on a substituted enum or composite column are text ordering and comparison.
- PostHog's managed warehouse remains **unvalidated**: no test here connects to it, and nothing in this matrix carries over to it.

## `check --mode rerun`

Retained inputs are opened by the adapter that captured them (`snapshot.inputs[].source.adapter`): a Postgres-captured snapshot is restored on a disposable Postgres under Postgres types and dialect, and everything else — a `duckdb` or `synthetic` extract, or an input naming no adapter — reruns on DuckDB as before. One session cannot mix engines, so a Postgres extract alongside another kind is refused with `not_implemented` rather than reread under the wrong dialect.

Opens retained inputs per execution (its declared `input_ids` only), re-executes every query and every Check with the recorded parameters, serialises results exactly as build does, and compares: a result whose bytes differ from `results[].content_hash` or a Check whose outcome differs from the recorded one is a `rerun_mismatch` error. The directory is never modified; `sql_execution: performed` is reported only when SQL actually ran.
