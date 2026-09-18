// ag-iterate-visual-revise-kn3: revising a pinned Finding without silently changing what it means.
//
// Two seams, both black-box. `aftergrid revise` is driven over temporary copies of the reviewed exemplar and
// judged by its report, the files it wrote and what `check`/`render` then say about them. The recorded
// /iterate-visual runs are judged against the rubric they claim to have been scored with — the loop itself
// needs a model to look at a PNG, so no test here exercises it, and the fixtures say so in their own text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { evidenceDrift, revise } from "./commands/revise.ts";
import { classifyChartSpec } from "./revise/classify.ts";
import { check } from "./commands/check.ts";
import { render } from "./commands/render.ts";
import { houseStyle } from "./render/charts.ts";
import { exitCodeFor } from "./report.ts";
// @ts-ignore: shared ESM validation library.
import { digestOf } from "../scripts/lib/validate-finding.mjs";

const NUMERIC = "2026-07-20-onboarding-checklist-retention";
const REPO = fileURLToPath(new URL("../", import.meta.url));
const RUNS = join(REPO, "fixtures", "runs", "kn3-visual");
const cleanup: string[] = [];
process.on("exit", () => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });

/** A temp Instance with the reviewed numeric exemplar, already rendered and pinned as the baseline. */
async function pinned(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "ag-kn3-"));
  cleanup.push(root);
  cpSync(join(REPO, "fixtures", "instance"), root, { recursive: true });
  // Decision records bind revision 1's digest; a revision bump would rightly break them, and that binding is
  // `aftergrid decide`'s test, not this one.
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  const dir = join(root, "analytics", "findings", NUMERIC);
  const rendered = await render({ dir, generatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(rendered.errors.length, 0, JSON.stringify(rendered.errors));
  const p = await revise({ dir, mode: "pin" });
  assert.equal(p.errors.length, 0, JSON.stringify(p.errors));
  assert.ok(existsSync(join(dir, "revisions", "1", "manifest.yaml")), "the baseline is archived under revisions/<N>");
  return dir;
}

const readManifest = (dir: string) => parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
const writeManifest = (dir: string, m: unknown) => writeFileSync(join(dir, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
/** Edit the manifest and re-pin its digest, the way an author's tool would leave it. */
function editManifest(dir: string, fn: (m: any) => void) {
  const m = readManifest(dir);
  fn(m);
  m.content_digest = digestOf(m, dir);
  writeManifest(dir, m);
  return m;
}
const spec = (dir: string) => join(dir, "charts", "retention_by_arm.vl.json");
const levels = (r: Awaited<ReturnType<typeof revise>>) => r.differences.map((d) => `${d.level}@${d.location}`);

/* ------------------------------------------------------------------ presentation */

test("a chart colour change is presentation, and applying it makes revision 2 with revision 1 archived and still rendered", async () => {
  const dir = await pinned();
  const before = readFileSync(join(dir, "render", "finding.html"), "utf8");
  const source = JSON.parse(readFileSync(spec(dir), "utf8"));
  source.encoding.color.scale = { domain: ["checklist", "control"], range: ["#0b6e4f", "#b9b9b9"] };
  writeFileSync(spec(dir), JSON.stringify(source, null, 2) + "\n");
  editManifest(dir, () => {});

  const classified = await revise({ dir, mode: "classify" });
  assert.equal(classified.classification, "presentation", JSON.stringify(classified.differences, null, 2));
  assert.equal(classified.errors.length, 0);
  assert.ok(levels(classified).some((l) => l.startsWith("presentation@charts/retention_by_arm.vl.json#encoding.color.scale")), levels(classified).join("\n"));

  const applied = await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") });
  assert.equal(applied.errors.length, 0, JSON.stringify(applied.errors, null, 2));
  assert.equal(applied.revision, 2);
  const m = readManifest(dir);
  assert.equal(m.finding.revision, 2);
  assert.equal(m.finding.generated_at, "2026-09-20T09:00:00Z");
  assert.match(readFileSync(join(dir, "memo.md"), "utf8"), /^revision: 2$/m, "the memo front matter follows the manifest");
  assert.equal(m.content_digest.value, digestOf(m, dir).value, "the new revision is pinned to its own content");

  // The reviewed artifact stays reconstructable: archived manifest, memo, chart spec and the render it produced.
  const archive = join(dir, "revisions", "1");
  for (const rel of ["manifest.yaml", "memo.md", "charts/retention_by_arm.vl.json", "render/finding.html"]) assert.ok(existsSync(join(archive, rel)), rel);
  assert.equal(readFileSync(join(archive, "render", "finding.html"), "utf8"), before, "revision 1's render is preserved byte for byte");
  const archived = parseYaml(readFileSync(join(archive, "manifest.yaml"), "utf8"));
  assert.equal(archived.finding.revision, 1);
  assert.notEqual(JSON.parse(readFileSync(join(archive, "charts", "retention_by_arm.vl.json"), "utf8")).encoding.color.scale, source.encoding.color.scale);
  assert.equal(archived.content_digest.value, digestOf(archived, join(REPO, "fixtures", "instance", "analytics", "findings", NUMERIC)).value, "the archive is byte-faithful to revision 1");
  assert.deepEqual(evidenceDrift(dir, archived), [], "and revision 1's recorded evidence hashes still resolve against the evidence files the Finding still holds");

  // Re-rendered and re-checked as part of applying.
  assert.ok(applied.info.some((i) => /^render: wrote/.test(i)), applied.info.join("\n"));
  assert.notEqual(readFileSync(join(dir, "render", "finding.html"), "utf8"), before, "the Finding was re-rendered");
  const rechecked = await check({ dir, github: null });
  assert.equal(rechecked.evidence, "valid", JSON.stringify(rechecked.errors));
  assert.equal(rechecked.readiness, "not_ready");
});

test("applying a revision never rebinds a review: it stays bound to the revision it read, and says so", async () => {
  const dir = await pinned();
  const reviewDigest = readManifest(dir).reviews[0].content_digest.value;
  editManifest(dir, (m: any) => { m.tables[0].columns[0].label = "Onboarding shown"; });

  const applied = await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") });
  assert.equal(applied.classification, "presentation", JSON.stringify(applied.differences));
  const m = readManifest(dir);
  assert.equal(m.reviews[0].content_digest.value, reviewDigest, "the review still binds the digest it was written against");
  assert.deepEqual(m.attestations, [], "revision 1's approval does not bind revision 2's content");
  assert.ok(applied.info.some((i) => /do not carry to revision 2/.test(i)), applied.info.join("\n"));
  const warnings = (await check({ dir, github: null })).warnings.map((w) => w.category);
  assert.ok(warnings.includes("stale_review"), warnings.join(", "));
});

test("a memo reworded with the same evidence tokens is presentation; a memo that shows different tokens is not", async () => {
  const dir = await pinned();
  const memo = join(dir, "memo.md");
  const original = readFileSync(memo, "utf8");
  writeFileSync(memo, original.replace("Who is counted: every person who signed up", "Who this counts: everyone who signed up"));
  editManifest(dir, () => {});
  const reworded = await revise({ dir, mode: "classify" });
  assert.equal(reworded.classification, "presentation", JSON.stringify(reworded.differences, null, 2));
  assert.deepEqual(levels(reworded), ["presentation@memo.md"]);

  writeFileSync(memo, original.replace("Limits: \"came back\"", "Limits: of {{ref:retention_by_arm.control.signups}} people, \"came back\""));
  editManifest(dir, () => {});
  const retokened = await revise({ dir, mode: "classify" });
  assert.equal(retokened.classification, "interpretation", JSON.stringify(retokened.differences, null, 2));
});

/* ------------------------------------------------------------------ interpretation */

test("changing a Claim's type is interpretation: it applies, the reviews go stale and review is demanded", async () => {
  const dir = await pinned();
  editManifest(dir, (m: any) => { m.claims[0].type = "associational"; });

  const classified = await revise({ dir, mode: "classify" });
  assert.equal(classified.classification, "interpretation");
  assert.deepEqual(levels(classified), ["interpretation@manifest.yaml#claims.c1.type"]);
  assert.ok(classified.warnings.some((w) => w.category === "needs_attention" && /Method and Question review/.test(w.message)), JSON.stringify(classified.warnings));

  const applied = await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") });
  assert.equal(applied.revision, 2);
  assert.ok(applied.warnings.some((w) => w.category === "needs_attention" && /Method and Question review are required/.test(w.message)), JSON.stringify(applied.warnings));
  assert.ok(applied.readiness_reasons.some((r) => /Method and Question review are required/.test(r)), applied.readiness_reasons.join("\n"));
  const after = await check({ dir, github: null });
  assert.ok(after.warnings.some((w) => w.category === "stale_review"), "the Method review is reported stale, not silently carried");
  assert.equal(after.readiness, "not_ready");
});

test("an axis domain that truncates is interpretation; one that shows at least as much is presentation", async () => {
  const dir = await pinned();
  const original = JSON.parse(readFileSync(spec(dir), "utf8"));

  const truncated = JSON.parse(JSON.stringify(original));
  truncated.encoding.x.scale.domain = [0.25, 0.4];
  writeFileSync(spec(dir), JSON.stringify(truncated, null, 2) + "\n");
  editManifest(dir, () => {});
  const cut = await revise({ dir, mode: "classify" });
  assert.equal(cut.classification, "interpretation", JSON.stringify(cut.differences, null, 2));
  assert.ok(cut.differences.some((d) => d.level === "interpretation" && /cuts values off the axis/.test(d.message)), JSON.stringify(cut.differences));

  const widened = JSON.parse(JSON.stringify(original));
  widened.encoding.x.scale.domain = [0, 0.6];
  writeFileSync(spec(dir), JSON.stringify(widened, null, 2) + "\n");
  editManifest(dir, () => {});
  const wide = await revise({ dir, mode: "classify" });
  assert.equal(wide.classification, "presentation", JSON.stringify(wide.differences, null, 2));
});

test("rebinding a chart to a different field is interpretation; adding a direct-label layer on a field it already shows is not", async () => {
  const dir = await pinned();
  const original = JSON.parse(readFileSync(spec(dir), "utf8"));

  const rebound = JSON.parse(JSON.stringify(original));
  rebound.encoding.x.field = "retained";
  writeFileSync(spec(dir), JSON.stringify(rebound, null, 2) + "\n");
  editManifest(dir, () => {});
  const swapped = await revise({ dir, mode: "classify" });
  assert.equal(swapped.classification, "interpretation", JSON.stringify(swapped.differences, null, 2));

  writeFileSync(spec(dir), readFileSync(join(RUNS, "first-pass-passes", "pass-1.vl.json"), "utf8"));
  editManifest(dir, () => {});
  const labelled = await revise({ dir, mode: "classify" });
  assert.equal(labelled.classification, "presentation", JSON.stringify(labelled.differences, null, 2));
});

/* ------------------------------------------------------------------ numeric */

test("changing a saved result value is numeric: revise refuses, writes nothing and names the command that reopens the Analysis", async () => {
  const dir = await pinned();
  const resultPath = join(dir, "results", "retention_by_arm.json");
  const data = JSON.parse(readFileSync(resultPath, "utf8"));
  data.rows[0].retained = data.rows[0].retained + 1;
  writeFileSync(resultPath, JSON.stringify(data, null, 2) + "\n");

  const classified = await revise({ dir, mode: "classify" });
  assert.equal(classified.classification, "numeric");
  assert.equal(exitCodeFor(classified), 2, "a numeric change is refused, not merely reported");
  const refusal = classified.errors.find((e) => e.category === "reopens_analysis")!;
  assert.ok(refusal, JSON.stringify(classified.errors));
  assert.match(refusal.remedy ?? "", /aftergrid execute/);
  assert.match(refusal.remedy ?? "", /Nothing was written/);

  const applied = await revise({ dir, mode: "apply" });
  assert.equal(applied.classification, "numeric");
  assert.equal(readManifest(dir).finding.revision, 1, "the revision is not bumped");
  assert.ok(!existsSync(join(dir, "revisions", "2")), "nothing is archived");
  assert.ok(applied.errors.every((e) => e.category === "reopens_analysis"));
});

test("a numeric change is caught from the manifest's own hashes, with no baseline at all", async () => {
  const dir = await pinned();
  rmSync(join(dir, "revisions"), { recursive: true, force: true });
  const query = join(dir, "queries", "retention_by_arm.sql");
  writeFileSync(query, readFileSync(query, "utf8") + "\n-- an extra predicate\n");
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "numeric");
  assert.ok(r.differences.some((d) => d.level === "numeric" && /query retention_by_arm/.test(d.message)), JSON.stringify(r.differences));
});

/* ------------------------------------------------------------------ baseline discipline */

test("with no baseline and no evidence drift, revise says it cannot classify rather than guessing", async () => {
  const dir = await pinned();
  rmSync(join(dir, "revisions"), { recursive: true, force: true });
  editManifest(dir, (m: any) => { m.claims[0].type = "associational"; });
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "unknown");
  const problem = r.errors.find((e) => e.category === "needs_input")!;
  assert.ok(problem, JSON.stringify(r.errors));
  assert.match(problem.remedy ?? "", /--pin|--baseline/);
});

test("--pin refuses a Finding that does not hash to the digest it pins", async () => {
  const dir = await pinned();
  rmSync(join(dir, "revisions"), { recursive: true, force: true });
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nAn unpinned edit.\n");
  const r = await revise({ dir, mode: "pin" });
  assert.equal(r.errors[0]?.category, "digest", JSON.stringify(r.errors));
  assert.ok(!existsSync(join(dir, "revisions")), "no baseline is recorded from a state nobody reviewed");
});

test("an unchanged Finding classifies as unchanged and a second --pin writes nothing new", async () => {
  const dir = await pinned();
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "unchanged");
  assert.deepEqual(r.differences, []);
  const again = await revise({ dir, mode: "pin" });
  assert.equal(again.errors.length, 0);
  assert.ok(again.info.some((i) => /already archives this digest/.test(i)), again.info.join("\n"));
});

