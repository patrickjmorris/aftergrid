# Golden eval contract

`aftergrid eval` runs Golden Questions end to end and records what happened. It is evaluation material for the
nightly model-in-the-loop run, **never a merge gate** (spec stories 43–44, `docs/contracts/golden-questions.md`).

Implementation: `src/eval/runner.ts` (the run and the assertions), `src/eval/record.ts` (what is written down).
Tests: `src/eval.test.ts`.

```
aftergrid eval --golden <id|all> --analyzer fixture|command
               [--analyzer-command "<template with {finding_dir} {raw_ask}>"]
               [--instance <dir>] [--out <dir>] [--sha <git sha>] [--json]
```

`--sha` names one directory component under `--out`, so it is validated in `runEval` — the one place both
`aftergrid eval` and `aftergrid eval nightly` pass through. A revision name that is not `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`
is refused as `unsafe_path` before any case runs and nothing is written. (`eval` reports it as an error, so it
exits 1; `eval nightly` exits 2 — see the exit-code table below.)

## What one case does

1. Copy the Instance to a throwaway directory, without its `findings/`. The real Instance is never written to,
   so an eval can run against a live one.
2. `aftergrid new finding <golden id>` in the copy, with the Golden Question's `raw_ask` and `reader`. The
   analyzer starts from a draft created the same way an Operator's would be.
3. Hand the Finding directory and the raw ask to the analyzer.
4. Assert the Golden Question's expectations against whatever came back.
5. Write `<out>/<sha>/<case>.json`, and `<out>/<sha>/summary.json` for the run.

With no `--out`, nothing is written and the report says so.

## Analyzers

| `--analyzer` | What it is | Exercised |
| --- | --- | --- |
| `fixture` | Replays a recorded run: a prepared Finding directory at `fixtures/runs/<golden id>/output`, or `fixtures/runs/4ka-<golden id>/output`. Declines when neither exists. | yes — `src/eval.test.ts` |
| `command` | Shells out to a headless `/analyze` and reads its last JSON line. Tokens `{finding_dir}`, `{raw_ask}`, `{instance}`, `{golden}`, `{reader}`, `{repo_root}` and `{max_cost_usd}` are substituted per argument; there is no shell, so a quoted token would keep its quotes. | **no model**; its failure paths are |

`exercised: false` travels into the run record and the report. No model runs in this repository's test suite,
so what a real analyzer prints and how long it takes are untested here.

**The first end-to-end golden eval with a live model has not been run.**

### When the command analyzer has "produced" a Finding

`aftergrid new finding` writes a **draft** manifest.yaml into the Finding directory before the analyzer starts,
so the presence of a manifest proves nothing. A Finding is produced only when

1. the command exited **0**, and
2. the draft manifest is no longer byte-for-byte the one `new finding` wrote.

Anything else is infrastructure: the case is an `error` with **zero assertions** and a stable `failure_cause`.
Scoring a draft against the Golden Question would fail every expectation at once and manufacture a fleet of
analytical regressions out of a broken orchestrator.

| `failure_cause` | Means | A retry may clear it |
| --- | --- | --- |
| `analyzer_exit_<code>` | the command exited non-zero | yes |
| `analyzer_spawn_failed` | the binary could not be started (ENOENT, permissions) | no |
| `analyzer_killed` | the child was killed before it exited (a timeout or a signal) | yes |
| `analyzer_wrote_nothing` | it exited 0 and left the draft exactly as `new finding` wrote it | yes |
| `harness_permission_denied` | the run halted because the harness refused a write inside the Finding directory | no — not until the harness is configured to allow it |

An analyzer that prints `{"status":"declined", ...}` has made a judgement rather than crashed: that case stays
`not_run`.

### A harness that refused the write

`/analyze` halts with `permission_denied` when the harness refuses a write inside the Finding directory, and
prints the halt as the **last line of its final message** — because the halt artifact
(`analysis-progress.yaml`) lives in the directory that just refused a write, so there may be no file to read
(`skills/analyze/references/halting.md`):

```json
{"aftergrid": "halt", "status": "permission_denied", "stage": "checked_analysis", "paths": ["checks/minimum_data.sql"], "reason": "Claude requested permissions to edit <path> which is a sensitive file"}
```

