// ag-write-finding-narrative-kpc: the /write-finding and /shape-narrative contracts, held by recorded runs.
//
// A skill reasons with a model in the loop, which this suite cannot run. What it can run is the contract the
// skill is written against: fixtures/runs/<run>/ holds an Analysis directory (input/) and the Finding the
// skill is expected to produce from it (output/), both hand-authored, with run.yaml recording both digests
// and the absence of a model. So the assertions here are mechanical ones — evidence validity, the writer's
// field boundary, answer-first structure, bound values, figure titles, Reader vocabulary, causal wording —
// and the judgements a lint cannot make (whether a caveat is the one that matters, whether "doubled" is
// earned) are deliberately absent: they live in skills/shape-narrative/references/narrative-criteria.md and
// are the Reader reviewer's, not this file's.
//
// Three tests at the end read the skill prose rather than the fixtures. A step that sends a writer to a
// field the Analysis schema does not define sends it to nothing, and a writer with nothing to read decides
// the value itself — the invented threshold the skill's own Boundaries table refuses. That is mechanical
// too, so it lives here.
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
const WRITER_SKILL = fileURLToPath(new URL("../skills/write-finding/", import.meta.url));
const readJson = (url: URL) => JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
const ANALYSIS_SCHEMA = readJson(new URL("./analysis/analysis.schema.json", import.meta.url));
const MANIFEST_SCHEMA = readJson(new URL("../schema/finding-manifest.schema.json", import.meta.url));

/**
 * The manifest paths /write-finding owns. Everything else must survive the skill byte-identical.
 *
 * Ownership is path-level, not block-level. The skill owns `export_policy.allowed_fields` and
 * `reader.profile` (skills/write-finding/SKILL.md, docs/skills/write-finding.md), not the blocks they sit
 * in: listing the coarse keys here would let `recipient_scope`, `granularity`, `delivery` and
 * `private_marker` change, or disappear, with the boundary reporting nothing. `private_marker` is the one
 * that bites — it is optional in schema/finding-manifest.schema.json, and both guards that use it are
 * conditional on its presence (the memo scan at scripts/lib/validate-finding.mjs:230, the output-byte
 * refusal in src/commands/render.ts) — so a writer that dropped it would disable the Instance's
 * private-content sentinel and still pass `check`, `render` and this file.
 *
 * `finding.generated_at` is volatile and excluded from the digest; the other `finding` paths identify the
 * Finding and are the writer's to set.
 */
const WRITER_OWNED = new Set([
  "claims", "charts", "tables", "derived", "external_sources", "coverage", "content_digest",
  "export_policy.allowed_fields", "reader.profile",
  "finding.state", "finding.outcome", "finding.title", "finding.generated_at",
]);

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

/**
 * A title that opens by asking, or by pointing back at another figure, names the artifact instead of
 * stating the Claim: "Who was counted, and how many came back", "The same comparison, phones and web
 * separately". A blunt proxy for a judgement that is the Reader reviewer's
 * (skills/shape-narrative/references/narrative-criteria.md, criterion 8); it reads the opening, not the
 * sentence, so a label it does not catch is still a review finding.
 */
const LABEL_OPENER = /^\s*(who|what|which|when|where|why|how|the same|this|that|these|those|summary|overview|breakdown)\b/i;

/** Words too common to tell a title about its Claim from a title about the table it sits on. */
const STOPWORDS = new Set([
  "more", "than", "with", "that", "this", "from", "have", "been", "they", "them", "their", "there", "were",
  "what", "when", "which", "while", "into", "over", "only", "also", "both", "each", "most", "some", "such",
  "then", "does", "done", "will", "about", "same", "those", "these", "here", "very", "much",
]);

/** Content words of a title or sentence, value tokens removed. */
const contentWords = (text: string): Set<string> =>
  new Set((text.toLowerCase().replace(/\{\{[^}]*\}\}/g, " ").match(/[a-z]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w)));

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

/**
 * Every leaf path at which two manifests differ, excluding the paths the writer owns. An empty array is the
 * boundary holding; each entry is a field the writer moved and was not entitled to.
 */
