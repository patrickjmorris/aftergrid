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
| `command` | Shells out to a headless `/analyze` and reads its last JSON line. Tokens `{finding_dir}`, `{raw_ask}`, `{instance}`, `{golden}`, `{reader}` are substituted per argument; there is no shell. | **no** |

`exercised: false` travels into the run record and the report. No model runs in this repository's test suite,
so what a real analyzer prints, how long it takes and what it leaves behind on a crash are untested here.

**The first end-to-end golden eval with a live model has not been run.**

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

`model` is null when no model ran. Every cost field is null until something reports one: an unknown cost is
`null`, never `0`. `skill_versions` reads `version` from each promoted skill's frontmatter and records
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
`ANTHROPIC_API_KEY` secret is present. Without it the job runs the fixture analyzer and writes in the job
summary that the model-in-the-loop run was **NOT exercised** and that a green run here says nothing about what
a model would produce. There is no configuration in which the workflow claims a model ran when none did. The
run directory is uploaded as an artifact; `summary.md` is posted to the job summary.

### What is written

`<out>/<sha>/` holds the per-case `<case>.json` records and `summary.json` exactly as `aftergrid eval` writes
them, plus:

- **`run.json`** — `git_sha`, `aftergrid_version`, `plugin_version`, `model` (null when no model ran),
  `skill_versions`, `analyzer` (`kind`, `exercised`, and the `command_template` with anything credential-shaped
  replaced by `<redacted>`; an environment *reference* such as `$ANTHROPIC_API_KEY` is kept, because it is how
  the run was configured), `instance`, `started`/`finished`/`elapsed_ms`, `budget_ms`, `case_timeout_ms`,
  `partial`, `not_run`, `totals`, `cases` and `failures`.
- **`summary.md`** — one line per case: `pass`, `analytical failure` with the failing assertion ids and a
  pointer to the assertion table above, `infrastructure error` with a stable cause word and whether a retry
  could clear it, or `not run`. Each line links its retained record by relative path.
- **`comparison.json`** — written by `eval compare`, and appended as a section to `summary.md`.

A `--model` given alongside the **fixture** analyzer names nothing that ran — a replayed Finding is not a model
run — so `run.json` records `model: null` and the report says why.

`summary.md`, `run.json` and every issue body are built from identifiers, statuses, causes and paths only. They
never carry an assertion's `observed` text or a record's `reason`, because those can quote numbers read out of a
Finding's results. That detail stays in the retained `<case>.json`, which is what the summary links to.

### Bounds and partial runs

`--budget-ms` (default 30 minutes) bounds the whole run and `--case-timeout-ms` (default 10 minutes) bounds each
case. A case that has not started when the budget is spent is recorded `not_run` with `stopped_by: "budget"` and
is never attempted. A case that outruns its timeout is recorded `error` / `infrastructure` with
`stopped_by: "timeout"`: nothing is claimed about that Analysis.

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
opening a second. A failure that repeats for a week is one issue with seven comments. The token comes from
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
| `unchanged` | the same verdict on both sides |
| `regressed` | passed in the baseline, fails now. Reported as `eval_case_failed` |
| `fixed` | failed in the baseline, passes now |
| `new` | no baseline record for this case |
| `infrastructure` | either side errored or failed an infrastructure assertion, so no analytical change is claimed |

Cases the baseline has and the run does not are listed under `missing_from_run`: a hole, not a verdict.

### Exit codes

| Code | Means |
| --- | --- |
| 0 | every case that ran passed, and no bound stopped the run |
| 1 | at least one case failed or errored (analytical or infrastructure), or `compare` found a regression |
| 2 | usage error or a refusal — including a `--sha` that is not a usable directory name |
| 4 | the run was **partial** (a budget or a per-case timeout stopped it) and nothing else failed |

A failure outranks partiality: a nightly that found a regression exits 1, and `partial` is in `run.json` and
`summary.md` either way. Cases the analyzer declined are not failures and do not change the exit code.

### What a nightly still does not do

The command analyzer is still `exercised: false`: no test in this repository runs it and no model runs in this
suite, so what a real headless `/analyze` prints, how long it takes and what it leaves behind on a crash remain
untested here. **The first end-to-end golden eval with a live model has not been run**, and neither the
workflow nor the run record will say otherwise.

## What an eval never does

- Approve anything. Readiness is reported `unknown` with the reason, and publication stays what
  `aftergrid check` says against a human APPROVED review.
- Validate a Finding's evidence. References, hashes and Checks are `aftergrid check`'s job; `evidence` in the
  eval report is `not_evaluated` and says so.
- Edit a Finding, or write into the Instance it was pointed at.
- Turn a declined case into a pass, or a crashed analyzer into a wrong answer.
