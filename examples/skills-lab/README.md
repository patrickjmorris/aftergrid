# Try the skills on an analysis you can inspect

Four small exercises using three synthetic analytical situations. No credentials, database, aftergrid CLI or
Engine Instance is required. Every CSV is deliberately small enough to read in full. These are teaching cases,
not customer evidence, a causal study or an accuracy benchmark.

Install a skill, open a case, and give your agent the case plus its CSV. Ask it to retain the calculations it
actually runs. For example:

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

```text
Use diagnose-change to complete examples/skills-lab/cases/conversion.md.
Keep the input unchanged. Save your analysis and executable calculations
in a new local directory called my-conversion-analysis.
```

In Codex you can name `$diagnose-change`; a slash-command host may expose a skill-menu command. Installation
and invocation are host-specific. The plain-language request above works whenever the host can load the skill.

## Choose a case

| Case | Input | Skill | The analytical task |
| --- | --- | --- | --- |
| [Conversion decline](cases/conversion.md) | [conversion.csv](data/conversion.csv) | `diagnose-change` | Explain a change without assuming which product experience caused it |
| [Recurring revenue](cases/revenue.md) | [recurring-revenue.csv](data/recurring-revenue.csv) | `diagnose-change` | Reconcile the headline with what happened to existing accounts |
| [Review a claim](cases/review.md) | [onboarding.csv](data/onboarding.csv) | `analysis-review` | Separate correct arithmetic from an unsupported causal recommendation |
| [Reuse a lesson](cases/learning.md) | First analysis + [conversion-followup.csv](data/conversion-followup.csv) | `learn-from-analysis`, `plan-analysis`, `checked-analysis` | Retrieve a lesson and test whether it explains a new period |

Start with the case prompt and inputs if you want to work through it yourself. The check below and the website
walkthroughs reveal the arithmetic.

## Recompute the teaching results

From the repository root, with Node installed:

```bash
node examples/skills-lab/verify.mjs
```

The script reads the committed CSVs, checks grain/count invariants, verifies the rate decomposition and MRR
bridge, and prints the results. It uses only Node's standard library. No network call is made.

Conversion drops from 8.8% to 6.2% even though each channel improves. On the follow-up, conversion rises from
6.2% to 8.0%, with both mix and within-channel improvement contributing. The script uses baseline rates to
allocate mix effects and current weights to allocate within-channel effects; another exact ordering can assign
the interaction differently. A correct analysis states its convention and reconciles to the same total.

MRR grows from $430 to $440: $90 new + $20 expansion − $20 contraction − $80 churn. Existing-account net
revenue retention is 350/430, or 81.4%. A five-account teaching extract does not establish a company's normal
churn rate or the return on a proposed retention program.

Onboarding completers retain at 60%, compared with 40% among non-completers. That is +20 percentage points and
+50% relative to the non-completer rate. The cohort is observational and self-selected; the intervention effect
is not identified by these counts.

## What the evidence establishes

`verify.mjs` proves arithmetic about these committed inputs. It does not execute an AI skill or evaluate a
business decision. A separate isolated Codex agent completed all four cases without the answer key, using
five skills. Its original answers, lesson, plan, executable calculations and command log are retained in
[outputs/](outputs/README.md). The [trial record](runs/README.md) describes the setup, coordinator reruns,
decomposition conventions and limitations. This is one agent's observed work, not a comparative benchmark.

To rerun the recorded calculations and compare them with the saved output, install Python 3 and run:

```bash
node examples/skills-lab/verify-recording.mjs
```

For larger, real agent runs on public-source data, use the [NYC example](../nyc-open-data/README.md). Its checked
Findings remain unapproved; passing checks or appearing in an example does not confer human approval.
