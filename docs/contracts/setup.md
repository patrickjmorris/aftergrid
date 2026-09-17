# `aftergrid setup`

Onboards a team to a working, resumable private Instance (spec stories 1–4). Implementation:
`src/commands/setup.ts` and `src/setup/`. Tests: `src/setup.test.ts`. Layout it writes:
`docs/contracts/instance-layout.md`. Skill wrapper: `skills/setup-aftergrid/SKILL.md`.

Inputs are explicit. v0 has no interactive prompt: setup asks nothing and guesses nothing, so the same command
line produces the same Instance in a terminal, in CI and inside an agent session.

```bash
aftergrid setup --instance analytics \
  --owner-name "Dana Okafor" --owner-contact dana@example.com \
  --repository loop-example/analytics --automation-login loop-aftergrid-bot --trusted-approver dana-okafor
```

That is the whole command on the default route. **`--adapter` is optional**: with none of it, the Instance is
written for the **recorded path** (ADR 0010), where the Operator's harness runs the SQL and `aftergrid record`
writes down what it ran. `--adapter duckdb --duckdb-path data/warehouse.duckdb` (or `--adapter postgres
--pg-url-env AFTERGRID_PG_URL`) is the **upgrade** the same Instance takes later.

| Flag | Meaning |
| --- | --- |
| `--instance <dir>` | Instance root. Default `analytics/` under the current directory. |
| `--adapter none\|duckdb\|postgres` | Which backend the Instance reads. **Default `none`**, and omitting the flag means the same thing: no adapter, the recorded path. `none` is not a refusal and not an incomplete setup. |
| `--duckdb-path <file-or-csv-dir>` | DuckDB only, required. A `.duckdb` file or a directory of `<table>.csv`, **inside** the Instance root: the path is resolved through `safePath`, exactly as the guardrail hook resolves it later. |
| `--pg-url-env <ENV_VAR_NAME>` | Postgres only, required. The **name** of an environment variable. The URL is read from the environment at runtime and only the variable name is written to `aftergrid.yaml`. |
| `--owner-name`, `--owner-contact` | The Operator a Reader's flag reaches. |
| `--repository owner/repo` | Where Finding pull requests are opened. |
| `--automation-login <login>` | The identity that opens them. Never a trusted approver. |
| `--trusted-approver <login>` | Repeatable. The humans whose APPROVED review counts. |
| `--settings <path>` | The Claude Code `settings.json` the guard is installed into. Default `<repo>/.claude/settings.json`. |
| `--skip-hook` | Do not install or test the guardrail hook. Setup then reports the hook as skipped and stays incomplete. |
| `--dry-run` | Report what would happen. Writes nothing at all — no scaffold, no setup state, no hook entry, no smoke. |
| `--json` | Print the `Report` (`src/report.ts`) instead of the human rendering. |

`setup(opts)` additionally takes `github` / `preflightClient` (an injectable `PreflightClient`), `skillsSearchPaths`,
`env`, `cwd` and `now`. These are test seams, not flags.

## No adapter is the default route, not a gap

An Instance that configures no adapter is complete. ADR 0010 makes the recorded path the default and the
adapter the exception, and setup writes exactly that:

```yaml
connection:
  # …why this Instance is on the recorded path, and how to upgrade…
  adapter: none
```

**Why an explicit `adapter: none` rather than an absent `connection:` block.** Both are handled safely by every
reader — `openInstanceAdapter` (`src/analysis/source.ts`) treats anything that is not `duckdb` or `postgres` as
no adapter, and `sourceLimits` (`src/intake/preflight.ts`) reads a missing field as an empty string — so the
choice is about what the file *says*. `adapter: none` says the Operator chose the recorded path; an absent block
says nothing, and reads like a file somebody deleted a section out of. The scaffolded block carries the reason
and the upgrade command in comments beside it.

What every consumer does with it:

