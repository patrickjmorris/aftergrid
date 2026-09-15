# Metric definitions are approved by an Operator; an agent may only propose them

A Metric definition carries plain-language meaning (grain, population, denominator, window, owner) and canonical SQL per adapter dialect, with a status of `proposed`, `approved` or `deprecated`. Only `approved` definitions may appear in a Finding, and only a human can set that status. Anthropic reports that bootstrapping a semantic layer with LLM-drafted definitions "produced plausible-looking definitions that encoded the very ambiguities we were trying to eliminate"; Snap's rule is that "governance is a decision, not a derivation." Letting the agent auto-approve would be faster to set up and is exactly how a plausible-but-wrong definition becomes load-bearing across every later Finding. The reconciliation Check runs the canonical SQL and compares it to the Analysis's number, so the definition is also the ground truth the checks depend on.


## Amended 2026-09-15, after independent review

From finding 9. Three classes, not one: **approved Metric definitions** (versioned, approver and reviewed revision recorded, required for any published decision metric), **Diagnostic calculations** (traceable, explicit status, allowed inside working Analyses), and **proposed** definitions. Requiring every intermediate count to be an approved business metric would make exploration too expensive; leaving definitions unversioned would make historical Findings unreadable. A definition reference in a Finding always pins a version.