Under `--output-format json` that final message is the envelope's `result` string, so `permissionHalt` reads
the last JSON line **of `result`**; an analyzer that prints the halt object as its own last stdout line is read
too. The halt is read **before** the exit code and before the draft comparison: a run blocked this way is
`failed` with cause `harness_permission_denied` — an `error` case, `infrastructure`, **zero assertions** —
whatever it exited with and whatever it managed to write before the refusal. The Analysis never got to have an
opinion, and scoring one out of a blocked run would file a permission problem as a wrong answer. The stage, the
refused paths and the harness's own denial text go into the case record's `reason` (through the same redaction
as everything else the run writes about an invocation); `summary.md` and any issue body carry the cause word
only, and the failure is marked **not recoverable**: the same flags refuse the same write tomorrow.

A `needs_input` or `needs_attention` halt is **not** this. Those are written into the Finding, the directory
comes back changed, and the case is scored exactly as it is today — assertions and all, with the halt showing
up as the outcome and state the manifest records.

### Cost

`--max-cost-usd` (default 2) is substituted into the template as `{max_cost_usd}`. **The runner meters
nothing.** The bound is enforced by the headless CLI's own `--max-budget-usd`; the runner only hands the number
over and records it in `run.json` under `budget.max_cost_usd`. What it records as *spent* is what the analyzer
reported in its `--output-format json` envelope — `total_cost_usd` into `cost.usd`, `usage.input_tokens` and
`usage.output_tokens` into the token fields — and `null` wherever the envelope said nothing. `run.json`'s
`totals.cost_usd` is the sum over the cases that reported a figure, and `null` when none did. A cost is never
fabricated, and an unknown cost is never `0`.

## The assertions

Each is recorded with an id, a status (`pass`, `fail`, `not_evaluated`) and a category.

| Assertion | Holds when | Category |
| --- | --- | --- |
| `outcome` | `finding.outcome` equals `expected.outcome` | analytical |
| `definitions_cited` | every id in `expected.definition_ids` appears in `definitions[]` | analytical |
| `definition_versions` | every one of those Definitions is cited at the version **and** lifecycle the Instance's `definitions/` library currently carries | analytical |
| `tables_read` | every table in `expected.tables_read` appears in some `snapshot.inputs[].source.tables` | analytical |
| `reference_values` | the golden's own `reference.queries` reproduce every `expected.values[]` within tolerance, through the DuckDB adapter on the Instance's warehouse | **infrastructure** |
| `value:<id>` | some cell of the Finding's saved results is within tolerance of the expected value | analytical |
| `must_not:<n>:<phrase>` | **fails** when the phrase appears in `memo.md`; never passes (see below) | analytical |
| `claim_type` | the answer-bearing Claim's type is no stronger than `expected.claim_type` (descriptive < associational < causal) | analytical |
| `constraint:window` | `question.window` start, end and timezone equal `constraints.window` | analytical |
| `constraint:data_to` | `coverage.data_to` equals `constraints.data_to` | analytical |
| `required_checks` | every kind in `constraints.required_checks` appears as some `checks[].kind` | analytical |