| Command | On an adapterless Instance |
| --- | --- |
| `aftergrid record` | Works. This is the route: the harness ran the SQL, `record` pins the query, the parameters, the result and the tool. `snapshot.guarantees` is `[artifact_replay]`. |
| `aftergrid check` (`--mode artifact`) | Works, unchanged. Every hash is verified. |
| `aftergrid check --mode rerun` | `rerun_unavailable`, for the reason it always gives: the executions were recorded rather than run by aftergrid, or there are no retained inputs. Nothing about this is new; a recorded Finding is refused the same way in an Instance that *has* an adapter. |
| `aftergrid capture` | Refused with `recorded_path` at `aftergrid.yaml#/connection/adapter`. There is no source to copy from. The remedy names `aftergrid record …` and, second, the upgrade — **set `connection.adapter` in `<instance>/aftergrid.yaml`**, with `setup --adapter …` offered as the way to *print* the block. It does not name a rerun of setup as the fix, because setup would not change the file. |
| `aftergrid execute` | Refused with `recorded_path` when the Finding has no retained inputs — which is every Finding on this route, because `capture` is what creates them. A Finding that already holds retained extracts still executes against them: `execute` reads the extracts and never the Instance connection, so refusing it over a config field that is not consulted would be a refusal with no reason behind it. |
| `aftergrid render`, `decide`, `review`, `revise` | Unaffected. None of them opens a source. |
| `aftergrid intake` (unattended) | Still refused, with its existing `source_limits_missing`, and the message now says why in the Instance's own terms: there is no adapter to enforce a statement timeout or a row cap on a query nobody is watching. Run the Analysis attended, or configure an adapter. |
| The guardrail hook | Unaffected. `policyFrom` records `connection.adapter` and gates on none of it; with no adapter it simply has no configured source path to recognise, and every refusal it makes is the one it made before. |
| Publication readiness | Unaffected. It is a fact about a Finding, verified per Finding, and no route to it runs through a connection. |

### Upgrading an Instance that already has an `aftergrid.yaml`

Setup never overwrites a file, and `aftergrid.yaml` is not an exception. So on an Instance that already has one,
`aftergrid setup --adapter duckdb --duckdb-path …` **does not change which adapter the Instance uses**. What it
does is real but narrower: it opens and probes the source that was named, reports the capability matrix it read,
reports the existing file as `kept (differs from what setup would write)`, and **prints the `connection:` block
it would have written** so the Operator can paste it in. The connection step says exactly that:

```
step connection: completed — duckdb source opened and its capability matrix read from the adapter itself;
aftergrid.yaml was kept, paste the block below into it — until you do, this Instance still reads whatever its
own connection: block says
```

A bare `step connection: completed` on a run that changed nothing would be the one thing setup must never do:
report an upgrade that did not happen. Every remedy elsewhere in the Engine that points at the adapter therefore
names **`connection.adapter` in `<instance>/aftergrid.yaml`** as the fix, and `setup --adapter …` only as the
way to print the block.

### Passing a source with no adapter

`--duckdb-path` or `--pg-url-env` with no `--adapter` is refused as `incomplete` at `--adapter`, before anything
is written. The alternative — dropping the flag and writing an adapterless Instance — would report a clean setup
for a run that ignored the warehouse the Operator just named.

## The six steps

Each is reported as its own fact, on a line beginning `step <name>:`. A step never borrows another's evidence.

### 1. scaffold

Creates the layout in `docs/contracts/instance-layout.md`: `aftergrid.yaml`, `readers.md`, `definitions/`
(a README and `example_definition.md`, which is `proposed` and carries no approval), `findings/`, `decisions/`
with an empty generated `decisions.md`, `golden/` and `provisional/` with READMEs, and a `.gitignore` covering
the setup state file.

**Nothing is ever overwritten.** Each path is reported as `created`, `kept`, or
`kept (differs from what setup would write; your copy was not touched)`. The third case is also a warning, so a
rerun with different options — a new owner, a second trusted approver — tells you the policy file on disk no
longer matches your flags and leaves your file alone. Editing `aftergrid.yaml` by hand is the way to change it.

`readers.md` documents the built-in `generic` profile and carries one example profile **indented inside a fenced
block**, because `readerProfileIds` reads every line starting `## ` as a real profile: an unindented example
would advertise a Reader who does not exist.

### 2. dependencies

| Dependency | Hard? | What is checked |
| --- | --- | --- |
| Node 22.18+ or 24+ | yes | `process.versions.node`. The 23 line reports `unknown` with its reason: it is not a line aftergrid is tested on. |
| `mattpocock-skills` | yes | A directory named `grilling` **and** one named `writing-for-agents`, each holding a `SKILL.md`, under the Claude Code skill/plugin directories (or `AFTERGRID_SKILLS_PATH`). Missing → the exact install line. |
| DuckDB prebuilt binding | only with an adapter | `@duckdb/node-api` imports and exposes `DuckDBInstance`. Hard for `--adapter duckdb` and `--adapter postgres` (a Postgres rerun opens retained extracts through DuckDB). With no adapter it is a **warning**, worded as what it is: *not needed to produce a Finding on the recorded path; needed to configure the duckdb adapter, and to run `execute` or `check --mode rerun` on any Finding that already holds retained inputs* — those open the extracts through this binding, whatever `connection:` says. It is never reported as a missing requirement of the route the Instance is on. |
| `initdb` / `pg_ctl` | no | Postgres only. Absent → `rerun unavailable, artifact replay available`; a rerun never falls back to the live source. |

A missing hard dependency is an **error with a remedy** and does not stop the remaining steps: you see every
problem in one run, fix them, and rerun. A bounded directory walk that ran out of budget reports `unknown`
("not found here"), never `missing`.

