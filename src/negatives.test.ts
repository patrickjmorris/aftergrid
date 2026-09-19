// ag-evidence-negatives-422: every seam-1 negative fixture must fail for its own declared reason, and the
// controls must pass. A negative that fails for an unrelated reason (a stale review, a missing approval) proves
// nothing, so each case declares the categories its one defect may produce and nothing else is tolerated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { check } from "./commands/check.ts";
import { render } from "./commands/render.ts";
import { CASES, buildNegatives, listTree, NEGATIVES_DIR } from "./negatives-build.ts";
// @ts-ignore: shared ESM validation library — the one digest implementation.
import { digestOf } from "../scripts/lib/validate-finding.mjs";

type Expected = {
  case: string;
  layer: string;
  expect: "error" | "pass" | "readiness";
  category: string;
  location_pattern: string;
  defect: string;
  description: string;
  also?: string[];
  also_warnings?: string[];
  reason_pattern?: string;
  render?: { refused?: boolean; must_contain?: string[]; must_not_contain?: string[] };
};

/** Non-case entries at the instance root: the Instance the cases live in, plus the hand-written index. */
const INSTANCE_FILES = new Set(["aftergrid.yaml", "readers.md", "README.md", "definitions"]);

const caseNames = (): string[] =>
  readdirSync(NEGATIVES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !INSTANCE_FILES.has(e.name))
    .map((e) => e.name)
    .sort();

function copyFixtures(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(), "ag-negatives-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(NEGATIVES_DIR, root, { recursive: true });
  return root;
}

const expectationFor = (root: string, name: string): Expected => parseYaml(readFileSync(join(root, name, "expected.yaml"), "utf8")) as Expected;

test("every negative fixture fails for its own declared reason, and the controls pass with valid evidence", async (t) => {
  const root = copyFixtures(t);
  const names = caseNames();
  assert.equal(names.length, CASES.length, "every generated case is on disk");

  for (const name of names) {
    const where = `case ${name}`;
    const exp = expectationFor(root, name);
    assert.equal(exp.case, name, `${where}: expected.yaml names its own directory`);
    const report = await check({ dir: join(root, name), mode: "artifact" });
    const seen = report.errors.map((e) => `${e.category} at ${e.location}`).join(", ");

    // A negative never rests on a stale review: that is a warning about the review, not about the evidence.
    const warned = new Set(report.warnings.map((w) => w.category));
    for (const w of warned) assert.ok((exp.also_warnings ?? []).includes(w), `${where}: undeclared warning ${w}`);

    // An Operator acts on a location. An error with an empty one is one they cannot act on, and a `pass` or
    // `readiness` case that names a category nothing raises describes an error the Engine does not emit.
    for (const p of [...report.errors, ...report.warnings]) assert.notEqual(p.location, "", `${where}: ${p.category} was reported with no location: ${p.message}`);

    if (exp.expect === "error") {
      const allowed = new Set([exp.category, ...(exp.also ?? [])]);
      assert.notEqual(exp.location_pattern, "", `${where}: an error case declares where it fails`);
      assert.ok(
        report.errors.some((e) => e.category === exp.category && new RegExp(exp.location_pattern).test(e.location)),
        `${where}: expected ${exp.category} at /${exp.location_pattern}/, got: ${seen || "no errors"}`,
      );
      for (const e of report.errors) assert.ok(allowed.has(e.category), `${where}: also failed for an unrelated reason: ${e.category} at ${e.location}`);
      assert.notEqual(report.evidence, "valid", `${where}: evidence must not be valid`);
      assert.notEqual(report.readiness, "ready", `${where}: a broken Finding is never publication ready`);
    } else {
      assert.equal(exp.category, "none", `${where}: a case that reports no error names no category`);
      assert.equal(exp.location_pattern, "", `${where}: a case that reports no error names no location`);
      assert.deepEqual(report.errors, [], `${where}: a control must pass`);
      assert.equal(report.evidence, "valid", `${where}: evidence valid`);
      assert.equal(report.content, "complete", `${where}: the controls are complete Findings`);
    }

    if (exp.expect === "readiness") {
      assert.equal(report.readiness, "not_ready", `${where}: an untrusted attestation never reaches ready`);
      assert.ok(
        report.readiness_reasons.some((r) => new RegExp(exp.reason_pattern!).test(r)),
        `${where}: readiness must say why: ${JSON.stringify(report.readiness_reasons)}`,
      );
    }
  }
});

/**
 * A fault inside a result file used to throw out of the shared validator, so `check` reported that one problem and
 * silently skipped the memo, the content digest and readiness. A second, unrelated defect planted in the same
 * directory must therefore also be reported: if only one error comes back, validation stopped early again and the
 * two result-file cases would be proving nothing about everything downstream of them.
 */
test("a fault inside a result file is reported without abandoning the rest of the Finding", async (t) => {
  const root = copyFixtures(t);
  for (const name of ["duplicate-row-key", "null-in-non-nullable-column"]) {
    const dir = join(root, name);
    const exp = expectationFor(root, name);
    // Two further, independent defects: a hand-copied quantity in the memo, and a memo that no longer digests.
    appendFileSync(join(dir, "memo.md"), "- Roughly 9 in 10 of them opened the app on the first day.\n");
    const report = await check({ dir, mode: "artifact", github: null });
    const seen = report.errors.map((e) => `${e.category} at ${e.location}`).join(", ");
    for (const category of [exp.category, "untraced_numeral", "digest"]) {
      assert.ok(report.errors.some((e) => e.category === category), `case ${name}: validation stopped before reporting ${category}; got: ${seen || "no errors"}`);
    }
    assert.ok(report.warnings.some((w) => w.category === "stale_review"), `case ${name}: the review of the old digest was never reached`);
  }
});

