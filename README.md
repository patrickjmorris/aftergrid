# aftergrid

**Analytics skills for the agent you already use.**

Ask a sharper question. Understand the data. Diagnose a change. Challenge the conclusion. Leave the next analysis better informed.

Aftergrid is a collection of 14 open-source skills for analytical work: the decisions an experienced analyst makes between receiving a question and giving someone an answer they can act on. Use one skill on a CSV, notebook, SQL query or draft, or use `analyze` to carry a question through the whole workflow.

**Start with the skills.** They work with the files and data tools your agent already has. Thirteen have a portable workflow; `setup-aftergrid` configures the optional Engine. You do not need a warehouse connection, a GitHub review or the aftergrid CLI to try the portable skills.

[Start here](docs/guides/quickstart.md) · [Browse the skills](skills/README.md) · [Try the examples](examples/skills-lab/README.md) · [Website](https://patrickjmorris.github.io/aftergrid/)

## Install

```bash
npx skills add patrickjmorris/aftergrid
```

Or start with one job:

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change
npx skills add patrickjmorris/aftergrid --skill analysis-review -a codex
```

The installer asks which skills and agents to use. Skill installation does not install the optional CLI or grant access to your data. Claude Code, Codex and Cursor use the same Markdown sources; command presentation and permission controls belong to the host. See the [installation and verification notes](skills/README.md) for what has actually been exercised.

Then give your agent a concrete task. The bundled-data prompt below needs a repository checkout; skill installation copies the skills, not the examples. Follow the [quickstart cloning step](docs/guides/quickstart.md), then, in Codex:

```text
Use $diagnose-change on examples/skills-lab/data/conversion.csv.
Conversion fell. Should we roll back signup? Reproduce the movement,
test competing explanations, and show the calculations you ran.
```

In a slash-command host, select the installed skill from its skill menu. You can also ask in plain language and name the skill. Use your host's actual command names rather than assuming they are identical everywhere.

## Pick the skill for the work

| Job | Skill | What you leave with |
| --- | --- | --- |
| Turn an ask into an answerable question | [grill-question](skills/grill-question/SKILL.md) | Decision, population, comparison and a way the answer could be wrong |
| Understand unfamiliar data | [explore-data](skills/explore-data/SKILL.md) | Grain, keys, coverage, join risks and a usable data map |
| Resolve what a metric means | [define-metric](skills/define-metric/SKILL.md) | A proposed definition with denominator, exclusions and checks |
| Choose the investigation before running it | [plan-analysis](skills/plan-analysis/SKILL.md) | Competing explanations, discriminating tests and stopping conditions |
| Explain a movement | [diagnose-change](skills/diagnose-change/SKILL.md) | A reconciled decomposition and the uncertainty that remains |
| Do the analytical work under checks | [checked-analysis](skills/checked-analysis/SKILL.md) | Executed calculations, evidence and an honest analysis log |
| Run the full workflow | [analyze](skills/analyze/SKILL.md) | An evidence-linked answer, review and clear next step |
| Challenge a result | [analysis-review](skills/analysis-review/SKILL.md) | Substantiated objections across method, question and reader lenses |
| Write the answer | [write-finding](skills/write-finding/SKILL.md) | A decision-oriented memo whose claims point to their evidence |
| Make the chart explain the claim | [iterate-visual](skills/iterate-visual/SKILL.md) | An inspected visual with sound comparisons and readable labels |
| Give the narrative a clear structure | [shape-narrative](skills/shape-narrative/SKILL.md) | An answer-first explanation with limitations where they matter |
| Revise without losing what changed | [revise-finding](skills/revise-finding/SKILL.md) | A scoped revision and the checks or reviews it reopens |
| Make a correction useful next time | [learn-from-analysis](skills/learn-from-analysis/SKILL.md) | A scoped, evidence-backed lesson for subsequent work |
| Add the optional checked-artifact workflow | [setup-aftergrid](skills/setup-aftergrid/SKILL.md) | An Engine Instance with explicit capability and approval status |

Use the smallest workflow that answers the task. Reviewing a chart does not require a full analysis run. A completed investigation can still conclude that the evidence is insufficient.

## Try it on data you can inspect

The [skills lab](examples/skills-lab/README.md) has three small synthetic cases, their exact inputs and a dependency-free calculation check:

```bash
node examples/skills-lab/verify.mjs
```

- **Conversion fell while both channels improved.** The overall rate falls from 8.8% to 6.2%. The useful next question is about the acquisition mix, not an assumed broken signup experience.
- **MRR grew while existing-account revenue shrank.** The $430 → $440 headline hides $80 of churn. Reconcile new revenue, expansion, contraction and churn before choosing the next action.
- **A precise retention number supports an imprecise claim.** 60% versus 40% is a real observed difference in the supplied data. Self-selection prevents it from identifying what mandatory onboarding would cause.

These are teaching cases, not customer outcomes or an accuracy benchmark. An isolated Codex agent completed the three cases and a lesson-reuse follow-up without the answer key. Its [original outputs and run record](examples/skills-lab/runs/README.md) are retained; all four saved calculations reproduce exactly.

For a larger example, [NYC open data](examples/nyc-open-data/README.md) contains two actual Claude Code analysis runs on public taxi, weather and bike data. One Finding is inconclusive; the other answers its descriptive question. Both are merged and agent-reviewed, **neither has human publication approval**. The [run log](examples/nyc-open-data/docs/run-log.md) preserves the false starts and corrections.

## An analytical practice that accumulates

Before writing SQL, establish the unit being counted. Before explaining a change, reproduce it and test the strongest alternative explanation. Before publishing a claim, try to break it. After resolving a non-obvious error, keep the evidence and the condition under which the lesson applies.

`learn-from-analysis` captures a proposed lesson; `plan-analysis` and `analyze` look for relevant prior lessons before proceeding. A lesson can change the next check without becoming a universal rule or silently approved metric.

Read the fieldnotes:

- [Ask before you query](docs/fieldnotes/ask-before-query.md)
- [The metric moved. What actually changed?](docs/fieldnotes/the-metric-moved.md)
- [Make the next analysis better](docs/fieldnotes/analysis-that-compounds.md)

## When you want stronger artifact guarantees

The optional **Engine** adds a TypeScript CLI, typed evidence references, runnable Checks, retained inputs, versioned Findings and human publication controls. A team's definitions and data live in its private **Instance**. The skills have an explicit Engine path when you ask for it or supply a Finding directory.

Portable work does not claim these guarantees automatically. On the recorded Engine path, the harness executes the queries and `aftergrid record` retains their results; this supports artifact replay, not independent source reruns. An adapter with retained inputs adds analysis reruns. Agent review and human approval remain different facts.

The source is public. The CLI is pre-release, not published to npm, and `package.json` remains `private: true`.

```bash
# From a checkout, with Node 22.18+ or 24+ and pnpm
pnpm install
node src/cli.ts --help
node src/cli.ts plugin validate --json
node src/cli.ts check fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention
```

[Engine setup](docs/skills/setup-aftergrid.md) · [Evidence contract](docs/contracts/finding-manifest.md) · [Distribution](docs/contracts/distribution.md) · [Vocabulary](CONTEXT.md)

## Development and verification

```bash
pnpm test
pnpm run validate:fixtures
pnpm run build:site
pnpm run check:site
pnpm run check:skills-lab # Python 3 is needed to rerun the recorded calculations
pnpm run smoke:pack
```

The CLI's declared platform matrix is Ubuntu/macOS on Node 22.18 and 24. Installer discovery, model behavior, deterministic arithmetic and human Reader feedback are different forms of evidence; none substitutes for the others. Development is tracked in [beads](docs/agents/issue-tracker.md).

## Influences and license

[Matt Pocock's skills](https://github.com/mattpocock/skills) shaped the original skill format, questioning and domain language. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) provides the model of capturing lessons that subsequent work actually retrieves. [Poteto's pstack](https://github.com/cursor/plugins/tree/main/pstack) sharpens the bar for adversarial review and observable proof. Aftergrid applies these practices to analytical judgment. These projects do not endorse aftergrid; see the [source comparison](docs/design/skills-reference-benchmark-2026-09-17.md).

MIT. Existing attribution is preserved in [LICENSE](LICENSE).
