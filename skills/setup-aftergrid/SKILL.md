---
name: setup-aftergrid
description: "Set up an aftergrid Instance in this repository \u2014 scaffold the layout, check the dependencies, validate the warehouse connection when the team has asked for one, install the guardrail hook and report what is still missing. An adapter is optional; the recorded path is the default."
disable-model-invocation: true
---

# Set up aftergrid

Get this repository to a working, resumable aftergrid Instance. The command does the work; your job is to
collect the inputs, run it, read the report and fix what it names.

**Report only what the command reported.** Every claim below comes from a line the command printed. If a step
says `unknown`, say `unknown` — do not round it up to "done," and do not describe the hook as protecting
anything until its self-test has passed in the output you are reading.

## 1. Collect the inputs

There are no prompts: every input is a flag. Ask the user for each one you do not already know, in one round.
Do not guess a GitHub login, an owner contact or a warehouse path.

- **Instance directory.** Default `analytics/`. Take the default unless the user names another.
- **Owner.** Name and contact — the person a Reader's flag reaches.
- **Publication.** The repository (`owner/repo`) where Finding pull requests are opened, the automation login
  that opens them, and one or more trusted approver logins. The automation login must not be a trusted
  approver: GitHub does not let the author of a pull request approve it, and there is no bypass.
- **Hook.** Where the Claude Code settings live, if not `<repo>/.claude/settings.json`.

If the user does not have the publication identities yet, run setup without them. The Instance still works and
still renders drafts; the report will say publication is not configured.

### Do not ask for a backend unless they want one

**An adapter is optional, and not asking for one is the default.** aftergrid's default route is the **recorded
path**: the user's own harness runs the SQL with whatever tool it already has — an MCP server, `psql`, a
warehouse CLI — and `aftergrid record` writes down the query, the parameters, the result and the tool that
produced them. A Finding built that way is complete, checkable and renderable, and its saved results replay
byte for byte. Nothing about setup, `/grill-question`, `/analyze` or a published Finding needs a backend.

Ask **one** question about it, and only this one: *do you want aftergrid to be able to re-run these queries
itself later — for `check --mode rerun` and for Revisit?* A "no," a "not yet" or an "I don't know" is `none`:
run setup with no `--adapter` and say what that means. Never ask for a warehouse path or a connection variable
before that answer is yes.

Only when it is yes:

- **DuckDB**: the path to a `.duckdb` file or a directory of `<table>.csv` files, **inside the Instance root**.
- **Postgres**: the **name** of the environment variable holding the connection string (for example
  `AFTERGRID_PG_URL`) and confirmation that it points at a **read-only** role. Never ask for the URL, never
  paste it into a command line, and never write it into a file. A write-capable role is refused.

An adapter can be added later against the same Instance, so "not yet" costs nothing that a second run of setup
does not give back.

## 2. Run it

The default: no `--adapter`, and no source flags to go with it.

```bash
node src/cli.ts setup \
  --instance analytics \
  --owner-name "<name>" --owner-contact "<contact>" \
  --repository <owner>/<repo> --automation-login <bot-login> --trusted-approver <human-login>
```

`node src/cli.ts` is the Engine checkout. Where aftergrid is installed as a package, the same command is
`aftergrid setup …` — same flags, same report.

Only if the user asked for rerun and Revisit, add **one** of these:

```bash
  --adapter duckdb --duckdb-path data/warehouse.duckdb
  --adapter postgres --pg-url-env AFTERGRID_PG_URL
```

Add `--dry-run` first if the user wants to see what would be written; it writes nothing at all. Add `--json`
when you want to read the report as data rather than prose.

The command is safe to rerun. It never overwrites a file and it remembers which steps completed.

## 3. Read the report

The output has one `step <name>:` line per step, each `completed`, `incomplete` or `skipped`. Read all six
before saying anything — a failed dependency does not stop the rest, so there is usually more than one thing
to fix in a single run.