### 3. connection and capabilities

Validated through the real adapters, never through a config field.

**No adapter.** The step is `skipped`, and nothing is claimed about a source that was never opened:
`sql_execution` stays `not_performed` and no capability matrix is printed. What is reported instead is what the
route gives (`artifact_replay`, verified hashes, the `aftergrid record` invocation that produces it) and what it
does not (`capture` refuses; `execute` refuses on a Finding with no retained inputs, and still runs on one that
has them; `check --mode rerun` answers `rerun_unavailable` for a recorded Finding; Revisit needs a Finding that
can be rerun; unattended intake stays refused with `source_limits_missing`), plus the line that upgrades it —
set `connection.adapter` in `<instance>/aftergrid.yaml`, with `setup --adapter …` naming itself as the way to
print the block, never as something that edits the file. A skipped connection step does **not** make the setup
`incomplete`.

**DuckDB.** The source is opened by `DuckDbAdapter` (a `.duckdb` file `READ_ONLY`, or a CSV directory
materialised into a sealed in-memory database) and its catalogue is read, so the report is evidence that a
statement ran. The capability matrix is printed from `capabilities()`. `privilege_probe: unsupported` gets its
own sentence: DuckDB has no roles, so there is no role to probe, and the safety is the read-only local-file
policy the engine enforces on every statement. **An unsupported probe is never reported as a missing safety
policy, and never as a passed probe.** It is not an error and not a warning.

**A source larger than the admission cap is a setup outcome, not a setup failure.** Either backend block takes an
optional `estimate_cap` (default 5,000,000): the largest planned scan any read may make. It bounds `capture` as
well as `execute`, because a whole-table copy is a scan of the whole table, so an Instance pointed at a source
with tens of millions of rows per table will connect, report its capability matrix and pass setup, and then have
`capture` refuse that table with `admission` before reading a byte. That is the designed behaviour, and the
answer is the windowed-Instance pattern in `docs/contracts/adapters.md`: the Operator's own build script writes a
bounded table (a daily or per-zone aggregate, a windowed extract) plus a provenance table into the Instance's own
DuckDB file, and aftergrid captures those — the analytical window still living in the analysis SQL. Run
`aftergrid capture <finding-dir> --catalog` after setup to see each table's scan rows, bytes and admissibility
before any Finding tries to copy one.

**Postgres.** `PostgresAdapter.probePrivileges()` runs against the configured role.

- A role with `can_write` or `can_ddl` is **refused** (`write_capable_role`) with the `CREATE ROLE` / `GRANT
  SELECT` remedy. There is no flag that accepts one: a session setting is not a boundary, the role's grants are.
- An unset environment variable is `missing_credential`, naming the variable only.
- A probe that could not run is a warning saying that whether the role can write is **unknown** — it is not
  recorded as read-only.

The connection string never reaches a file, a report or a log: messages pass through a redactor that strips the
variable's value and any URL-shaped substring.

### 4. hook

Unless `--skip-hook`: `hook({action:"install"})` then `hook({action:"status"})` (`docs/contracts/hook.md`).
**"hook active" is reported only when status found the exact command installed *and* its self-test passed** — a
known-bad command exited 2 and a known-good read exited 0, just now. Installed and working are separate facts.
A failure says exactly which of the two failed. `--skip-hook` is reported as skipped, with a warning that
unattended intake must not run until the guard is installed and self-tests clean.

### 5. publication preflight

Local rules first, with no network call: the repository is `owner/repo`, the automation login and every trusted
approver are GitHub logins, and **the automation login is not among the trusted approvers**. That last one is
`solo_setup_invalid`, and the message carries the reason: GitHub does not let the author of a pull request
approve it, so one account cannot both open the Finding pull request and approve it. There is no bypass flag, no
environment variable and no override.

With a client or a token (`GITHUB_TOKEN` / `GH_TOKEN`), two GET reads — `GET /repos/:owner/:repo` and
`GET /users/:login` — confirm the repository exists and that every configured login resolves to a **distinct**
account id. Two logins behind one account is `solo_setup_invalid` for the same reason.

Without a client, preflight is `unknown` and says so, pointing at the solo pilot runbook in
`docs/contracts/publication.md`. An API that could not be read is also `unknown` with the error class named:
never a rejection, never a pass.

`src/publication/github.ts` reads pull requests and reviews and has no user or repository read; it is not
changed by this command. The two reads preflight needs live behind `PreflightClient` in `src/setup/preflight.ts`,
with a fetch implementation beside it and a fake in the tests. **No test reaches api.github.com.**

### 6. smoke

`new finding setup-smoke` → `check` → `render`, run against a **temporary copy** of the scaffold. All three
outcomes are reported. The copy is deleted; the real Instance is left holding only the scaffold, with no
`setup-smoke` Finding to clean up. The smoke runs offline (`github: null`), so a scaffold check never depends on
the network.