function boundaryViolations(input: any, output: any): string[] {
  const out: string[] = [];
  const isPlainObject = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  const walk = (a: any, b: any, path: string) => {
    if (WRITER_OWNED.has(path)) return;
    if (isPlainObject(a) && isPlainObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path ? `${path}.${key}` : key);
      return;
    }
    try { assert.deepEqual(b, a); } catch { out.push(path); }
  };
  walk(input, output, "");
  return out.sort();
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
    // `render` carries `check`'s warnings forward, and these recorded outputs raise exactly one kind:
    // `direction_unstated` on a derived difference declared with a positional operand pair. They are RECORDED
    // RUN OUTPUT — a record of what the writer wrote on 2026-09-16, before named operands existed
    // (ag-derived-named-operands-kbk) — and one of the two shapes involved has no honest after/baseline
    // reading at all: a policy minimum minus what has accumulated. Editing them to adopt the convention would
    // make the fixture claim the run wrote something it did not. The reviewed exemplars under
    // fixtures/instance, which are the living reference, ARE converted and raise nothing. Any other warning,
    // and any warning anywhere but a derived entry, is still a failure.
    const unexpected = r.warnings.filter((w) => !(w.category === "direction_unstated" && /^manifest\.yaml#\/derived\/\d+$/.test(w.location)));
    assert.deepEqual(unexpected, [], `${name}/output render: ${JSON.stringify(unexpected)}`);
    const html = readFileSync(join(root, name, "output", "render", "finding.html"), "utf8");
    assert.ok(/class="draft"/.test(html), `${name}: a Finding with no verified approval renders labelled draft`);
  }
});