/* ------------------------------------------------------------------ Variants */

test("a rejected Variant is kept in charts[] with variant_of set, classifies as presentation, and never reaches the render", async () => {
  const dir = await pinned();
  const variantSpec = "charts/retention_by_arm_wide.vl.json";
  const source = JSON.parse(readFileSync(spec(dir), "utf8"));
  source.encoding.x.scale.domain = [0, 1];
  writeFileSync(join(dir, "charts", "retention_by_arm_wide.vl.json"), JSON.stringify(source, null, 2) + "\n");
  editManifest(dir, (m: any) => {
    const survivor = m.charts[0];
    m.charts.push({ id: "retention_by_arm_wide", claim_id: survivor.claim_id, spec_path: variantSpec, result_id: survivor.result_id, title: survivor.title, description: survivor.description, variant_of: survivor.id });
  });

  const classified = await revise({ dir, mode: "classify" });
  assert.equal(classified.classification, "presentation", JSON.stringify(classified.differences, null, 2));
  assert.ok(classified.differences.some((d) => /Variant/.test(d.message)), JSON.stringify(classified.differences));

  const applied = await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") });
  assert.equal(applied.errors.length, 0, JSON.stringify(applied.errors, null, 2));
  const rendered = readdirSync(join(dir, "render"));
  assert.ok(rendered.includes("retention_by_arm_chart.svg"), rendered.join(", "));
  assert.ok(!rendered.includes("retention_by_arm_wide.svg"), "a Variant shares the survivor's pinned evidence but is not shown");
  assert.ok(!readFileSync(join(dir, "render", "finding.html"), "utf8").includes("retention_by_arm_wide"), "and is not named in the Reader's page");
  assert.equal((await check({ dir, github: null })).evidence, "valid");
});

