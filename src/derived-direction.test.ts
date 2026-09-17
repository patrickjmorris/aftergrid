// Seam: named derived operands (bead ag-derived-named-operands-kbk).
//
// `difference`, `ratio` and `percent_change` take their SIGN from which operand is which, and both orders are
// valid arithmetic. That is not a hypothetical: a real run wrote four `percent_change` values
// baseline-then-after, every rendered change carried the opposite sign ("rose by −20.6%"), `aftergrid check`
// could not see it, and only the method reviewer caught it (examples/nyc-open-data/docs/run-log.md, Citi Bike
// run 1). So the three accept the named pair `{ after, baseline }`, which makes the direction a declared fact.
//
// What is asserted here: the two forms compute the same number, the named form fixes the sign, the positional
// form is reported as `direction_unstated` and the named form is not, the named pair is refused on an
// operation with no direction, the schema accepts both, and the sign reaches the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { checkArtifact } from "./commands/check.ts";
import { validateAnalysisFile, analysisWarnings } from "./analysis/validate.ts";
import { displayValue, loadResults } from "./render/values.ts";
// @ts-ignore: the shared arithmetic and the one digest implementation.
import { calculate, operandList, operandRefs, DIRECTIONAL_OPERATIONS } from "../scripts/fixture-safety.mjs";
// @ts-ignore: shared ESM validation library.
import { digestOf, schemaErrors } from "../scripts/lib/validate-finding.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_INSTANCE = join(REPO, "fixtures/instance");
const NUMERIC = "2026-07-20-onboarding-checklist-retention";

const CHECKLIST_RATE = "ref:retention_by_arm.checklist.retained_7d_rate";
const CONTROL_RATE = "ref:retention_by_arm.control.retained_7d_rate";

/** A throwaway copy of the fixture Instance, without `decisions/`: every case here rewrites the manifest. */
function copyInstance(t: { after: (fn: () => void) => void }): string {
  const root = join(mkdtempSync(join(tmpdir(), "ag-derived-")), "instance");
  t.after(() => rmSync(join(root, ".."), { recursive: true, force: true }));
  cpSync(FIXTURE_INSTANCE, root, { recursive: true });
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  return root;
}

const findingDir = (root: string) => join(root, "analytics", "findings", NUMERIC);