test("the writer changes only the fields it owns: no query, Check, result, retained input or definition moves", () => {
  for (const name of RUN_NAMES) {
    const inp = join(RUNS, name, "input"), out = join(RUNS, name, "output");
    const im = readManifest(inp), om = readManifest(out);

    assert.deepEqual(boundaryViolations(im, om), [],
      `${name}: these manifest paths are evidence the writer reads, or the Instance's to set, not fields it writes`);
    // Stated positively as well: the writer really did write its half.
    assert.equal(im.finding.state, "draft");
    assert.equal(om.finding.state, "complete");
    assert.ok(im.claims.length === 0 && om.claims.length > 0, `${name}: the writer adds the Claims`);
    assert.ok(om.coverage.description !== im.coverage.description, `${name}: the writer states coverage`);
    assert.ok(om.export_policy.allowed_fields.length > 0 && im.export_policy.allowed_fields.length === 0,
      `${name}: the writer declares what may reach the Reader`);
    // Stated positively as well, because both sentinel guards are conditional on the marker's presence:
    // an absent marker is not a lenient policy, it is no policy.
    for (const [side, m] of [["input", im], ["output", om]] as const) {
      assert.ok(typeof m.export_policy.private_marker === "string" && m.export_policy.private_marker.length > 0,
        `${name}/${side}: the Instance's private_marker is what makes the memo scan and the render refusal run at all`);
      assert.equal(m.export_policy.granularity, "aggregate_only",
        `${name}/${side}: row_level is refused in v0 (docs/contracts/finding-manifest.md)`);
    }

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

test("every numeric Claim leads with its figure, and every chart and table title states its Claim", () => {
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
    // Chart and table titles state their Claim, and both are held to it. A chart title carries the values as
    // tokens and the render resolves them; a table caption is emitted verbatim (src/render/html.ts), so a
    // token in a table title would reach a Reader as literal braces — it states the Claim in words and the
    // rows underneath carry the numbers. skills/shape-narrative/SKILL.md step 4 is the contract.
    for (const fig of [...m.charts, ...m.tables]) {
      const isChart = m.charts.includes(fig);
      const kind = isChart ? "chart" : "table";
      assert.ok(typeof fig.title === "string" && fig.title.length > 0, `${name}: ${fig.id} has a title`);
      const claim = m.claims.find((c: any) => c.id === fig.claim_id);
      assert.ok(claim, `${name}: ${fig.id} names a Claim`);

      assert.ok(!LABEL_OPENER.test(fig.title),
        `${name}: ${kind} ${fig.id} title "${fig.title}" opens by naming the artifact, not by stating the Claim`);
      const shared = [...contentWords(fig.title)].filter((w) => contentWords(claim.sentence).has(w));
      assert.ok(shared.length >= 2,
        `${name}: ${kind} ${fig.id} title "${fig.title}" says nothing its Claim ${claim.id} says (shared: ${JSON.stringify(shared)})`);

      const tokens = [...fig.title.matchAll(/\{\{(ref|derived|ext):([^}]*)\}\}/g)].map((t) => `${t[1]}:${t[2]}`);
      if (isChart) {
        assert.ok(tokens.length > 0, `${name}: chart ${fig.id} states the Claim with its values bound`);
        for (const t of tokens) assert.ok(claim.evidence.includes(t), `${name}: chart title value ${t} is evidence of ${claim.id}`);
      } else {
        assert.deepEqual(tokens, [],
          `${name}: table ${fig.id} title carries a value token, which a table caption renders as literal braces`);
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
  // The basis lives in comparison.description: analysis.schema.json sets additionalProperties:false on a
  // candidate Claim, so there is no `causal_basis` key to read.
  assert.match(analysis.candidate_claims.find((c: any) => c.id === "c1").comparison.description, /randomis(ed|ing) assignment/i,
    "the Analysis recorded the only basis v0 accepts for a causal Claim");
  assert.match(c1.material_caveat, /at random/i, "the caveat names the randomisation the conclusion rests on");

  const c2 = m.claims.find((c: any) => c.id === "c2");
  assert.equal(c2.type, "associational", "a split chosen after seeing the result is never causal");
  assert.equal(c2.comparison.pre_registered, false);
  assert.ok(!c2.answer_bearing, "an exploratory Claim never carries the Answer");
  for (const c of m.claims) assert.ok(c.comparison.kind !== "none", "an associational or causal Claim compares something");
});

// --- The skill's own prose, read as a contract -----------------------------------------------------------

/** Every markdown page of /write-finding, concatenated: the whole instruction a writer follows. */
const writerSkillText = (): string => {
  const files = ["SKILL.md", ...readdirSync(join(WRITER_SKILL, "references")).map((f) => join("references", f))];
  return files.filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(WRITER_SKILL, f), "utf8")).join("\n");
};

/** Does `path` (dotted, `[]` for "into the array's items") name a property the Analysis schema defines? */
function analysisSchemaDefines(path: string): boolean {
  let node: any = ANALYSIS_SCHEMA;
  for (const segment of path.split(".")) {
    const key = segment.replace(/\[\]$/, "");
    if (node?.type !== "object" || !node.properties?.[key]) return false;
    node = node.properties[key];
    if (segment.endsWith("[]")) {
      if (node?.type !== "array" || !node.items) return false;
      node = node.items;
    }
  }
  return true;
}

/**
 * Fields the Analysis schema is gaining in the parallel schema change, and the schema-valid place each one
 * is recorded until it lands. The skill may name them, and must also name the fallback, so a writer reading
 * a schema-valid analysis.yaml today still has somewhere to look.
 */
// depends on 7qg schema change: once the schema defines these, the first assertion below resolves them
// directly and this map only keeps the fallback documented.
const PENDING_ANALYSIS_FIELDS: Record<string, string> = {
  "requested_external_sources": "analysis.yaml#assumptions",
  "requested_derived": "analysis.yaml#notes",
  "candidate_claims[].causal_basis": "candidate_claims[].comparison.description",
};

test("every analysis.yaml field the writer skill names is one the Analysis schema defines", () => {
  const text = writerSkillText();
  const named = [...text.matchAll(/analysis\.yaml#([A-Za-z_][\w.[\]]*)/g)].map((m) => m[1]!.replace(/\.+$/, ""));
  assert.ok(named.length > 0, "the skill cites analysis.yaml fields by path");

  for (const path of new Set(named)) {
    assert.ok(analysisSchemaDefines(path) || path in PENDING_ANALYSIS_FIELDS,
      `skills/write-finding names analysis.yaml#${path}, which src/analysis/analysis.schema.json does not define: ` +
      "a writer sent to a field that cannot exist has to decide the value for itself");
  }
  // A pending field is only safe to name while the page also names where the value is recorded today.
  for (const [pending, fallback] of Object.entries(PENDING_ANALYSIS_FIELDS)) {
    if (!named.includes(pending)) continue;
    assert.ok(text.includes(fallback),
      `skills/write-finding names ${pending}, which the Analysis schema may not define yet, without naming ${fallback}`);
  }
});

test("the writer skill maps every Analysis comparison.kind onto a kind the manifest schema accepts", () => {
  const analysisKinds: string[] = ANALYSIS_SCHEMA.properties.candidate_claims.items.properties.comparison.properties.kind.enum;
  const manifestKinds: string[] = MANIFEST_SCHEMA.$defs.claim.properties.comparison.properties.kind.enum;

  // The mapping table in step 5 of SKILL.md: rows of | `analysis kind` | `manifest kind` |.
  const skill = readFileSync(join(WRITER_SKILL, "SKILL.md"), "utf8");
  const mapping = new Map<string, string>();
  for (const row of skill.matchAll(/^\|\s*`([a-z_]+)`\s*\|\s*`([a-z_]+)`\s*\|\s*$/gm)) mapping.set(row[1]!, row[2]!);

  for (const kind of analysisKinds) {
    const target = mapping.get(kind) ?? kind;
    assert.ok(manifestKinds.includes(target),
      `the Analysis spells comparison.kind ${kind}, which is not a manifest value and skills/write-finding/SKILL.md ` +
      "gives no mapping for it: carrying it across fails the manifest schema, and translating it is a judgement no page backs");
  }
  for (const [from, to] of mapping) {
    assert.ok(analysisKinds.includes(from), `SKILL.md maps comparison.kind ${from}, which the Analysis schema does not allow`);
    assert.ok(manifestKinds.includes(to), `SKILL.md maps comparison.kind ${from} to ${to}, which the manifest schema does not allow`);
  }

  // And the recorded runs carry each comparison across by that mapping, never by re-judging it.
  for (const name of RUN_NAMES) {
    const analysis = parseYaml(readFileSync(join(RUNS, name, "input", "analysis.yaml"), "utf8"));
    const om = readManifest(join(RUNS, name, "output"));
    for (const candidate of analysis.candidate_claims) {
      const claim = om.claims.find((c: any) => c.id === candidate.id);
      assert.ok(claim, `${name}: candidate Claim ${candidate.id} reached the Finding`);
      assert.equal(claim.comparison.kind, mapping.get(candidate.comparison.kind) ?? candidate.comparison.kind,
        `${name}: ${candidate.id} comparison.kind was translated by something other than the table in SKILL.md`);
      assert.equal(claim.comparison.pre_registered, candidate.comparison.pre_registered,
        `${name}: ${candidate.id} pre_registered is a fact about the Analysis`);
    }
  }
});

test("the writer's field boundary is path-level: dropping the Instance's private marker is a violation", () => {
  for (const name of RUN_NAMES) {
    const im = readManifest(join(RUNS, name, "input"));
    const om = readManifest(join(RUNS, name, "output"));
    assert.deepEqual(boundaryViolations(im, om), [], `${name}: the recorded run stays inside the boundary`);

    // The failure the coarse form of WRITER_OWNED could not see: the Instance's half of export_policy
    // rewritten, and the private-content sentinel deleted, under cover of a field the writer does own.
    const tampered = structuredClone(om);
    delete tampered.export_policy.private_marker;
    tampered.export_policy.recipient_scope = "company";
    tampered.export_policy.granularity = "row_level";
    tampered.reader.profile = "someone_else";
    assert.deepEqual(boundaryViolations(im, tampered), [
      "export_policy.granularity", "export_policy.private_marker", "export_policy.recipient_scope",
    ], `${name}: a writer that rewrote the Instance's export policy must be reported, and reader.profile must not be`);
  }
});

test("a recorded run reports no corrections count, because none was observed", () => {
  for (const name of RUN_NAMES) {
    const raw = readFileSync(join(RUNS, name, "run.yaml"), "utf8");
    const run = readRun(name);
    // input/ was cut out of an already-reviewed output/, so the transformation a corrections counter scores
    // ran backwards: nothing was produced and then corrected. A zero here would read as an observation,
    // sitting beside check_artifact and check_rerun, which are reproducible facts.
    assert.equal(run.verification.structural_or_value_corrections_after_first_check, undefined,
      `${name}: a corrections count is not something a hand-built fixture can verify`);
    assert.equal(run.corrections_after_first_check, "not_measured",
      `${name}: run.yaml records the absence of the measurement rather than a number`);
    assert.match(String(run.corrections_not_measured_because ?? ""), /output\/ existed/,
      `${name}: run.yaml says why the count cannot be measured here`);
    assert.ok(!/corrections[a-z_]*:\s*-?\d/i.test(raw),
      `${name}: a corrections count in a hand-recorded run describes its construction, not the skill`);
  }
});
