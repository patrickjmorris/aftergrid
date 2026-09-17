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

test("a recorded halt passes only the check_failed it names, never a hash or digest error", () => {
  const halt = { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/falsifier_direction_holds_by_day_type: the required falsifier recorded fail" };
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/some_other_check")] }, halt).ok, false, "a Check the reason does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type"), err("hash_mismatch", "results/x.json")] }, halt).ok, false, "a hash error is never a halt");
});

test("recordedHalt reads only a needs_attention or needs_input progress file", () => {
  const d = mkdtempSync(join(tmpdir(), "ag-exck-"));
  assert.equal(recordedHalt(d), null);
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: clarify\nstatus: running\nreason: ''\n");
  assert.equal(recordedHalt(d), null, "a running stage is not a halt");
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: checked_analysis\nstatus: needs_attention\nreason: 'check_failed at checks/f'\n");
  assert.deepEqual(recordedHalt(d), { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/f" });
});
