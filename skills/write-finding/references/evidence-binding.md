# Evidence binding

How a value gets from a saved result into a sentence, a table cell or a chart title. The grammar itself is
`docs/contracts/reference-grammar.md`; this page is how to use it while writing a Finding.

## Three ways to name a value, and one way to say "this is not a measurement"

| Token | Names | Use it for |
| --- | --- | --- |
| `{{ref:<result_id>.<row_key>.<column>}}` | One cell of one saved result set | Anything a query produced |
| `{{derived:<id>}}` | One declared derived value | Arithmetic the query did not do |
| `{{ext:<id>}}` | One typed external source | A target, an assumption, a prior Finding |
| `{{literal:<text>}}` | Not a value | A numeral that is a parameter of the Question, a definition or a policy — never a measurement |

Inside the manifest (`claims[].evidence`, `derived[].operands`, `recheck.predicate.subject`) the same
grammar is written without the `{{ }}`: `ref:signups_by_week.2026-08-24.signups`, `derived:lift`,
`ext:minimum_days`. One value, one spelling, everywhere.

A token names a value; it never computes one. There is no expression language, no whitespace inside a token,
and ids never contain a dot, so a token always splits unambiguously.

## Resolution, and the three ways it fails

`check` resolves every token from the pinned manifest and stops at the first miss. The failures you will
cause while writing:

- `unresolved_reference` — the result, row key, derived id or external id is not declared. Row keys are the
  **values** of the result's `row_key` column, never a row number.
- `missing_column` — the column is not declared on that result.
- `untraced_numeral` — a digit in `memo.md` outside a token and outside the allowed list. See below.

## What may be a bare numeral in memo prose

ISO dates and timestamps; ids declared in the manifest; section numbers in a heading; a definition version
next to its id; a file path; and `{{literal:…}}`. Everything else that looks like a number fails `check`.

A durations-as-words rule follows from that: "seven days after signup" describes the definition and is
fine; a *measured* count of days is a token. Spelling a measured quantity in words to get past `check`
("doubled," "half," "most") is the violation method review is asked to look for, so bind the value instead.

## Derived values

Prefer SQL. A `derived` entry exists for arithmetic the query did not do.

| `operation` | Value | Operands |
| --- | --- | --- |
| `difference` | after − baseline, or minuend − subtrahend | **named**: `{ after, baseline }` or `{ minuend, subtrahend }`, identical units |
| `ratio` | after / baseline, or numerator / denominator | **named**: `{ after, baseline }` or `{ numerator, denominator }`, any units, yields `ratio` |
| `percent_change` | 100 × (after − baseline) / baseline | **named**: `{ after, baseline }` only, any units, yields `percent` |
| `sum` | a + b + … | positional, 1 or more, identical units |
| `min` / `max` | smallest / largest | positional, 1 or more, identical units |
| `percent_of` | 100 × a / b | positional, 2, any units, yields `percent` |

```yaml
- id: member_ebike_change
  operation: percent_change
  operands: { after: ref:rides_by_period.jan2025.member_ebike, baseline: ref:rides_by_period.jan2024.member_ebike }
  unit: percent
  display: { kind: percent, decimals: 1 }
  on_zero_denominator: not_available
  on_null: not_available
```

The three named operations take their SIGN from which operand is which, and both orders are valid arithmetic,
so `check` cannot tell a flipped pair from an intended one. A real run wrote four percent changes
baseline-then-after and rendered every one with the opposite sign — "rose by −20.6%" — and only the method
reviewer could see it.

**Choosing the vocabulary.** Use `{ after, baseline }` when the value is a before-and-after comparison:
`after` is the measured value the Claim is about, `baseline` is the earlier period, the control arm or the
reference group it is compared with. Use `{ minuend, subtrahend }` (on a `difference`) or
`{ numerator, denominator }` (on a `ratio`) when it is not a comparison — a policy minimum less what has
accumulated, a part over a whole. Those operands are not a measurement and the thing it is measured against,
so calling them `after` and `baseline` would be a false declaration. `percent_change` takes
`{ after, baseline }` only, because a percent change without a baseline is not one.

Both vocabularies are declarations of order, both clear the warning, and keys from two of them cannot be
mixed. A positional pair on one of the three still resolves and is reported as the warning
`direction_unstated`. Named operands on `sum`, `min`, `max` or `percent_of` are refused (`derived_arity`):
those operations have no direction to declare.

Every entry declares `unit`, `on_zero_denominator: not_available` and `on_null: not_available`. A derived
value may reference another derived value; a cycle is `derived_cycle`. Arithmetic runs on the saved decimal
strings exactly, never in binary floating point, and never on a rounded value.

## External sources

A number that is not a measurement is still typed evidence. `kind` is `target`, `assumption` or
`external_reference`; `source.type` is `document`, `person`, `policy`, `url` or `prior_finding`; `source`
carries a description, a date, and where it came from. A threshold the team agreed before the analysis is a
`target`; a policy minimum is an `assumption`. Both are rules for acting, so the memo says so rather than
presenting them as something the data showed.

## Units and display

- `unit` is business meaning — `users`, `ratio`, `days`, `count` — and it comes from the evidence or the
  Metric definition, not from the SQL type. `unknown` is allowed and is better than a guess.
- `display` is applied once, at render, and never before a derived calculation: `integer` (thousands
  separators), `decimal` (`decimals` places), `percent` (× 100 on a `ratio`, `%` suffix),
  `percentage_points` (× 100 on a `ratio`, ` pp` suffix), `currency_usd`, `date`, `text`.
- A difference of two `ratio` values is still `ratio`; display it as `percentage_points` so a Reader is not
  invited to read it as a percentage change.
- `null` and a zero denominator both render as "not available." They are not zero, not blank and not a dash.

## Export

`export_policy.allowed_fields` governs every path a value can take to a Reader: prose token, table cell,
chart data, chart text, derived operand. A reference to a column outside the list fails `export_policy`
wherever it appears, so list a column when you display it and leave it off when you do not.

## Before you run check

- Every token in `memo.md`, in `claims[].sentence`, `population`, `material_caveat`,
  `comparison.description`, and in every chart `title` and `description`, resolves.
- Every Claim's `evidence` array lists the values that Claim actually rests on — including the derived value
  and the external source its recheck predicate reads.
- Every column shown by a chart or table is in `allowed_fields`.
- The digest is re-pinned after the last edit.
