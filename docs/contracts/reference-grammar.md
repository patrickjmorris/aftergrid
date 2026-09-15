# Reference grammar

How a value gets from a saved result into a sentence, a table cell or a chart title. Governs `memo.md`, `manifest.yaml` string fields marked "may contain reference tokens", and chart `title`/`description`. Schema: `schema/finding-manifest.schema.json` (`value_ref`).

## Tokens

Three token kinds. Nothing else is a token.

| Token | Resolves to | Example |
| --- | --- | --- |
| `{{ref:<result_id>.<row_key>.<column>}}` | One cell of a saved result set | `{{ref:signups_by_week.2026-08-24.signups}}` |
| `{{derived:<id>}}` | One declared derived value | `{{derived:signups_short_of_minimum}}` |
| `{{ext:<id>}}` | One typed external source (target, assumption, external reference) | `{{ext:minimum_cohort_size}}` |

- `result_id`, `column`, derived and external ids: `^[a-z][a-z0-9_]{0,63}$`. No dots, no hyphens.
- `row_key`: `^[A-Za-z0-9_-]{1,64}$`. Hyphens allowed (dates, slugs). No dots.
- Separators are always `.`; because ids never contain `.`, a token splits unambiguously.
- No whitespace inside a token. No expression language: a token names a value, it never computes one. Arithmetic lives in SQL or in a declared `derived` entry.
- Same grammar without the `{{ }}` wrapper is used inside the manifest (`claims[].evidence`, `derived[].operands`, `recheck.predicate.subject`), so a value has exactly one spelling everywhere.

## Resolution

`check` and `render` resolve every token from the pinned manifest, in this order, and fail on the first miss:

1. `ref`: the `result_id` exists in `results`; the file at its `path` hashes to its `content_hash`; the `row_key` column is declared and its values are unique; exactly one row has that key; the `column` is declared. Resolution is by key, never by row index.
2. `derived`: the id exists in `derived`; every operand resolves; the operand graph has no cycle; units are compatible with the operation (`difference`/`sum` need identical units; `ratio`/`percent_of`/`percent_change` accept any and yield `ratio` or `percent`).
3. `ext`: the id exists in `external_sources`.

Errors carry a location (`memo.md:42:17` or `manifest.yaml#/claims/0/evidence/1`), a category (`unresolved_reference`, `duplicate_row_key`, `missing_column`, `hash_mismatch`, `derived_cycle`, `unit_mismatch`) and a remedy.

## Values

- Decimal precision is preserved from the saved result. Nothing is rounded before a derived calculation.
- `null` in a result cell renders as "not available". It is never zero, and a derived value with a null operand is "not available".
- A zero denominator in `ratio`, `percent_of`, `percent_change` is "not available", never 0 or infinity.
- Display formatting (`display` on the column, derived value or external source) is defined once and applied only at render: `percent` multiplies a `ratio` by 100 and appends `%`; `decimals` rounds for display only; `integer` uses thousands separators.
- The same token renders identically in prose, table cells and chart text.

## What is not a token

`check` treats a numeral in `memo.md` as data-bearing unless it is one of these. Everything else that looks like a number fails `check` with category `untraced_numeral`.

| Allowed without a token | Rule |
| --- | --- |
| ISO dates and timestamps | `2026-08-24`, `2026-08-24T00:00:00Z` |
| Times of day, durations stated as words | `9am`, "seven days" is prose, `7` alone is not |
| Ids | Finding, Claim, result, check ids declared in the manifest |
| Section numbering in headings | `## 3. Evidence` |
| Definition versions | `v2` when adjacent to a definition id |
| Explicit non-evidence literal | `{{literal:30-day}}`: a number that is a parameter of the Question, a definition or a policy, not an observation. `check` counts these and lists them in its report; method review reads them. A literal is never a measured value. |

Words that carry a quantity without digits ("doubled", "half", "most") are not caught by `check`; they belong to method review, which reads every Claim sentence against its evidence.

## Chart bindings

A chart spec never contains data. The renderer binds the `result_id` named in `charts[]` to the spec's single `data` slot as `{"name": "result"}`; field names in encodings must be declared columns of that result. The allowlist for the Vega-Lite subset is owned by the renderer bead; this grammar only fixes that the chart's values come from the same result sets as every token.
