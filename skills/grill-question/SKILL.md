---
name: grill-question
description: Grill a raw ask until it is a Question — decision, Reader, metric, population, window, primary comparison and a falsifier — and write it into a Finding. Use before any analysis runs, when an ask names no metric or window, when a definition is missing or only proposed, or to resume a Question left unresolved.
disable-model-invocation: true
---

# Sharpen an ask into a Question

An ask in plain words on one side; on the other, a Question a Finding can answer and a Revisit can later re-test.
The interview is the work. Everything else here is where the answers land.

The procedure is in **[references/clarification.md](../checked-analysis/references/clarification.md)** — the
rounds, the seven parts, the vocabulary challenge, how a definition is proposed, and what to write. Read it
before round 1. `/checked-analysis` reads the same file, so an Operator gets the same interview whether they
started here or the analysis started it.

## 1. Find the Finding, or make one

The Question lives in a Finding's `manifest.yaml`. There is nowhere else to put it.

```bash
aftergrid new finding <slug> --ask "<the ask, verbatim>" --reader <profile-id>
```

Reuse an existing directory when the Operator names one, or when a draft for this ask already exists — `new
finding` refuses to overwrite, and a second directory for the same ask splits its history.

Done when: you have a Finding directory holding `manifest.yaml`, and `question.raw_ask` is the ask in the
Operator's own words.

## 2. Read what is already settled

Follow *Read before you ask* in the reference. A part with a recorded value is settled, and a settled part is
never asked again.

Done when: for each of decision, Reader, metric, population, window, primary comparison and falsifier, you can
say either its value and the file you read it from, or that nothing records it.

## 3. Run the rounds

Follow *Ask in rounds*. Ask the whole frontier at once, numbered, each with your recommended answer. Wait.
Recompute. Ask again.

Show the Operator the settled parts as a list they can correct, rather than asking them again — including on a
second pass over a Finding you left unresolved.

Done when: the frontier is empty and the Operator has confirmed the shared understanding. Every part is either
settled or explicitly recorded as unsettled with its reason.

## 4. Write it down

Follow *Writing the result*. `question` and `reader` in `manifest.yaml`; `stage: clarified`, `reader_profile`,
`assumptions`, `pre_registered_comparison` and any `needs_input` in `analysis.yaml`. `stage: clarified` is what
says this file is a seed: without it the Analysis file is read as a finished working record and `check` reports
the probes, execution order, candidate Claims and outcome it is missing.

A part that is not settled stays **absent** from the manifest and named in `question.unresolved`. A falsifier
you cannot run is not written at all.

New definitions go to `<instance>/definitions/<id>.md` as `lifecycle: proposed` with no approval block. An
approved definition is read, never edited.

Done when `aftergrid check <finding-dir>` runs clean of schema errors and reports the state you intended.
Evidence is `valid` in every row below: nothing is wrong with the evidence, there is none yet.

| What you settled | `question.state` | What `check` reports |
| --- | --- | --- |
| All seven parts, falsifier is a Check | `resolved` | content `incomplete` until the analysis runs; no schema error |
| Some parts open | `unresolved` | content `incomplete`, warnings naming each unresolved part |
| The ask cannot be answered as posed | `not_answerable` | content `incomplete`; the Finding's outcome will be `needs_reframing` |

## 5. Hand it on

Tell the Operator, in this order:

1. The Question in their words: the decision, who is counted, over what window, compared with what.
2. Which definitions it uses, each with its version and lifecycle. Name any that is `proposed`, and say plainly
   that a proposed definition cannot be the published decision metric until they approve it.
3. Anything unresolved, and who owns it. Do not round `unresolved` up to "ready".
4. The next command: `/analyze <finding-dir>`, which runs the checked analysis, the writing and the review.

`node src/cli.ts <command>` where aftergrid runs from a source checkout; `aftergrid <command>` where it is
installed. Same flags, same report.