## Resumability

`<instance>/.aftergrid-setup.json` records which steps completed, with a timestamp. It is listed in the
generated `.gitignore`: it is local state, not a shared artifact, and it holds nothing that cannot be rebuilt by
rerunning.

A rerun reports which steps a previous run completed, then **re-runs every verifying step and reports what it
finds now**. Only the smoke — the one step that builds and renders a throwaway Finding — is skipped when it
already passed, and that is reported as `resumed`, naming the date, with how to force it (delete the state
file). The file is a record of history and never a substitute for checking: nothing is reported as installed,
verified or ready because this file says it once was.

A state file that cannot be parsed is a warning and is treated as no state at all. Every step is idempotent and
nothing is overwritten, so redoing all of them is safe.

## Secret handling

- The Postgres connection string is named by environment variable. `aftergrid.yaml` gets `url_env: NAME`;
  the value is read from `process.env` at runtime, by the adapter, and never by anything that writes a file.
- Adapter error messages are redacted before they reach a `Problem`: the variable's value and any URL-shaped
  substring are removed.
- The GitHub token is read from `GITHUB_TOKEN` / `GH_TOKEN` by the client and is never recorded.
- `.aftergrid-setup.json` holds step names, statuses, timestamps and short details — no credential, no
  connection string and no table contents.
- `src/setup.test.ts` greps every generated file for the connection string and its password.

## The report

`Report` (`src/report.ts`) with `command: "setup"`. The axes mean:

- `syntax` — `invalid` when the options cannot be honoured (no source, a literal URL where a variable name
  belongs). Nothing is written in that case.
- `content` — `complete` only when every hard dependency was found, the connection **settled** (validated, or
  skipped because no adapter was asked for), the hook is active, preflight is `ok`, the smoke passed and no
  scaffold file differs. Otherwise `incomplete`, with one
  info line naming exactly what is outstanding. A setup with no GitHub token is therefore `incomplete`, because
  the publication identities are unverified; that is the honest state, not a failure.
- `evidence` — always `not_evaluated`. Evidence validity is a fact about a Finding, and setup has none. The
  smoke's own check result is reported in `info`.
- `sql_execution` — `performed` only when a statement really ran against the configured source.
- `readiness` — `unknown`, or `not_ready` when the policy definitely cannot work. **Never `ready`.** Publication
  readiness is a fact about a Finding, verified per Finding by `aftergrid check`; the reasons list says so.

New categories: `dependency_missing` (a hard dependency was not found) and `write_capable_role` (the connected
Postgres role can change the source). `recorded_path` is not a setup category — setup reports the recorded path
in `info`, and it is `capture` and `execute` that refuse with it. Reused: `solo_setup_invalid`, `policy_untrusted`, `missing_credential`,
`missing_file`, `unsafe_path`, `runtime_unavailable`, `hook_not_installed`, `hook_self_test_failed`, `exists`,
`incomplete`, `invalid_artifact`, `value_type`, `check_failed`.

## What setup does **not** verify

- **That any Finding is approved, or could be.** Preflight says the policy *can* work. Approval is verified per
  Finding, against the GitHub API, by `src/publication/readiness.ts`.
- **That `aftergrid.yaml` is protected.** CODEOWNERS and branch protection are repository configuration. The
  scaffolded file says to guard it; nothing here can check that you did.
- **That the trusted approver will read a Finding**, or is still at the company.
- **That the guard covers a path it says it does not cover.** `docs/contracts/hook.md` lists the uncovered
  paths; setup repeats that the guard is not a shell sandbox and never implies otherwise.
- **That your data is correct**, that the tables mean what you think, or that any definition is right.
- **The real GitHub API path.** It is exercised only through fakes and a fake `fetch`. Treat the live path as
  untested until someone runs it against a real repository.
- **Any harness other than Claude Code.** The hook step installs into Claude Code settings; equivalent safety
  elsewhere is not claimed.

## What the clean-install smoke covers on this route

`scripts/pack-smoke.mjs` drives the **packed** CLI, and its `setup-recorded-path` step runs the default route
end to end: `setup` with no `--adapter`, then `new finding` and `check` in the Instance it wrote, then an
`aftergrid setup --adapter duckdb` rerun over that same Instance to prove the file is kept and the `connection:`
block is printed instead of applied.

**`aftergrid record` is not exercised there**, and that is a gap covered only by unit tests
(`src/record.test.ts`). `record --execution <id>` needs a Finding that *declares* the execution being recorded —
a query, an execution and a result set, bound to each other — and `new finding` declares none. Making the smoke
Finding recordable would mean this script hand-authoring a manifest, which is evidence about the script rather
than about the packed CLI. Until the scaffold declares an execution, the recorded write path through the
installed binary is untested.
