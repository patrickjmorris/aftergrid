# setup-aftergrid

## What it does

`/setup-aftergrid` gets a repository to a working, resumable aftergrid Instance. The skill does not do the work
itself: it collects the inputs, runs `aftergrid setup`, and then reports what the command reported — six separate
facts, none of them rounded up.

It is **user-invoked** (`disable-model-invocation: true`, `policy.allow_implicit_invocation: false`). Setup writes
files into a repository and installs a Claude Code hook, so a human asks for it; no agent reaches for it mid-task.

## Inputs

Every input is a flag on the command; the skill's first job is to collect them in one round rather than guess.

| Input | Notes |
| --- | --- |
| Instance directory | Defaults to `analytics/`. |
| Backend | **Optional, and asked about only once.** With no `--adapter`, the Instance is written for the recorded path: your harness runs the SQL and `aftergrid record` writes down what it ran. The skill asks one question — do you want aftergrid to be able to re-run these queries itself, for `check --mode rerun` and Revisit? — and only a yes turns into `duckdb` (a `.duckdb` file or a directory of `<table>.csv` files, inside the Instance root) or `postgres`. |
| Postgres connection | Only when the answer was Postgres. The **name** of the environment variable holding the connection string, never the string. A write-capable role is refused, and there is no flag that accepts one. |
| Owner | Name and contact — where a Reader's flag lands. |
| Publication | `owner/repo`, the automation login that opens Finding pull requests, and one or more trusted approver logins. The automation login may not be a trusted approver. |
| Hook settings | Path to the Claude Code settings file, if not `<repo>/.claude/settings.json`. |

Setup runs without the publication identities. The Instance still works and still renders drafts; the report then
says publication is not configured.

## What it verifies

Each of these is a separate step in the report, reported `completed`, `incomplete` or `skipped`:

- **scaffold** — which files were created, which were kept unchanged, and which were kept *and differ* from what
  setup would have written. Nothing is ever overwritten.
- **dependencies** — Node's version, the `mattpocock-skills` skills (`grilling` and `writing-for-agents`), and the
  prebuilt DuckDB binding. A missing one carries the exact install line.
- **connection** — the source was really opened and its capability matrix was read from the adapter. For DuckDB,
  "role probing unsupported" is the correct answer, not a gap. With no adapter the step is **skipped** and the
  report says what the recorded path gives (`artifact_replay`, verified hashes, `aftergrid record`) and what it
  costs (`capture` and `execute` refuse, `check --mode rerun` is `rerun_unavailable`, Revisit and unattended
  intake are unavailable). A skipped connection does not make the setup incomplete. A source whose tables are
  larger than the Instance's admission cap still connects and still passes setup: `capture` refuses those tables
  with `admission` before reading a byte, and the report says so and names the windowed-Instance pattern
  ([`docs/contracts/adapters.md`](../contracts/adapters.md), "Large sources") rather than a narrower capture.
- **hook** — the guard is installed **and** its self-test just blocked a write and allowed a read. Installed
  without a passing self-test is reported as exactly that.
- **publication_preflight** — whether the policy could ever produce a verified approval. Without a GitHub token
  this is `unknown`, and `unknown` is what it says.
- **smoke** — a throwaway Finding ran `new` → `check` → draft `render` in a temporary copy. The Instance itself is
  left holding only the scaffold.

Setup is safe to rerun: it never overwrites a file, never writes a credential, and records completed steps in
`<instance>/.aftergrid-setup.json` so a rerun resumes. `--dry-run` writes nothing at all.

## What it does not verify

- That the data is correct.
- That `aftergrid.yaml` is protected by CODEOWNERS and branch protection — that is repository configuration, and
  nothing in setup can check it.
- That any Finding has been approved, or that a trusted approver will ever read one.
- That the guard covers a query path it says it does not cover. The hook is not a shell sandbox; source
  permissions and runtime isolation remain the boundary (`docs/contracts/hook.md`).

The full contract, including every limit: [`docs/contracts/setup.md`](../contracts/setup.md).

## It's working if

- The skill asks for the inputs it does not have, in one round, and guesses no login, contact or warehouse path.
- It does not ask for a warehouse path or a connection variable at all until you have said you want rerun and
  Revisit. No answer, or "not yet", sets the Instance up on the recorded path.
- On an adapterless Instance, the summary names `aftergrid record` as the route and lists what is unavailable,
  rather than reporting the missing adapter as something still to fix.
- The summary it gives back names each of the six steps with the word the command used for it.
- `unknown` survives into the summary as `unknown`.
- The hook is described as protecting something only when the self-test line is in the output.
- The next command it hands you is `/grill-question` and then `aftergrid new finding <slug>`.
