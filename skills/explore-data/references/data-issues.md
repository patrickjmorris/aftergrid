# Data issues: a source defect found mid-analysis

Reach for this when a check shows the data disagreeing with how its source is meant to behave: a period with
missing rows, a refresh job that stopped, duplicates on a key the system guarantees unique, values outside their
documented range, freshness far behind the pipeline's schedule. The analysis continues, scoped around the
defect. The defect also leaves a note for the person who can fix it.

## 1. Classify each observation

- **Defect** — the source is not doing what it is meant to do. Someone upstream could fix it.
- **Suspected defect** — the observation fits a defect, but intended behavior is not documented. Treat it as a
  defect and state the intended behavior you assumed.
- **Limit** — the source never recorded this by design (no history table, no field at the needed grain). A
  limit goes in the answer's caveats, and in a lesson through `learn-from-analysis` when later work would hit it
  again. It gets no note.

Completion: every data observation that constrains the analysis carries one of the three labels.

## 2. Measure it

For each defect, record what a data owner needs to reproduce it without you:

- **Scope** — tables, fields, periods, segments affected.
- **Size** — rows affected and their share of the analysis population, per period when it varies.
- **Window** — first and last date the defect appears.
- **Evidence** — the query or transform, and its observed result.
- **Suspected cause** — labeled a hypothesis unless you observed the mechanism.

Completion: the owner could rerun the evidence and get the same size.

## 3. Bound its effect on this analysis

Name the claims that touch affected rows. Choose the workaround (exclude the period, restrict to rows with the
fields populated, filter on a maturity window) and state what it costs: population lost, periods dropped,
comparisons weakened. Where feasible, compute the headline with and without the workaround. Assign a severity:

- **Blocks** — the question cannot be answered until the defect is fixed.
- **Distorts** — the answer holds only under the workaround; without it the result would mislead.
- **Minor** — no claim in this analysis moves.

Then continue the analysis under the workaround. The defect, its workaround and its severity go in the answer's
limits, beside the claims they touch.

Completion: every affected claim names the workaround it depends on.

## 4. Write the note

Write `data-issues/<yyyy-mm-dd>-<slug>.md` in the user's project, or wherever the user keeps them. When a note
already describes the same defect, append the new observation with its date instead of opening another.

```markdown
# <What is wrong, in one line>

- Status: open
- Severity: blocks | distorts | minor
- Owner: <team or person who can fix it, or "unknown">
- Found during: <the analysis question, one line>

## Observed
<Scope, size, window. The query and its result.>

## Suspected cause
<Hypothesis, labeled as one.>

## Effect on the analysis
<Claims touched, workaround used, what it cost.>

## Next check
<The smallest query that would confirm the cause or the fix.>
```

Keep credentials, connection strings, and raw personal records out of the note. Counts and identifiers of
affected tables are enough.

## 5. Offer a draft issue

Draft an issue for the owner's tracker from the note. Ask through the harness's structured question tool when
it has one (`AskUserQuestion` in Claude Code, `request_user_input` in Codex): file it, and in which repository or
tracker. File only after the user says yes, with the tool they already use (`gh issue create`, a tracker's
MCP server), then add the issue link to the note. A declined draft stays in the note as its record.

Completion: each defect has a note, appears in the answer's limits, and the user has been offered a draft.
