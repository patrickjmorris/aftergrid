# Proposed landing-page section: "Try it on open data"

**This is a proposal, not site content.** The site (`site/`) is somebody else's in-progress work and nothing
here has been lifted into it. It is written so the owner can paste it and change the voice, and every claim in
it is something `examples/nyc-open-data/` shows today — if a claim stops being true, this file is wrong and the
example is the authority.

---

## Headline

**See a Finding before you trust one**

## Body (three sentences)

`examples/nyc-open-data/` is a public demo Instance on NYC taxi trips, Central Park weather and Citi Bike
rides: rebuild its data from the publishers in about five minutes, then run `/analyze` on it and watch one
Question go from a plain-words ask to a Finding a non-data reader can inspect. Every number on the rendered page
opens the chain behind it — the calculation, the saved result and its hash, the query, the retained data, the
definition — and every Finding carries the test it wrote down in advance for what would show its own answer
wrong. Two Findings have come out of it so far, and neither is approved: both are open draft pull requests
waiting on a human, which is the only thing that makes a Finding publishable.

## The two results, one line each

- **Trips into the Congestion Relief Zone, January 2025 against January 2024** — *inconclusive.* The average
  weekday had 5.3% more trips into the zone; among the five weekday pairs matched on day of week, holiday and
  weather, 5.4% fewer. The falsifier, pinned before any query ran, recorded `fail` and the Finding says the
  Question is not settled.
- **Member e-bike rides, January 2025 against January 2024** — *answered.* Members took 1,329,923 rides on
  e-bikes against 1,055,584 a year earlier, 69.2% of member rides against 62.8%; its falsifier passed, and the
  two months were not alike on weather, which sits in the caveat beside the answer.

## Link

[Walk through the NYC open-data example →](https://github.com/patrickjmorris/aftergrid/tree/main/examples/nyc-open-data)

---

## Notes for the owner

- **Do not soften "inconclusive".** It is the demo's strongest claim: the machinery caught a month-on-month rise
  that would otherwise have been published as an effect.
- **Do not write "approved", "published" or "reviewed by a human"** anywhere near these two Findings. Both pull
  requests are drafts with zero reviews; the reviews on the pages are agent reviews, which are not approvals.
- The rendered pages are not hosted anywhere yet; the link above goes to the walkthrough, which says how to open
  them from the two demo branches. If the site later hosts a rendered page, it must keep the page's own draft
  banner.
- All eight definitions in the Instance are `proposed`, so no number from this example may headline a metric
  claim on the site.