| Step | What `completed` means |
| --- | --- |
| `scaffold` | Files were created or kept. A file reported as *differs from what setup would write* was **kept**: your edits won, and nothing was lost. |
| `dependencies` | Node, `mattpocock-skills` and the DuckDB binding were all found. |
| `connection` | The source was actually opened and its capability matrix read from the adapter. For DuckDB, "role probing unsupported" is correct and expected — DuckDB has no roles, and the safety is the read-only file policy. It is not a missing safety policy. **With no adapter this step is `skipped`, and a skipped connection is not an incomplete setup** — nothing was opened because nothing needed to be. Relay the route and its cost from the lines the report prints; do not describe it as something still to fix. |
| `hook` | The guard is installed **and** its self-test just blocked a write and allowed a read. If only the first is true, the report says so; do not call it active. |
| `publication_preflight` | The policy is self-consistent and, with a token, every login resolved to a distinct real account. This says nothing about any Finding being approved. |
| `smoke` | A throwaway Finding went `new` → `check` → draft `render` in a temporary copy. Your Instance holds only the scaffold. |

## 4. Fix and rerun

Every error carries a remedy. Apply them and rerun the same command.

- **`dependency_missing` for mattpocock-skills** — run the install line in the remedy
  (`claude plugins install mattpocock-skills`, or `npx skills@latest add mattpocock/skills`). `/grill-question`
  depends on `grilling` and `writing-for-agents`.
- **A `runtime_unavailable` warning about the DuckDB binding, on an Instance with no adapter** — nothing to fix
  *to produce a Finding on the recorded path*: no source is opened there. Say the rest too, because it is what
  the warning says: the binding is needed to configure the duckdb adapter, and to run `execute` or
  `check --mode rerun` on any Finding that already holds retained inputs — those open the extracts through it,
  whatever `connection:` says. It is not a broken setup, and it is not "unused here."
- **`missing_credential`** — export the named environment variable and rerun.
- **`write_capable_role`** — create a read-only role with the `GRANT` statements in the remedy and point the
  connection string at it. Do not look for a flag to accept the write-capable role; there is not one.
- **`solo_setup_invalid`** — the automation login and a trusted approver are the same account. A second GitHub
  account (or a GitHub App installation) opens the pull requests; the human approves them.
- **`hook_self_test_failed`** — the guard is not enforcing. Say so plainly and do not run unattended intake.
- **Publication `unknown`** — no GitHub token, so nothing was verified. Export a read-only token
  (`GITHUB_TOKEN`) and rerun, or leave it: the runbook in `docs/contracts/publication.md` is the whole round
  trip.

## 5. Tell the user where they are

Summarize the six steps as they were reported, name what is outstanding and give the next command:
`/grill-question` to sharpen a raw ask into a Question, then `aftergrid new finding <slug>`.

Say which data path this Instance is on, in the report's own words:

- **No adapter.** Queries are run by their own tool and written down with
  `aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <file>`. The Finding guarantees
  `artifact_replay`: the saved results replay byte for byte and every hash is checked. `aftergrid capture` and
  `aftergrid execute` refuse here and say so, `aftergrid check --mode rerun` answers `rerun_unavailable`,
  Revisit is unavailable, and unattended intake stays refused (`source_limits_missing`). That is the stated
  cost of the default route, not a failure, and rerunning setup with `--adapter …` buys it back later.
- **An adapter.** The extra it bought — `capture`, `execute`, `check --mode rerun` and Revisit — plus whatever
  the connection step reported about the source itself. If the source holds tables larger than the admission cap,
  say so now: `capture` will refuse them with `admission` before reading a byte, and the answer is the
  windowed-Instance pattern — the Operator's own script builds a bounded table plus a provenance table (into the
  Instance's DuckDB file on a DuckDB Instance, or as a table in the schema this Instance reads on a Postgres one)
  and aftergrid captures those (`docs/contracts/adapters.md`, "Large sources"). Run
  `aftergrid capture <finding-dir> --catalog` to see each table's scan rows, its bytes where the source states
  them, and whether it is admissible.

Two more things to say, and to keep saying:

- The guardrail hook is **not a shell sandbox**. It blocks writes and DDL through supported query paths. Source
  permissions and runtime isolation remain the boundary; `docs/contracts/hook.md` lists what is not covered.
- Setup verified none of these: that the data is correct, that `aftergrid.yaml` is protected by CODEOWNERS and
  branch protection (do that next — it is repository configuration nothing here can check), or that any Finding
  has been approved.

Full contract, including everything setup cannot verify: `docs/contracts/setup.md`.