/** Rewrite the copied exemplar's manifest through `mutate`, re-pin the digest, drop the now-stale trust. */
function mutate(root: string, fn: (m: any) => void): { dir: string; manifest: any } {
  const dir = findingDir(root);
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  fn(m);
  m.attestations = [];
  m.reviews = [];
  m.content_digest = digestOf(m, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return { dir, manifest: m };
}

const percentChange = (operands: unknown) => ({
  id: "rate_change", operation: "percent_change", operands,
  unit: "percent", display: { kind: "percent", decimals: 1 },
  on_zero_denominator: "not_available", on_null: "not_available",
});

/* ------------------------------------------------- the arithmetic */

test("the named pair computes what the positional pair computes, and is the thing that fixes the sign", () => {
  const after = { value: "0.34775641025641024", unit: "ratio" };
  const baseline = { value: "0.28483920367534454", unit: "ratio" };

  for (const [operation, unit] of [["percent_change", "percent"], ["difference", "ratio"], ["ratio", "ratio"]] as const) {
    const positional = calculate(operation, [after, baseline], unit);
    const named = calculate(operation, { after, baseline }, unit);
    assert.deepEqual(named, positional, `${operation}: naming the operands changes the declaration, never the value`);

    // And the flipped pair is a different number that is just as valid arithmetically. This is the whole
    // reason the names exist: nothing about the value itself says the order was the intended one.
    const flipped = calculate(operation, { after: baseline, baseline: after }, unit);
    assert.notDeepEqual(flipped, named, `${operation}: the reverse order is a different value`);
    if (operation !== "ratio") assert.ok(named!.n > 0n && flipped!.n < 0n, `${operation}: the operand order decides the sign`);
  }
});

test("named operands are refused on an operation with no direction, and only on the shape this contract defines", () => {
  const a = { value: "1", unit: "users" }, b = { value: "2", unit: "users" };
  for (const operation of ["sum", "min", "max", "percent_of"]) {
    assert.throws(() => operandList(operation, { after: CHECKLIST_RATE, baseline: CONTROL_RATE }, "at"),
      (e: any) => e.category === "derived_arity" && /direction/.test(e.message),
      `${operation} has no direction to declare`);
  }
  for (const operation of DIRECTIONAL_OPERATIONS) {
    assert.deepEqual(operandList(operation, { after: "ref:r.k.c", baseline: "ref:r.k.d" }, "at"), ["ref:r.k.c", "ref:r.k.d"],
      `${operation} normalises to [after, baseline]`);
    assert.throws(() => operandList(operation, { after: "ref:r.k.c" }, "at"), (e: any) => e.category === "derived_arity");
    assert.throws(() => operandList(operation, { after: "ref:r.k.c", baseline: "ref:r.k.d", extra: "ref:r.k.e" }, "at"), (e: any) => e.category === "derived_arity");
    assert.throws(() => operandList(operation, "ref:r.k.c", "at"), (e: any) => e.category === "derived_arity");
  }
  assert.deepEqual(operandList("sum", [a, b], "at"), [a, b], "a positional list is returned unchanged");
  assert.deepEqual(operandRefs({ operation: "difference", operands: { after: "ref:r.k.c", baseline: "ref:r.k.d" } }), ["ref:r.k.c", "ref:r.k.d"]);
  assert.deepEqual(operandRefs({ operation: "sum", operands: ["ref:r.k.c"] }), ["ref:r.k.c"]);
});

/* ------------------------------------------------- the schema */

test("the manifest schema accepts both operand forms, and the named one only as exactly { after, baseline }", (t) => {
  const root = copyInstance(t);
  const dir = findingDir(root);
  const base: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  const withDerived = (operands: unknown) => {
    const m = structuredClone(base);
    m.derived.push(percentChange(operands));
    return schemaErrors(m, REPO) as { category: string; location: string }[];
  };
  assert.deepEqual(withDerived({ after: CHECKLIST_RATE, baseline: CONTROL_RATE }), [], "the named pair is schema-valid");
  assert.deepEqual(withDerived([CHECKLIST_RATE, CONTROL_RATE]), [], "the positional list is still schema-valid");
  assert.ok(withDerived({ after: CHECKLIST_RATE }).length, "a named pair missing baseline is not a pair");
  assert.ok(withDerived({ after: CHECKLIST_RATE, baseline: CONTROL_RATE, previous: CONTROL_RATE }).length, "no third operand name is defined");
  assert.ok(withDerived({ after: CHECKLIST_RATE, baseline: "not a reference" }).length, "a named operand is still a value reference");
});

/* ------------------------------------------------- what check reports */

test("a positional difference, ratio or percent change is reported as direction_unstated; the named pair is not", (t) => {
  const root = copyInstance(t);

  // The exemplar's three lifts are already named, so it starts with nothing to say.
  assert.deepEqual(checkArtifact({ dir: findingDir(root), mode: "artifact" }).warnings.filter((w) => w.category === "direction_unstated"), []);

  const positional = mutate(root, (m) => m.derived.push(percentChange([CHECKLIST_RATE, CONTROL_RATE])));
  const reported = checkArtifact({ dir: positional.dir, mode: "artifact" });
  assert.deepEqual(reported.errors, [], JSON.stringify(reported.errors));
  const warned = reported.warnings.filter((w) => w.category === "direction_unstated");
  assert.equal(warned.length, 1, JSON.stringify(reported.warnings));
  assert.equal(warned[0]!.location, `manifest.yaml#/derived/${positional.manifest.derived.length - 1}`);
  assert.match(warned[0]!.message, /rate_change/, "the warning names the entry");
  assert.match(warned[0]!.remedy ?? "", /after: <ref>, baseline: <ref>/, "the remedy names the named form");

  // Naming the same pair, with the same references in the same order, leaves nothing to report.
  const named = mutate(root, (m) => {
    m.derived[m.derived.length - 1]!.operands = { after: CHECKLIST_RATE, baseline: CONTROL_RATE };
  });
  const clean = checkArtifact({ dir: named.dir, mode: "artifact" });
  assert.deepEqual(clean.errors, [], JSON.stringify(clean.errors));
  assert.deepEqual(clean.warnings.filter((w) => w.category === "direction_unstated"), []);
});

test("named operands on an operation with no direction are refused by check, not warned about", (t) => {
  const root = copyInstance(t);
  const { dir } = mutate(root, (m) => m.derived.push({
    id: "named_total", operation: "sum",
    operands: { after: "ref:retention_by_arm.checklist.signups", baseline: "ref:retention_by_arm.control.signups" },
    unit: "users", display: { kind: "integer" }, on_zero_denominator: "not_available", on_null: "not_available",
  }));
  const report = checkArtifact({ dir, mode: "artifact" });
  assert.ok(report.errors.some((e) => e.category === "derived_arity" && /^manifest\.yaml#\/derived\/\d+$/.test(e.location)),
    JSON.stringify(report.errors));
  assert.deepEqual(report.warnings.filter((w) => w.category === "direction_unstated"), [], "a refusal is not also a warning");
});

/* ------------------------------------------------- what a Reader sees */

test("the sign a named percent change displays is the one the manifest declares", (t) => {
  const root = copyInstance(t);
  const dir = findingDir(root);
  const rendered = (operands: unknown) => {
    const { manifest } = mutate(root, (m) => {
      m.derived = m.derived.filter((d: any) => d.id !== "rate_change");
      m.derived.push(percentChange(operands));
    });
    return displayValue(manifest, loadResults(dir, manifest), "derived:rate_change");
  };
  // The checklist arm's rate is the higher one, so declaring it as `after` is a rise and declaring it as the
  // `baseline` is a fall. Both are valid arithmetic on the same two cells; the names are what decides.
  assert.equal(rendered({ after: CHECKLIST_RATE, baseline: CONTROL_RATE }), "22.1%");
  assert.equal(rendered({ after: CONTROL_RATE, baseline: CHECKLIST_RATE }), "-18.1%");
  assert.equal(rendered([CHECKLIST_RATE, CONTROL_RATE]), "22.1%", "the positional pair displays the same value it always did");
});

/* ------------------------------------------------- the same shape in analysis.yaml */

test("requested_derived carries the same two forms, warns on the positional one and refuses the wrong operation", (t) => {
  const root = copyInstance(t);
  const dir = findingDir(root);
  const manifest: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  const base: any = parseYaml(readFileSync(join(REPO, "fixtures/runs/7qg-onboarding/analysis.yaml"), "utf8"));
  const requesting = (entry: Record<string, unknown>) => {
    const analysis = structuredClone(base);
    analysis.requested_derived = [entry];
    writeFileSync(join(dir, "analysis.yaml"), toYaml(analysis, { lineWidth: 0 }));
    return { problems: validateAnalysisFile(dir, manifest), warnings: analysisWarnings(dir) };
  };
  const requested = (operands: unknown) => ({ id: "rate_change", operation: "percent_change", operands, unit: "percent", display: { kind: "percent", decimals: 1 } });

  const named = requesting(requested({ after: CHECKLIST_RATE, baseline: CONTROL_RATE }));
  assert.deepEqual(named.problems, [], JSON.stringify(named.problems));
  assert.deepEqual(named.warnings, [], "a named request has nothing left to say");

  const positional = requesting(requested([CHECKLIST_RATE, CONTROL_RATE]));
  assert.deepEqual(positional.problems, [], JSON.stringify(positional.problems));
  assert.equal(positional.warnings.length, 1, JSON.stringify(positional.warnings));
  assert.equal(positional.warnings[0]!.category, "direction_unstated");
  assert.equal(positional.warnings[0]!.location, "analysis.yaml#/requested_derived/0/operands");

  // A named operand still has to resolve to a cell that exists.
  const unresolved = requesting(requested({ after: CHECKLIST_RATE, baseline: "ref:retention_by_arm.no_such_arm.retained_7d_rate" }));
  assert.ok(unresolved.problems.some((p) => p.category === "unresolved_reference" && p.location === "analysis.yaml#/requested_derived/0/operands/baseline"),
    JSON.stringify(unresolved.problems));

  const wrongOperation = requesting({ id: "named_total", operation: "sum", operands: { after: CHECKLIST_RATE, baseline: CONTROL_RATE }, unit: "ratio" });
  assert.ok(wrongOperation.problems.some((p) => p.category === "derived_arity" && p.location === "analysis.yaml#/requested_derived/0/operands"),
    JSON.stringify(wrongOperation.problems));
});
