// ag-write-finding-narrative-kpc: the /write-finding and /shape-narrative contracts, held by recorded runs.
//
// A skill reasons with a model in the loop, which this suite cannot run. What it can run is the contract the
// skill is written against: fixtures/runs/<run>/ holds an Analysis directory (input/) and the Finding the
// skill is expected to produce from it (output/), both hand-authored, with run.yaml recording both digests
// and the absence of a model. So the assertions here are mechanical ones — evidence validity, the writer's
// field boundary, answer-first structure, bound values, Reader vocabulary, causal wording — and the
// judgements a lint cannot make (whether a caveat is the one that matters, whether "doubled" is earned) are
// deliberately absent: they live in skills/shape-narrative/references/narrative-criteria.md and are the
// Reader reviewer's, not this file's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { check } from "./commands/check.ts";
import { render } from "./commands/render.ts";

const RUNS = fileURLToPath(new URL("../fixtures/runs/", import.meta.url));

/** The manifest fields /write-finding owns. Everything else must survive the skill byte-identical. */
const WRITER_OWNED = new Set([
  "claims", "charts", "tables", "derived", "external_sources",
  "coverage", "export_policy", "reader", "content_digest",
]);
/** Inside `finding`. `generated_at` is volatile and excluded from the digest; the rest identify the Finding. */
const WRITER_OWNED_FINDING = new Set(["state", "outcome", "title", "generated_at"]);

/** Evidence the writer reads and never writes: a change to any of these is the failure the boundary catches. */
const EVIDENCE_DIRS = ["inputs", "queries", "checks", "results"];

/**
 * Verbs that assert a cause. Applied to a Finding that reached no answer, where nothing established one.
 * Deliberately not a general-purpose detector: "because" introducing a method choice is fine and stays off
 * this list, and a quantity spelled in words ("doubled") is a review concern, not a lint.
 */
const CAUSAL_VERBS = [
  "caused", "causes", "causing", "drove", "drives", "driving", "led to", "leads to",
  "resulted in", "results in", "due to", "because of", "thanks to", "responsible for",
  "impact of", "effect of", "made more", "brought about",
];

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const readRun = (run: string) => parseYaml(readFileSync(join(RUNS, run, "run.yaml"), "utf8"));
const readManifest = (dir: string) => parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));

/** A temp copy of the whole fixtures/runs Instance, so check and render can write without touching fixtures. */
function copyRuns(): string {
  const root = mkdtempSync(join(tmpdir(), "ag-writer-"));
  cpSync(RUNS, root, { recursive: true });
  return root;
}

/** Every file under `dir`, as repo-relative path -> sha256, so two directories can be compared by content. */
function hashTree(dir: string, base = dir): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, hashTree(p, base));
    else if (statSync(p).isFile()) out[relative(base, p)] = sha(readFileSync(p));
  }
  return out;
}

