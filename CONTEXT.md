# aftergrid

Open-source skills, checks and a thin CLI for producing Findings: analysis memos a non-data reader can understand, inspect and act on, with every number traced to its evidence. The engine is public; each team's context lives in a private Instance.

This glossary governs Engine and Instance docs and skill prose. Reader-facing copy may use plain words (analyst, decision maker, workspace, "a finding").

## Language

### Work

**Question**:
The sharpened form of a raw ask: a decision to make, a metric, a population, a window and a falsifier. Sharpening is the job of `/grill-question`; a raw ask is not rejected for lacking these.
_Avoid_: request, ticket, ask

**Analysis**:
One run that answers a Question and produces a Finding.
_Avoid_: report, notebook, investigation

**Finding**:
The document an Analysis produces: Claims, tables and charts, with every number traced to the evidence behind it. "Inconclusive", "insufficient data" and "question needs reframing" are valid Findings.
_Avoid_: memo, report, result, insight, readout

**Claim**:
One assertion in a Finding, stated as a sentence and backed by at least one chart or table whose numbers are traced. Every Claim declares its type: descriptive, associational or causal; and its comparison, population and window.
_Avoid_: insight, takeaway, point, key finding

**Variant**:
One candidate rendering of the same Claim, produced while iterating on a chart; at most one becomes the chart in the Finding.
_Avoid_: option, alternative, draft, version

**Check**:
A runnable assertion that establishes one stated property of an Analysis: an invariant holds, a calculation matches its Metric definition, an evidence reference resolves. Passing Checks never by itself makes a Finding trustworthy.
_Avoid_: test, validation, guardrail, proof

**Snapshot**:
The retained inputs an Analysis ran against: an immutable fixture or bounded extracts with content hashes. A Finding lists which guarantees its Snapshot gives: artifact replay, analysis rerun, both, or neither.
_Avoid_: freeze, baseline, as-of, fingerprint

### Context

**Metric definition**:
The versioned meaning of a metric in plain language and in canonical SQL: grain, population, denominator, window, owner. Status is proposed, approved or deprecated; only an Operator can approve, and the approver and reviewed revision are recorded. Only an approved definition may carry a published decision metric.
_Avoid_: metric (bare), KPI, measure

**Diagnostic calculation**:
A traceable calculation used inside an Analysis that is not an approved Metric definition. Allowed in working Analyses with explicit status; never the headline of a Finding.
_Avoid_: ad-hoc metric, scratch metric

**Golden Question**:
A Question with a known-true answer, used to evaluate that the Engine and an Instance still agree.
_Avoid_: eval case, test question

**Decision record**:
An entry stating who decided, what action or deliberate inaction was taken, why, when, what would trigger a revisit, and the eventual outcome. It cites a Finding; merging a Finding does not create one.
_Avoid_: outcome, verdict

**Decision log**:
The collection of Decision records in an Instance.
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
The person a Finding is written for. Can understand, inspect and follow up on a Finding without reading SQL. Each Finding names its Reader from the profiles the Instance keeps.
_Avoid_: stakeholder, consumer, end user, audience

## Relationships

- A **Question** has many **Analyses**; each **Analysis** produces one **Finding**
- A chart in a **Finding** is the surviving **Variant** for its **Claim**
- A **Finding** is made of **Claims**; each **Claim** is headed by a sentence and backed by a chart or table
- A **Finding** is publishable only when its **Checks** pass, its **Metric definitions** are approved, and its method review is recorded; these are shown as separate facts, never one badge
- An **Analysis** runs against one **Snapshot**
- Every number in a **Finding** resolves from an evidence reference: query execution, **Snapshot**, and a **Metric definition** or **Diagnostic calculation**
- A **Decision record** cites a **Finding** and enters the **Decision log**; merging a **Finding** does not create one
- A **Golden Question** is a **Question** whose **Finding** is already known
- The **Engine** operates on an **Instance**; the **Operator** owns both, the **Reader** sees only **Findings**
