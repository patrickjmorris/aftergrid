---
title: Catch the rollback in four rows
description: Install one skill, paste a prompt, see whether the agent still recommends rolling back signup.
kicker: Start here
---

Conversion fell from 8.8% to 6.2%. Someone will say roll back signup. Direct went 10% → 11%. Paid went 4% → 5%. More traffic came from paid. The average is not the product.

No clone. The CSV is already on GitHub.

## Install one skill

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

Installing copies instructions; it does not grant data access. Use `/diagnose-change` in Claude Code or Cursor, `$diagnose-change` in Codex. Refresh the agent's skills if it is not visible yet.

## Paste this

```text
/diagnose-change Conversion fell from 8.8% to 6.2%. Should we roll
back signup?

Use https://raw.githubusercontent.com/patrickjmorris/aftergrid/main/examples/skills-lab/data/conversion.csv

Reproduce the movement. Separate mix from within-channel change.
Show the calculations. Do not recommend a rollback from the aggregate
alone.
```

| Period | Channel | Sessions | Signups | Rate |
| --- | --- | ---: | ---: | ---: |
| Baseline | Direct | 8,000 | 800 | 10% |
| Baseline | Paid | 2,000 | 80 | 4% |
| Current | Direct | 2,000 | 220 | 11% |
| Current | Paid | 8,000 | 400 | 5% |

Four rows. No experiment, no change log. Work within that.

## It worked if

The agent recomputes 8.8% and 6.2% from counts, splits mix from within-channel change, and does **not** treat the aggregate as evidence the signup experience broke. Mix is about −3.6pp; within-channel about +1.0pp. The recommendation is inspect acquisition, not roll back on this table.

Compare with the [worked write-up](../examples/conversion-mix.md). Then try [growth that hid churn](../examples/revenue-bridge.md) and [a 50% lift that is not a mandate](../examples/causal-claim.md).

## Then use it on your work

Point the same skill at your file. Name the decision owner. State the measurement rules you already know. If the question is still mush, start with [grill-question](../skills/grill-question.md). The full collection:

```bash
npx skills add patrickjmorris/aftergrid
```

Unsure which skill? `/ask-aftergrid` names one and stops. The [workflow guide](./skill-workflows.md) maps stuck points to skills.

Clone only if you want the rest of the lab on disk:

```bash
git clone https://github.com/patrickjmorris/aftergrid.git
cd aftergrid
node examples/skills-lab/verify.mjs
```

The optional Engine adds typed Findings, retained evidence, and publication controls. Not needed for the four-row case. [setup-aftergrid](../skills/setup-aftergrid.md) when you want it.