/** memo prose with tokens, HTML comments and front matter removed: what a Reader actually reads. */
function prose(memo: string): string {
  return memo
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/\{\{(ref|derived|ext|literal):[^}]*\}\}/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** The body of one `## ` section of a memo, excluding the heading line. */
function section(memo: string, name: string): string {
  const lines = memo.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  assert.ok(start >= 0, `memo has no ## ${name} section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

const RUN_NAMES = ["kpc-numeric", "kpc-insufficient"] as const;

// ---------------------------------------------------------------------------------------------------------

test("recorded runs are pinned: run.yaml names both digests, the analysis.yaml hash and no model", () => {
  for (const name of RUN_NAMES) {
    const run = readRun(name);
    assert.equal(run.skill, "write-finding");
    assert.equal(run.model, "recorded by hand (no model run)", `${name}: a recorded run never claims a model ran`);
    assert.equal(run.reviewer_outcome.state, "not_exercised", `${name}: no reviewer ran, and run.yaml says so`);
    for (const side of ["input", "output"] as const) {
      const dir = join(RUNS, name, side);
      assert.equal(readManifest(dir).content_digest.value, run[side].manifest_content_digest,
        `${name}/${side}: manifest content_digest differs from the one run.yaml recorded`);
      assert.equal(sha(readFileSync(join(dir, "analysis.yaml"))), run[side].analysis_yaml_sha256,
        `${name}/${side}: analysis.yaml differs from the one run.yaml recorded`);
      const m = readManifest(dir);
      assert.equal(m.finding.state, run[side].finding_state);
      assert.equal(m.finding.outcome, run[side].finding_outcome);
      assert.equal(m.reader.profile, run[side].reader_profile);
    }
  }
});

test("every recorded output is evidence-valid, complete and rendered as a draft; every input is a valid incomplete Analysis", async () => {
  const root = copyRuns();
  for (const name of RUN_NAMES) {
    const run = readRun(name);

    const inp = await check({ dir: join(root, name, "input"), github: null });
    assert.equal(inp.errors.length, 0, `${name}/input: ${JSON.stringify(inp.errors)}`);
    assert.equal(inp.content, "incomplete", `${name}/input is an Analysis directory, not a Finding`);
    assert.equal(inp.state, "draft");

    const out = await check({ dir: join(root, name, "output"), github: null });
    assert.equal(out.errors.length, 0, `${name}/output: ${JSON.stringify(out.errors)}`);
    assert.equal(out.evidence, "valid", `${name}/output evidence must be valid`);
    assert.equal(out.content, "complete");
    assert.equal(out.outcome, run.output.finding_outcome);
    // The writer produces a draft. Readiness is a human's APPROVED review, verified elsewhere.
    assert.equal(out.readiness, "not_ready", `${name}/output must not claim publication readiness`);

    const r = await render({ dir: join(root, name, "output"), generatedAt: "2026-09-16T12:00:00Z" });
    assert.equal(r.errors.length, 0, `${name}/output render: ${JSON.stringify(r.errors)}`);
    assert.equal(r.warnings.length, 0, `${name}/output render: ${JSON.stringify(r.warnings)}`);
    const html = readFileSync(join(root, name, "output", "render", "finding.html"), "utf8");
    assert.ok(/class="draft"/.test(html), `${name}: a Finding with no verified approval renders labelled draft`);
  }
});

test("the writer changes only the fields it owns: no query, Check, result, retained input or definition moves", () => {
  for (const name of RUN_NAMES) {
    const inp = join(RUNS, name, "input"), out = join(RUNS, name, "output");
    const im = readManifest(inp), om = readManifest(out);

    for (const key of Object.keys({ ...im, ...om })) {
      if (WRITER_OWNED.has(key) || key === "finding") continue;
      assert.deepEqual(om[key], im[key], `${name}: manifest.${key} is evidence the writer reads, not a field it writes`);
    }
    for (const key of Object.keys({ ...im.finding, ...om.finding })) {
      if (WRITER_OWNED_FINDING.has(key)) continue;
      assert.deepEqual(om.finding[key], im.finding[key], `${name}: manifest.finding.${key} identifies the Finding and never changes`);
    }
    // Stated positively as well: the writer really did write its half.
    assert.equal(im.finding.state, "draft");
    assert.equal(om.finding.state, "complete");
    assert.ok(im.claims.length === 0 && om.claims.length > 0, `${name}: the writer adds the Claims`);
    assert.ok(om.coverage.description !== im.coverage.description, `${name}: the writer states coverage`);
    assert.ok(om.export_policy.allowed_fields.length > 0 && im.export_policy.allowed_fields.length === 0,
      `${name}: the writer declares what may reach the Reader`);

    // Evidence files, and the Analysis directory's own record, are byte-identical on both sides.
    for (const sub of EVIDENCE_DIRS) {
      assert.deepEqual(hashTree(join(out, sub)), hashTree(join(inp, sub)),
        `${name}: ${sub}/ differs between the Analysis directory and the Finding`);
    }
    assert.equal(sha(readFileSync(join(out, "analysis.yaml"))), sha(readFileSync(join(inp, "analysis.yaml"))),
      `${name}: analysis.yaml belongs to /checked-analysis`);
    // charts/ is the only directory the writer creates, and only where there is a chart.
    assert.equal(existsSync(join(inp, "charts")), false, `${name}: an Analysis directory carries no chart specs`);

    // The hashes in the manifest still name the same bytes, so "unchanged" is not just an unchanged pointer.
    for (const list of ["queries", "checks", "results"] as const) {
      for (const [i, entry] of om[list].entries()) {
        assert.equal(entry.content_hash.value, im[list][i].content_hash.value, `${name}: ${list}[${i}] re-pinned`);
        assert.equal(sha(readFileSync(join(out, entry.path))), entry.content_hash.value, `${name}: ${entry.path} matches its hash`);
      }
    }
    for (const [i, s] of om.snapshot.inputs.entries()) {
      assert.equal(sha(readFileSync(join(out, s.path))), s.content_hash.value, `${name}: retained input ${i} matches its hash`);
    }
  }
});

test("the writer records no review and no attestation", () => {
  for (const name of RUN_NAMES) {
    const om = readManifest(join(RUNS, name, "output"));
    assert.deepEqual(om.reviews, [], `${name}: /analysis-review writes reviews[], not the writer`);
    assert.deepEqual(om.attestations, [], `${name}: an attestation is a human's`);
  }
});