test("choosing the other Variant is presentation: the swap keeps the Claim, the result set and the pinned evidence", async () => {
  const dir = await pinned();
  const variantSpec = "charts/retention_by_arm_wide.vl.json";
  const source = JSON.parse(readFileSync(spec(dir), "utf8"));
  source.encoding.x.scale.domain = [0, 1];
  writeFileSync(join(dir, "charts", "retention_by_arm_wide.vl.json"), JSON.stringify(source, null, 2) + "\n");
  editManifest(dir, (m: any) => {
    const survivor = m.charts[0];
    m.charts.push({ id: "retention_by_arm_wide", claim_id: survivor.claim_id, spec_path: variantSpec, result_id: survivor.result_id, title: survivor.title, description: survivor.description, variant_of: survivor.id });
  });
  assert.equal((await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") })).errors.length, 0);
  assert.equal((await revise({ dir, mode: "pin" })).errors.length, 0);

  // The Operator picks the wide one: the two entries trade places and the Claim points at the survivor.
  editManifest(dir, (m: any) => {
    const [narrow, wide] = [m.charts.find((c: any) => c.id === "retention_by_arm_chart"), m.charts.find((c: any) => c.id === "retention_by_arm_wide")];
    delete wide.variant_of;
    narrow.variant_of = wide.id;
    m.claims[0].chart_ids = [wide.id];
  });
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "presentation", JSON.stringify(r.differences, null, 2));
  assert.ok(r.differences.some((d) => /Variant of the same Claim/.test(d.message)), JSON.stringify(r.differences));
});

test("promoting a Variant classifies its spec against the chart it replaces: a truncated axis costs review even though neither file changed", async () => {
  const dir = await pinned();
  const cut = JSON.parse(readFileSync(spec(dir), "utf8"));
  cut.encoding.x.scale.domain = [0.25, 0.4];
  writeFileSync(join(dir, "charts", "retention_by_arm_cut.vl.json"), JSON.stringify(cut, null, 2) + "\n");
  editManifest(dir, (m: any) => {
    const survivor = m.charts[0];
    m.charts.push({ id: "retention_by_arm_cut", claim_id: survivor.claim_id, spec_path: "charts/retention_by_arm_cut.vl.json", result_id: survivor.result_id, title: survivor.title, description: survivor.description, variant_of: survivor.id });
  });
  // Keeping the candidate costs nothing: it is not on the Reader's page.
  assert.equal((await revise({ dir, mode: "classify" })).classification, "presentation");
  assert.equal((await revise({ dir, mode: "apply", now: () => new Date("2026-09-20T09:00:00Z") })).errors.length, 0);
  assert.equal((await revise({ dir, mode: "pin" })).errors.length, 0);

  // Putting it on the page is the change, and the spec it replaces is what it has to be judged against.
  const memo = join(dir, "memo.md");
  writeFileSync(memo, readFileSync(memo, "utf8").replace("<!-- chart: retention_by_arm_chart -->", "<!-- chart: retention_by_arm_cut -->"));
  editManifest(dir, (m: any) => {
    const [narrow, promoted] = [m.charts.find((c: any) => c.id === "retention_by_arm_chart"), m.charts.find((c: any) => c.id === "retention_by_arm_cut")];
    delete promoted.variant_of;
    narrow.variant_of = promoted.id;
    m.claims[0].chart_ids = [promoted.id];
  });
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "interpretation", JSON.stringify(r.differences, null, 2));
  assert.ok(r.differences.some((d) => d.level === "interpretation" && /cuts values off the axis/.test(d.message) && /retention_by_arm_chart, the chart it replaces/.test(d.message)), JSON.stringify(r.differences, null, 2));
  assert.ok(r.warnings.some((w) => w.category === "needs_attention"), JSON.stringify(r.warnings));

  const applied = await revise({ dir, mode: "apply", now: () => new Date("2026-09-21T09:00:00Z") });
  assert.equal(applied.errors.length, 0, JSON.stringify(applied.errors, null, 2));
  assert.ok(applied.readiness_reasons.some((x) => /Method and Question review are required/.test(x)), applied.readiness_reasons.join("\n"));
});

