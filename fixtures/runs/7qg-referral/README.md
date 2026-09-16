# Recorded run: September referral campaign (insufficient data)

The second synthetic acceptance run for `/grill-question` and `/checked-analysis`, on the golden Question
`fixtures/instance/analytics/golden/referral_campaign.yaml`, whose reviewed expectation is an **abstention**.

**How it was produced.** By hand, following the two skills step by step. **No model was in the loop.** It is a
fixed input to `src/analysis.test.ts`, and evidence about artifact shape only.

| File | What it is |
| --- | --- |
| `raw-ask.md` | The ask, the rounds, and the round where the honest answer was "we cannot write that yet". |
| `clarification-rounds.yaml` | The same rounds, machine-readable: what each round asked, what it settled, and that a second pass asks only the part still listed in `question.unresolved`. |
| `clarified-question.yaml` | The `question` block: state `unresolved`, `unresolved: [falsifier]`, **no falsifier key at all**. |
| `analysis.yaml` | Recommends `insufficient_data`, says what would be needed, and names two specific needs-input items. |

**What the run demonstrates**

- A Question that cannot be fully sharpened ends as `unresolved` with the missing part listed. No falsifier is
  invented to fill the field, and `question.falsifier` is absent rather than a plausible-looking placeholder.
- The minimum-data Check still runs and still records a real outcome; `fail` on a `required: false`
  `minimum_data` Check is a business result, not an engine failure.
- The headline Claim is `numeric: false`: it states what is missing without asserting a rate that twelve users
  cannot support. The one numeric Claim counts the referred users and nothing else.
- `needs_input` names the owner and is specific enough to act on without a round trip.
- `outcome_recommendation.what_would_be_needed` is what turns "no answer" into a usable result, and the schema
  requires it for every outcome except `answered`.
- A second pass over this Finding asks only about `falsifier` — the one part `question.unresolved` names —
  and restates the six settled parts instead of re-interrogating them.
