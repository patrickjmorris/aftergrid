---
name: setup-aftergrid
description: Set up an aftergrid Instance in this repository — scaffold the layout, check the dependencies, validate the warehouse connection, install the guardrail hook and report what is still missing.
disable-model-invocation: true
---

# Set up aftergrid

Get this repository to a working, resumable aftergrid Instance. The command does the work; your job is to
collect the inputs, run it, read the report and fix what it names.

**Report only what the command reported.** Every claim below comes from a line the command printed. If a step
says `unknown`, say `unknown` — do not round it up to "done", and do not describe the hook as protecting
anything until its self-test has passed in the output you are reading.

## 1. Collect the inputs

There are no prompts: every input is a flag. Ask the user for each one you do not already know, in one round.
Do not guess a GitHub login, an owner contact or a warehouse path.

- **Instance directory.** Default `analytics/`. Take the default unless the user names another.
- **Backend.** `duckdb` or `postgres`.
  - DuckDB: the path to a `.duckdb` file or a directory of `<table>.csv` files, **inside the Instance root**.
  - Postgres: the **name** of the environment variable holding the connection string (for example
    `AFTERGRID_PG_URL`) and confirmation that it points at a **read-only** role. Never ask for the URL, never
    paste it into a command line, and never write it into a file. A write-capable role is refused.
- **Owner.** Name and contact — the person a Reader's flag reaches.
- **Publication.** The repository (`owner/repo`) where Finding pull requests are opened, the automation login
  that opens them, and one or more trusted approver logins. The automation login must not be a trusted
  approver: GitHub does not let the author of a pull request approve it, and there is no bypass.
- **Hook.** Where the Claude Code settings live, if not `<repo>/.claude/settings.json`.

If the user does not have the publication identities yet, run setup without them. The Instance still works and
still renders drafts; the report will say publication is not configured.

## 2. Run it

```bash
node src/cli.ts setup \
  --instance analytics \
  --adapter duckdb --duckdb-path data/warehouse.duckdb \
  --owner-name "<name>" --owner-contact "<contact>" \
  --repository <owner>/<repo> --automation-login <bot-login> --trusted-approver <human-login>
```

Postgres instead of the DuckDB flags:

```bash
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
| `connection` | The source was actually opened and its capability matrix read from the adapter. For DuckDB, "role probing unsupported" is correct and expected — DuckDB has no roles, and the safety is the read-only file policy. It is not a missing safety policy. |
| `hook` | The guard is installed **and** its self-test just blocked a write and allowed a read. If only the first is true, the report says so; do not call it active. |
| `publication_preflight` | The policy is self-consistent and, with a token, every login resolved to a distinct real account. This says nothing about any Finding being approved. |
| `smoke` | A throwaway Finding went `new` → `check` → draft `render` in a temporary copy. Your Instance holds only the scaffold. |

## 4. Fix and rerun

Every error carries a remedy. Apply them and rerun the same command.

- **`dependency_missing` for mattpocock-skills** — run the install line in the remedy
  (`claude plugins install mattpocock-skills`, or `npx skills@latest add mattpocock/skills`). `/grill-question`
  depends on `grilling` and `writing-for-agents`.
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

Summarise the six steps as they were reported, name what is outstanding and give the next command:
`/grill-question` to sharpen a raw ask into a Question, then `aftergrid new finding <slug>`.

Two things to say, and to keep saying:

- The guardrail hook is **not a shell sandbox**. It blocks writes and DDL through supported query paths. Source
  permissions and runtime isolation remain the boundary; `docs/contracts/hook.md` lists what is not covered.
- Setup verified none of these: that the data is correct, that `aftergrid.yaml` is protected by CODEOWNERS and
  branch protection (do that next — it is repository configuration nothing here can check), or that any Finding
  has been approved.

Full contract, including everything setup cannot verify: `docs/contracts/setup.md`.
