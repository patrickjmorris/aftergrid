# `aftergrid setup`

Onboards a team to a working, resumable private Instance (spec stories 1–4). Implementation:
`src/commands/setup.ts` and `src/setup/`. Tests: `src/setup.test.ts`. Layout it writes:
`docs/contracts/instance-layout.md`. Skill wrapper: `skills/setup-aftergrid/SKILL.md`.

Inputs are explicit. v0 has no interactive prompt: setup asks nothing and guesses nothing, so the same command
line produces the same Instance in a terminal, in CI and inside an agent session.

```bash
aftergrid setup --instance analytics \
  --adapter duckdb --duckdb-path data/warehouse.duckdb \
  --owner-name "Dana Okafor" --owner-contact dana@example.com \
  --repository loop-example/analytics --automation-login loop-aftergrid-bot --trusted-approver dana-okafor
```

| Flag | Meaning |
| --- | --- |
| `--instance <dir>` | Instance root. Default `analytics/` under the current directory. |
| `--adapter duckdb\|postgres` | Which backend the Instance reads. Default `duckdb`. |
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
| DuckDB prebuilt binding | yes | `@duckdb/node-api` imports and exposes `DuckDBInstance`. |
| `initdb` / `pg_ctl` | no | Postgres only. Absent → `rerun unavailable, artifact replay available`; a rerun never falls back to the live source. |

A missing hard dependency is an **error with a remedy** and does not stop the remaining steps: you see every
problem in one run, fix them, and rerun. A bounded directory walk that ran out of budget reports `unknown`
("not found here"), never `missing`.

### 3. connection and capabilities

Validated through the real adapters, never through a config field.

**DuckDB.** The source is opened by `DuckDbAdapter` (a `.duckdb` file `READ_ONLY`, or a CSV directory
materialised into a sealed in-memory database) and its catalogue is read, so the report is evidence that a
statement ran. The capability matrix is printed from `capabilities()`. `privilege_probe: unsupported` gets its
own sentence: DuckDB has no roles, so there is no role to probe, and the safety is the read-only local-file
policy the engine enforces on every statement. **An unsupported probe is never reported as a missing safety
policy, and never as a passed probe.** It is not an error and not a warning.

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
- `content` — `complete` only when every hard dependency was found, the connection validated, the hook is
  active, preflight is `ok`, the smoke passed and no scaffold file differs. Otherwise `incomplete`, with one
  info line naming exactly what is outstanding. A setup with no GitHub token is therefore `incomplete`, because
  the publication identities are unverified; that is the honest state, not a failure.
- `evidence` — always `not_evaluated`. Evidence validity is a fact about a Finding, and setup has none. The
  smoke's own check result is reported in `info`.
- `sql_execution` — `performed` only when a statement really ran against the configured source.
- `readiness` — `unknown`, or `not_ready` when the policy definitely cannot work. **Never `ready`.** Publication
  readiness is a fact about a Finding, verified per Finding by `aftergrid check`; the reasons list says so.

New categories: `dependency_missing` (a hard dependency was not found) and `write_capable_role` (the connected
Postgres role can change the source). Reused: `solo_setup_invalid`, `policy_untrusted`, `missing_credential`,
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
