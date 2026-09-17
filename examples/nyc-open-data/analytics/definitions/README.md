# Metric definitions and Diagnostic calculations

One markdown file per definition, named `<definition_id>.md`. Shape, front matter and the content-hash rule:
`docs/contracts/instance-layout.md`.

Two separate axes, never collapsed into one word:

- `kind` is `metric` or `diagnostic`. A Diagnostic calculation may be used inside an Analysis with its status
  shown; it is never the headline of a Finding.
- `lifecycle` is `proposed`, `approved` or `deprecated`. **The `lifecycle` line is display only.** Approval is
  the `approval:` attestation underneath it: an approver, a date and the content hash of what they approved.
  Editing `lifecycle: approved` by hand approves nothing, and `aftergrid check` says so.

A published decision metric must cite an approved definition at a pinned version. Anything else belongs in the
Analysis with its status visible.

`example_definition.md` is an example, not a definition of yours: it is `proposed`, it carries no approval, and
its SQL runs against nothing. Delete it once you have written a real one.
