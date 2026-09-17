// Seam: named derived operands (beads ag-derived-named-operands-kbk, ag-derived-direction-none-9kp).
//
// `difference`, `ratio` and `percent_change` take their SIGN from which operand is which, and both orders are
// valid arithmetic. That is not a hypothetical: a real run wrote four `percent_change` values
// baseline-then-after, every rendered change carried the opposite sign ("rose by −20.6%"), `aftergrid check`
// could not see it, and only the method reviewer caught it (examples/nyc-open-data/docs/run-log.md, Citi Bike
// run 1). So the three accept NAMED operands, which make the direction a declared fact.
//
// There are two vocabularies, because not every signed difference or ratio is a before-and-after comparison.
// `{ after, baseline }` is one. A policy minimum less what has accumulated, and a part over a whole, are not:
// they are `{ minuend, subtrahend }` on a `difference` and `{ numerator, denominator }` on a `ratio`. Before
// the second vocabulary existed those entries had to stay positional and carry `direction_unstated` forever,
// with no true remedy — naming them after/baseline would have been a false declaration.
//
// What is asserted here: every form computes the same number, a named form fixes the sign, the positional form
// is reported as `direction_unstated` and no named form is, a named pair is refused on an operation that does
// not take it, the schema accepts each vocabulary and no mixture of them, the exemplars raise the warning
// nowhere, and each vocabulary reaches the page in the words that match what it means.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { checkArtifact } from "./commands/check.ts";
import { render } from "./commands/render.ts";
import { validateAnalysisFile, analysisWarnings } from "./analysis/validate.ts";
import { displayValue, loadResults } from "./render/values.ts";
// @ts-ignore: the shared arithmetic and the one digest implementation.
import { calculate, operandList, operandRefs, operandVocabulary, DIRECTIONAL_OPERATIONS, OPERAND_VOCABULARIES } from "../scripts/fixture-safety.mjs";
// @ts-ignore: shared ESM validation library.
import { digestOf, schemaErrors } from "../scripts/lib/validate-finding.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_INSTANCE = join(REPO, "fixtures/instance");
const FINDINGS = join(FIXTURE_INSTANCE, "analytics/findings");
const NUMERIC = "2026-07-20-onboarding-checklist-retention";
const PRICE = "2026-09-15-price-change-cancellations";

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

/** Rewrite a copied exemplar's manifest through `mutate`, re-pin the digest, drop the now-stale trust. */
function mutateIn(dir: string, fn: (m: any) => void): { dir: string; manifest: any } {
  const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  fn(m);
  m.attestations = [];
  m.reviews = [];
  m.content_digest = digestOf(m, dir);
  writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  return { dir, manifest: m };
}

const mutate = (root: string, fn: (m: any) => void) => mutateIn(findingDir(root), fn);

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

/* ------------------------------------------------- the second vocabulary (ag-derived-direction-none-9kp) */

test("each vocabulary computes what the positional pair computes, and declares an order the positional pair does not", () => {
  const minuend = { value: "28", unit: "days" }, subtrahend = { value: "7", unit: "days" };
  assert.deepEqual(calculate("difference", { minuend, subtrahend }, "days"), calculate("difference", [minuend, subtrahend], "days"),
    "minuend − subtrahend is the same arithmetic as the positional [a, b]");
  assert.deepEqual(calculate("difference", { minuend, subtrahend }, "days"), { n: 21n, d: 1n });
  assert.deepEqual(calculate("difference", { minuend: subtrahend, subtrahend: minuend }, "days"), { n: -21n, d: 1n },
    "the reverse order is a different, equally valid number — which is why the order is declared");

  const numerator = { value: "3", unit: "users" }, denominator = { value: "4", unit: "users" };
  assert.deepEqual(calculate("ratio", { numerator, denominator }, "ratio"), calculate("ratio", [numerator, denominator], "ratio"));
  assert.deepEqual(calculate("ratio", { numerator, denominator }, "ratio"), { n: 3n, d: 4n });
  assert.deepEqual(calculate("ratio", { numerator: denominator, denominator: numerator }, "ratio"), { n: 4n, d: 3n });

  // Every named form is a declaration of order, so `operandRefs` reads every one of them for traversal.
  for (const v of OPERAND_VOCABULARIES as { keys: string[] }[]) {
    const operands = Object.fromEntries(v.keys.map((k, i) => [k, `ref:r.k.c${i}`]));
    assert.deepEqual(operandVocabulary(operands), v);
    assert.deepEqual(operandRefs({ operation: v.keys[0] === "after" ? "percent_change" : "difference", operands }), ["ref:r.k.c0", "ref:r.k.c1"]);
  }
  // A mixture of two vocabularies names no order at all, so it is not a vocabulary and carries no refs.
  assert.equal(operandVocabulary({ after: "ref:r.k.c", denominator: "ref:r.k.d" }), null);
  assert.deepEqual(operandRefs({ operation: "ratio", operands: { after: "ref:r.k.c", denominator: "ref:r.k.d" } }), []);
});

