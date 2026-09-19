# Engine Finding mode

This reference applies only to an existing aftergrid Finding or an explicitly requested Engine workflow. It requires the complete aftergrid toolkit, including the CLI and contracts; portable use of the skill does not. Resolve repository paths below against that toolkit, not against the user's data directory.

# Review a Finding

Three reviewers, dispatched at once, judging different things. They do not fix the Finding and they do not
approve it: each returns what it found, and the findings are recorded against the content digest so a later
edit makes them visibly stale.

**Blocking is the whole judgment.** A finding is **blocking** when a Reader acting on this Finding as it
stands would be misled: a sentence that does not mean what its number means, a Claim type the design does not
earn, a rate with no stated denominator, a caveat that would change the decision and is not beside the Answer,
an answer to a different question than the one asked. Everything else — wording, ordering, a chart that could
be clearer, an interesting cut nobody made — is **non-blocking**. Report it and move on.

## 1. Read what is already recorded

```bash
aftergrid review status <finding-dir>
```

It prints one counts line — `reviews: <n> current, <m> superseded, <k> stale` — and whether `/analyze` would
halt. **Superseded and stale are different facts, and only one of them is work:**

- **superseded** — a later review of the same kind exists. History. Redoing it is a wasted run: `aftergrid
  review record` dedupes on (kind, reviewer, digest) and would write nothing. `check` reports it as
  `review_superseded` info, never as a warning.
- **stale** — that kind's **newest** review is bound to older content, so nobody has reviewed the Finding as it
  now stands. Redo that kind. Never re-pin a review to content it did not read.

A manifest that keeps its round-1 reviews beside the current ones is therefore normal, and `0 stale` means
there is nothing to redo however many superseded entries sit behind it.

The halt decision is computed, not assumed: the command runs the offline artifact check itself, so a Finding
whose evidence is broken reports `halt` here with the check error rather than `continue`. It executes no SQL,
so step 2 is still the gate — a rerun mismatch is invisible to this command. On a Finding outside its Instance
there is nothing to validate against, and the command says the evidence was not judged instead of guessing.

Done when you can name which of `method`, `question`, `reader` still needs a review of the current content
(that is the `stale` count and the missing kinds, never the `superseded` count), and whether the command
already halted on the evidence.

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

When independent subagents are available, send all three in one message so they run at the same time, each with no sight of the others' output. When the harness cannot delegate, perform three separate serial lens passes, record the actual single agent identity for each kind, and explicitly report serial self-review rather than independent review. Do not invent three agents. The briefs, including the exact JSON each returns, are in
[`references/reviewer-briefs.md`](reviewer-briefs.md).

Pass each subagent the Finding directory, the manifest, the memo and the resolved Reader profile. Give the
Reader reviewer the narrative criteria: use `skills/shape-narrative/references/narrative-criteria.md` when it
exists, and [`references/reader-criteria.md`](reader-criteria.md) when it does not.

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

Done when `aftergrid review status <finding-dir>` lists a current `method`, `question` and `reader` review. The
round-1 reviews stay in the manifest and are counted `superseded`; leave them there.

## 6. Report what was found

State, in this order: the halt decision from `review status`, every blocking finding with the reviewer that
raised it, then the non-blocking ones. Use the words the reviewers used.

Say "reviewed by three agent reviewers" only when three agents actually performed those reviews; otherwise say "three review lenses, performed serially by one agent." Do not say approved, verified, signed off or cleared: publication
still needs a human APPROVED review at the analyzed commit, which nothing here has read
(`docs/contracts/publication.md`).
