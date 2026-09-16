# `aftergrid intake`

Running an Issue request in the background, with pause and retry states a human can act on (spec stories 8 and
35–37). Implementation: `src/commands/intake.ts` and `src/intake/`. Tests: `src/intake.test.ts`.

The runner analyses nothing. It claims a request at a stable revision, **refuses to dispatch when enforcement is
absent**, hands the request to a harness, `check`s what comes back rather than believing it, and reports one of a
small set of honest states on the Issue and in one pull request per run.

```bash
aftergrid intake --repo loop-example/analytics --once            # process what is labelled now, then exit
aftergrid intake --repo loop-example/analytics --poll-seconds 60 # the local poller
aftergrid intake --repo loop-example/analytics --resume intake_7_9f2c1ab30d41 --provided definition_approval
```

| Flag | Meaning |
| --- | --- |
| `--repo owner/repo` | Where the Issues are. Defaults to `publication.repository` in `aftergrid.yaml`. |
| `--label <name>` | The trigger label. Default `ready-for-agent`. |
| `--instance <dir>` | Instance root. Default: walk up from the working directory for `aftergrid.yaml`. |
| `--once` | Process the Issues labelled right now, then exit. The default. |
| `--poll-seconds N` | Loop instead, sleeping N seconds between passes. Uses the injected clock, so tests never wait. |
| `--harness fixture\|command` | Which harness to dispatch to. `command` shells out to `--harness-command`. |
| `--harness-command "<template>"` | Whitespace-separated template; `{run_id} {instance} {run_dir} {scratch} {findings} {request}` are substituted **per token**, so a path with spaces stays one argument. No shell is involved. |
| `--fixture-source <finding-dir>` | The Finding `--harness fixture` copies. For rehearsals and tests. |
| `--resume <run_id>` | Continue a run that paused for input. |
| `--provided <kind>` | Repeatable. Marks one need supplied. |
| `--timeout-ms N` | Abort signal deadline handed to the harness. |
| `--max-attempts N` | Attempts for a transient API error. Default 3, exponential backoff from 500 ms. |
| `--base <branch>` | Base branch for the pull request. Default `main`. |
| `--settings <path>` | The Claude Code `settings.json` the hook check reads. Default `<cwd>/.claude/settings.json`. |
| `--json` | Print the `Report` (plus a `runs` array) instead of the human rendering. |

## Run identity

```
run_id = intake_<issue>_<sha256(issue number + issue body + updated_at)[:12]>
```

Identity is **derived, not minted**, and two properties follow from that:

- the same Issue at the same revision always produces the same run id, so a duplicate or concurrent trigger finds
  the existing claim instead of starting a second Analysis;
- an Issue edited after dispatch produces a **different** run id. An edit is a new input revision, never a silent
  change to what a running Analysis was asked. The older run is marked `superseded` (with `superseded_by`) and its
  artifacts are kept: a partial Analysis is evidence about what was asked, and deleting it would hide the edit.

Everything a run needs to survive a restart is on disk under the Instance root, every path through `safePath`:

```
<instance>/intake/runs/<run_id>/
  claim.json     created with O_EXCL: the atomic claim
  request.json   the snapshotted request: issue number, title, body, updated_at, labels, snapshot time,
                 plus `provided` kinds and any human comments recorded on resume
  state.json     { run_id, repository, issue, status, attempts, pr, finding_dir, last_error, needs,
                   superseded_by, created, updated }
  log.jsonl      one line per event: { ts, event, ids, status }
  scratch/       the harness's scratch space. Not evidence; intake never reads it back
```

## States

