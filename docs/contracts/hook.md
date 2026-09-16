# Guardrail hook contract

ADR 0006: a rule with no enforcement is not a rule. The supported-query-path rules are enforced by a Claude Code
PreToolUse hook (`hooks/claude-code/aftergrid-guard.mjs`), installed by `aftergrid hook install`, not by skill prose.

The hook has one job: **stop a source write or DDL issued through a supported query entry point, without getting in
the way of local Finding files or a disposable scratch database.** It is not a shell sandbox, and everything below
says plainly where it stops.

## Wire contract

Claude Code runs the hook before every `Bash` tool call and pipes it JSON on stdin:

```json
{ "tool_name": "Bash", "tool_input": { "command": "psql -c \"insert into users values (1)\"" }, "cwd": "/repo" }
```

| Outcome | Exit | stdout | stderr |
| --- | --- | --- | --- |
| block | 2 | `{"decision":"block","reason":…,"aftergrid_hook":{…}}` | a human reason, then one `{"aftergrid_hook":{…}}` line |
| allow | 0 | the `aftergrid_hook` line when the command could not be inspected, or with `--explain` | empty |

The machine-readable verdict is stable: `{version, decision, rule, tool, target, source, operations, message,
remedy, policy, policy_source, policy_notes, notes, uninspected, not_covered}`, plus `wrapper` when the command was
inspected through a shell's `-c`. `not_covered` travels with every verdict, so nothing reads as "checked" that was
not.

## Policy source

The hook walks up from the tool call's `cwd` looking for `aftergrid.yaml`, then `analytics/aftergrid.yaml`, at each
ancestor (12 levels). It reads `connection.adapter`, `connection.duckdb.path`, `connection.postgres.{host,database,
port,url_env}` with a small YAML-subset reader, no dependency on the `yaml` package. `connection.duckdb.path` goes
through `safePath` against the Instance root. A `url_env` that is set is parsed for host and database only; the
credential is never read into a verdict or a log.

With **no `aftergrid.yaml` above `cwd`** the hook says so (`policy_source: "no instance policy found"`), recognises
no source as configured, and still blocks the built-in destructive-command list below.

## Supported paths

| Entry point | SQL the hook reads | Verdict |
| --- | --- | --- |
| `psql` / `pgcli` | **every** `-c` / `--command` (not just the first), heredocs (`<<EOF`, `<<-'EOF'`), a here-string (`<<<`), stdin redirected from a file (`< q.sql`), upstream `echo`/`printf` in the same pipeline, **every** `-f` file's contents when readable (≤1 MB) | write/DDL against the configured target → **block**; otherwise allow |
| `duckdb` | every `-c` / `-cmd` / `-s`, the positional SQL after the database file, heredocs, here-strings, redirected stdin and piped SQL, every `-f`/`-init` file's contents when readable | write/DDL against the configured file → **block**; `ATTACH`/`INSTALL`/`LOAD` anywhere → **block** |
| `node -e` / `deno -e` / `bun -e`, `python -c` / `python3 -c`, `ruby -e`, `perl -e` | the inline snippet, string literals included | a write keyword plus database context → **block** |
| `bash -c` / `sh -c` / `zsh -c` / `ksh -c` / `dash -c` (including clustered forms such as `-lc`) | the inline command string, classified exactly as if it had been typed directly, up to 3 levels of nesting | the inner command's verdict, carrying `wrapper` and a note saying it was inspected through the shell |
| `node src/cli.ts …`, `aftergrid …` | — | allow (`local_artifact`): the CLI's own SQL runs in the sealed adapter sandbox |
| `mkdir`, `cp`, `mv`, `tee`, `git`, `pnpm`, … | — | allow (`local_artifact`); writing under `<instance>/findings/` is named as such |
| `initdb`, `pg_ctl`, `createdb`, `dropdb`, `docker run`/`podman` | — | allow (`disposable_database`): provisioning a throwaway database is not agent-issued source SQL |

A redirection is removed **operator and operand** (`> out.txt`, `2> err.log`, `2>&1`), so a file name never stands
where a positional argument is read; an *input* redirection is the exception, because `< q.sql` and `<<<"…"` are SQL
the command will execute and are read as such.

