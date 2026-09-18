# Analytics skills

Fourteen skills for analytical work: turn an ask into a useful question, inspect data, define a metric, plan comparisons, investigate a change, challenge an answer, and explain what the evidence supports. Use the skills with your own files, notebook, SQL client, or existing connector. Thirteen work without the aftergrid CLI; `setup-aftergrid` is specifically for the optional Engine.

## Choose the work you need

| Skill | Use it for |
| --- | --- |
| [analyze](analyze/SKILL.md) | Take a question through analysis, challenge, and an evidence-linked answer. |
| [grill-question](grill-question/SKILL.md) | Resolve ambiguity before doing the wrong calculation. |
| [explore-data](explore-data/SKILL.md) | Establish grain, keys, joins, coverage, and answerable questions. |
| [define-metric](define-metric/SKILL.md) | Specify numerator, denominator, eligibility, time rules, and counter-metrics. |
| [plan-analysis](plan-analysis/SKILL.md) | Retrieve applicable lessons and select comparisons that can distinguish explanations. |
| [checked-analysis](checked-analysis/SKILL.md) | Execute calculations with explicit checks and a record of what actually ran. |
| [diagnose-change](diagnose-change/SKILL.md) | Reproduce a shift, separate mix from within-group effects, and test rival explanations. |
| [analysis-review](analysis-review/SKILL.md) | Challenge method, question alignment, and reader interpretation; refute weak objections. |
| [write-finding](write-finding/SKILL.md) | Write an answer with traceable evidence and its decisive caveat. |
| [shape-narrative](shape-narrative/SKILL.md) | Make the analysis understandable without changing its meaning. |
| [iterate-visual](iterate-visual/SKILL.md) | Inspect and improve charts for truthful, readable comparisons. |
| [revise-finding](revise-finding/SKILL.md) | Apply feedback while separating presentation, interpretation, and calculation changes. |
| [learn-from-analysis](learn-from-analysis/SKILL.md) | Save scoped, evidence-backed proposed lessons and test applicability on later work. |
| [setup-aftergrid](setup-aftergrid/SKILL.md) | Configure the optional Engine's Instance, connections, and publication identities. |

## Install and invoke

```bash
npx skills add patrickjmorris/aftergrid
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

For a named harness, the installer supports `-a <agent>`. A Claude Code plugin uses `.claude-plugin/plugin.json`; the Engine package includes the same skills. Each skill carries `agents/openai.yaml` for Codex-style discovery. The repository is public; the npm CLI remains unpublished.

Installer check on 2026-09-17: the local checkout was copied into isolated destinations with the skills installer: all fourteen for Codex, `grill-question` alone for Cursor, and `diagnose-change` alone for Claude Code. These checks establish installer discovery and copied files, not runtime behavior or harness parity. The separate NYC Claude Code runs establish the Engine workflow behavior they actually exercised.

New skills allow both explicit use and automatic discovery. Existing invocation policies are preserved: `analyze`, `grill-question`, `revise-finding`, and `setup-aftergrid` are explicit; the five original craft skills are model-invoked. In Claude Code the model-invoked skills are hidden from the slash-command menu; describe the task naturally. A harness that supports explicit skill-file selection may also load their `SKILL.md`. Invocation availability is distinct from authorization to write externally or access a source.

| Policy | SKILL.md | openai.yaml |
| --- | --- | --- |
| Explicit only | `disable-model-invocation: true` | `allow_implicit_invocation: false` |
| Original model-invoked craft skill | `user-invocable: false` | `allow_implicit_invocation: true` |
| Normal discovery | `disable-model-invocation: false`, `user-invocable: true` | `allow_implicit_invocation: true` |

## Portable analysis and Engine Findings

Portable analysis uses the supplied artifacts and tools. It does not claim Engine verification, publication approval, or a human Reader study. An existing Finding or an explicit request for Engine artifacts routes to the skill's `references/engine-workflow.md`. Those preserved procedures require the complete toolkit and retain its evidence binding, checks, revision rules, and approval gates; copying a skill alone does not install the Engine.

Entry points and portable references live inside each skill so an individual installation has what it needs. Full Engine contracts are in the toolkit; they are not silently required to start ordinary work. The catalog and plugin/package skills arrays agree, and `aftergrid plugin validate` checks metadata and entrypoint references. It does not prove analytical quality or live harness behavior.

## Evidence and development

The [skills lab](../examples/skills-lab/runs/README.md) records one isolated Codex agent using five skills on four synthetic tasks without the answer key, with original outputs and reproducible calculations. The NYC example records real Claude Code runs on public-source data. The original hand-authored Engine regression fixtures are not model runs. None substitutes for real human Reader feedback. See [behavioral evaluation scenarios](evaluation.md) for additional planned tests and the distinction between a scenario and an observed result.

Promoted skills live directly under `skills/` with a docs page in `docs/skills/`. Experimental or retired skills may use `in-progress/` or `deprecated/`; those buckets are excluded from the plugin index. Do not create empty buckets merely for symmetry.
