// scripts/examples-check.mjs: a committed halted draft passes only when its recorded halt explains every error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verdict, recordedHalt } from "../scripts/examples-check.mjs";

const err = (category, location, message = "") => ({ category, location, message, remedy: "" });
/** The message `check` writes for a definition pin that no longer matches the file; it carries the id. */
const defPin = (n, id) => err("hash_mismatch", `manifest.yaml#/definitions/${n}`, `definition ${id} content changed since pinned`);

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
  assert.equal(verdict({ syntax: "ok", errors: [err("check_shape", "checks/some_other_check")] }, halt).ok, false, "a Check the reason does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/some_other_check")] }, halt).ok, false, "a Check the reason does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type"), err("hash_mismatch", "results/x.json")] }, halt).ok, false, "a result hash error is never a halt");
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "snapshot/inputs/0")] }, halt).ok, false, "nor an input hash error");
  assert.equal(verdict({ syntax: "ok", errors: [err("digest", "manifest.yaml#/content_digest")] }, halt).ok, false, "nor a digest error");
});

// ag-falsifier-outcome-cov: `analytical_outcome` is the Engine saying the Finding still claims `answered` over
// a falsifier that fired. That is the one thing a halt must never excuse — it is the dishonest publication the
// contract exists to stop, not a state the run can record its way out of.
test("a halt never excuses an answered Finding standing on a fired falsifier", () => {
  const halt = { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/falsifier_direction_holds_by_day_type: the falsifier recorded fail" };
  assert.equal(verdict({ syntax: "ok", errors: [err("analytical_outcome", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, false);
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true, "the other two Check categories are still accounted for");
  assert.equal(verdict({ syntax: "ok", errors: [err("check_shape", "checks/falsifier_direction_holds_by_day_type")] }, halt).ok, true);
});

// The reason names a Check by id, so the match is on the whole id and not on a fragment of one.
test("a halt reason naming falsifier_lift does not account for an error at a Check called lift", () => {
  const halt = { status: "needs_attention", stage: "s", reason: "check_failed at checks/falsifier_lift" };
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/lift")] }, halt).ok, false);
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_lift")] }, halt).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [err("check_failed", "checks/falsifier_lift.sql")] }, halt).ok, true, "the .sql spelling of the same Check still matches");
});

// A definition improved after the run is the Instance moving on, not the Finding breaking. The Finding is a
// faithful record of the definition as it stood; re-pinning it would edit committed run output. The tolerance is
// bounded: the record has to name WHICH definition moved, in the reason or in `stale_definitions`.
test("a definition pin that moved is accounted for only where the record names that definition", () => {
  const bare = { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/f", stale_definitions: [] };
  const named = { ...bare, reason: "check_failed at checks/f; the weekday_share definition was improved after the run", stale_definitions: [] };
  const listed = { ...bare, stale_definitions: ["weekday_share"] };
  assert.equal(verdict({ syntax: "ok", errors: [defPin(1, "weekday_share")] }, bare).ok, false, "an unbounded definition-pin tolerance is every definition at once");
  assert.equal(verdict({ syntax: "ok", errors: [defPin(1, "weekday_share")] }, named).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [defPin(1, "weekday_share")] }, listed).ok, true);
  assert.equal(verdict({ syntax: "ok", errors: [defPin(0, "trips_into_zone")] }, listed).ok, false, "a definition the record does not name is unexplained");
  assert.equal(verdict({ syntax: "ok", errors: [defPin(1, "weekday_share")] }, null).ok, false, "and only on a Finding whose halt is recorded");
  assert.equal(verdict({ syntax: "ok", errors: [err("hash_mismatch", "manifest.yaml#/queries/0")] }, listed).ok, false, "a query file's pin is not a definition's");
});

test("recordedHalt reads only a needs_attention or needs_input progress file, and carries stale_definitions", () => {
  const d = mkdtempSync(join(tmpdir(), "ag-exck-"));
  assert.equal(recordedHalt(d), null);
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: clarify\nstatus: running\nreason: ''\n");
  assert.equal(recordedHalt(d), null, "a running stage is not a halt");
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: checked_analysis\nstatus: needs_attention\nreason: 'check_failed at checks/f'\n");
  assert.deepEqual(recordedHalt(d), { status: "needs_attention", stage: "checked_analysis", reason: "check_failed at checks/f", stale_definitions: [] });
  writeFileSync(join(d, "analysis-progress.yaml"), "stage: checked_analysis\nstatus: needs_attention\nreason: 'x'\nstale_definitions: [weekday_share]\n");
  assert.deepEqual(recordedHalt(d).stale_definitions, ["weekday_share"]);
});