| `state.status` | What is true | What moves it |
| --- | --- | --- |
| `claimed` | The claim file exists. Nothing has been dispatched. | Preflight, then dispatch. |
| `blocked` | Preflight refused: enforcement or policy is absent. **Nothing was dispatched and nothing was written under `findings/`.** | Fix the named problem and rerun. |
| `running` | Handed to the harness. | The harness's answer, or a rerun taking over an interrupted run. |
| `needs_input` | Named things are missing and guessing is not allowed. The Issue is labelled `needs-info`. | `--resume` once every need is provided. |
| `needs_attention` | Something came back that a human must look at: `check` reported invalid evidence, or the produced Finding was out of scope. **No pull request is opened.** | A human reads the Finding. |
| `complete` | A Finding was produced, `check` reported its evidence valid, and one draft pull request exists. The Issue is labelled `ready-for-human`. | A human review. |
| `failed` | A technical failure, with a recoverable reason and the attempt count. | Rerun. |
| `superseded` | The Issue changed; a newer revision owns the request. Artifacts kept. | Nothing: it is history. |

`complete` means "a checked Finding and a draft pull request exist". It never means approved, merged, or correct.

## Preflight: what must be true before anything is dispatched

Checked before every dispatch, including a `--resume` dispatch, and reported fact by fact:

1. **The Instance policy is present** (`findInstance`). No `aftergrid.yaml`, no run.
2. **The guardrail hook is installed *and* self-tests clean**, right now — `hook({action:"status"})`, which pipes a
   known-bad and a known-good command through the guard (`docs/contracts/hook.md`). Installed and working are
   separate facts and both are required.
3. **Scope**: `<instance>/findings` exists and resolves inside the Instance. A Finding produced anywhere else is
   refused when it comes back, as `scope_violation`.
4. **The configured source declares its limits**: `statement_timeout_ms` and `estimate_cap` for postgres,
   `read_only: true` for duckdb. Preflight checks they are *present*; the adapters enforce them at execution time
   (`docs/contracts/adapters.md`) and preflight says so rather than implying it re-verified them.

**There is no bypass.** No `--allow-no-hook`, no environment variable, no "warn and continue". A flag that let an
unattended run proceed without the guard would be exactly the rule-with-no-enforcement ADR 0006 exists to refuse,
and "we warned you" is not enforcement. A preflight failure puts every run in `blocked` with the reason, writes
nothing under `findings/`, and exits non-zero. It still *reads* the labelled Issues, so the report can name which
requests are blocked; it writes nothing to GitHub — no label, no comment, no pull request — and dispatches nothing.

## Label semantics

Per `docs/agents/issue-tracker.md`. The runner adds exactly two labels, each only when the fact behind it is true:

| Label | Set when | Set by |
| --- | --- | --- |
| `ready-for-agent` | — | A human. It is the trigger; the runner never adds it. |
| `needs-info` | A run paused with `needs_input`. | The runner. |
| `ready-for-human` | A draft pull request exists for the run. | The runner. |

The runner **never removes a label** — not even the trigger — and **never adds any other one**. Removing the
trigger would be the runner editing its own queue; the claim file is what stops a second run instead, so an Issue
that keeps its `ready-for-agent` label is reported as `already_claimed` on the next pass, not re-analysed.

This is the one place aftergrid **writes** to the GitHub API: labels, comments and its own pull request. It never
writes to a data source, and it never submits a review. Publication's own client (`src/publication/github.ts`) is
read-only by construction — it judges an approval, so it must not be able to create one.

## The pull request

One per run, keyed by the run id in both the head branch (`aftergrid/<run_id>`) and the title:

```
[aftergrid] <finding title> (run <run_id>)
```

The body carries the Issue link, the run id, the Finding directory and id, the `check` summary **as axis words and
category names only**, and the sentence that publication requires a human APPROVED review per
`docs/contracts/publication.md`. `findByRun` is asked before a create, and again before every retry of a create, so
an interruption after the pull request landed — or a retry of a call that had in fact succeeded — ends in an update
rather than a second pull request.

**What intake does not do: git.** It does not create, commit or push the head branch. The branch must already carry
the Finding directory. Wiring the commit and push (or having the harness do it) is a maintainer to-do; until then
`create` will fail against a real repository with an unprocessable-entity error, which is reported as `failed` with
its error class, never as a pull request that exists.

## What leaves the runner, and what never does

- Log lines, Issue comments and pull request bodies carry **ids, axis words and category names only**. No query
  results and no numbers from results. `src/intake.test.ts` plants a sentinel decimal in a result and greps every
  written file, every comment and every pull request body for it, along with a sentinel token and any
  credentialed URL.
