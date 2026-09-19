# aftergrid

**Analytics skills for the agent you already use.**

Conversion fell from 8.8% to 6.2%. Both channels improved. An agent that only pulls the total will recommend rolling back signup. `diagnose-change` will not.

Fifteen open-source skills for Claude Code, Codex, Cursor, and any agent that reads `SKILL.md`. Fourteen work on a CSV, notebook, or SQL client. No warehouse, GitHub review, or CLI required.

[Try the four-row case](docs/guides/quickstart.md) · [Browse the skills](skills/README.md) · [Website](https://patrickjmorris.github.io/aftergrid/) · [Work with me](#work-with-me)

## Install and run it

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

Then paste this. No clone; the CSV is on GitHub:

```text
/diagnose-change Conversion fell from 8.8% to 6.2%. Should we roll
back signup?

Use https://raw.githubusercontent.com/patrickjmorris/aftergrid/main/examples/skills-lab/data/conversion.csv

Reproduce the movement. Separate mix from within-channel change.
Show the calculations. Do not recommend a rollback from the aggregate
alone.
```

In Codex, write `$diagnose-change`. The whole collection:

```bash
npx skills add patrickjmorris/aftergrid
```

The installer asks which skills and agents to use. It copies Markdown; it does not grant data access. Unsure which skill? Start with `ask-aftergrid`.

## Pick the skill for the work

| Job | Skill | What you leave with |
| --- | --- | --- |
| Unsure which skill fits | [ask-aftergrid](skills/ask-aftergrid/SKILL.md) | One next skill, why not the sibling, and a prompt to paste |
| Turn an ask into a question | [grill-question](skills/grill-question/SKILL.md) | Decision, population, comparison, and a way the answer could be wrong |
| Understand unfamiliar data | [explore-data](skills/explore-data/SKILL.md) | Grain, keys, coverage, join risks, and a usable data map |
| Resolve what a metric means | [define-metric](skills/define-metric/SKILL.md) | A proposed definition with denominator, exclusions, and checks |
| Choose the investigation first | [plan-analysis](skills/plan-analysis/SKILL.md) | Competing explanations, discriminating tests, and stopping conditions |
| Explain a movement | [diagnose-change](skills/diagnose-change/SKILL.md) | A reconciled decomposition and the uncertainty that remains |
| Do the work under checks | [checked-analysis](skills/checked-analysis/SKILL.md) | Executed calculations, evidence, and an honest analysis log |
| Run the full workflow | [analyze](skills/analyze/SKILL.md) | An evidence-linked answer, review, and a clear next step |
| Challenge a result | [analysis-review](skills/analysis-review/SKILL.md) | Substantiated objections across method, question, and reader |
| Write the answer | [write-finding](skills/write-finding/SKILL.md) | A decision-oriented memo whose claims point to their evidence |
| Make the chart explain the claim | [iterate-visual](skills/iterate-visual/SKILL.md) | An inspected visual with sound comparisons and readable labels |
| Give the narrative a structure | [shape-narrative](skills/shape-narrative/SKILL.md) | An answer-first explanation with limitations where they matter |
| Revise without losing what changed | [revise-finding](skills/revise-finding/SKILL.md) | A scoped revision and the checks or reviews it reopens |
| Make a correction useful next time | [learn-from-analysis](skills/learn-from-analysis/SKILL.md) | A scoped, evidence-backed lesson for subsequent work |
| Add the optional checked-artifact path | [setup-aftergrid](skills/setup-aftergrid/SKILL.md) | An Engine Instance with explicit capability and approval status |

Use the smallest workflow that answers the task. Reviewing a chart does not require a full analysis. A completed investigation can still conclude the evidence is insufficient.

## Try it on data you can inspect

The [skills lab](examples/skills-lab/README.md) has the conversion case plus three more, with exact inputs and a dependency-free check:

```bash
node examples/skills-lab/verify.mjs
```

- **Conversion fell while both channels improved.** 8.8% → 6.2%. The next question is acquisition mix, not a broken signup. [Worked example](docs/examples/conversion-mix.md).
- **Conversion recovered. Same mechanism?** Mix plus a paid-rate change, not the prior decline in reverse. [Lesson reuse](docs/examples/lesson-reuse.md).
- **MRR grew while the starting customers shrank.** $430 → $440 hides $80 of churn. [Revenue bridge](docs/examples/revenue-bridge.md).
- **A precise retention number, an imprecise claim.** 60% versus 40% is real. Self-selection means it cannot say what mandatory onboarding would cause. [Worked review](docs/examples/causal-claim.md).

Teaching cases, not customer outcomes or a benchmark. An isolated Codex agent completed all four without the answer key; the saved calculations reproduce. [Outputs and run record](examples/skills-lab/runs/README.md).

For a larger example, [NYC open data](examples/nyc-open-data/README.md) has two Claude Code runs on public taxi, weather, and bike data. One Finding is inconclusive; the other answers its descriptive question. Both are merged and agent-reviewed; **neither has human publication approval**. The [run log](examples/nyc-open-data/docs/run-log.md) keeps the false starts.

## Lessons that get retrieved

Before writing SQL, establish the unit. Before explaining a change, reproduce it and test the strongest alternative. Before publishing a claim, try to break it. After a non-obvious error, keep the evidence and the conditions where the lesson applies.

`learn-from-analysis` captures a proposed lesson; `plan-analysis` and `analyze` look for matching lessons before proceeding. A lesson can change the next check without becoming a universal rule or an approved metric.

- [Ask before you query](docs/fieldnotes/ask-before-query.md)
- [The metric moved. Now what?](docs/fieldnotes/the-metric-moved.md)
- [Analysis that compounds](docs/fieldnotes/analysis-that-compounds.md)

## When you want stronger guarantees

The optional **Engine** adds a TypeScript CLI, typed evidence, runnable Checks, retained inputs, versioned Findings, and human publication controls. A team's definitions live in its private **Instance**. Skills take the Engine path when you ask for it or supply a Finding directory.

Portable work does not claim these guarantees. Agent review and human approval are different facts, and the Engine keeps them separate.

The source is public. The CLI is pre-release, not on npm, and `package.json` remains `private: true`.

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

CI runs on Ubuntu and macOS, Node 22.18 and 24. Installer checks, model runs, deterministic arithmetic, and human reader feedback are different kinds of evidence; none stands in for another. Development is tracked in [beads](docs/agents/issue-tracker.md). Agents working on this repository read [AGENTS.md](AGENTS.md).

## Work with me

I'm [Patrick Morris](https://github.com/patrickjmorris). I built aftergrid because the agent answers reaching product and growth decisions were confident, fast, and often wrong in ways an experienced analyst would catch in a minute.

- **Consulting.** Pilot engagements for teams putting analytics judgment into the agents they already use: metric definitions a second analyst would apply the same way, a review step before numbers reach a decision, and lessons the next analysis retrieves. Your data stays in your repository.
- **Sponsorship.** Sponsors fund public skills and worked examples and get a named line on the site and in the docs. Nothing commercial appears inside a Finding, and no sponsor touches a metric approval or a capability status.

Email [patrickjohnmorris@gmail.com](mailto:patrickjohnmorris@gmail.com?subject=aftergrid) with the meeting you're trying to get right.

## Influences and license

[Matt Pocock's skills](https://github.com/mattpocock/skills) shaped the skill format, questioning, and domain language. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) is the model for capturing lessons that later work retrieves. [pstack](https://github.com/cursor/plugins/tree/main/pstack) is the bar for adversarial review and observable proof. Aftergrid applies those practices to analytical judgment. These projects do not endorse aftergrid; see the [source comparison](docs/design/skills-reference-benchmark-2026-09-17.md).

MIT. Existing attribution is preserved in [LICENSE](LICENSE).
