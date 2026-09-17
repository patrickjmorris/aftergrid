// The one admission rule shared by adapters: a read is admitted when the largest planned scan is under the cap,
// or, when the estimate is unknown, only because enforced resource limits apply. A row LIMIT never bounds
// admission (spec: Adapters). Both adapters call this; `capture` calls it per table, because a whole-table copy
// is a scan of the whole table (docs/contracts/adapters.md, "Large sources: the windowed Instance pattern").
import type { Admission, Estimate, ResourceLimits } from "./contract.ts";

/**
 * The one wording for a capture refused by admission, shared by every adapter. `capture` copies whole tables by
 * contract, so the read it would perform is the table: when the planner puts that scan over the cap there is no
 * flag that narrows it, and the message says the observed scan estimate and the limit it crossed. The remedy —
 * the bounded table built beside the Instance — is named by `src/commands/capture.ts`, which owns remedies.
 */
export function captureRefusal(table: string, scan_rows: number, cap: number): string {
  return `capture of ${table} is refused: the planner estimates a whole-table scan of ${scan_rows} rows, over this Instance's admission limit of ${cap} rows. `
    + "capture copies whole tables by contract — there is no window, predicate or row-bound flag that would narrow this read — so nothing was read and nothing was written";
}

export function admit(estimate: Estimate, cap: number, limits: ResourceLimits): Admission {
  if (estimate.status === "estimated") {
    return estimate.scan_rows <= cap
      ? { decision: "admitted", basis: "estimate_under_cap", estimate, cap }
      : { decision: "rejected", reason: `planned scan of ${estimate.scan_rows} rows exceeds the cap of ${cap}`, estimate };
  }
  return { decision: "admitted", basis: "unknown_estimate_with_enforced_limits", estimate, limits };
}
