// ag-render-html-pjn: render from validated source; reader-safe; accessible; refuses invalid evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, cpSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { render } from "./commands/render.ts";
// @ts-ignore
import { digestOf } from "../scripts/lib/validate-finding.mjs";

const NUMERIC = "2026-07-20-onboarding-checklist-retention", INSUFFICIENT = "2026-09-15-price-change-cancellations";
const RECORDED = "2026-09-16-price-change-cancellations-recorded";
function copy(): string { const root = mkdtempSync(join(tmpdir(), "ag-render-")); cpSync(fileURLToPath(new URL("../fixtures/instance/", import.meta.url)), root, { recursive: true }); return root; }
const finding = (root: string, f: string) => join(root, "analytics", "findings", f);

test("both exemplars render: factual values agree across prose, tables and chart text; draft label; ids-only mailto; copyable fallback", async () => {
  const root = copy();
  const r1 = await render({ dir: finding(root, NUMERIC), png: true, generatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(r1.errors.length, 0, JSON.stringify(r1.errors));
  const html = readFileSync(join(finding(root, NUMERIC), "render", "finding.html"), "utf8");
  for (const v of ["34.8%", "28.5%", "6.3 pp", "1,277", "8.7 pp"]) assert.ok(html.includes(v), v);
  assert.ok(!html.includes("0.3477") && !html.includes("0.284839"), "raw decimals never reach the page; display formatting applied once");
  assert.ok(/class="draft"/.test(html) && /Publication approval has not been verified/.test(html), "draft label");
  assert.ok(/<div class="answer">[\s\S]*?<\/div>\s*<div class="caveat">/.test(html), "answer and material caveat together");
  const mailtos = [...html.matchAll(/href="(mailto:[^"]+)"/g)].map((m) => decodeURIComponent(m[1]!));
  assert.ok(mailtos.length >= 3);
  for (const m of mailtos) { assert.ok(/Finding: fnd_7k2m9q4w1xzb/.test(m)); assert.ok(!/34\.8|28\.5|624|653/.test(m), "mailto carries ids only"); }
  assert.ok(html.includes("write to <code>dana@loop.example</code>"), "copyable fallback contact");
  assert.ok(html.includes("cannot know whether a newer revision exists"), "no supersession claim");
  assert.ok(/<strong>Data<\/strong> Retained inputs are kept: artifact replay and analysis rerun are possible\./.test(html), "a Finding that did retain its inputs says so, with its guarantees");
  assert.ok(existsSync(join(finding(root, NUMERIC), "render", "retention_by_arm_chart.svg")) && existsSync(join(finding(root, NUMERIC), "render", "retention_by_arm_chart.png")));
  const svg = readFileSync(join(finding(root, NUMERIC), "render", "retention_by_arm_chart.svg"), "utf8");
  assert.ok(/<title id="chart-retention_by_arm_chart-title">Users who saw the checklist came back more often: 34\.8% vs 28\.5%<\/title>/.test(svg) && /<desc id=/.test(svg), "chart carries title and description");
  assert.ok(/role="img" aria-labelledby=/.test(html), "inline chart is labelled");
  assert.ok(html.split("<details").length >= 6 && html.split('scope="col"').length >= 8 && html.split('scope="row"').length >= 3, "expandable sections and semantic tables");
  assert.ok(html.includes('name="viewport"') && html.includes("max-width: 30rem"), "phone rules present");
  // Every resolved value carries a provenance popover: result, query, retained inputs, definition. CSS only, no script.
  const refs = html.match(/<span class="ref" tabindex="0" aria-describedby="tip-\d+">/g) ?? [];
  assert.ok(refs.length >= 20, `every token carries a popover (${refs.length})`);
  const tip = /<span class="ref" tabindex="0" aria-describedby="(tip-\d+)">34\.8%<span class="tip" id="\1" role="tooltip">([\s\S]*?)<\/span><\/span><\/span>/.exec(html);
  assert.ok(tip, "34.8% has a popover");
  for (const needle of ["results/retention_by_arm.json", "row <code>checklist</code>", "queries/retention_by_arm.sql", "inputs/users.csv", "retained_7d</code> version 2", "recorded, not verified here", "{{ref:retention_by_arm.checklist.retained_7d_rate}}"]) assert.ok(tip![2]!.includes(needle), needle);
  // The exemplar's lift declares NAMED operands, so the popover says which value is the measured one and
  // which the reference. That, not the arithmetic, is what a reader cannot otherwise check: both operand
  // orders are valid and one of them renders the opposite sign (ag-derived-named-operands-kbk).
  assert.ok(/<span class="ref"[^>]*>6\.3 pp<span class="tip"[^>]*>[\s\S]*?The difference of after 34\.8%[\s\S]*?against baseline 28\.5%/.test(html), "derived value explains its calculation and names which operand is which");
  assert.ok(/<span class="ref"[^>]*>3 pp<span class="tip"[^>]*>[\s\S]*?not a measurement/.test(html), "external target is labelled as not a measurement");
  for (const svg of html.match(/<svg[\s\S]*?<\/svg>/g) ?? []) assert.ok(!svg.includes('class="ref"'), "no popover markup inside chart SVG");
  assert.ok(/<td class="num"><span class="ref"/.test(html), "numeric table cells carry popovers");
  assert.ok(/<li><span class="mk ok">✓<\/span><span><strong>Checks passed<\/strong>/.test(html) && /<span class="mk no">×<\/span><span><strong>Publication approval<\/strong>/.test(html), "facts carry separate marks");

  const r2 = await render({ dir: finding(root, INSUFFICIENT), generatedAt: "2026-09-15T12:00:00Z" });
  assert.equal(r2.errors.length, 0, JSON.stringify(r2.errors));
  const html2 = readFileSync(join(finding(root, INSUFFICIENT), "render", "finding.html"), "utf8");
  assert.ok(!html2.includes("<svg"), "no chart for the insufficient-data Finding");
  for (const v of ["We cannot tell yet", "2026-10-05", ">7<", ">67<", "887"]) assert.ok(html2.includes(v), v);
  assert.ok(/this failure is the result of the Finding, not an error/.test(html2));
  assert.ok(/Method review<\/strong>[^<]*stale/.test(html2), "stale review is said to be stale");
});

test("reader-safe export: private sentinels and non-exported fields never reach HTML, SVG or PNG; unsafe markup is escaped", async () => {
  const root = copy();
  const dir = finding(root, NUMERIC);
  const mp = join(dir, "manifest.yaml"); const m = parseYaml(readFileSync(mp, "utf8"));
  // A non-exported column with a sentinel value, and hostile markup in an authored field.
  m.results[0].columns.push({ name: "secret", type: "text", unit: "text" });
  const rp = join(dir, "results", "retention_by_arm.json"); const data = JSON.parse(readFileSync(rp, "utf8"));
  data.columns.push("secret"); for (const row of data.rows) row.secret = "PRIVATE_FIXTURE_MARKER_DO_NOT_RENDER";
  writeFileSync(rp, JSON.stringify(data, null, 2) + "\n");
  m.finding.title = 'Title <script>alert(1)</script> & "quotes"';
  m.tables[0].title = "<img src=x onerror=alert(1)>";
  m.attestations = []; m.reviews = [];
  for (const r of m.results) { const b = readFileSync(join(dir, r.path)); const { createHash } = await import("node:crypto"); r.content_hash.value = createHash("sha256").update(b).digest("hex"); const ex = m.executions.find((e: any) => e.result_id === r.id); ex.result_hash.value = r.content_hash.value; }
  m.content_digest = digestOf(m, dir);
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  writeFileSync(mp, toYaml(m, { lineWidth: 0 }));
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8").replace("## Appendix", "## Appendix\n\n<script>alert('memo')</script> [x](javascript:alert('y'))\n"));
  // memo changed: re-pin digest
  m.content_digest = digestOf(m, dir); writeFileSync(mp, toYaml(m, { lineWidth: 0 }));
  const r = await render({ dir, png: true });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  for (const f of ["finding.html", "retention_by_arm_chart.svg", "retention_by_arm_chart.png"]) {
    const bytes = readFileSync(join(dir, "render", f));
    assert.ok(!bytes.includes("PRIVATE_FIXTURE_MARKER_DO_NOT_RENDER"), `${f} must not contain the sentinel`);
    assert.ok(!bytes.includes("secret"), `${f} must not contain the non-exported column`);
  }
  const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
  assert.ok(!/<script/.test(html) && !/<img/.test(html) && !/href="javascript/.test(html), "hostile markup escaped, never emitted as tags or hrefs");
  assert.ok(html.includes("&lt;script&gt;"), "escaped, not dropped");
});

test("render refuses invalid evidence and forbidden chart specs, leaving previous outputs untouched", async () => {
  const root = copy();
  const dir = finding(root, NUMERIC);
  const out = join(dir, "render", "finding.html");
  writeFileSync(out, "previous output");
  const rp = join(dir, "results", "retention_by_arm.json");
  writeFileSync(rp, readFileSync(rp, "utf8").replace('"retained": 217', '"retained": 317'));
  const r = await render({ dir });
  assert.ok(r.errors.some((e) => e.category === "hash_mismatch"));
  assert.equal(readFileSync(out, "utf8"), "previous output");
  const root2 = copy(); const dir2 = finding(root2, NUMERIC);
  const sp = join(dir2, "charts", "retention_by_arm.vl.json"); const spec = JSON.parse(readFileSync(sp, "utf8"));
  spec.transform = [{ filter: "datum.arm == 'checklist'" }];
  writeFileSync(sp, JSON.stringify(spec));
  const m = parseYaml(readFileSync(join(dir2, "manifest.yaml"), "utf8")); m.attestations = []; m.reviews = []; m.content_digest = digestOf(m, dir2);
  rmSync(join(root2, "analytics", "decisions"), { recursive: true, force: true });
  writeFileSync(join(dir2, "manifest.yaml"), toYaml(m, { lineWidth: 0 }));
  const r2 = await render({ dir: dir2 });
  assert.ok(r2.errors.some((e) => e.category === "chart_subset"), JSON.stringify(r2.errors));
});

// ag-falsifier-outcome-cov. The Finding this bead exists for: a pre-registered falsifier recorded fail, the
// Finding says inconclusive, and the page must EXIST — with the falsifier on it in the Question's own words.
test("a failed falsifier is its own fact on a draft page, and never a reason to refuse the render", async () => {
  const root = copy();
  const dir = finding(root, NUMERIC);
  const mp = join(dir, "manifest.yaml");
  const m = parseYaml(readFileSync(mp, "utf8"));
  m.checks.find((c: any) => c.id === "falsifier_lift").outcome = "fail";
  m.finding.outcome = "inconclusive";
  // Reviews and attestations bind content, so they are dropped rather than rebound to a Finding they never saw.
  m.reviews = []; m.attestations = [];
  m.content_digest = digestOf(m, dir);
  rmSync(join(root, "analytics", "decisions"), { recursive: true, force: true });
  writeFileSync(mp, toYaml(m, { lineWidth: 0 }));

  const r = await render({ dir, generatedAt: "2026-09-16T12:00:00Z" });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.ok(r.warnings.some((w) => w.category === "falsifier_failed"), JSON.stringify(r.warnings));
  const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
  assert.ok(
    /<span class="mk no">×<\/span><span><strong>Falsifier<\/strong> [^<]*7-day retention is not at least 3 percentage points above the control arm[^<]*— recorded fail; this Finding is inconclusive\./.test(html),
    "the falsifier is one fact, in the Question's words, with a no mark",
  );
  assert.ok(!/<strong>Checks that did not pass<\/strong>[^<]*at least 500 users/.test(html), "it is said once, not twice");
  assert.ok(/class="draft"/.test(html), "an inconclusive Finding is still a draft until a human approves it");
  assert.ok(html.includes("<svg"), "the evidence still renders: the numbers are not in doubt, the Answer is");
});

test("an incomplete draft renders with an incomplete label and no invented content", async () => {
  const root = copy();
  const r = await render({ dir: finding(root, "companion-needs-input") });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const html = readFileSync(join(finding(root, "companion-needs-input"), "render", "finding.html"), "utf8");
  assert.ok(/Incomplete draft/.test(html));
  assert.ok(!/<svg|<table/.test(html));
});

test("a recorded Finding says on the page who ran it, in one line beside the other facts", async () => {
  const root = copy();
  const dir = finding(root, RECORDED);
  const r = await render({ dir, generatedAt: "2026-09-16T12:00:00Z" });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
  assert.ok(
    html.includes("<strong>How this was run</strong> Queries and Checks were run by the Operator's tool duckdb cli; aftergrid recorded them and did not rerun them."),
    "the recorded-path fact is on the page, in the Reader's words",
  );
  // It is a fact among facts, not a badge: it carries its own mark and the Data fact stays separate.
  assert.ok(/<span class="mk wn">!<\/span><span><strong>How this was run<\/strong>/.test(html), "it carries its own mark");
  // Nothing was retained here, and the Data fact says that rather than reading a guarantee as a kept copy.
  assert.ok(
    html.includes('<span class="mk no">×</span><span><strong>Data</strong> No copy of the data was kept. The saved results replay byte for byte; the queries cannot be rerun here.'),
    "the Data fact reports the empty Snapshot, with its own mark",
  );
  assert.ok(!/Retained inputs are kept/.test(html), "a Finding that retained nothing never says inputs are kept");
  assert.ok(/class="draft"/.test(html), "nothing about being recorded makes a draft approved");
  // The provenance popover tells the same truth about where the numbers came from.
  assert.ok(html.includes("the source, read by duckdb cli; aftergrid recorded the result and did not run the query"), "the value popover does not claim a retained copy");
  assert.ok(!html.includes("retained inputs not recorded"), "and it does not report the recorded path as a missing record");
});

test("retained inputs with an empty guarantee list are reported as kept but unproven, never as a malformed promise", async () => {
  // capture leaves guarantees empty and execute empties it when a run saved no result; both are real states.
  const root = copy();
  const dir = finding(root, INSUFFICIENT);
  const mp = join(dir, "manifest.yaml");
  const m = parseYaml(readFileSync(mp, "utf8"));
  m.snapshot.guarantees = []; m.attestations = []; m.reviews = [];
  m.content_digest = digestOf(m, dir);
  writeFileSync(mp, toYaml(m, { lineWidth: 0 }));
  const r = await render({ dir, generatedAt: "2026-09-16T12:00:00Z" });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const html = readFileSync(join(dir, "render", "finding.html"), "utf8");
  assert.ok(html.includes('<span class="mk wn">!</span><span><strong>Data</strong> Retained inputs are kept, but no replay or rerun from them has been recorded yet.'), "kept, unproven, with a warning mark");
  assert.ok(!/are possible\./.test(html), "no guarantee is named when none is held");
  assert.ok(!/mk ok">✓<\/span><span><strong>Data/.test(html), "the ok mark is reserved for a held guarantee");
});