- The credential is read from `GITHUB_TOKEN` / `GH_TOKEN` in the environment, never from a file in the repository
  and never from Issue text. It is never logged: only the error class and the HTTP status reach a message.
- The Finding's own `title` is authored text and does appear in the pull request title, by design. If an author
  puts a number in a title, that number travels; nothing here rewrites a Finding's words.
- `request.json` holds the Issue's title and body verbatim. That is task input, snapshotted so the run is
  reproducible — and it is only ever input. Nothing in an Issue can relax preflight, change the Instance policy,
  add a label the runner does not add on its own, name a credential or reach a URL. The test
  "Issue text asking for the controls to be relaxed changes nothing" asserts the policy file and the hook settings
  are byte-identical afterwards.

## Timeouts

`--timeout-ms` aborts the `AbortSignal` handed to the harness. It is **not a kill**: a harness that ignores its
signal is not stopped, and intake says the run was aborted only when the deadline really fired. A run that timed
out is `failed` with the deadline named, so it can be rerun.

## Retries

A transient API error — HTTP 429, any 5xx, or a network failure — is retried up to `--max-attempts` with
exponential backoff (500 ms, doubling, capped at 30 s) measured on an **injected clock**, so no test ever sleeps.
A 404, a 401 or a malformed body is not retried: repeating it only produces the same answer more expensively.
Every retry is logged with its error class, attempt number and backoff.

## Resume

`--resume <run_id>` continues a run whose status is `needs_input`, using the **snapshotted** request, not the live
Issue: the run continues at the revision it claimed. A need is marked provided by `--provided <kind>`, or by a new
comment on the Issue from someone other than the Instance's `automation_login`, posted after the request snapshot.
The runner cannot tell which need a sentence answers, so a new human comment marks **every** outstanding need
provided — and the report says so in those words. Resume reuses the same run id, so it reuses the same pull request.

## Concurrency, honestly

- Two triggers in one process race for the claim file. The loser reports `already_claimed` and starts no second
  Analysis.
- A run whose state is still `running` was interrupted, and the next pass **takes it over** rather than leaving it
  for nobody. The pull request stays single because it is keyed by run id and looked up before it is created.
- **The claim is not a lease with an expiry.** Two runners in two processes could both take over the same
  interrupted run; the pull request would still be one, but the Analysis would run twice. A lease is future work.

## What intake does **not** enforce or verify

- **That the guard covers a path it says it does not cover.** `docs/contracts/hook.md` lists the uncovered paths.
- **That the declared source limits are honoured.** Preflight checks they are written down; the adapters enforce.
- **That a Finding is right, or that the harness did what it was asked.** Only that `aftergrid check` reports its
  evidence valid — which is a fact about references, hashes and structure, not about truth.
- **Publication.** Readiness is never `ready` here, and `intake` never approves anything.
- **The real GitHub API path.** It is exercised only through the fakes in `src/intake/issues.ts` and
  `src/intake/pull-requests.ts`. **No test contacts GitHub.** Treat the live path as untested.
- **The analysis harness.** `ClaudeCodeHarness` is a stub against the interface the headless orchestrator
  (`ag-review-analyze-golden-4ka`) will implement. No test runs it, because no model runs in CI; it reports
  `exercised: false` and the intake report repeats that where the run is, so a green suite cannot imply coverage.
- **Anything about an Issue tracker other than GitHub Issues.** aftergrid's own development stays in beads
  (`docs/agents/issue-tracker.md`); this is the *product's* intake, for an Operator's Instance.

## The optional GitHub Actions recipe

`.github/workflows/aftergrid-intake.example.yml` is an **example, and optional**: the local poller
(`--poll-seconds`) works without it, and nothing in the Engine depends on it. Copy it into the *Instance*
repository and adapt it. It is deliberately `workflow_dispatch`-only so that it never runs on a schedule by
accident, and it carries the same requirement as every other path: the guardrail hook must be installed and
self-testing clean on the runner, or intake refuses to dispatch.
