# Golden Questions and planted effects

Schema: `schema/golden-question.schema.json`. Fixture set: `fixtures/instance/analytics/golden/*.yaml` on the synthetic warehouse `fixtures/instance/data/` (generator `scripts/gen-fixture-data.mjs`, fixed seed). Planted effects and failures are catalogued in `fixtures/instance/planted-effects.yaml`.

## What a Golden Question is

A reviewed reference case: a raw ask, the Reader it is for, the outcome an honest Analysis reaches (`answered`, `inconclusive`, `insufficient_data`, `needs_reframing`), the definitions and tables it must use, reference values with tolerances, what the Finding must state in plain words, and what it must not conclude. It is evaluation material for the nightly model-in-the-loop run (`ag-nightly-eval-0dv`), never a merge gate, and it is written to reward an explained, supported answer, not a predetermined recommendation.

## Three layers, kept apart

Every planted item declares which layer it lives in. They are different kinds of facts and a fixture must never let one masquerade as another.

| Layer | Who catches it | Example |
| --- | --- | --- |
| Engine category | `check` mechanically: `duplicate_row_key`, `check_failed`, `null_value`, `hash_mismatch`, a derived zero denominator rendering "not available" | duplicate event rows fail an `invariant` Check; a platform with no users yields "not available", never 0 |
| Analytical outcome | the Analysis, honestly | too little data → `insufficient_data`; a metric that cannot be measured → `needs_reframing` |
| Review concern | Method and Reader reviewers, in words | a mix shift explains a falling overall rate; an instrumentation break is not a behaviour change; a coverage gap must be stated |

A population mix shift does not by itself require a mechanical Check failure: the numbers are right, the interpretation is what needs care.

## Reference values

`expected.values[]` are produced by `reference.queries[]`, plain SQL over the warehouse tables with named parameters, keyed by `row_key`. `src/golden.test.ts` runs them through the DuckDB adapter and asserts each value within its tolerance, so the file is checked, not trusted. Tolerances are absolute in the value's unit. Causal conclusions are only expected where the data was generated with randomised assignment; everywhere else `claim_type` is descriptive or associational.

## Determinism

The generator is seeded; the same seed reproduces the same logical rows and CSV bytes (`tests/generator.test.mjs`). Hash expectations in fixtures commit to the CSV serialisation defined in `docs/contracts/checks-and-results.md`, not to incidental database bytes. Planted additions use a second random stream and only add rows, or remove rows outside both exemplar extracts, so the reviewed exemplar Findings keep their bytes.
