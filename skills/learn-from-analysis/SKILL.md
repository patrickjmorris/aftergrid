---
name: learn-from-analysis
description: "Capture a non-obvious lesson from an actual analysis or correction, with evidence, applicability, counterexamples, and retrieval cues. Update project notes as proposals, never automatic approved definitions or universal memory."
disable-model-invocation: false
user-invocable: true
---

# Learn from an analysis

Preserve a lesson that will change a later analyst's decisions. Use an actual completed calculation, failed approach, correction, or unresolved contradiction. A generic maxim or plausible idea without supporting observation is not a learned lesson.

## Select a demonstrated lesson

Read the relevant analysis artifacts and source evidence. Identify the previous assumption, the observation that challenged it, what changed, and what work a future analyst would do differently. A failed query proves the query failed, not that the business hypothesis is false. An agent review is evidence of a concern until its correction or verification is shown.

Keep the distinction between verified observation, plausible explanation, and open question. Do not label something verified because the prior agent said it was. If the supplied evidence is insufficient, write a proposed question to test or explain why no lesson can yet be supported.

## Search before adding

Read the user-designated project notes or lesson directory if one exists. Search for the same metric, source, grain, join, and failure mode. Compare scope and evidence before merging: similar wording may hide different populations or versions. Preserve disagreements, obsolete applicability conditions, and links to superseded evidence. Do not overwrite an approved definition or erase a contradictory observation to make one rule.

Use the project's existing organization. If no destination is established, return a proposed note in the response; when saving notes is part of the user's request, choose a clear local project path and say where. Do not write global agent memory, credentials, raw personal data, or unrelated project instructions.

## Write a compact lesson

Include:

- A descriptive title and retrieval terms: metric/source, grain, and failure mode.
- Status **proposed**, with the observed date/version when known.
- The context and prior assumption.
- The actual observation, with source/query/result or artifact references.
- The changed analytical practice and why the observation supports it.
- Applicability: populations, time semantics, schema/definition versions, and conditions that matter.
- A counterexample or invalidating condition, and what to check before reusing it.
- Uncertainty, contradictions, and a review owner only if supplied.

Do not invent an observation date, human owner, test execution, or evidence link. Use “not recorded” where appropriate. Link to allowed artifacts rather than copying sensitive raw data into a reusable note.

## Make reuse testable

End with the next-task retrieval cue and the check a future analysis should perform before applying the lesson. A lesson about one-to-many joins should tell the next analyst which grain/cardinality to verify; it should not forbid joins generally. A mix-shift diagnosis should prompt checking current weights, not assume every future decline is mix shift.

When asked to apply an existing lesson, first inspect its applicability against the new data and preserve contrary evidence. State whether it was applied, narrowed, rejected, or left unresolved, with the evidence that decided it. A proposed note never becomes an approved definition or an active Engine check without the separate owner process.