test("taking the rendering chart off the page by filing it as a Variant is not presentation", async () => {
  const dir = await pinned();
  editManifest(dir, (m: any) => { m.charts[0].variant_of = "some_other_chart"; });
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "interpretation", JSON.stringify(r.differences, null, 2));
  assert.ok(r.differences.some((d) => d.level === "interpretation" && /no longer renders/.test(d.message)), JSON.stringify(r.differences));
});

test("an entry calling itself a Variant of a chart it shares no result set with is not classified as one", async () => {
  const dir = await pinned();
  const other = "charts/retention_by_week_arm_alt.vl.json";
  writeFileSync(join(dir, other), readFileSync(join(RUNS, "three-passes-still-failing", "pass-3.vl.json"), "utf8"));
  editManifest(dir, (m: any) => {
    const survivor = m.charts[0];
    m.charts.push({ id: "retention_by_week_arm_alt", claim_id: survivor.claim_id, spec_path: other, result_id: "retention_by_week_arm", title: survivor.title, description: survivor.description, variant_of: survivor.id });
  });
  const r = await revise({ dir, mode: "classify" });
  assert.equal(r.classification, "interpretation", JSON.stringify(r.differences, null, 2));
  assert.ok(r.differences.some((d) => d.level === "interpretation" && /binds result set retention_by_week_arm/.test(d.message)), JSON.stringify(r.differences));
});

