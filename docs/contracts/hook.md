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
remedy, policy, policy_source, policy_notes, notes, uninspected, not_covered}`. `not_covered` travels with every
verdict, so nothing reads as "checked" that was not.

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
| `psql` / `pgcli` | `-c` / `--command`, heredocs (`<<EOF`, `<<-'EOF'`), upstream `echo`/`printf` in the same pipeline, `-f` file contents when readable (≤1 MB) | write/DDL against the configured target → **block**; otherwise allow |
| `duckdb` | `-c` / `-cmd` / `-s`, the positional SQL after the database file, heredocs and piped SQL, `-f`/`-init` file contents when readable | write/DDL against the configured file → **block**; `ATTACH`/`INSTALL`/`LOAD` anywhere → **block** |
| `node -e` / `deno -e` / `bun -e` | the inline snippet, string literals included | a write keyword plus database context → **block** |
| `node src/cli.ts …`, `aftergrid …` | — | allow (`local_artifact`): the CLI's own SQL runs in the sealed adapter sandbox |
| `mkdir`, `cp`, `mv`, `tee`, `git`, `pnpm`, … | — | allow (`local_artifact`); writing under `<instance>/findings/` is named as such |
| `initdb`, `pg_ctl`, `createdb`, `dropdb`, `docker run`/`podman` | — | allow (`disposable_database`): provisioning a throwaway database is not agent-issued source SQL |

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
- A write to an `other` target is allowed and the verdict says the hook polices the configured source only and that
  database permissions remain the boundary everywhere else.
- SQL built by a command substitution (`psql -c "$(…)"`) is **blocked** as `uninspected_sql`: unreadable SQL is
  refused, never waved through. The substitution's own command is inspected separately.

## Not covered

The hook is not a shell sandbox. Source permissions, read-only roles and runtime isolation remain the boundary.
It does not cover:

- HTTP query APIs (`curl`/`wget` to a warehouse endpoint), `bq`, `snowsql`, `mysql`, `ssh` and other clients: allowed,
  and reported as `uninspected` on stdout even without `--explain`.
- Database client libraries inside a script file (`python pull.py`, `node script.js`, `bash load.sh`): the file is
  not read.
- What runs inside a container it allowed for provisioning.
- Interactive `psql`/`duckdb` sessions, which carry no SQL on the command line.
- A `-f` SQL file that is missing, unreadable or larger than 1 MB: allowed, reported as uninspected.
- Shell constructs beyond its best-effort parser: aliases, functions, `eval`, base64-encoded payloads, process
  substitution, and quoting the parser mis-reads.
- Privacy, PII masking, export policy and publication approval, which are the validator's and renderer's job.
- Any harness other than Claude Code. Equivalent safety elsewhere is not claimed until those query and export paths
  are tested.

## `aftergrid hook install | uninstall | status [--settings <path>]`

Edits the project `.claude/settings.json` (default `<cwd>/.claude/settings.json`) as a JSON merge:

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node <engine>/hooks/claude-code/aftergrid-guard.mjs" } ] } ] } }
```

- **install** is idempotent: a second install adds no second entry. An entry pointing at a different Engine checkout
  is repointed, not duplicated. Other `PreToolUse` hooks, other events and unrelated settings are preserved. Settings
  that cannot be parsed are reported (`invalid_artifact`) and **not written**, so nothing is lost.
- **uninstall** removes only entries whose command contains `hooks/claude-code/aftergrid-guard.mjs`, prunes the
  groups that become empty, and leaves everything else exactly as it was.
- **status** reports whether the exact command is installed (`state: installed | not_installed`) and then *runs* the
  guard: a known-bad command must exit 2 and a known-good read must exit 0. Installed and working are separate
  facts; a failed self-test is a `hook_self_test_failed` error. `readiness` is `unknown` with the reason that
  publication readiness is a fact about a Finding, not about the hook.

## Provisional sign-off

The only bridge ADR 0006 (amended) allows, and a narrow one: an exploratory read of a **non-sensitive unverified
source**. Hard database permissions, privacy boundaries and execution limits have no bridge and this file never
grants them. The hook does not grant provisional access either; it names the record in its remedy.

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
date or expiry absent), `wrong_source`, `invalid_date`, `not_yet_valid`, `expired`, `unverified_evidence` (an
approver name with no reference). Expiry is inclusive to the end of its day.

An allowed record carries caveats rather than a clean bill: the reference is **recorded, not verified** — this tool
does not call the provider's API — and the results read under it carry `results[].provisional`, which the shared
validator already refuses for a Reader (`scripts/lib/validate-finding.mjs`: Claims, charts, tables, prose tokens and
derived operands all fail `provisional_evidence`, and `aftergrid render` refuses the Finding). Every evaluation,
allowed or blocked, appends one line to `<instance>/provisional/log.jsonl`; a log that cannot be written never turns
a blocked read into an allowed one.

Not enforced here: whether the source really is non-sensitive, whether the referenced review exists or approved this
record, whether the approver is on the Instance's trusted allowlist, and whether the reason is truthful.
