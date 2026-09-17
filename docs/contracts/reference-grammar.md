# Reference grammar

How a value gets from a saved result into a sentence, a table cell or a chart title. Governs `memo.md`, `manifest.yaml` string fields marked "may contain reference tokens", and chart `title`/`description`. Schema: `schema/finding-manifest.schema.json` (`value_ref`).

## Tokens

Three value token kinds, plus one marker for declared non-evidence literals. Nothing else is a token.

| Token | Resolves to | Example |
| --- | --- | --- |
| `{{ref:<result_id>.<row_key>.<column>}}` | One cell of a saved result set | `{{ref:signups_by_week.2026-08-24.signups}}` |
| `{{derived:<id>}}` | One declared derived value | `{{derived:signups_short_of_minimum}}` |
| `{{ext:<id>}}` | One typed external source (target, assumption, external reference) | `{{ext:minimum_cohort_size}}` |
| `{{literal:<text>}}` | Not a value. Marks a numeral that is a parameter of the Question, a definition or a policy, never a measurement. Counted and listed by `check`; read by method review. | `{{literal:30-day}}` |

- `result_id`, `column`, derived and external ids: `^[a-z][a-z0-9_]{0,63}$`. No dots, no hyphens.
- `row_key`: `^[A-Za-z0-9_-]{1,64}$`. Hyphens allowed (dates, slugs). No dots.
- Separators are always `.`; because ids never contain `.`, a token splits unambiguously.
- No whitespace inside a token. No expression language: a token names a value, it never computes one. Arithmetic lives in SQL or in a declared `derived` entry.
- Same grammar without the `{{ }}` wrapper is used inside the manifest (`claims[].evidence`, `derived[].operands`, `recheck.predicate.subject`), so a value has exactly one spelling everywhere.

## Resolution

`check` and `render` resolve every token from the pinned manifest, in this order, and fail on the first miss:

1. `ref`: the `result_id` exists in `results`; the file at its `path` hashes to its `content_hash`; the `row_key` column is declared and its values are unique; exactly one row has that key; the `column` is declared. Resolution is by key, never by row index.
2. `derived`: the id exists in `derived`; every operand resolves; the operand graph has no cycle; units are compatible with the operation (`difference`/`sum` need identical units; `ratio`/`percent_of`/`percent_change` accept any and yield `ratio` or `percent`); and the operand form is one this grammar defines (see **Operand direction**).
3. `ext`: the id exists in `external_sources`.

Errors carry a location (`memo.md:42:17` or `manifest.yaml#/claims/0/evidence/1`), a category (`unresolved_reference`, `duplicate_row_key`, `missing_column`, `hash_mismatch`, `derived_cycle`, `unit_mismatch`) and a remedy.

## Values

- Decimal precision is preserved from the saved result. Nothing is rounded before a derived calculation.
- `null` in a result cell renders as "not available". It is never zero, and a derived value with a null operand is "not available".
- A zero denominator in `ratio`, `percent_of`, `percent_change` is "not available", never 0 or infinity.
- Display formatting (`display` on the column, derived value or external source) is defined once and applied only at render: `percent` multiplies a `ratio` by 100 and appends `%`; `decimals` rounds for display only; `integer` uses thousands separators.
- The same token renders identically in prose, table cells and chart text.

## Operand direction

`difference`, `ratio` and `percent_change` take their value from which operand is which. Both orders are valid
arithmetic, so no check can tell a flipped pair from an intended one: a percent change written
baseline-then-after renders a real number with the opposite sign, and only a human reading the prose can see
it. A real run did exactly that, four times, and rendered "rose by −20.6%"
(`examples/nyc-open-data/docs/run-log.md`, Citi Bike run 1).

These three therefore accept **named operands**, and the named form is the one to write:

```yaml
operands: { after: ref:crz_trips_by_period.after.crz_trips, baseline: ref:crz_trips_by_period.baseline.crz_trips }
```

- `after` is the measured value — the one the Claim is about.
- `baseline` is what it is measured against — the earlier period, the control arm, the reference group.
- `difference` is `after − baseline`. `ratio` is `after / baseline`. `percent_change` is
  `100 × (after − baseline) / baseline`. The named form computes exactly what the positional `[a, b]` computes;
  what it adds is the declaration, so the sign is a fact the Engine stands behind and a renderer can show.
- The render names them: a popover on a named derived value reads "the difference of after … against
  baseline …", so a Reader and a reviewer see the direction without opening the manifest.

A positional pair on one of the three is still valid and still resolves, and `check` reports the warning
`direction_unstated` at `manifest.yaml#/derived/<i>` (and at `analysis.yaml#/requested_derived/<i>/operands`,
where the value is first requested). It is a warning, not an error: the value is exact and the arithmetic is
defined — what is missing is the declaration that makes the sign checkable.

`sum`, `min` and `max` are order-free, and `percent_of` names its own order ("a as a percent of b"). None of
them has a direction to declare, so named operands on any of them are refused: `derived_arity`.

## What is not a token

`check` treats a numeral in `memo.md` as data-bearing unless it is one of these. Everything else that looks like a number fails `check` with category `untraced_numeral`.

| Allowed without a token | Rule |
| --- | --- |
| ISO dates and timestamps | `2026-08-24`, `2026-08-24T00:00:00Z` |
| Durations that are parameters, as words | "seven days after signup" describes the definition; a measured count of days is a token |
| Ids | Finding, Claim, result, check ids declared in the manifest |
| Section numbering in headings | `## 3. Evidence` |
| Definition versions | `v2` when adjacent to a definition id |
| Explicit non-evidence literal | `{{literal:30-day}}`, see above. |

Words that carry a quantity without digits ("doubled", "half", "most") are not caught by `check`; they belong to method review, which reads every Claim sentence against its evidence. Spelling a measured quantity out in words to get past `check` is a violation method review is asked to look for, not a technique.

## Chart bindings

A chart spec never contains data. The renderer binds the `result_id` named in `charts[]` to the spec's single `data` slot as `{"name": "result"}`; field names in encodings must be declared columns of that result. The allowlist for the Vega-Lite subset is owned by the renderer bead; this grammar only fixes that the chart's values come from the same result sets as every token.
