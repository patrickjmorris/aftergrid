# Provisional sign-off records

The one narrow bridge ADR 0006 (amended) allows: an exploratory read of a **non-sensitive unverified source**,
recorded as `<id>.yaml` in this directory. Shape, every failure code and what is deliberately not verified:
`docs/contracts/hook.md`.

What this directory does **not** do:

- It does not grant database permissions. A read-only role is still the boundary.
- It does not bridge privacy limits, export policy or execution limits. Those have no bridge.
- An approver *name* is editable text and authorizes nothing on its own: a record needs a reference
  (`github_pr_review`, `github_issue_comment` or `signed_note`) that a Finding pull request cannot mint.
- A result read under a provisional sign-off stays provisional. The validator refuses to render it to a Reader.

`log.jsonl` is appended to on every evaluation, allowed or blocked.
