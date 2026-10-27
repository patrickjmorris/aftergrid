---
title: From a metric drop to a call in four rows
description: Install two skills, paste a prompt, and see whether your agent stops at the rollback, the mix, or the decision.
kicker: Start here
---

Conversion fell from 8.8% to 6.2%. Someone will say roll back signup. Direct went 10% → 11%. Paid went 4% → 5%. Paid grew from 2,000 to 8,000 of the 10,000 sessions.

Catching that mix shift is half the job. The other half is what the product lead needs next: how many signups the drop cost, whether that matters against the plan, and what to check first.

No clone. The CSV is already on GitHub.

## Install two skills

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change make-the-call
```

Installing copies instructions; it does not grant data access. Use `/diagnose-change` in Claude Code or Cursor, `$diagnose-change` in Codex. Refresh the agent's skills if they are not visible yet.

## Paste this

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

| Period | Channel | Sessions | Signups | Rate |
| --- | --- | ---: | ---: | ---: |
| Baseline | Direct | 8,000 | 800 | 10% |
| Baseline | Paid | 2,000 | 80 | 4% |
| Current | Direct | 2,000 | 220 | 11% |
| Current | Paid | 8,000 | 400 | 5% |

Four rows. No experiment, no change log. Work within that.

## It worked if

The diagnosis recomputes 8.8% and 6.2% from counts, splits mix from within-channel change, and does **not** treat the aggregate as evidence the signup experience broke. Mix is about −3.6pp; within-channel about +1.0pp.

The call goes further. Signups fell 260 (880 to 620) on flat traffic. It splits that net into its parts: the shift toward paid cost 360 signups, and better rates in both channels won back 100. Against the assumed 900 plan the period is 280 short, well past the 100 threshold, so the drop is material. The rate gains are real, but they do not change this week's priority. The recommendation is not to roll back signup on this evidence: first rule out a tracking change that relabeled direct sessions as paid, then find where direct traffic went. It should weigh at least two options, name the observation that would reverse the call, and say that four rows give no history, so materiality against normal variation is unjudged.

Compare with the [worked write-up](../examples/conversion-mix.md). Then try [growth that hid churn](../examples/revenue-bridge.md) and [a 50% lift that is not a mandate](../examples/causal-claim.md).

## Then use it on your work

Point the same skills at your file. Name the decision owner. State the measurement rules you already know. If the question is still mush, start with [grill-question](../skills/grill-question.md). The full collection:

```bash
npx skills add patrickjmorris/aftergrid
```

Unsure which skill? `/ask-aftergrid` names one and stops. The [workflow guide](./skill-workflows.md) maps each step of the work to a skill.

Clone only if you want the rest of the lab on disk:

```bash
git clone https://github.com/patrickjmorris/aftergrid.git
cd aftergrid
node examples/skills-lab/verify.mjs
```

The optional Engine is a command-line tool that saves each analysis as a versioned report with its queries, checks, and review record. Not needed for the four-row case. [setup-aftergrid](../skills/setup-aftergrid.md) when you want it.