`not_evaluated` is a real status and appears where there is nothing to judge: a golden with no
`definition_ids`, a `null` expected value (not-availability is the render contract's job, not a cell search),
a constraint the golden does not declare, or a warehouse the runner could not open.

A Golden Question names definition **ids** and says "any version"
(`schema/golden-question.schema.json`), so there is no version in the golden to compare against. The version an
honest Analysis must cite is the one the Instance approves, and `definition_versions` reads it from
`<instance>/definitions/*.md` frontmatter. A Finding citing a superseded `retained_7d v1`, or citing v2 as
`proposed` when the library records it `approved`, fails that assertion while still passing
`definitions_cited`. When the Instance library declares none of the expected ids there is no current version to
compare against, and the assertion is `not_evaluated` with category `infrastructure`.

`must_not` is a **substring screen with one informative outcome**. A memo that reproduces the forbidden wording
fails. A memo that does not has established nothing, and is recorded `not_evaluated` rather than `pass`: the
shipped goldens' entries are prose descriptions of a forbidden conclusion ("recommend keeping or rolling back
the price"), which no memo reproduces verbatim, so counting their absence as a held assertion would inflate
what the record says the run checked. The judgement belongs to the Question and Method reviewers.
`expected.must_state` is not asserted here for the same reason — a reviewer judges it, in words. The id carries
the entry's ordinal, so two entries sharing a 40-character prefix stay two assertions.

`constraints.population` is prose and is not asserted; like `must_state`, a reviewer judges it. The other three
constraint fields name things a Finding also declares, so each is compared directly.

## Analytical and infrastructure, kept apart

An analysis that reaches the wrong outcome and a runner that could not start are different facts, and an eval
that conflates them reports a broken warehouse as a bad answer.

| Case outcome | Means |
| --- | --- |
| `pass` | every evaluated assertion held |
| `fail` | at least one assertion failed; `failure_category` says `analytical` or `infrastructure`, and infrastructure wins when both are present, because an infrastructure failure makes the analytical verdicts untrustworthy |
| `error` | the machinery failed before a verdict was possible — the analyzer threw, `new finding` refused, the produced directory had no manifest. Nothing is claimed about the Analysis and `assertions` is empty. |
| `not_run` | the analyzer declined, usually because there is no recorded run for this golden. Not a failure and not a pass. |

In the report these arrive as `eval_case_failed` (analytical) and `eval_infrastructure` (everything else).

## The run report's own axes

- `content` is `complete` only when every case reached a verdict. A `not_run` or an `error` leaves a hole in
  the run, and the report names the cases and says the run is incomplete.
- `sql_execution` is `performed` only when a reference query actually executed. Constructing the DuckDB adapter
  runs no SQL, so a run whose cases all declined reports `not_performed` and says the golden values it carried
  were read from the file rather than reproduced.
- `evidence` is always `not_evaluated`, and `readiness` always `unknown`, with the reason.

## The record

```json
{
  "schema_version": "0.1.0",
  "case": "onboarding_checklist_retention",
  "outcome": "pass",
  "failure_category": null,
  "reason": "every assertion held (11 checked, 2 not evaluated)",
  "analyzer": { "name": "fixture", "exercised": true, "source": "fixtures/runs/4ka-…/output" },
  "finding": { "dir": "…", "id": "fnd_7k2m9q4w1xzb", "state": "complete", "outcome": "answered" },
  "assertions": [ { "id": "outcome", "status": "pass", "category": "analytical", "expected": "…", "observed": "…" } ],
  "model": null,
  "skill_versions": { "setup-aftergrid": "unversioned" },
  "plugin_version": "0.0.0",
  "git_sha": "…",
  "aftergrid_version": "0.0.0",
  "started": "…", "finished": "…",
  "cost": { "input_tokens": null, "output_tokens": null, "usd": null }
}
```

`model` is **only ever what a case reported**, and `null` otherwise. `--model` is a label on the invocation,
not evidence: a run whose analyzer never produced a Finding names no model, in the per-case records and in
`run.json` alike. Every cost field is null until something reports one: an unknown cost is `null`, never `0`. `skill_versions` reads `version` from each promoted skill's frontmatter and records
`unversioned` where a skill carries none.

## Nightly

`aftergrid eval nightly` is the scheduled run: the same suite, the same assertions and the same per-case
records, plus a bound, a run record and a summary a human can act on. Implementation: `src/eval/nightly.ts`,
`src/eval/compare.ts`, `src/eval/report.ts`. Tests: `src/nightly.test.ts`.

```
aftergrid eval nightly [--golden <id|all>] [--analyzer fixture|command] [--analyzer-command "<template>"]
                       [--instance <dir>] [--out <dir>] [--sha <git sha>] [--model <model id>]
                       [--budget-ms N] [--case-timeout-ms N] [--report-issues [--repo owner/repo]]
                       [--artifact-base <prefix>] [--json]
aftergrid eval compare <baseline-run-dir> <run-dir> [--dry-run] [--json]
aftergrid eval report <run-dir> [--repo owner/repo] [--artifact-base <prefix>] [--dry-run] [--json]
```

**Not a merge gate.** The schedule is `.github/workflows/nightly-eval.yml`. It is `schedule` +
`workflow_dispatch` only — never `on: pull_request` — and it must not be made a required check. A regression
found here opens an issue; it never blocks a merge.

### The schedule

Nightly at 04:17 UTC. `workflow_dispatch` takes `sha` (the job checks out **that exact revision**, so a release
candidate can be evaluated without waiting for the schedule), `model` (recorded with the run; it is a label, not
a switch), `budget_minutes`, and `report_issues` (opt-in; the issue sink runs only when it is set).

The job runs the **command** analyzer — headless Claude Code invoking `/analyze` — only when the
`ANTHROPIC_API_KEY` secret is present. That branch installs the CLI it is about to shell out to
(`npm i -g @anthropic-ai/claude-code`, unpinned on purpose: pinning would evaluate an old orchestrator against
today's skills), and the template it passes is

```
claude -p /analyze --plugin-dir {repo_root} --add-dir {finding_dir} --permission-mode bypassPermissions \
       --max-budget-usd {max_cost_usd} --output-format json
```

`/analyze` is a skill of **this repository's plugin**, and the Finding lives in a `mkdtemp` copy of the
Instance, so the plugin has to be loaded explicitly; `{repo_root}` is the Engine checkout the runner resolves
from its own module URL. The permission mode is the subject of "What the headless run needs" below. Whether
that invocation produces a Finding is still unverified: no model has run the suite end to end.

### What the headless run needs

The permission flags are not a preference. Run 1 of `/analyze` on the NYC open-data Instance
(`examples/nyc-open-data/docs/run-log.md`) invoked the CLI the way the template above used to read —
`--plugin-dir <repo> --permission-mode acceptEdits` — and **every** write into the Finding directory was refused
as *"Claude requested permissions to edit <path> which is a sensitive file"*: sixteen refusals across eight
paths, including the halt artifact itself. That session's own probe matrix found `acceptEdits` alone fine,
`--add-dir` fine, `--plugin-dir` + `acceptEdits` refused even with `Write(//<instance>/**)` and
`Edit(//<instance>/**)` allow rules, and `--plugin-dir` + `bypassPermissions` fine.

**Probed again on 2026-09-17 with `claude 2.1.274`** (the plugin under test is this repository; each probe is
one headless session asking for a single file to be written, bounded by `--max-budget-usd 2` — this CLI version
has no `--max-turns` flag):

| Flags, all with `--plugin-dir <repo>` | Wrote `<instance>/probe/checks/p.sql` | Wrote `<instance>/findings/<slug>/checks/p.sql` | Reported cost |
| --- | --- | --- | --- |
| `--permission-mode bypassPermissions` | ok | not probed | $1.09 |
| `--permission-mode dontAsk` | **denied** — "Permission to use Write has been denied because Claude Code is running in don't ask mode" | not probed | $0.58 |
| `--allowedTools "Write" "Edit" "Bash(aftergrid:*)"` (no mode flag) | ok | ok | $0.56 + $0.57 |
| `--permission-mode acceptEdits` | not probed | **ok** | $0.56 |
| `--permission-mode acceptEdits`, Instance **outside** the plugin dir (a temp dir) | — | **ok** | $0.56 |
| `--permission-mode acceptEdits`, Instance **inside** the plugin dir (the repo's `examples/`) | — | **denied**, "sensitive file" | $0.57 |

Two facts. `dontAsk` refuses the write outright and is unusable for a nightly. And the cause of run 1 **is**
established by the last two rows: with `--plugin-dir <repo>` loaded, Claude Code treats every path inside that
plugin directory as a sensitive file and refuses to write it under `acceptEdits`, whatever allow rules are passed.
Run 1's Instance was `examples/nyc-open-data/analytics`, inside the repository the flag named. The same flags,
the same session version, a Finding in a temp directory: written without complaint. The demo Instance is the
odd case, because it lives inside the Engine's own checkout; an Operator's Instance and the runner's both sit
outside it.

The workflow therefore uses **`--permission-mode acceptEdits`**, the least-privileged mode that writes where the
runner writes: each case's Instance is a `mkdtemp` copy of `fixtures/instance` outside the repository. Runs of
the in-repo demo Instance use `bypassPermissions` and say so in their run log. Narrowing further to an
`--allowedTools` set is possible (it wrote fine in the probes) but must enumerate every tool `/analyze` needs,

Without the secret the job runs the fixture analyzer. Either way the job summary's claim comes from
`aftergrid eval summary` reading `run.json`, never from the secret being set, so there is no configuration in
which the workflow claims a model ran when none did. The run directory is uploaded as an artifact; `summary.md`
is posted to the job summary.

`budget_minutes` and `max_cost_usd` are free-text dispatch inputs and are validated in the shell before they
reach arithmetic or a flag. The baseline for the comparison is the most recent completed, non-cancelled run of
this workflow **on the default branch**, and the chosen run id is printed into the job summary. Issue filing
runs on the schedule as well as on a dispatch that asked for it: `inputs` is null on a schedule, so gating on
`inputs.report_issues` alone would mean the nightly that actually runs every night never filed what it found.

### What is written

`<out>/<sha>/` holds the per-case `<case>.json` records and `summary.json` exactly as `aftergrid eval` writes
them, plus:

- **`run.json`** — `git_sha`, `aftergrid_version`, `plugin_version`, `model` (null when no model ran),
  `skill_versions`, `analyzer` (`kind`, `exercised`, and the `command_template` with anything credential-shaped
  replaced by `<redacted>`; an environment *reference* such as `$ANTHROPIC_API_KEY` is kept, because it is how
  the run was configured), `instance`, `started`/`finished`/`elapsed_ms`, `budget_ms`, `case_timeout_ms`,
  `partial`, `not_run`, `budget.max_cost_usd`, `totals` (the eval's counts plus `cost_usd`, null when no case
  reported one), `cases` and `failures`. Each case that the analyzer itself broke on also carries
  `failure_cause`.
- **`summary.md`** — one line per case: `pass`, `analytical failure` with the failing assertion ids and a
  pointer to the assertion table above, `infrastructure error` with a stable cause word and whether a retry
  could clear it, or `not run`. Each line links its retained record by relative path.
- **`comparison.json`** — written by `eval compare`, and appended as a section to `summary.md`.

A `--model` given alongside the **fixture** analyzer names nothing that ran — a replayed Finding is not a model
run — so `run.json` records `model: null` and the report says why. The fixture analyzer runs no command either,
so `command_template` is `null` for it whatever `--analyzer-command` said.

A run reports that it "covered every selected case" only when every case reached a verdict. A declined or
errored case is a hole, and the run names the cases instead of claiming coverage over them.

### Redaction

`redactCommand` splits each token on its **first `=`** before judging it, so `--api-key=VALUE` and
`--api-key VALUE` are the same case. A name is credential-shaped by **suffix**
(`/(^|[-_])(api[-_]?key|key|token|secret|password|passwd|credential|pat|auth)s?$/i`), so an unfamiliar
`--anthropic-api-key` is caught without anyone adding it to a list; the environment-assignment form also matches
the word anywhere in the name. A bare token with a provider shape (`ghp_…`, `github_pat_…`, `sk-…`, `xox…`,
underscores and dashes included) is redacted wherever it appears. An environment *reference* (`$ANTHROPIC_API_KEY`)
is kept: it is how the run was configured, not a secret.

The same redaction (`src/eval/redact.ts`) is applied to everything the run writes about how an analyzer was
invoked, not only to `run.json`'s template: the rendered argv recorded as a case's `analyzer.source`, and the last
stderr line the command analyzer appends to a failure `reason` (a CLI rejecting an unknown flag echoes the flag,
credential and all). What an analyzer prints to stdout as its JSON envelope is parsed, never copied.

### Was a model really in the loop?

`aftergrid eval summary <run-dir>` prints that claim as markdown, and it is the only thing that decides it. A
present `ANTHROPIC_API_KEY` is **not** evidence — the secret is set long before an analyzer crashes — so the
claim rests on three facts held together in `run.json`: `analyzer.kind === "command"`, `totals.pass + totals.fail > 0`,
and `model !== null`. Anything less prints `Model in the loop: NOT exercised` with the reason (the fixture
analyzer ran / no case reached a verdict / no case reported a model). The workflow's job summary calls this
command rather than matching strings in a shell.

`summary.md`, `run.json` and every issue body are built from identifiers, statuses, causes and paths only. They
never carry an assertion's `observed` text or a record's `reason`, because those can quote numbers read out of a
Finding's results. That detail stays in the retained `<case>.json`, which is what the summary links to.

### Bounds and partial runs

`--budget-ms` (default 30 minutes) bounds the whole run and `--case-timeout-ms` (default 10 minutes) bounds each
case. A case that has not started when the budget is spent is recorded `not_run` with `stopped_by: "budget"` and
is never attempted. A case that outruns its timeout is recorded `error` / `infrastructure` with
`stopped_by: "timeout"`: nothing is claimed about that Analysis.

The bound reaches the process, not only the record. The command analyzer runs in its own process group and the
case timeout (or `analyzerTimeoutMs`, when set separately) kills the whole group, so a subprocess the analyzer
started (a headless harness spawns several) does not keep spending wall clock or API budget after the case was
recorded as stopped. The timer that enforces the bound holds the event loop open until the case settles: a
stalled analyzer with no handle of its own cannot let the process drain before the verdict is written.

`partial: true` means a **bound** stopped the run, and `not_run` names every case that reached no verdict and
why — `budget` for a case that was not attempted, `declined` for one the analyzer refused (no recorded run).
A partial run is never reported as a complete one, and `content` stays `incomplete` whenever any case reached no
verdict, as it does for `aftergrid eval`.

### Fingerprints and dedup

Every failure carries `fingerprint = sha256(case id + assertion id + category)` — never a timestamp, a message,
a number or a path — so the same failure on two nights, at two revisions, fingerprints identically. A
case-level infrastructure error uses the assertion id `(run)`.

`aftergrid eval report <run-dir>` (or `--report-issues` on the run itself) files them through an `IssueSink`
(`find(fingerprint)`, `create({title, body, labels})`, `comment(issue, body)`). The GitHub implementation reads
the **open** issues carrying the `aftergrid-eval` label and looks for the marker
`<!-- aftergrid-eval:<fingerprint> -->` in their bodies; when it finds one it comments on that issue instead of
opening a second. It **pages**: a single `per_page=100` request stops looking at the hundredth open issue and
would re-file everything past it every night. Paging stops at a short page (the end of the list) or at 20 pages;
if the window is exhausted with no answer the sink **refuses** — an `api_error` saying `search window exhausted`
— and creates nothing, because a missing issue is recoverable and a nightly stream of duplicates is not. A failure that repeats for a week is one issue with seven comments. The token comes from
`GITHUB_TOKEN` / `GH_TOKEN` only; the repository comes from the Instance policy (`publication.repository`) or
`--repo`. A fake sink (`createFakeIssueSink`) is what the tests use: **no test contacts GitHub.**

Only **analytical** failures open an issue. An infrastructure error says the machinery broke, not that the
Analysis is wrong; it is recorded in `run.json` and `summary.md` and reported as `eval_infrastructure`, and
filing it as a regression would send a reader to read the wrong thing.

### Regression detection

`aftergrid eval compare <baseline-run-dir> <run-dir>` reads the retained records of both runs — it re-runs
nothing and re-judges nothing — and classifies each case:

| Classification | Means |
| --- | --- |
| `unchanged` | the same verdict on both sides — or the same absence of one on both sides |
| `regressed` | passed in the baseline, fails now. Reported as `eval_case_failed` |
| `fixed` | failed in the baseline, passes now |
| `new` | no baseline record for this case |
| `no_verdict` | exactly one side reached a verdict (`pass` or `fail`). A case that passed and now declines has not held its pass, and one that never ran and now fails has not regressed from one |
| `infrastructure` | either side errored or failed an infrastructure assertion, so no analytical change is claimed |

`no_verdict` is counted and rendered separately from `unchanged`, in `comparison.json` and in the section
appended to `summary.md`: reporting a hole as stability is how a suite quietly stops testing anything.

Cases the baseline has and the run does not are listed under `missing_from_run`: a hole, not a verdict. A record
file on either side that cannot be read back as a case record is listed under `malformed` (and warned about),
which is a different hole from a missing one and calls for a different fix. A record carrying no `assertions`
array at all is compared as having no failing assertions rather than crashing the comparison.

### Exit codes

| Code | Means |
| --- | --- |
| 0 | every case that ran passed, and no bound stopped the run |
| 1 | at least one case failed or errored (analytical or infrastructure), or `compare` found a regression |
| 2 | usage error or a refusal — including a `--sha` that is not a usable directory name |
| 4 | the run was **partial** (a budget or a per-case timeout stopped it) and nothing else failed |

A failure outranks partiality: a nightly that found a regression exits 1, and `partial` is in `run.json` and
`summary.md` either way. Cases the analyzer declined are not failures and do not change the exit code. **These
codes have not changed.** `.github/workflows/ci.yml` runs the fixture suite on every push and tolerates exit 1
(`|| test $? -eq 1`), because an eval is never a merge gate; 2 (usage or refusal) and 3 still fail the check.

### What a nightly still does not do

The command analyzer is still `exercised: false`: **no model runs in this suite**, so what a real headless
`/analyze` prints, how long it takes and what it costs remain untested here. Its *failure* handling is tested,
with stand-in binaries (`/usr/bin/false`, a path that does not exist, `/usr/bin/true`), and so is the cost
parsing, with a script that prints the envelope shape — neither of which establishes that the real invocation
in the workflow is well-formed. **The first end-to-end golden eval with a live model has not been run**, and neither the
workflow nor the run record will say otherwise.

## What an eval never does

- Approve anything. Readiness is reported `unknown` with the reason, and publication stays what
  `aftergrid check` says against a human APPROVED review.
- Validate a Finding's evidence. References, hashes and Checks are `aftergrid check`'s job; `evidence` in the
  eval report is `not_evaluated` and says so.
- Edit a Finding, or write into the Instance it was pointed at.
- Turn a declined case into a pass, or a crashed analyzer into a wrong answer.
