# aftergrid

Open-source skills, checks and a thin CLI for producing Findings: analysis memos a non-data reader can trust, with every number traced to its query. The engine is public; each team's context lives in a private Instance.

## Language

### Work

**Question**:
An ask sharpened into a decision to make, a metric, a population, a window and a falsifier.
_Avoid_: request, ticket, ask

**Analysis**:
One run that answers a Question and produces a Finding.
_Avoid_: report, notebook, investigation

**Finding**:
The document an Analysis produces: claims, tables and charts, with every number traced to the query, Snapshot and Metric definition behind it.
_Avoid_: memo, report, result, insight, readout

**Claim**:
One assertion in a Finding, stated as a sentence and backed by at least one chart or table whose numbers are traced.
_Avoid_: insight, takeaway, point, key finding

**Variant**:
One candidate rendering of the same Claim, produced while iterating on a chart; at most one becomes the chart in the Finding.
_Avoid_: option, alternative, draft, version

**Check**:
A runnable assertion an Analysis must pass before its Finding is trusted — an invariant, a reconciliation, or a provenance rule.
_Avoid_: test, validation, guardrail

**Snapshot**:
The as-of moment an Analysis ran against, plus a fingerprint of each source table it read, so the Analysis can be rerun and drift detected.
_Avoid_: freeze, baseline, extract

### Context

**Metric definition**:
The meaning of a metric in plain language and in canonical SQL: grain, population, denominator, window, owner. Only an approved definition may appear in a Finding; an agent can propose one, only an Operator can approve it.
_Avoid_: metric (bare), KPI, measure

**Golden Question**:
A Question with a known-true answer, used to evaluate that the Engine and an Instance still agree.
_Avoid_: eval case, test question

**Decision log**:
The record of accepted Findings and the decisions they drove.
_Avoid_: memo archive, history

**Engine**:
aftergrid itself: skills, Checks, adapters and the CLI. Holds verbs, never a team's nouns.
_Avoid_: core, framework

**Instance**:
A team's private repository of context (Metric definitions, table docs, Decision log, golden Questions) and Findings, which the Engine operates on.
_Avoid_: config, app, workspace

### People

**Operator**:
The data-savvy person who installs the Engine, maintains the Instance and reviews Findings.
_Avoid_: analyst, admin, maintainer

**Reader**:
The person a Finding is written for; not expected to read queries or SQL. Each Finding names its Reader from the profiles the Instance keeps.
_Avoid_: stakeholder, consumer, end user, audience

## Relationships

- A **Question** has many **Analyses**; each **Analysis** produces one **Finding**
- A chart in a **Finding** is the surviving **Variant** for its **Claim**
- A **Finding** is made of **Claims**; each **Claim** is headed by a sentence and backed by a chart or table
- A **Finding** is trusted only when its **Checks** pass
- An **Analysis** runs against one **Snapshot**
- Every number in a **Finding** traces to a query, a **Snapshot** and a **Metric definition**
- An accepted **Finding** enters the **Decision log**
- A **Golden Question** is a **Question** whose **Finding** is already known
- The **Engine** operates on an **Instance**; the **Operator** owns both, the **Reader** sees only **Findings**
