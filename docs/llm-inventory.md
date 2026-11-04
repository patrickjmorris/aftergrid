# LLM inventory

Every place this repository runs a model, or has recorded running one. Checked against the code and GitHub on 2026-11-02.

**The nightly eval does not exercise a real model.** The repository has no `ANTHROPIC_API_KEY` secret, so [`nightly-eval.yml`](../.github/workflows/nightly-eval.yml) takes its fixture branch and never calls `claude -p`. Its green checks mean recorded runs still pass the assertions. They say nothing about how a model behaves today. The first end-to-end golden eval with a live model has not been run.

## Use cases

| Use case | Owner | Model | Trigger | Monthly cost, and its label | Trace location | Eval status |
| --- | --- | --- | --- | --- | --- | --- |
| Nightly golden eval | Patrick Morris | None today. With a key: `claude -p /analyze`, on the Claude Code default model, because nothing pins one | Cron `17 4 * * *`, or manual dispatch | **$0 model spend, observed:** no model has run. See [the ceiling](#if-the-key-is-added) for a run with a key | Actions artifact `nightly-eval-<sha>`, kept 30 days: `run.json`, `summary.md`, one JSON record per case | **Fixtures only.** 2 of 7 cases replay and pass, 5 are not run |
| NYC open-data Findings | Patrick Morris | Opus on the Citi Bike runs. The log records no `--model` for the congestion runs | Manual, six runs in 2026-09 | **$0 recurring. No charge recorded:** a subscription paid for the runs. One-off estimate of about $2 to $29 a run, CLI-reported at API list price | [`run-log.md`](../examples/nyc-open-data/docs/run-log.md) | No scheduled eval. Findings are complete and unapproved |
| Skills-lab trial | Patrick Morris | A Codex agent. Model not recorded | Manual, once on 2026-09-17 | **$0 recurring. One-off cost unknown:** not recorded | [`command-log.md`](../examples/skills-lab/outputs/command-log.md) | No scheduled eval. [`verification.json`](../examples/skills-lab/runs/verification.json) reruns the arithmetic, not the agent |
| YouTube case study | Patrick Morris | `claude-opus-5-5` for analysis. Opus, `gpt-6.1-sol` and `gemini-4-argon` as reviewers | Manual, 2026-10-27 to 2026-10-28 | **$0 recurring. One-off cost unknown:** not recorded | [`run-record.md`](../examples/spotsports-youtube/run-record.md), [`reviews/`](../examples/spotsports-youtube/analysis/reviews/) | No scheduled eval. AI-model reviews only |

Cost labels:

- **Observed:** read from runs.
- **Estimate:** a figure the CLI reported that nobody was charged.
- **Unknown:** not recorded. An unknown cost isn't $0.

## What the nightly actually does

Observed in the [latest scheduled run](https://github.com/patrickjmorris/aftergrid/actions/runs/41388183735), 2026-11-02:

- The job's `ANTHROPIC_API_KEY` is empty, so it uses the fixture analyzer.
- `run.json` records `"model": null` and `totals.cost_usd: null`. The summary says `model in the loop: NOT exercised`.
- The two passes are replays: `onboarding_checklist_retention` and `price_change_cancellations`. The other five cases have no recorded run and are declined.

All 47 runs from 2026-09-17 to 2026-11-02 were scheduled, succeeded and took 25 seconds or less. That rules out a full model run in any of them.

The green check is easy to misread, because declined cases don't fail the job. The job summary carries the honest answer.

## If the key is added

Nothing below has been observed.

- **Ceiling:** $2 per case × 7 cases × 30 nights = **$420 a month**. This is an upper bound from the workflow defaults, not a forecast. Claude Code enforces the $2 through `--max-budget-usd`. The runner meters nothing.
- **The $2 may be too low.** Recorded `/analyze` runs were estimated at about $2 to $29, and the probes in [`eval.md`](contracts/eval.md) cost about $0.56 to write one file. A ceiling that stops a run early would show up as a failed case, not as a finding about the skills.
- **The `model` dispatch input isn't a switch.** It labels the run and never reaches the `claude` command, so the default model can change between nights. `run.json` records only the model a case reports.
- **Traces may stop short of the prompts.** The runner parses the analyzer's JSON envelope and never copies it. Whether any prompt or response survives in the artifact is unproven until a model run happens.

Adding the key waits on linking Claude API credits. This document changes neither.

## What makes no model call

- **The Engine.** `src/`, `bin/` and `hooks/` have no provider SDK or API call. The eval's command analyzer is the one path to a model, through the template in the workflow.
- **CI.** `ci.yml` runs the same eval with `--analyzer fixture`. No other workflow calls a model.
- **Skills.** They run in the agent a user already has, on that user's account. This repository pays for none of it and sees none of it.

## Re-check

```sh
gh secret list
gh run list --workflow nightly-eval.yml --limit 5
gh run download <run-id> --dir <empty-dir>   # then read run.json and summary.md
git grep -nE 'api\.(anthropic|openai)\.com|openrouter' -- src bin hooks
```