test("both Reader profiles are exercised: one named profile from readers.md, one generic fallback with disclosure", () => {
  const named = readManifest(join(RUNS, "kpc-numeric", "output"));
  assert.equal(named.reader.profile, "product_owner");
  const readers = readFileSync(join(RUNS, "readers.md"), "utf8");
  assert.ok(new RegExp(`^## ${named.reader.profile}\\s*$`, "m").test(readers), "the named profile exists in readers.md");

  const generic = readManifest(join(RUNS, "kpc-insufficient", "output"));
  assert.equal(generic.reader.profile, "generic");
  const memo = readFileSync(join(RUNS, "kpc-insufficient", "output", "memo.md"), "utf8");
  assert.match(section(memo, "How we checked"), /general reader/i,
    "a generic Reader is told the memo was written for nobody in particular");
});

test("answer-first: the Answer opens the memo, carries the material caveat, and the answer-bearing Claim leads", () => {
  for (const name of RUN_NAMES) {
    const dir = join(RUNS, name, "output");
    const m = readManifest(dir);
    const memo = readFileSync(join(dir, "memo.md"), "utf8");

    const headings = [...memo.matchAll(/^## (.+)$/gm)].map((x) => x[1]!.trim());
    assert.equal(headings[0], "Answer", `${name}: Answer is the first section`);

    const answer = section(memo, "Answer");
    assert.ok(answer.includes("<!-- material_caveat -->"), `${name}: the caveat sits inside the Answer section`);
    const bearing = m.claims.filter((c: any) => c.answer_bearing);
    assert.equal(bearing.length, 1, `${name}: exactly one answer-bearing Claim`);
    assert.equal(m.claims[0].id, bearing[0].id, `${name}: the answer-bearing Claim leads claims[], which is render order`);
    const caveat = answer.slice(answer.indexOf("<!-- material_caveat -->") + "<!-- material_caveat -->".length).trim();
    assert.ok(caveat.startsWith(bearing[0].material_caveat.trim().slice(0, 60)), `${name}: the caveat is the Claim's, verbatim`);

    // The Answer sentence comes before the caveat and says something.
    const opening = answer.split("<!-- material_caveat -->")[0]!.trim();
    assert.ok(opening.length > 0 && opening.length < 400, `${name}: the Answer is one short paragraph, not a section`);

    // Evidence subsections follow claims[] order, one per Claim, heading = sentence.
    const subs = [...section(memo, "Evidence").matchAll(/^### (.*?)\s*<!-- claim: ([a-z0-9_]+) -->\s*$/gm)];
    assert.deepEqual(subs.map((s) => s[2]), m.claims.map((c: any) => c.id), `${name}: subsections follow claims[] order`);
    for (const s of subs) {
      const claim = m.claims.find((c: any) => c.id === s[2]);
      assert.equal(s[1]!.trim(), claim.sentence.trim(), `${name}: ${s[2]} heading states the Claim`);
    }
  }
});

test("every numeric Claim leads with its figure and is backed by a chart or table whose title states the Claim", () => {
  for (const name of RUN_NAMES) {
    const dir = join(RUNS, name, "output");
    const m = readManifest(dir);
    const ev = section(readFileSync(join(dir, "memo.md"), "utf8"), "Evidence");
    const bodies = ev.split(/^### /m).slice(1);

    for (const claim of m.claims) {
      const figures = [...(claim.chart_ids ?? []), ...(claim.table_ids ?? [])];
      if (!claim.numeric) { assert.equal(figures.length, 0, `${name}: ${claim.id} asserts no number and needs no figure`); continue; }
      assert.ok(figures.length >= 1, `${name}: numeric Claim ${claim.id} needs a chart or a table`);
      assert.ok(claim.evidence.length >= 1, `${name}: numeric Claim ${claim.id} needs at least one evidence reference`);

      const body = bodies.find((b) => b.includes(`<!-- claim: ${claim.id} -->`))!;
      const afterHeading = body.slice(body.indexOf("-->") + 3);
      const firstContent = afterHeading.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
      assert.match(firstContent!, /^<!-- (chart|table): [a-z0-9_]+ -->$/,
        `${name}: ${claim.id} opens with its figure, then the prose`);
    }
    // Chart and table titles are claims with values bound, not axis labels.
    for (const fig of [...m.charts, ...m.tables]) {
      assert.ok(typeof fig.title === "string" && fig.title.length > 0, `${name}: ${fig.id} has a title`);
      const claim = m.claims.find((c: any) => c.id === fig.claim_id);
      assert.ok(claim, `${name}: ${fig.id} names a Claim`);
      if (m.charts.includes(fig)) {
        const tokens = [...fig.title.matchAll(/\{\{(ref|derived|ext):([^}]*)\}\}/g)].map((t) => `${t[1]}:${t[2]}`);
        assert.ok(tokens.length > 0, `${name}: chart ${fig.id} states the Claim with its values bound`);
        for (const t of tokens) assert.ok(claim.evidence.includes(t), `${name}: chart title value ${t} is evidence of ${claim.id}`);
      }
    }
  }
});

test("every displayed value is bound, and every column a figure shows is allowed to leave the Instance", () => {
  for (const name of RUN_NAMES) {
    const dir = join(RUNS, name, "output");
    const m = readManifest(dir);
    const memo = readFileSync(join(dir, "memo.md"), "utf8");
    const allowed = new Set<string>(m.export_policy.allowed_fields);

    const tokens = [...memo.matchAll(/\{\{(ref|derived|ext):([^}]*)\}\}/g)];
    assert.ok(tokens.length > 0, `${name}: the memo carries bound values, not typed numbers`);

    const resolvable = new Set<string>([
      ...m.derived.map((d: any) => `derived:${d.id}`),
      ...m.external_sources.map((e: any) => `ext:${e.id}`),
    ]);
    for (const t of tokens) {
      const ref = `${t[1]}:${t[2]}`;
      if (t[1] === "ref") {
        const [rid, , col] = t[2]!.split(".");
        assert.ok(m.results.some((r: any) => r.id === rid && r.columns.some((c: any) => c.name === col)), `${name}: ${ref} names a declared column`);
        assert.ok(allowed.has(`${rid}.${col}`), `${name}: ${ref} is displayed, so ${rid}.${col} belongs in allowed_fields`);
      } else {
        assert.ok(resolvable.has(ref), `${name}: ${ref} is declared`);
      }
    }
    for (const t of m.tables) for (const c of t.columns) assert.ok(allowed.has(`${t.result_id}.${c.name}`), `${name}: table column ${t.result_id}.${c.name} is exported`);
    // Every declared external source says where it came from; a target is never presented as a measurement.
    for (const e of m.external_sources) {
      assert.ok(["target", "assumption", "external_reference"].includes(e.kind), `${name}: ${e.id} is typed`);
      assert.ok(e.source?.type && e.source?.description && e.source?.date, `${name}: ${e.id} names its source`);
    }
  }
});

test("Reader-level language: no word on the profile's avoid list survives in the prose", () => {
  const profiles: Record<string, string[]> = {
    "kpc-numeric": parseYaml(
      /```yaml\n([\s\S]*?)```/.exec(readFileSync(join(RUNS, "readers.md"), "utf8").split("## product_owner")[1]!)![1]!,
    ).vocabulary.avoid,
    "kpc-insufficient": parseYaml(
      readFileSync(fileURLToPath(new URL("../schema/generic-reader-profile.yaml", import.meta.url)), "utf8"),
    ).vocabulary.avoid,
  };
  for (const name of RUN_NAMES) {
    const text = prose(readFileSync(join(RUNS, name, "output", "memo.md"), "utf8")).toLowerCase();
    for (const word of profiles[name]!) {
      assert.ok(!new RegExp(`\\b${word.toLowerCase()}`).test(text), `${name}: the memo uses "${word}", which this Reader's profile asks it to avoid`);
    }
  }
});

test("the insufficient-data Finding asserts no cause and invents no number", () => {
  const dir = join(RUNS, "kpc-insufficient", "output");
  const m = readManifest(dir);
  const memo = readFileSync(join(dir, "memo.md"), "utf8");

  assert.equal(m.finding.outcome, "insufficient_data");
  for (const c of m.claims) assert.equal(c.type, "descriptive", `${c.id}: nothing here compares a treated group with an untreated one`);

  const surfaces = [
    prose(memo),
    m.finding.title,
    ...m.claims.flatMap((c: any) => [c.sentence, c.population, c.material_caveat ?? "", c.comparison.description, ...c.exclusions, ...c.limitations]),
    ...m.tables.map((t: any) => t.title),
  ].join("\n").toLowerCase();
  for (const verb of CAUSAL_VERBS) assert.ok(!surfaces.includes(verb), `the non-answer uses causal wording: "${verb}"`);

  // The non-answer is the first thing a Reader meets, and the falsifier was not evaluated.
  assert.match(section(memo, "Answer").trim(), /^We cannot tell yet/, "the Answer says the non-answer in its first clause");
  const falsifier = m.checks.find((c: any) => c.kind === "falsifier");
  assert.equal(falsifier.outcome, "not_run", "a falsifier below its minimum-data gate is not run, never guessed");
  assert.equal(m.checks.find((c: any) => c.kind === "minimum_data").outcome, "fail");
  // A Claim with no number is representable, and is how the withheld comparison is stated.
  assert.ok(m.claims.some((c: any) => c.numeric === false && c.evidence.length === 0), "the withheld comparison is a non-numeric Claim");
});

test("the numeric Finding's causal Claim is earned by randomised assignment, and the exploratory cut is not", () => {
  const m = readManifest(join(RUNS, "kpc-numeric", "output"));
  const analysis = parseYaml(readFileSync(join(RUNS, "kpc-numeric", "input", "analysis.yaml"), "utf8"));

  const c1 = m.claims.find((c: any) => c.id === "c1");
  assert.equal(c1.type, "causal");
  assert.equal(c1.comparison.kind, "variant_vs_control");
  assert.equal(c1.comparison.pre_registered, true);
  assert.match(analysis.candidate_claims.find((c: any) => c.id === "c1").causal_basis, /randomis(ed|ing) assignment/i,
    "the Analysis recorded the only basis v0 accepts for a causal Claim");
  assert.match(c1.material_caveat, /at random/i, "the caveat names the randomisation the conclusion rests on");

  const c2 = m.claims.find((c: any) => c.id === "c2");
  assert.equal(c2.type, "associational", "a split chosen after seeing the result is never causal");
  assert.equal(c2.comparison.pre_registered, false);
  assert.ok(!c2.answer_bearing, "an exploratory Claim never carries the Answer");
  for (const c of m.claims) assert.ok(c.comparison.kind !== "none", "an associational or causal Claim compares something");
});
