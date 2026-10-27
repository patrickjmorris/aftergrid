# Analytics skills

Fifteen skills for analytical work. Fourteen work without the aftergrid CLI; `setup-aftergrid` configures the optional Engine. Use them with your files, notebook, SQL client, or existing connector.

## Choose the work you need

| Skill | Use it for |
| --- | --- |
| [ask-aftergrid](ask-aftergrid/SKILL.md) | Choose the next skill when you are unsure which procedure fits. |
| [analyze](analyze/SKILL.md) | Take a question through checked analysis, challenge, and an evidence-linked answer, with a log of what ran. |
| [grill-question](grill-question/SKILL.md) | Resolve ambiguity before doing the wrong calculation. |
| [explore-data](explore-data/SKILL.md) | Establish grain, keys, joins, coverage, and answerable questions. |
| [define-metric](define-metric/SKILL.md) | Specify numerator, denominator, eligibility, time rules, and counter-metrics. |
| [plan-analysis](plan-analysis/SKILL.md) | Retrieve applicable lessons and select comparisons that distinguish explanations. |
| [diagnose-change](diagnose-change/SKILL.md) | Reproduce a shift, separate mix from within-group effects, and test rival explanations. |
| [make-the-call](make-the-call/SKILL.md) | Tie a result to the goal, judge whether it matters, weigh the options, and recommend. |
| [analysis-review](analysis-review/SKILL.md) | Challenge method, question alignment, and reader interpretation. |
| [write-finding](write-finding/SKILL.md) | Write an answer with traceable evidence and its decisive caveat. |
| [shape-narrative](shape-narrative/SKILL.md) | Make the analysis understandable without changing its meaning. |
| [iterate-visual](iterate-visual/SKILL.md) | Inspect and improve charts for truthful, readable comparisons. |
| [revise-finding](revise-finding/SKILL.md) | Apply feedback while separating presentation, interpretation, and calculation. |
| [learn-from-analysis](learn-from-analysis/SKILL.md) | Save scoped, evidence-backed proposed lessons for later work. |
| [setup-aftergrid](setup-aftergrid/SKILL.md) | Configure the optional Engine Instance, connections, and publication identities. |

## Install and invoke

```bash
npx skills add patrickjmorris/aftergrid
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

Target one harness with `-a <agent>`. Claude Code can load the repo as a plugin via `.claude-plugin/plugin.json`. Each skill carries `agents/openai.yaml` for Codex discovery. The repository is public; the npm CLI is unpublished.

Installer check, 2026-09-17: the then-fourteen skills copied into isolated Codex, Cursor (`grill-question`), and Claude Code (`diagnose-change`) destinations. `ask-aftergrid` and `make-the-call` were added afterward and are in the plugin index; that check did not cover them. Copied files are not runtime parity. The NYC Claude Code runs are the only exercised Engine workflow.

`ask-aftergrid`, `analyze`, `grill-question`, `revise-finding`, and `setup-aftergrid` are explicit: you start them. The four remaining original craft skills are model-invoked and hidden from the Claude Code slash menu; describe the task. The six newest skills allow both.

| Policy | SKILL.md | openai.yaml |
| --- | --- | --- |
| Explicit only | `disable-model-invocation: true` | `allow_implicit_invocation: false` |
| Original model-invoked craft skill | `user-invocable: false` | `allow_implicit_invocation: true` |
| Normal discovery | `disable-model-invocation: false`, `user-invocable: true` | `allow_implicit_invocation: true` |

## Portable analysis and Engine Findings

By default, skills work with the files and tools you supply. That portable path does not claim Engine verification, publication approval, or a study with human readers. An existing Finding or an explicit request for Engine artifacts routes to `references/engine-workflow.md`. Copying a skill does not install the Engine.

`aftergrid plugin validate` checks metadata and entrypoint references. It does not prove analytical quality or live harness behavior.

## Evidence and development

The [skills lab](../examples/skills-lab/runs/README.md) records one isolated Codex agent using five skills on four synthetic tasks without the answer key. The NYC example records real Claude Code runs on public data. Hand-authored Engine fixtures are not model runs. None substitutes for human Reader feedback. See [behavioral evaluation scenarios](evaluation.md).

Promoted skills live under `skills/` with a docs page in `docs/skills/`. Experimental or retired skills may use `in-progress/` or `deprecated/`; those buckets are excluded from the plugin index. `deprecated/checked-analysis` was folded into `analyze`.
