# aftergrid

**Analytics judgment for the agent you already use.**

Your agent can already get the number. Text-to-SQL, semantic layers, and BI copilots made the number cheap to request. Deciding what it means is still the hard work. A good analyst ties the metric to the goal it serves, checks that the story holds, sets aside true findings that do not change the decision, and recommends what to do. aftergrid teaches your agent that discipline.

Conversion fell from 8.8% to 6.2%. An agent that reads the total recommends rolling back signup. `diagnose-change` finds that both channels improved and traffic shifted toward paid. `make-the-call` sizes it: the shift cost 360 signups, better rates won back 100, and the net loss of 260 leaves the period 280 short of an assumed 900-signup plan. Don't roll back signup yet. First check whether a tracking change relabeled direct visits as paid, then find where the 6,000 direct sessions went.

Fourteen open-source skills for Claude Code, Codex, Cursor, and any agent that reads `SKILL.md`. Thirteen work on a CSV, a notebook, or the SQL connection your agent already has. Nothing else to set up.

[Try the four-row case](docs/guides/quickstart.md) · [Browse the skills](skills/README.md) · [Website](https://patrickjmorris.github.io/aftergrid/) · [Work with me](#work-with-me)

## Install and run it

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change make-the-call
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

Then ask for the call:

```text
/make-the-call Using that diagnosis, size the mix and rate effects
in signups. For this teaching case, assume the plan was 900 signups
for the period and we act on any shortfall over 100. Say whether the
drop matters, which findings do not, what the options are, and what
would change your recommendation.
```

In Codex, write `$diagnose-change` and `$make-the-call`. The whole collection:

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
| Do the work under checks, start to finish | [analyze](skills/analyze/SKILL.md) | An evidence-linked answer, a log of what ran, a review, and a clear next step |
| Decide what a result means | [make-the-call](skills/make-the-call/SKILL.md) | One recommendation in goal units, what matters and what does not, and the trigger that would change it |
| Challenge a result | [analysis-review](skills/analysis-review/SKILL.md) | Substantiated objections across method, question, reader, and materiality |
| Write the answer, or fix a buried one | [write-finding](skills/write-finding/SKILL.md) | An answer-first memo in the reader's words whose claims point to their evidence |
| Make the chart explain the claim | [iterate-visual](skills/iterate-visual/SKILL.md) | An inspected visual with sound comparisons and readable labels |
| Revise without losing what changed | [revise-finding](skills/revise-finding/SKILL.md) | A scoped revision and the checks or reviews it reopens |
| Make a correction useful next time | [learn-from-analysis](skills/learn-from-analysis/SKILL.md) | A scoped, evidence-backed lesson for subsequent work |
| Add the optional checked-artifact path | [setup-aftergrid](skills/setup-aftergrid/SKILL.md) | An Engine Instance with explicit capability and approval status |

Use the smallest workflow that answers the task. Reviewing a chart does not require a full analysis. A completed investigation can still conclude the evidence is insufficient.

## Try it on data you can inspect

The [skills lab](examples/skills-lab/README.md) has the conversion case plus three more, with exact inputs and a dependency-free check:

```bash
node examples/skills-lab/verify.mjs
```

- **Conversion fell while both channels improved.** 8.8% → 6.2%. A traffic shift cost 360 signups and better rates won back 100. Not a broken signup flow. [Worked example](docs/examples/conversion-mix.md).
- **Conversion recovered. Same mechanism?** Mix plus a paid-rate change, not the prior decline in reverse. [Lesson reuse](docs/examples/lesson-reuse.md).
- **MRR grew while the starting customers shrank.** $430 → $440 hides $80 of churn. [Revenue bridge](docs/examples/revenue-bridge.md).
- **A precise retention number, an imprecise claim.** 60% versus 40% is real. Self-selection means it cannot say what mandatory onboarding would cause. [Worked review](docs/examples/causal-claim.md).

Teaching cases, not customer outcomes or a benchmark. An isolated Codex agent completed all four without the answer key; the saved calculations reproduce. [Outputs and run record](examples/skills-lab/runs/README.md).

For a larger example, [NYC open data](examples/nyc-open-data/README.md) has two Claude Code runs on public taxi, weather, and bike data. One Finding is inconclusive; the other answers its descriptive question. Both are merged and agent-reviewed; **neither has human publication approval**. The [run log](examples/nyc-open-data/docs/run-log.md) keeps the false starts.

## Fieldnotes

- [The number is not the answer](docs/fieldnotes/the-number-is-not-the-answer.md)
- [Ask before you query](docs/fieldnotes/ask-before-query.md)
- [The metric moved. Now what?](docs/fieldnotes/the-metric-moved.md)
- [Analysis that compounds](docs/fieldnotes/analysis-that-compounds.md)

## Lessons that get retrieved

Before writing SQL, establish the unit. Before explaining a change, reproduce it and test the strongest alternative. Before publishing a claim, try to break it. After a non-obvious error, keep the evidence and the conditions where the lesson applies.

`learn-from-analysis` captures a proposed lesson; `plan-analysis` and `analyze` look for matching lessons before proceeding. A lesson can change the next check without becoming a universal rule or an approved metric.

## When you want stronger guarantees

The optional **Engine** is a command-line tool for teams that need an audit trail. It saves each analysis as a versioned report (a **Finding**) with its queries, retained inputs, runnable checks, and review record, and it keeps human publication approval separate from agent review. A team's metric definitions and Findings live in its own repository (an **Instance**). Skills take the Engine path when you ask for it or supply a Finding directory.

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

I'm [Patrick Morris](https://github.com/patrickjmorris). I built aftergrid because agents got good at fetching the number before they got good at the work that follows. Their answers reported a rate without sizing it against the goal, and too often missed a mix shift an experienced analyst would spot in a minute.

- **Consulting.** Pilot engagements for teams putting analytics judgment into the agents they already use: metrics tied to the goals they serve, a review step that asks whether a result matters before it reaches a decision, and lessons the next analysis retrieves. Your data stays in your repository.
- **Sponsorship.** Sponsors fund public skills and worked examples and get a named line on the site and in the docs. Nothing commercial appears inside a Finding, and no sponsor touches a metric approval or a capability status.

Email [patrickjohnmorris@gmail.com](mailto:patrickjohnmorris@gmail.com?subject=aftergrid) with the meeting you're trying to get right.

## Influences and license

[Matt Pocock's skills](https://github.com/mattpocock/skills) shaped the skill format, questioning, and domain language. [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) is the model for capturing lessons that later work retrieves. [pstack](https://github.com/cursor/plugins/tree/main/pstack) is the bar for adversarial review and observable proof. Aftergrid applies those practices to analytical judgment. These projects do not endorse aftergrid; see the [source comparison](docs/design/skills-reference-benchmark-2026-09-17.md).

MIT. Existing attribution is preserved in [LICENSE](LICENSE).