/**
 * An approval is granted on a definition and recorded in the definition file. A Finding restates it. Neither the
 * restatement nor a `lifecycle` string in the Finding's own manifest is evidence that anyone approved anything,
 * so a manifest that disagrees with the definition file must not produce an approved decision metric.
 */
test("a decision metric cannot approve itself from its citing Finding's manifest", async (t) => {
  const root = copyFixtures(t);
  const repin = (dir: string, edit: (m: any) => void) => {
    const m: any = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
    edit(m);
    m.content_digest = digestOf(m, dir);
    writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  };

  // 1. A well-formed approval pasted into the manifest for a definition whose file records none.
  const pasted = join(root, "decision-metric-not-approved");
  repin(pasted, (m) => {
    m.definitions[1].approval = {
      source: { type: "github_pr_review", repository: "loop-example/analytics", pull_request: 999, review_id: 1, commit_sha: "0".repeat(40) },
      approver: "an-agent", date: "2026-01-01", content_hash: { ...m.definitions[1].content_hash },
    };
  });
  const asserted = await check({ dir: pasted, mode: "artifact", github: null });
  assert.ok(
    asserted.errors.some((e) => e.category === "definition_not_approved" && e.location === "manifest.yaml#/definitions/1"),
    `a pasted approval made the decision metric approved: ${asserted.errors.map((e) => `${e.category} at ${e.location}`).join(", ") || "no errors"}`,
  );

  // 2. A lifecycle the definition file does not record, on the control that otherwise passes.
  for (const lifecycle of ["proposed", "deprecated"]) {
    const dir = join(root, "control-valid");
    cpSync(join(NEGATIVES_DIR, "control-valid"), dir, { recursive: true });
    repin(dir, (m) => void (m.definitions[0].lifecycle = lifecycle));
    const report = await check({ dir, mode: "artifact", github: null });
    assert.ok(
      report.errors.some((e) => e.category === "definition_version" && e.location === "manifest.yaml#/definitions/0"),
      `lifecycle ${lifecycle} was accepted although definitions/retained_7d.md records approved: ${report.errors.map((e) => e.category).join(", ") || "no errors"}`,
    );
    assert.notEqual(report.evidence, "valid", `lifecycle ${lifecycle}: evidence must not be valid`);
  }
});

test("render on the rendering cases: not available is written in words, private fields never leave, invalid evidence is refused", async (t) => {
  const root = copyFixtures(t);
  for (const name of caseNames()) {
    const exp = expectationFor(root, name);
    if (!exp.render) continue;
    const where = `case ${name}`;
    const dir = join(root, name);
    const report = await render({ dir, generatedAt: "2026-09-15T12:00:00Z" });

    if (exp.render.refused) {
      assert.ok(report.errors.length > 0, `${where}: render must refuse invalid evidence`);
      assert.ok(!existsSync(join(dir, "render")), `${where}: a refused render writes nothing`);
      continue;
    }
    assert.deepEqual(report.errors, [], `${where}: render must succeed`);
    const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
    for (const needle of exp.render.must_contain ?? []) assert.ok(html.includes(needle), `${where}: render must contain ${JSON.stringify(needle)}`);
    for (const needle of exp.render.must_not_contain ?? []) assert.ok(!html.includes(needle), `${where}: render must not contain ${JSON.stringify(needle)}`);
    // Every Reader-facing byte, not only the HTML, is projected.
    for (const file of readdirSync(join(dir, "render"))) {
      const bytes = readFileSync(join(dir, "render", file));
      for (const needle of exp.render.must_not_contain ?? []) assert.ok(!bytes.includes(needle), `${where}: ${file} must not contain ${JSON.stringify(needle)}`);
    }
    // A draft is labeled a draft: none of these fixtures carries a verified publication approval.
    assert.notEqual(report.readiness, "ready", `${where}: nothing here is approved for publication`);
    assert.ok(/class="draft"/.test(html), `${where}: unapproved output is labeled`);
  }
});

test("the committed negative fixtures are exactly what src/negatives-build.ts generates", (t) => {
  const out = mkdtempSync(join(tmpdir(), "ag-negatives-build-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const written = buildNegatives(out);
  assert.deepEqual(listTree(out), written, "the builder reports every file it writes");
  for (const rel of written) {
    assert.deepEqual(
      readFileSync(join(NEGATIVES_DIR, rel)),
      readFileSync(join(out, rel)),
      `${rel} differs from what the builder generates; run 'node src/negatives-build.ts' rather than hand-editing`,
    );
  }
  const extra = listTree(NEGATIVES_DIR).filter((p) => !written.includes(p) && p !== "README.md");
  assert.deepEqual(extra, [], "nothing under fixtures/negatives is hand-maintained except README.md");
});

test("fixtures/negatives/README.md names every case and the reason it exists", () => {
  const readme = readFileSync(join(NEGATIVES_DIR, "README.md"), "utf8");
  for (const c of CASES) {
    assert.ok(readme.includes(`\`${c.name}\``), `README.md must list ${c.name}`);
    assert.ok(readme.includes(c.category), `README.md must name the category ${c.category} for ${c.name}`);
  }
});