Blocked operations: `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, `REVOKE`,
`MERGE INTO`, `VACUUM`, `REINDEX`, `COPY … TO/FROM` (rule `source_write`), and `ATTACH`, `INSTALL`, `LOAD` (rule
`engine_extension`, statement-initial only, so a column aliased `load` is not a write). SQL string literals and
comments are stripped before matching, so `select 'delete from users' as note` is a read.

**Budgets are not the hook's job.** A `LIMIT`-only read passes here; admission by cost estimate, scan caps, timeouts
and memory limits belong to the adapter (`docs/contracts/adapters.md`, `src/adapters/duckdb.ts`), and the hook's
allow message says so rather than implying it checked.

## Target matching, and failing closed

`target` is `configured`, `other` or `unknown`.

- Postgres: an explicit `-h`/`-d`/`--dbname`/URI that differs from the configured host or database is `other`. A
  command that relies on the environment (`psql -c …` with no target) is `configured`: the default connection is the
  configured one.
- DuckDB: the positional database file is resolved (through symlinks) and compared with `connection.duckdb.path`;
  inside a configured directory counts. No file argument means an in-memory database, which is `other`.
- A target the hook cannot resolve to a literal — `$DB`, `${WAREHOUSE}`, `~user`, or the output of a substitution —
  is `unknown`, never `other`. It is not equal to the configured value and never could be, so calling it a different
  database would fail *open*; a write to it is blocked as a source the hook cannot rule out.
- A write to an `other` target is allowed and the verdict says the hook polices the configured source only and that
  database permissions remain the boundary everywhere else.
- SQL **any part of which** is built by a command substitution (`psql -c "$(…)"`, `psql -c "select 1; $(…)"`,
  `psql -c "dr$(echo op) table t"`) is **blocked** as `uninspected_sql`: unreadable SQL is refused, never waved
  through, and literal text beside a substitution does not make the substitution readable. The substitution's own
  command is inspected separately.
- Shell **parameter expansion** is a different case and a weaker one: `Q="drop table users"; psql -c "$Q"` carries
  the literal `$Q`, which the hook does not resolve. It is not blocked; it is reported `uninspected` with a note, so
  nothing reads as checked that was not. Resolving it is not in scope — see *Not covered*.

## Not covered

The hook is not a shell sandbox. Source permissions, read-only roles and runtime isolation remain the boundary.
It does not cover:

- HTTP query APIs (`curl`/`wget` to a warehouse endpoint), `bq`, `snowsql`, `mysql`, `ssh` and other clients: allowed,
  and reported as `uninspected` on stdout even without `--explain`.
- Database client libraries inside a script **file** (`python pull.py`, `node script.js`, `bash load.sh`): the file
  is not read. An *inline* payload is a different thing and is inspected: `bash -c "psql -c 'drop …'"` blocks, and
  so does `python3 -c "cur.execute('drop table users')"`.
- Shells nested deeper than 3 levels (`bash -c "bash -c \"bash -c …\""`): reported `uninspected`.
- What runs inside a container it allowed for provisioning.
- Interactive `psql`/`duckdb` sessions, which carry no SQL on the command line. SQL piped in from a command the hook
  does not read (`cat q.sql | psql`) is reported `uninspected` and names the upstream command — it is not called an
  interactive session.
- Shell **parameter expansion**: `$VAR` and `${VAR}` are not resolved. SQL containing one is allowed and reported
  `uninspected` with a note; a write keyword the hook *can* see beside it still blocks.
- A `-f` SQL file that is missing, unreadable or larger than 1 MB: allowed, reported as uninspected.
- Shell constructs beyond its best-effort parser: aliases, functions, `eval`, base64-encoded payloads, process
  substitution, and quoting the parser mis-reads.
- Privacy, PII masking, export policy and publication approval, which are the validator's and renderer's job.
- Any harness other than Claude Code. Equivalent safety elsewhere is not claimed until those query and export paths
  are tested.
- **The recorded data path** (ADR 0010, `docs/contracts/record.md`), except where the harness happens to run its
  SQL through a shell command this hook inspects. That is the default route: the Operator's tool owns the
  connection, and a query issued through an MCP server or an in-process client never reaches a `Bash` tool call,
  so no verdict was ever produced for it. This is the same non-coverage as the entries above, and it is stated on
  the Finding rather than left to be inferred: `aftergrid check` emits a `recorded_path` note naming which
  executions and Checks were harness-recorded and by what tool, and the rendered page carries one line saying the
  Operator's tool ran them and aftergrid did not. Checks-before-SQL on that route are agent-reported, so neither
  this guard nor the Engine establishes that a write was refused — only that nothing here claims otherwise.

## `aftergrid hook install | uninstall | status [--settings <path>]`

Edits the project `.claude/settings.json` (default `<cwd>/.claude/settings.json`) as a JSON merge:

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node <engine>/hooks/claude-code/aftergrid-guard.mjs" } ] } ] } }
```

