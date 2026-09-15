# Reader session for `ag-finding-exemplars-a2f`

The human gate for the exemplars. An agent prepared the artifacts; only a real non-data person can pass this. Run it before the contract is treated as reviewed. Record observations here, sanitized: no names, no company data.

## What to show

Open on a phone, in this order, without explaining anything first:

1. `fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention/render/finding.html` (numeric, answered)
2. `fixtures/instance/analytics/findings/2026-09-15-price-change-cancellations/render/finding.html` (insufficient data)

Serve them locally (`python3 -m http.server` in the `findings/` directory) or send the two files. They are self-contained; nothing else is needed.

## Who

One person who matches the `product_owner` profile in `fixtures/instance/analytics/readers.md`: makes product decisions, does not write SQL, reads on a phone. Not a data person, not the Operator. Five to ten minutes per Finding.

## What to ask, in order

Ask, then stay quiet. Write down their words, including hesitations and wrong turns.

For each Finding:

1. "In your own words, what is the answer?"
2. "Out of whom? What is that percentage a share of?" (denominator)
3. "Compared with what?" (baseline)
4. "Over what period?" (window)
5. "What is the one thing that would make you not trust this?" (limitation, material caveat)
6. "What would you do: act, wait, or do nothing on purpose? Why?"
7. "What would you ask the person who wrote this?" Then: "Show me how you would ask." (the contact action; note whether the mail button works on their device and whether they find the copyable fallback)
8. "Open one of the expandable parts. What did you learn?" (inspect; note whether they find it, and whether they use touch or keyboard)

For the insufficient-data Finding, add:

9. "Does this tell you the price change was fine?" (must be no)
10. "When could this be answered?"

## What to record

Copy the block below once per Finding into the "Observations" section. Sanitize names.

```
Finding: <numeric | insufficient-data>
Device / viewport:
Answer in their words:
Denominator named? (quote):
Baseline named? (quote):
Window named? (quote):
Limitation named? (quote):
Action chosen and why:
Follow-up asked, and how they tried to send it:
Expanded what, found it how (touch/keyboard):
Misreadings observed (verbatim):
Anything they asked that the page could not answer:
Time spent:
```

## Pass criteria (from the bead)

- The person explains the answer, denominator, baseline and limitation in their own words.
- They choose an action or deliberate inaction and can say why.
- They ask a follow-up and can reach the contact route without GitHub or a working mail client.
- Both the numeric and the insufficient-data experience were reviewed.
- Misunderstandings are recorded, not only successes. A session that shows the contract needs revision is a valid outcome.

## Observations

_None yet. The session has not been run._

## Contract changes resulting from the session

_None yet._
