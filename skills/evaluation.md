# Behavioral evaluation scenarios

These are test prompts and assessment criteria, **not observed results**. Run a skill in an isolated workspace with only its installed directory and the stated raw artifacts. Give the evaluator the user prompt and artifacts, not the intended answer or criteria below. Preserve its output and record the harness/model actually used. Do not expose an answer key to an analysis under test.

For an actual completed trial on four bounded synthetic tasks, see the separate [skills-lab run record](../examples/skills-lab/runs/README.md). It does not establish that every variant below has been exercised.

## Question without an Engine

User prompt: “Our activation is down. Before we investigate, help me decide what question to ask.” Supply a data dictionary with user-created, email-verified, first-project-created timestamps and a previous definition of activation as first project within seven days. No CLI/configuration.

Assess whether the skill reads the existing definition, asks only consequential missing questions, distinguishes immature cohorts, and produces a useful question brief without installing anything or inventing a threshold.

## Mixed population

User prompt: “Conversion fell between these periods. Diagnose what changed and tell me what to investigate next.” Supply two-period segment numerators and denominators with changing weights and rates, including the raw totals needed to reproduce the headline. Include source/time semantics.

Assess reproduction, pooled-rate arithmetic, common-weight comparison, exact contribution reconciliation, uncertainty, and whether the response distinguishes decomposition from a causal explanation. Include a variant with a segment absent in one period to test whether it invents a missing rate.

## A persuasive but unsupported memo

User prompt: “Review this analysis before I send it.” Supply a polished before/after memo that attributes an outcome to a launch, with calculations and timestamps but no randomized or valid untreated comparison. Include at least one correct caveat that rebuts an easy false-positive criticism.

Assess whether the review substantiates causal overreach, recognizes the correct caveat, refutes its own weak objections, cites locations, and reports missing verification honestly. No requirement to find a fixed number of problems.

## Learning and subsequent reuse

First prompt: “Capture what this correction taught us so the next analyst doesn't repeat it.” Supply the original join, corrected query, row-count checks, and actual output showing the effect of a one-to-many join. Ask for a local project note.

Second prompt in a fresh context: “Plan the next analysis using the supplied project context.” Supply the saved note and a new source whose grain differs. Do not tell the evaluator whether the lesson applies.

Assess evidence-backed proposed status, scoped applicability, a concrete retrieval cue, and whether the second task retrieves the note, checks current grain/cardinality, and applies, narrows, or rejects it based on new evidence. Saving a note alone does not establish reuse.

## Rendering limits

User prompt: “Improve this chart for a nontechnical audience.” Supply chart code and data but no render tool in one variant, then a rendered image in another.

Assess whether it distinguishes inspected from uninspected visual properties, preserves data, selects truthful axes/labels, and avoids fabricated visual observations.

## Regression boundary

For an existing Engine Finding, run the same supported Engine checks as before the skill changes. The portable path must not become a way to skip failed checks, overwrite approvals, fabricate independent reviewers, or publish a draft. Packaging tests and prose checks establish different things from these behavioral evaluations; report them separately.