- **install** is idempotent: a second install adds no second entry. An entry pointing at a different Engine checkout
  is repointed, not duplicated. Other `PreToolUse` hooks, other events and unrelated settings are preserved.
- **uninstall** removes only entries whose command contains `hooks/claude-code/aftergrid-guard.mjs`, prunes the
  groups that become empty, and leaves everything else exactly as it was.
- **status** reports whether the exact command is installed (`state: installed | not_installed`) and then *runs* the
  guard: a known-bad command must exit 2 and a known-good read must exit 0. Installed and working are separate
  facts; a failed self-test is a `hook_self_test_failed` error. `readiness` is `unknown` with the reason that
  publication readiness is a fact about a Finding, not about the hook.
- **The matcher is load-bearing.** Claude Code runs a `PreToolUse` group only when its matcher matches the tool, so
  a guard entry under `matcher: "Write"` is *not* installed: `status` reports `not_installed` and warns that the
  entry is never run for a Bash call, and `install` adds the `matcher: "Bash"` group it needs. `""` and `"*"` match
  every tool and count; a matcher that is a regular expression counts when it matches `Bash`.
- **Settings the commands cannot walk are reported, never crashed through.** Before any action, every shape is
  checked: `hooks` must be an object (a JSON array is refused — a named property set on an array is dropped by
  `JSON.stringify`, which once produced a reported success that wrote nothing), `hooks.PreToolUse` must be an array,
  each group an object, each group's `hooks` an array, each entry an object. Anything else — and settings that
  cannot be parsed as JSON at all — is one `invalid_artifact` error naming the exact path, with **nothing written**,
  for `install`, `uninstall` and `status` alike.

## Provisional sign-off

The only bridge ADR 0006 (amended) allows, and a narrow one: an exploratory read of a **non-sensitive unverified
source**. Hard database permissions, privacy boundaries and execution limits have no bridge and this file never
grants them. The hook does not grant provisional access either, and a sign-off never unblocks a *write*: the
`source_write` remedy says plainly that recording one does not lift the block.

`<instance>/provisional/<id>.yaml`:

```yaml
id: prov_unverified_billing
source: postgres://warehouse.example/analytics#billing_raw
reason: billing_raw is not in the verified table set; exploring whether it explains the September gap
reason_code: unverified_table
approver:
  name: Dana Okafor          # editable text: never authorization on its own
  evidence:
    type: github_pr_review   # github_pr_review | github_issue_comment | signed_note
    url: https://github.com/loop-example/analytics/pull/12#pullrequestreview-345
date: 2026-09-10
expiry: 2026-09-20
```

`evaluateProvisional(instanceRoot, id, source, at)` (`src/hook/provisional.ts`) returns
`allowed` or `blocked` with a reason code per failure: `missing`, `invalid_artifact`, `incomplete` (source, reason,
date or expiry absent), `wrong_source`, `invalid_date`, `not_yet_valid`, `expired`, `id_mismatch` (the file declares
an `id` other than its own filename, so the log could not be joined back to it), `unverified_evidence` (an approver
name with no reference). Expiry is inclusive to the end of its day. `record_id` in the decision and in the log is
the id that was **evaluated** — the filename — never the one the file claims for itself, and each log line carries
`record_path` beside it.

**What this function is, today.** It is a library function with **no caller in shipping code**: no command, adapter
or hook invokes it, nothing sets `results[].provisional` when a read happens under a sign-off, and the guard below
never consults a record — its `source_write` remedy says so in as many words. So "a missing, expired, wrong-source
or unverified sign-off blocks a provisional read" is true of this function's return value and of the validator that
refuses a result already marked `provisional`; it is **not** an enforced path from a read to a verdict. Wiring an
entry point (`aftergrid hook provisional …` or an adapter gate) is outstanding work, tracked separately, and until
it lands nothing here should be read as enforcement.

An allowed record carries caveats rather than a clean bill: the reference is **recorded, not verified** — this tool
does not call the provider's API — and the results read under it carry `results[].provisional`, which the shared
validator already refuses for a Reader (`scripts/lib/validate-finding.mjs`: Claims, charts, tables, prose tokens and
derived operands all fail `provisional_evidence`, and `aftergrid render` refuses the Finding). Every evaluation,
allowed or blocked, appends one line to `<instance>/provisional/log.jsonl`; a log that cannot be written never turns
a blocked read into an allowed one.

Not enforced here: whether the source really is non-sensitive, whether the referenced review exists or approved this
record, whether the approver is on the Instance's trusted allowlist, and whether the reason is truthful.
