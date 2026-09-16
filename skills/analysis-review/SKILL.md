---
name: analysis-review
description: Review a complete Finding with three independent reviewers — Method, Question and Reader — and record what each found in the manifest. Use after the draft is written and before `aftergrid check`, or when a revision has left the recorded reviews stale.
user-invocable: false
---

# Review a Finding

Three reviewers, dispatched at once, judging different things. They do not fix the Finding and they do not
approve it: each returns what it found, and the findings are recorded against the content digest so a later
edit makes them visibly stale.

**Blocking is the whole judgement.** A finding is **blocking** when a Reader acting on this Finding as it
stands would be misled: a sentence that does not mean what its number means, a Claim type the design does not
earn, a rate with no stated denominator, a caveat that would change the decision and is not beside the Answer,
an answer to a different question than the one asked. Everything else — wording, ordering, a chart that could
be clearer, an interesting cut nobody made — is **non-blocking**. Report it and move on.

## 1. Read what is already recorded

```bash
aftergrid review status <finding-dir>
```

It prints the reviews bound to the current content digest, the ones bound to older content, and whether
`/analyze` would halt. A review bound to older content is not a review of this Finding: redo it.

Done when you can name which of `method`, `question`, `reader` still needs a review of the current content.

## 2. Separate a broken execution from a thin answer

```bash
aftergrid check <finding-dir> --json
```

Read `errors` and `evidence`:

| What you see | What it is | What you do |
| --- | --- | --- |
| `errors` is empty | The evidence is valid. | Review it. |
| a `check_error`, `sql_error`, `hash_mismatch`, `rerun_mismatch` or `unresolved_reference` | The machinery is broken. | Stop. Record no review. Report `needs_attention` naming the category and location; `/analyze` halts here. |
| `outcome: insufficient_data`, `inconclusive` or `needs_reframing`, no errors | An honest answer. | Review it exactly as you would an answered one. |

A Finding that says "we cannot tell yet" is a finished Analysis, and the reviewers judge whether it says so
honestly. A Check that errored is a run that did not happen.

Done when the errors list is empty, or you have stopped and written the `needs_attention` reason.

## 3. Resolve the Reader profile

`reader.profile` in `manifest.yaml` names the profile. Find it as a `## <id>` section in the Instance's
`readers.md`. When the profile is `generic`, or the Instance has no `readers.md`, use
`schema/generic-reader-profile.yaml`.

Done when you are holding the profile's `role`, `data_literacy`, `will_misread` and `vocabulary`, or the
generic fallback and the fact that you are using it.

## 4. Dispatch the three reviewers in parallel

Send all three in one message so they run at the same time, each as its own subagent with no sight of the
others' output. The briefs, including the exact JSON each returns, are in
[`references/reviewer-briefs.md`](references/reviewer-briefs.md).

Pass each subagent the Finding directory, the manifest, the memo and the resolved Reader profile. Give the
Reader reviewer the narrative criteria: use `skills/shape-narrative/references/narrative-criteria.md` when it
exists, and [`references/reader-criteria.md`](references/reader-criteria.md) when it does not.

Done when you hold three results, each an object with a `blocking` array and a `non_blocking` array of plain
sentences. A reviewer that returns prose instead of JSON is asked again; a reviewer that fails twice is
recorded as a `needs_attention` reason, never as a clean review.

## 5. Record each review

One command per reviewer. Repeat `--blocking` and `--non-blocking` per finding.

```bash
aftergrid review record <finding-dir> \
  --kind method \
  --reviewer "agent:<model id>" \
  --blocking "the rate has no stated denominator" \
  --non-blocking "the second chart would read better sorted by size"
```

The Reader review adds `--profile <profile id>`.

The command refuses when the Finding's files no longer hash to its pinned digest. That refusal is correct:
re-pin the Finding first, then review what is actually there. The command never writes an attestation.

Done when `aftergrid review status <finding-dir>` lists a current `method`, `question` and `reader` review.

## 6. Report what was found

State, in this order: the halt decision from `review status`, every blocking finding with the reviewer that
raised it, then the non-blocking ones. Use the words the reviewers used.

Say "reviewed by three agent reviewers". Do not say approved, verified, signed off or cleared: publication
still needs a human APPROVED review at the analyzed commit, which nothing here has read
(`docs/contracts/publication.md`).