/* ------------------------------------------------------------------ what a position axis is */

test("a position axis's scale is not cosmetic: zero, type, reverse and nice are interpretation, while a colour scale is not", async () => {
  const dir = await pinned();
  const original = JSON.parse(readFileSync(spec(dir), "utf8"));
  for (const [key, value] of [["zero", false], ["type", "sqrt"], ["reverse", true], ["nice", false]] as [string, unknown][]) {
    const edited = JSON.parse(JSON.stringify(original));
    edited.encoding.x.scale[key] = value;
    writeFileSync(spec(dir), JSON.stringify(edited, null, 2) + "\n");
    editManifest(dir, () => {});
    const r = await revise({ dir, mode: "classify" });
    assert.equal(r.classification, "interpretation", `${key}: ${JSON.stringify(r.differences, null, 2)}`);
    assert.ok(r.differences.some((d) => d.level === "interpretation" && d.location.endsWith(`#encoding.x.scale.${key}`)), `${key}: ${JSON.stringify(r.differences)}`);
  }
  // Which category carries the accent is how the chart points, not what a length says.
  const coloured = JSON.parse(JSON.stringify(original));
  coloured.encoding.color.scale = { domain: ["checklist", "control"], range: ["#0b6e4f", "#b9b9b9"] };
  writeFileSync(spec(dir), JSON.stringify(coloured, null, 2) + "\n");
  editManifest(dir, () => {});
  assert.equal((await revise({ dir, mode: "classify" })).classification, "presentation");
});

test("a domain that appears is called a meaning change without claiming it cut values off an axis that had none", () => {
  const bare = { mark: "bar", encoding: { x: { field: "retained_7d_rate", type: "quantitative" } } };
  const scaled = { mark: "bar", encoding: { x: { field: "retained_7d_rate", type: "quantitative", scale: { domain: [0, 0.5] } } } };
  const appeared = classifyChartSpec("c", "charts/x.vl.json", bare, scaled);
  assert.equal(appeared.length, 1, JSON.stringify(appeared));
  assert.equal(appeared[0]!.level, "interpretation");
  assert.ok(!/cuts values off/.test(appeared[0]!.message), appeared[0]!.message);
  assert.match(appeared[0]!.message, /cannot compare/);
  const disappeared = classifyChartSpec("c", "charts/x.vl.json", scaled, bare);
  assert.equal(disappeared.length, 1, JSON.stringify(disappeared));
  assert.ok(!/cuts values off/.test(disappeared[0]!.message), disappeared[0]!.message);
  // A narrowing is still named for what it does.
  const narrowed = classifyChartSpec("c", "charts/x.vl.json", scaled, { mark: "bar", encoding: { x: { field: "retained_7d_rate", type: "quantitative", scale: { domain: [0.25, 0.4] } } } });
  assert.ok(narrowed.some((j) => j.level === "interpretation" && /cuts values off the axis/.test(j.message)), JSON.stringify(narrowed));
});

/* ------------------------------------------------------------------ what revise refuses to destroy or to skip */

