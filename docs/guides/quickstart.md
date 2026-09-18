---
title: Your first analysis with aftergrid
description: Install one skill, use a small CSV, and inspect the reasoning behind the answer.
kicker: Start here
---

Start with a question and a file your agent can read. Aftergrid's portable skills work with your agent's existing tools: CSVs, SQL, notebooks, or a connected warehouse. You do not need the Aftergrid Engine to use them.

## Install the skills

Install the collection with the skills CLI, then select your agent when prompted:

```bash
npx skills add patrickjmorris/aftergrid
```

Or start with one skill:

```bash
npx skills add patrickjmorris/aftergrid --skill diagnose-change
```

There are fourteen skills. Thirteen support portable analytical work; `setup-aftergrid` configures the optional Engine. Installing a skill gives your agent instructions. It does not grant access to a warehouse or install the Engine CLI.

Examples on this site use `/skill-name`, the convention in slash-command harnesses. In Codex, use `$skill-name`, such as `$diagnose-change`. Use the invocation syntax your host exposes; restart or refresh the agent's skills if a newly installed skill is not yet visible.

## Try a question with four rows

Clone the repository for the bundled teaching data:

```bash
git clone https://github.com/patrickjmorris/aftergrid.git
cd aftergrid
```

Open that directory in your agent, then give it this prompt:

```text
/diagnose-change Our session-to-signup conversion fell between two
comparable weeks. Should we roll back the signup experience?

Read examples/skills-lab/cases/conversion.md for the question and
measurement context. Use examples/skills-lab/data/conversion.csv.
Preserve the input. Save your calculations, the code you actually ran,
and a short recommendation under analysis/conversion/.
```

The case is synthetic. It has one row per period and acquisition channel, with eligible sessions and signups. It deliberately withholds experiment data and a product change log. Your agent should work within that evidence.

## Inspect the result

The overall rate falls from 8.8% to 6.2%, while the rate in each channel rises. The useful question is how the total fell when both parts improved. A good analysis accounts for the shift toward the lower-converting channel and distinguishes that arithmetic explanation from a causal claim about the signup experience.

Read the code and calculations, not only the recommendation. Does the agent name the denominator? Does it recompute the combined rate from counts? Does it reconcile the contributions to the total change? Does it explain what would require more data?

With Node installed, check the fixture arithmetic independently from the repository root:

```bash
node examples/skills-lab/verify.mjs
```

This verifies the bundled cases' arithmetic. It does not grade your agent's entire analysis. Compare its reasoning with the [worked conversion example](../examples/conversion-mix.md), then try the [revenue bridge](../examples/revenue-bridge.md).

## Use it on your work

Replace the case path with your own approved source and name the decision owner. State known measurement rules and ask the agent to surface missing ones. If the question itself is unclear, start with [grill-question](../skills/grill-question.md). If you want the full sequence, use [analyze](../skills/analyze.md). The [workflow guide](./skill-workflows.md) shows smaller entry points.

The optional Engine adds structured Findings, retained evidence, automated checks, and review records. Its CLI is separate and is not published to npm. Follow the repository's [source installation instructions](https://github.com/patrickjmorris/aftergrid#when-you-want-stronger-artifact-guarantees) when you need that path, then use [setup-aftergrid](../skills/setup-aftergrid.md).