test("a vocabulary is refused on an operation whose value it does not describe", () => {
  const a = { value: "1", unit: "users" }, b = { value: "2", unit: "users" };
  const refused = (operation: string, operands: unknown) =>
    assert.throws(() => operandList(operation, operands, "at"), (e: any) => e.category === "derived_arity", `${operation} ${JSON.stringify(operands)}`);

  // A ratio is not a subtraction and a difference is not a division.
  refused("ratio", { minuend: "ref:r.k.c", subtrahend: "ref:r.k.d" });
  refused("difference", { numerator: "ref:r.k.c", denominator: "ref:r.k.d" });
  // A percent change without a baseline is not a percent change, so it takes after/baseline and nothing else.
  refused("percent_change", { minuend: "ref:r.k.c", subtrahend: "ref:r.k.d" });
  refused("percent_change", { numerator: "ref:r.k.c", denominator: "ref:r.k.d" });
  assert.deepEqual(operandList("percent_change", { after: "ref:r.k.c", baseline: "ref:r.k.d" }, "at"), ["ref:r.k.c", "ref:r.k.d"]);
  // The directionless operations take no named pair in any vocabulary.
  for (const operation of ["sum", "min", "max", "percent_of"]) {
    refused(operation, { minuend: "ref:r.k.c", subtrahend: "ref:r.k.d" });
    refused(operation, { numerator: "ref:r.k.c", denominator: "ref:r.k.d" });
  }
  // A half pair and a mixed pair declare nothing.
  refused("difference", { minuend: "ref:r.k.c" });
  refused("ratio", { numerator: "ref:r.k.c", baseline: "ref:r.k.d" });
  assert.deepEqual(operandList("difference", [a, b], "at"), [a, b], "a positional list is still returned unchanged");
});

test("the schema accepts each vocabulary on the operations that take it, and no mixture of two", (t) => {
  const root = copyInstance(t);
  const base: any = parseYaml(readFileSync(join(findingDir(root), "manifest.yaml"), "utf8"));
  const errorsFor = (entry: Record<string, unknown>) => {
    const m = structuredClone(base);
    m.derived.push({ unit: "ratio", display: { kind: "decimal", decimals: 2 }, on_zero_denominator: "not_available", on_null: "not_available", ...entry });
    return schemaErrors(m, REPO) as { category: string; location: string }[];
  };
  const SIGNUPS = "ref:retention_by_arm.checklist.signups", CONTROL_SIGNUPS = "ref:retention_by_arm.control.signups";

  assert.deepEqual(errorsFor({ id: "short_by", operation: "difference", operands: { minuend: SIGNUPS, subtrahend: CONTROL_SIGNUPS } }), [], "{ minuend, subtrahend } is schema-valid");
  assert.deepEqual(errorsFor({ id: "share", operation: "ratio", operands: { numerator: SIGNUPS, denominator: CONTROL_SIGNUPS } }), [], "{ numerator, denominator } is schema-valid");
  // The schema knows the shapes, not which operation takes which — that refusal is `derived_arity`, above.
  // What the schema alone must refuse is a pair that is not one of the shapes at all.
  assert.ok(errorsFor({ id: "mixed", operation: "difference", operands: { after: SIGNUPS, denominator: CONTROL_SIGNUPS } }).length, "keys from two vocabularies are not a named pair");
  assert.ok(errorsFor({ id: "mixed", operation: "ratio", operands: { numerator: SIGNUPS, baseline: CONTROL_SIGNUPS } }).length, "nor the other mixture");
  assert.ok(errorsFor({ id: "partial", operation: "difference", operands: { minuend: SIGNUPS } }).length, "a half pair is not a pair");
  assert.ok(errorsFor({ id: "extra", operation: "ratio", operands: { numerator: SIGNUPS, denominator: CONTROL_SIGNUPS, baseline: CONTROL_SIGNUPS } }).length, "no third operand name is defined");
  assert.ok(errorsFor({ id: "unref", operation: "ratio", operands: { numerator: SIGNUPS, denominator: "not a reference" } }).length, "a named operand is still a value reference");
});

