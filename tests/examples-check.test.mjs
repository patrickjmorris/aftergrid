// scripts/examples-check.mjs: a committed halted draft passes only when its recorded halt explains every error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verdict, recordedHalt } from "../scripts/examples-check.mjs";

const err = (category, location) => ({ category, location, message: "", remedy: "" });

test("no errors is acceptable, halt or not", () => {
  assert.equal(verdict({ syntax: "ok", errors: [] }, null).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [] }, { status: "needs_input", stage: "clarify", reason: "x" }).ok, true);
});

test("an error with no recorded halt fails, and a syntax error always fails", () => {
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/f")] }, null).ok, false);
  assert.equal(verdict({ syntax: "invalid", errors: [err("schema", "manifest.yaml")] }, { status: "needs_attention", stage: "s", reason: "schema manifest.yaml" }).ok, false);
});

test("a recorded halt passes only the Check-level errors it names, never a result hash or digest error", () => {
  const halt = { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/falsifier_direction_holds_by_day_type: the required falsifier recorded fail" };
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true);
  // ag-falsifier-outcome-cov: the contract sharpened, so the Engine now says `check_shape` about the same
  // Check the halt names. The halt is a statement about that Check, not about one category's spelling.
  assert.equal(verdict({ syntax: "ok", errors: [err("check_shape", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [err("analytical_outcome", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [err("check_shape", "checks/some_other_check")] }, halt).ok, false, "a Check the reason does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/some_other_check")] }, halt).ok, false, "a Check the reason does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type"), err("hash_mismatch", "results/x.json")] }, halt).ok, false, "a result hash error is never a halt");
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "snapshot/inputs/0")] }, halt).ok, false, "nor an input hash error");
  assert.equal(verdict({ syntax: "ok", errors: [err("digest", "manifest.yaml#/content_digest")] }, halt).ok, false, "nor a digest error");
});

// A definition improved after the run is the Instance moving on, not the Finding breaking. The Finding is a
// faithful record of the definition as it stood; re-pinning it would edit committed run output.
test("a definition pin that moved because the Instance's definition file did is accounted for, unlike any other hash", () => {
  const halt = { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/f" };
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "manifest.yaml#/definitions/1")] }, halt).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "manifest.yaml#/definitions/1")] }, null).ok, false, "and only on a Finding whose halt is recorded");
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "manifest.yaml#/queries/0")] }, halt).ok, false, "a query file's pin is not a definition's");
});

test("recordedHalt reads only a needs_attention or needs_input progress file", () => {
  const d = mkdtempSync(join(tmpdir(), "ag-exck-"));
  assert.equal(recordedHalt(d), null);
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: clarify\nstatus: running\nreason: ''\n");
  assert.equal(recordedHalt(d), null, "a running stage is not a halt");
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: checked_analysis\nstatus: needs_attention\nreason: 'check_failed at checks/f'\n");
  assert.deepEqual(recordedHalt(d), { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/f" });
});
