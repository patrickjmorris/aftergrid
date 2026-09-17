# Golden Questions

One file per reference case: a Question with a reviewed expected answer within tolerances, **or** an expected
abstention. A golden Question is how you find out that the Engine and this Instance still agree after a model,
skill or definition change.

`<question_id>.yaml` carries the raw ask, the Reader, the expected outcome (including `insufficient_data` and
`needs_reframing`, which are real answers), the definition ids and tables the Analysis is expected to use, the
values it must land on with their tolerances, what the Finding must state, and what it must not conclude.

The Engine ships worked examples under `fixtures/instance/analytics/golden/`. Nothing is scaffolded here,
because a golden Question is a judgement about your data that only you can make.