test("every reviewed exemplar declares the direction of every difference, ratio and percent change", () => {
  // The point of the second vocabulary: nothing under fixtures/instance carries `direction_unstated` any
  // more. The price exemplars used to, with no remedy that was not a false label.
  const names = readdirSync(FINDINGS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(names.includes(PRICE), "the price exemplar is the case this bead is about");
  for (const name of names) {
    const report = checkArtifact({ dir: join(FINDINGS, name), mode: "artifact" });
    assert.deepEqual(report.warnings.filter((w) => w.category === "direction_unstated"), [], name);
    // And that is a property of the manifests, not of what `check` happens to walk.
    const m: any = parseYaml(readFileSync(join(FINDINGS, name, "manifest.yaml"), "utf8"));
    for (const d of m.derived ?? []) {
      if (!DIRECTIONAL_OPERATIONS.includes(d.operation)) continue;
      assert.ok(operandVocabulary(d.operands), `${name}: ${d.id} (${d.operation}) leaves its direction unstated`);
    }
  }
});

/* ------------------------------------------------- what a Reader sees */

test("the render names each vocabulary in the words that match what it means", async (t) => {
  const root = copyInstance(t);

  // A before-and-after comparison: the onboarding exemplar's lift, checklist arm against control arm.
  const numeric = await render({ dir: findingDir(root), generatedAt: "2026-09-17T12:00:00Z" });
  assert.deepEqual(numeric.errors, [], JSON.stringify(numeric.errors));
  const numericHtml = readFileSync(join(findingDir(root), "render", "finding.html"), "utf8");
  assert.match(numericHtml, /difference of after 34\.8% <span class="flag">\(retention_by_arm\.checklist\.retained_7d_rate\)<\/span> against baseline 28\.5%/, "the popover");
  assert.match(numericHtml, /<code>lift<\/code> is the difference of after <code>ref:retention_by_arm\.checklist\.retained_7d_rate<\/code> against baseline <code>ref:retention_by_arm\.control\.retained_7d_rate<\/code>/, "the calculated list");

  // Not a comparison: a policy minimum less what has accumulated, and a part over a whole.
  const priceDir = join(root, "analytics", "findings", PRICE);
  // The memo is inside the content digest, so it is written before `mutateIn` re-pins.
  writeFileSync(join(priceDir, "memo.md"),
    readFileSync(join(priceDir, "memo.md"), "utf8") +
    "- So far {{derived:cancel_share}} of the subscriptions active at the change have cancelled. That is a share of a whole, not a comparison with anything.\n");
  mutateIn(priceDir, (m) => {
    m.derived.push({
      id: "cancel_share", operation: "ratio",
      operands: { numerator: "ref:since_change.post.cancellations", denominator: "ref:since_change.post.active_at_change" },
      unit: "ratio", display: { kind: "percent", decimals: 1 },
      on_zero_denominator: "not_available", on_null: "not_available",
      description: "Cancellations so far as a share of the subscriptions active when the price changed.",
    });
    m.claims.find((c: any) => c.id === "c1").evidence.push("derived:cancel_share");
  });

  const price = await render({ dir: priceDir, generatedAt: "2026-09-17T12:00:00Z" });
  assert.deepEqual(price.errors, [], JSON.stringify(price.errors));
  const priceHtml = readFileSync(join(priceDir, "render", "finding.html"), "utf8");
  assert.match(priceHtml, /difference of 28 <span class="flag">\(ext:minimum_days\)<\/span> less 7 <span class="flag">\(since_change\.post\.days_elapsed\)<\/span>/, "minuend less subtrahend, in the popover");
  assert.match(priceHtml, /<code>days_short<\/code> is the difference of <code>ext:minimum_days<\/code> less <code>ref:since_change\.post\.days_elapsed<\/code>/, "minuend less subtrahend, in the calculated list");
  assert.match(priceHtml, /ratio of 67 <span class="flag">\(since_change\.post\.cancellations\)<\/span> over /, "numerator over denominator, in the popover");
  assert.match(priceHtml, /<code>cancel_share<\/code> is the ratio of <code>ref:since_change\.post\.cancellations<\/code> over <code>ref:since_change\.post\.active_at_change<\/code>/, "numerator over denominator, in the calculated list");
  // The words a vocabulary does not own stay out of its way.
  assert.doesNotMatch(priceHtml, /difference of after/, "a subtraction that is not a comparison is never described as one");
});

/* ------------------------------------------------- the same vocabularies in analysis.yaml */

test("requested_derived carries every vocabulary, resolves each named operand and refuses the wrong one", (t) => {
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

  const minuend = requesting({ id: "rate_gap", operation: "difference", operands: { minuend: CHECKLIST_RATE, subtrahend: CONTROL_RATE }, unit: "ratio" });
  assert.deepEqual(minuend.problems, [], JSON.stringify(minuend.problems));
  assert.deepEqual(minuend.warnings, [], "a declared order has nothing left to say");

  const numerator = requesting({ id: "rate_share", operation: "ratio", operands: { numerator: CHECKLIST_RATE, denominator: CONTROL_RATE }, unit: "ratio" });
  assert.deepEqual(numerator.problems, [], JSON.stringify(numerator.problems));
  assert.deepEqual(numerator.warnings, []);

  // A named operand still has to resolve to a cell that exists, at its own key's pointer.
  const unresolved = requesting({ id: "rate_gap", operation: "difference", operands: { minuend: CHECKLIST_RATE, subtrahend: "ref:retention_by_arm.no_such_arm.retained_7d_rate" }, unit: "ratio" });
  assert.ok(unresolved.problems.some((p) => p.category === "unresolved_reference" && p.location === "analysis.yaml#/requested_derived/0/operands/subtrahend"),
    JSON.stringify(unresolved.problems));

  const wrongVocabulary = requesting({ id: "rate_change", operation: "percent_change", operands: { numerator: CHECKLIST_RATE, denominator: CONTROL_RATE }, unit: "percent" });
  assert.ok(wrongVocabulary.problems.some((p) => p.category === "derived_arity" && p.location === "analysis.yaml#/requested_derived/0/operands"),
    JSON.stringify(wrongVocabulary.problems));

  const mixed = requesting({ id: "rate_gap", operation: "difference", operands: { after: CHECKLIST_RATE, subtrahend: CONTROL_RATE }, unit: "ratio" });
  assert.ok(mixed.problems.some((p) => p.category === "analysis_contract" && p.location === "analysis.yaml#/requested_derived/0/operands"),
    JSON.stringify(mixed.problems));
});

test("the direction_unstated remedy names every vocabulary, so a pair with no after/baseline reading has one", (t) => {
  const root = copyInstance(t);
  const positional = mutate(root, (m) => m.derived.push(percentChange([CHECKLIST_RATE, CONTROL_RATE])));
  const warned = checkArtifact({ dir: positional.dir, mode: "artifact" }).warnings.find((w) => w.category === "direction_unstated");
  assert.ok(warned, "the positional pair is still reported");
  assert.match(warned!.remedy ?? "", /after: <ref>, baseline: <ref>/);
  assert.match(warned!.remedy ?? "", /minuend: <ref>, subtrahend: <ref>/);
  assert.match(warned!.remedy ?? "", /numerator: <ref>, denominator: <ref>/);
});
