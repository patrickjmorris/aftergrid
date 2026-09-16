// The one admission rule shared by adapters: a read is admitted when the largest planned scan is under the cap,
// or, when the estimate is unknown, only because enforced resource limits apply. A row LIMIT never bounds
// admission (spec: Adapters). src/adapters/duckdb.ts keeps an identical private copy from before this module
// existed; it is left untouched by ag-postgres-adapter-dna and should adopt this function when it is next edited.
import type { Admission, Estimate, ResourceLimits } from "./contract.ts";

export function admit(estimate: Estimate, cap: number, limits: ResourceLimits): Admission {
  if (estimate.status === "estimated") {
    return estimate.scan_rows <= cap
      ? { decision: "admitted", basis: "estimate_under_cap", estimate, cap }
      : { decision: "rejected", reason: `planned scan of ${estimate.scan_rows} rows exceeds the cap of ${cap}`, estimate };
  }
  return { decision: "admitted", basis: "unknown_estimate_with_enforced_limits", estimate, limits };
}
