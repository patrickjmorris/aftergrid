# grill-question

## What it does

`/grill-question` interviews you until a raw ask is a **Question**: a decision, a Reader, a Metric definition at
a pinned version, a population, a window with its analytical timezone, a primary comparison registered before
any cut, and a falsifier a Check can evaluate — or an explicit record that a falsifier cannot be written yet.

It works the way `grilling` does: a frontier of decisions, asked a whole round at a time, each question carrying
the recommended answer so you can correct rather than compose. It asks only about what changes the analysis, and
it finds facts about your data itself instead of asking you for them.

The result lands in a Finding's `manifest.yaml` (`question`, `reader`) and in the `analysis.yaml` beside it, as a
seed marked `stage: clarified` (`reader_profile`, `assumptions`, `pre_registered_comparison`, `needs_input`). New
Metric definitions are written to `<instance>/definitions/<id>.md` as `lifecycle: proposed` with no approval
block.

It is **user-invoked** (`disable-model-invocation: true`, `policy.allow_implicit_invocation: false`): it creates
a Finding directory, writes definition files, and spends your attention in rounds. The same procedure reached
mid-task is `/checked-analysis`, which reads the same reference file this skill reads — so no user-invoked skill
ever calls another one.

## When to reach for it

- You have an ask in plain words and no metric, window, population or falsifier behind it yet.
- The ask uses a word your Instance defines differently, or a causal word ("helped", "drove") whose design you
  have not confirmed.
- No approved Metric definition fits, and you want the new one written down as a proposal before anyone runs it.
- A Finding you started is sitting at `question.state: unresolved` and the missing part is now settled.
- Someone filed the ask as an Issue and you want it sharp before the background run picks it up.

Reach for `/analyze` instead when the Question is already `resolved` and you want the whole chain run. Reach for
`/revise-finding` when the Finding exists and it is the memo, not the Question, that needs changing.

## Common questions

**Will it ask me the same things twice?** No. Everything already recorded is settled, and a settled part is
never asked again. On a second pass it restates the settled parts as a list you can correct, and asks only about
what is in `question.unresolved` or waiting on a `needs_input` owner.

**What if I do not know the falsifier?** Then it is not written. The Question ends `unresolved` with `falsifier`
in the list, the field is absent rather than filled with something plausible, and a `needs_input` item records
who sets the bar and before what. A threshold picked after seeing the numbers is a bar set to fit its own
result, and the skill will not write one.

**Does it approve the definitions it proposes?** No, and it cannot. A proposal is written with
`lifecycle: proposed` and no `approval:` block. Approval is your attestation bound to the definition file's
content hash, recorded separately (`docs/contracts/instance-layout.md`). A proposed definition may back a
supporting or diagnostic Claim with its status shown; it can never be the published decision metric.

**Will it edit a definition I already approved?** No. An approved file is read and never written. A Question
that needs a change to one becomes a `needs_input` item of kind `definition_approval` naming you, and the
analysis stops there for that metric.

**Does it run any SQL against my source?** Only reads, and only to answer its own questions rather than yours:
the catalog, and bounded probes on data the Instance's connection already allows. It never writes.

**Will `aftergrid check` say my evidence is invalid before any analysis has run?** No. The file this skill
leaves is marked `stage: clarified`, which is a complete artifact for where it is: `check` reports evidence
`valid` and content `incomplete`, and the sections `/checked-analysis` fills are required only once the run has
happened. "Invalid evidence" means something is wrong with evidence, never that there is none yet.

**It says my Question is `unresolved`. Is that a failure?** No. An unresolved Question with its missing parts
named is a better artifact than a resolved-looking one with an invented falsifier, and `insufficient_data` and
`needs_reframing` are valid Findings.

## It's working if

- Your ask survives verbatim in `question.raw_ask`, whatever the rounds settle.
- Each round arrives numbered, with a recommended answer you can accept or correct in a line.
- No round asks about something an earlier round settled, and a second session over the same Finding asks only
  about what was left open.
- Every question it asks would change the metric, the population, the window, the comparison, the falsifier or
  the Reader if you answered it differently.
- It looks up facts about your data rather than asking you for them.
- Unsettled parts are absent from the manifest and listed in `question.unresolved` — never filled in.
- Any definition it wrote reads `lifecycle: proposed` and carries no approval block, and any approved definition
  file is byte-for-byte as you left it.
- The hand-off names the definitions with their versions and lifecycles, and does not round `unresolved` up to
  "ready".