test("--apply --baseline refuses to overwrite the pinned archive with a copy nobody reviewed", async () => {
  const dir = await pinned();
  const copy = mkdtempSync(join(tmpdir(), "ag-kn3-baseline-"));
  const older = mkdtempSync(join(tmpdir(), "ag-kn3-older-"));
  cleanup.push(copy, older);
  cpSync(dir, copy, { recursive: true });
  cpSync(dir, older, { recursive: true });
  writeFileSync(join(copy, "memo.md"), readFileSync(join(copy, "memo.md"), "utf8") + "\nA line nobody reviewed.\n");
  const archived = readFileSync(join(dir, "revisions", "1", "memo.md"), "utf8");

  editManifest(dir, (m: any) => { m.tables[0].columns[0].label = "Onboarding shown"; });
  const r = await revise({ dir, mode: "apply", baseline: copy, now: () => new Date("2026-09-20T09:00:00Z") });
  assert.equal(r.errors[0]?.category, "digest", JSON.stringify(r.errors));
  assert.equal(readFileSync(join(dir, "revisions", "1", "memo.md"), "utf8"), archived, "the reviewed revision 1 is still the one in revisions/1");
  assert.equal(readManifest(dir).finding.revision, 1, "and nothing was applied");

  // A clean copy of a different revision is refused too, rather than filed under this one's number.
  const m = parseYaml(readFileSync(join(older, "manifest.yaml"), "utf8"));
  m.finding.revision = 7;
  m.content_digest = digestOf(m, older);
  writeFileSync(join(older, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const mismatched = await revise({ dir, mode: "apply", baseline: older, now: () => new Date("2026-09-20T09:00:00Z") });
  assert.ok(mismatched.errors.some((e) => /revision 7/.test(e.message)), JSON.stringify(mismatched.errors));
  assert.equal(readFileSync(join(dir, "revisions", "1", "memo.md"), "utf8"), archived);
});

test("a file the manifest names and the Finding no longer holds is reported missing, never as nothing to revise", async () => {
  for (const missing of ["charts/retention_by_arm.vl.json", "memo.md"]) {
    const dir = await pinned();
    rmSync(join(dir, missing));
    for (const mode of ["classify", "apply"] as const) {
      const r = await revise({ dir, mode });
      assert.notEqual(r.classification, "unchanged", `${missing} ${mode}: ${JSON.stringify(r)}`);
      assert.equal(r.content, "incomplete", `${missing} ${mode}`);
      assert.ok(r.errors.some((e) => e.category === "missing_file" && e.message.includes(missing)), `${missing} ${mode}: ${JSON.stringify(r.errors)}`);
    }
    assert.equal(readManifest(dir).finding.revision, 1, `${missing}: nothing was applied`);
    assert.equal((await check({ dir, github: null })).evidence, "invalid", `${missing}: check says the same`);
  }
});

test("a chart spec that is not JSON is a typed error in the report, not a stack trace out of the command", async () => {
  const dir = await pinned();
  writeFileSync(spec(dir), "{ not json ");
  for (const mode of ["classify", "apply"] as const) {
    const r = await revise({ dir, mode });
    assert.equal(r.syntax, "invalid", mode);
    const problem = r.errors.find((e) => e.category === "invalid_artifact");
    assert.ok(problem, `${mode}: ${JSON.stringify(r.errors)}`);
    assert.match(problem!.message, /not valid JSON/);
    assert.match(problem!.location, /retention_by_arm\.vl\.json/);
  }
  assert.equal(readManifest(dir).finding.revision, 1, "nothing was applied");
});

/* ------------------------------------------------------------------ the /iterate-visual loop's own steps */

test("the re-pin /iterate-visual step 2 documents is what makes check valid again after a spec edit", async () => {
  const dir = await pinned();
  // A draft being worked by the visual loop has no approval standing on its digest.
  editManifest(dir, (m: any) => { m.attestations = []; });
  const edited = JSON.parse(readFileSync(spec(dir), "utf8"));
  edited.encoding.color.scale = { domain: ["checklist", "control"], range: ["#0b6e4f", "#b9b9b9"] };
  writeFileSync(spec(dir), JSON.stringify(edited, null, 2) + "\n");

  const stale = await check({ dir, github: null });
  assert.ok(stale.errors.some((e) => e.category === "digest"), "editing a chart spec breaks the content digest");
  assert.equal((await render({ dir })).errors.some((e) => e.category === "digest"), true, "and render refuses until it is re-pinned");

  const m = readManifest(dir);
  m.content_digest = digestOf(m, dir);
  writeManifest(dir, m);
  const after = await check({ dir, github: null });
  assert.equal(after.evidence, "valid", JSON.stringify(after.errors, null, 2));
  assert.ok(!after.errors.some((e) => e.category === "digest"), JSON.stringify(after.errors));
  assert.equal((await render({ dir, generatedAt: "2026-09-15T12:00:00Z" })).errors.length, 0);
});

test("the hold-back /iterate-visual step 6 documents keeps a returned chart off the Reader's page and leaves check valid", async () => {
  const dir = await pinned();
  const memo = join(dir, "memo.md");
  writeFileSync(memo, readFileSync(memo, "utf8").replace("<!-- chart: retention_by_arm_chart -->\n", ""));
  editManifest(dir, (m: any) => { m.claims[0].chart_ids = []; m.attestations = []; });

  const checked = await check({ dir, github: null });
  assert.equal(checked.evidence, "valid", JSON.stringify(checked.errors, null, 2));
  const rendered = await render({ dir, generatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(rendered.errors.length, 0, JSON.stringify(rendered.errors, null, 2));
  const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
  assert.ok(!html.includes("<figure>"), "the returned chart is not shown to the Reader");
  assert.ok(!html.includes("retention_by_arm_chart"), "and is not named on the page");
  // Neither edit alone does it: the marker without the id refuses, the id without the marker changes nothing.
  const markerOnly = await pinned();
  writeFileSync(join(markerOnly, "memo.md"), readFileSync(join(markerOnly, "memo.md"), "utf8").replace("<!-- chart: retention_by_arm_chart -->\n", ""));
  editManifest(markerOnly, (m: any) => { m.attestations = []; });
  assert.ok((await check({ dir: markerOnly, github: null })).errors.some((e) => /chart marker/.test(e.message)), "a Claim that still lists the chart demands its marker");

  const idOnly = await pinned();
  editManifest(idOnly, (m: any) => { m.claims[0].chart_ids = []; m.attestations = []; });
  assert.equal((await check({ dir: idOnly, github: null })).evidence, "valid");
  assert.equal((await render({ dir: idOnly, generatedAt: "2026-09-15T12:00:00Z" })).errors.length, 0);
  assert.ok(readFileSync(join(idOnly, "render", "finding.html"), "utf8").includes("<figure>"), "the memo marker is what puts the figure on the page, so dropping the id alone changes nothing");
});

test("/iterate-visual documents the two steps its own loop cannot finish without, and claims no outcome it has no step for", () => {
  const skill = readFileSync(join(REPO, "skills", "iterate-visual", "references", "engine-workflow.md"), "utf8");
  const doc = readFileSync(join(REPO, "docs", "skills", "iterate-visual.md"), "utf8");
  // Step 2: an edited spec leaves the digest stale, and the remedy `check` prints names a flag that does not exist.
  assert.match(skill, /digestOf/, "the skill says how to re-pin content_digest after a spec edit");
  for (const m of (skill + doc).matchAll(/check\s+(?:<[^>]+>\s+)?--pin/g)) {
    const around = (skill + doc).slice(Math.max(0, m.index - 200), m.index + 200);
    assert.match(around, /does not exist/, "`check --pin` is only ever named as the flag the CLI does not parse, never as a step");
  }
  // Step 6: handing a chart back is a report; taking it off the page is two edits, and neither text may claim
  // the loop does it on its own.
  const holdBack = skill.slice(skill.indexOf("## 6."), skill.indexOf("## 7."));
  assert.match(holdBack, /chart_ids/, "step 6 names the Claim field that decides whether a returned chart is shown");
  assert.match(holdBack, /marker/, "and the memo marker that goes with it");
  for (const [name, text] of [["SKILL.md", skill], ["docs", doc]] as const) {
    assert.ok(!/is not (?:in|rendered into) the render/.test(text), `${name}: a returned chart is still rendered until someone holds it back`);
  }
});

/* ------------------------------------------------------------------ recorded /iterate-visual runs */

const RUBRIC = join(REPO, "skills", "iterate-visual", "references", "visual-rubric.md");
const rubricItems = () => [...readFileSync(RUBRIC, "utf8").matchAll(/^### `([a-z_]+)`$/gm)].map((m) => m[1]!);
const runs = () => readdirSync(RUNS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => ({ name: e.name, run: JSON.parse(readFileSync(join(RUNS, e.name, "run.json"), "utf8")) }));

test("every recorded pass scores exactly the rubric items it says it looked at, and never more", () => {
  const items = rubricItems();
  assert.equal(items.length, 7, "the rubric is the seven yes/no items the design names");
  assert.ok(runs().length >= 2, "an early-success run and a still-failing run");
  for (const { name, run } of runs()) {
    assert.match(String(run.recorded), /No live model produced this run/i, `${name}: a recorded run says it is recorded`);
    assert.equal(run.rubric, "skills/iterate-visual/references/visual-rubric.md", name);
    assert.ok(run.passes.length >= 1 && run.passes.length <= 3, `${name}: three passes is a maximum`);
    assert.equal(run.outcome.passes_used, run.passes.length, name);
    for (const pass of run.passes) {
      assert.deepEqual(pass.items.map((i: any) => i.id).sort(), [...items].sort(), `${name} pass ${pass.pass}: every rubric item gets a verdict`);
      for (const item of pass.items) {
        assert.ok(["yes", "no"].includes(item.verdict), `${name} pass ${pass.pass} ${item.id}: yes or no`);
        assert.ok(String(item.note).trim().length > 20, `${name} pass ${pass.pass} ${item.id}: the note names what in the image decides it`);
      }
      const justified = pass.items.filter((i: any) => i.verdict === "yes").length;
      assert.equal(pass.score, justified, `${name} pass ${pass.pass}: the score is the count of yes verdicts, never above it`);
      assert.ok(existsSync(join(RUNS, name, pass.spec)), `${name} pass ${pass.pass}: the spec it scored is kept`);
    }
    for (const variant of run.variants ?? []) {
      assert.equal(variant.variant_of, run.chart_id, `${name}: a Variant names the chart it is a candidate for`);
      assert.equal(variant.result_id, run.result_id, `${name}: Variants share the surviving chart's result set and its pinned evidence`);
    }
  }
});

test("a pass with a failing item is never recorded as accepted: it goes back to the Operator with the item and a next step", () => {
  for (const { name, run } of runs()) {
    const last = run.passes[run.passes.length - 1];
    const failing = last.items.filter((i: any) => i.verdict === "no").map((i: any) => i.id);
    if (failing.length === 0) {
      assert.equal(run.outcome.kind, "accepted", `${name}: every item passed`);
      assert.equal(last.pass, 1, `${name}: the early-success run stops at pass 1`);
      continue;
    }
    assert.equal(run.outcome.kind, "returned_to_operator", `${name}: ${failing.join(", ")} still fails`);
    assert.deepEqual([...run.outcome.failing_items].sort(), [...failing].sort(), name);
    assert.ok(String(run.outcome.next_step).trim().length > 40, `${name}: a next step, not an apology`);
    assert.ok(last.score < last.items.length, `${name}: a returned chart never scores a clean sheet`);
  }
  const failing = runs().filter(({ run }) => run.outcome.kind === "returned_to_operator");
  assert.equal(failing.length, 1);
  assert.equal(failing[0]!.run.passes.length, 3, "the still-failing run uses all three passes and then stops");
});

test("every recorded pass is scored against the image the pinned renderer actually produces", async () => {
  const dir = await pinned();
  const vega: any = await import("vega");
  const vl: any = await import("vega-lite");
  const [accent, grey] = houseStyle.range.category as string[];
  const manifest = readManifest(dir);
  for (const { name, run } of runs()) {
    const res = manifest.results.find((r: any) => r.id === run.result_id);
    assert.ok(res, `${name}: binds ${run.result_id}, a result set of the exemplar`);
    const numeric = new Set(res.columns.filter((c: any) => c.type === "integer" || c.type === "decimal").map((c: any) => c.name));
    const rows = JSON.parse(readFileSync(join(dir, "results", `${run.result_id}.json`), "utf8")).rows
      .map((row: any) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : numeric.has(k) ? Number(v) : v])));

    for (const pass of run.passes) {
      const where = `${name} pass ${pass.pass}`;
      const source = JSON.parse(readFileSync(join(RUNS, name, pass.spec), "utf8"));
      // Built the way `src/render/charts.ts` builds it: the spec's own config is discarded for the house style.
      const full = { ...source, width: 480, height: Math.max(60, 32 * rows.length + 20), title: { text: run.chart_id }, config: houseStyle, data: { name: "result" } };
      const view = new vega.View(vega.parse(vl.compile(full).spec), { renderer: "none" }).data("result", rows);
      await view.runAsync();
      const svg: string = await view.toSVG();
      const verdict = (id: string) => pass.items.find((i: any) => i.id === id)?.verdict;
      const prose = [...pass.items.map((i: any) => String(i.note)), String(pass.revision ?? ""), String(run.outcome.next_step ?? "")];

      // The house style disables legends, so no pass may be scored on one being read, dropped or kept.
      assert.ok(!/role-legend|role="legend"/.test(svg), `${where}: the pinned house style draws no legend`);
      for (const text of prose) assert.ok(!/\blegends?\b/i.test(text) || /no legend|without a legend|draws no legend|legends? (?:is|are) disabled/i.test(text), `${where}: this describes a legend the renderer never draws — ${text}`);

      // Grey plus one accent is what the palette does, not something a note may assert against the image.
      const colours = new Set<string>();
      try { for (const value of view.scale("color").domain()) colours.add(String(view.scale("color")(value))); } catch { /* no colour channel */ }
      if (colours.size && [...colours].every((c) => c === accent || c === grey)) assert.equal(verdict("grey_plus_accent"), "yes", `${where}: the image is grey plus the accent (${[...colours].join(", ")})`);

      // And whether the value axis starts at zero is readable off the compiled scale.
      for (const channel of ["x", "y"]) {
        let domain: unknown = null;
        try { domain = view.scale(channel).domain(); } catch { /* no such scale */ }
        if (!Array.isArray(domain) || domain.length !== 2 || !domain.every((v) => typeof v === "number")) continue;
        assert.equal(verdict("axis_not_truncated"), domain[0] === 0 ? "yes" : "no", `${where}: the ${channel} domain is ${JSON.stringify(domain)}`);
      }
      view.finalize();
    }
  }
});

test("the recorded direct-label spec is in the validated Vega-Lite subset and renders the labels the rubric asks for", async () => {
  const dir = await pinned();
  writeFileSync(spec(dir), readFileSync(join(RUNS, "first-pass-passes", "pass-1.vl.json"), "utf8"));
  // The exemplar's fixture attestation binds revision 1's digest; re-pinning by hand is not `revise --apply`,
  // so drop it rather than leave a stale attestation standing in for the chart this test is about.
  editManifest(dir, (m: any) => { m.attestations = []; });
  const checked = await check({ dir, github: null });
  assert.equal(checked.evidence, "valid", JSON.stringify(checked.errors, null, 2));
  const rendered = await render({ dir, generatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(rendered.errors.length, 0, JSON.stringify(rendered.errors, null, 2));
  const svg = readFileSync(join(dir, "render", "retention_by_arm_chart.svg"), "utf8");
  for (const label of ["34.8%", "28.5%"]) assert.ok(svg.includes(label), `${label} is written on the chart, not left to a legend`);
  assert.ok(!/<text[^>]*>checklist<\/text>[\s\S]*<text[^>]*>control<\/text>[\s\S]*legend/i.test(svg));
});
