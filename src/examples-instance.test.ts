// The committed demo Instance under examples/nyc-open-data/analytics, validated without its data.
//
// `demo.duckdb` is never committed (examples/nyc-open-data/.gitignore), so nothing here opens a database or
// reaches the network. What is checked is everything the repository *does* carry: that the connection profile
// names the warehouse the build writes, that both Reader profiles validate against the shipped schema, that
// every definition's front matter is well formed, that every Golden Question loads through the same loader the
// eval uses and validates against the Golden Question schema, and — the honesty guard — that no file under
// `analytics/` claims an approval that nobody has given.
//
// The last test recomputes every golden's reference values through the DuckDB adapter — but only when a built
// `demo.duckdb` happens to be sitting in the Instance. With no data it reports that it was skipped and why,
// so CI (which never has the data) stays offline while a contributor who has just run the build gets the
// check for free.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadGoldens, loadDefinitions } from "./eval/runner.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXAMPLE = join(ROOT, "examples", "nyc-open-data");
const INSTANCE = join(EXAMPLE, "analytics");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const readerSchema = JSON.parse(readFileSync(join(ROOT, "schema", "reader-profile.schema.json"), "utf8"));
const goldenSchema = JSON.parse(readFileSync(join(ROOT, "schema", "golden-question.schema.json"), "utf8"));

/** The tables `examples/nyc-open-data/scripts/build-data.mjs` writes. A golden may read no other. */
const DEMO_TABLES = new Set([
  "trips_daily", "trips_sample", "weather_daily", "citibike_daily", "citibike_stations",
  "taxi_zones", "crz_zones", "build_provenance", "build_meta",
]);

/** Every file under `analytics/`, so a claim cannot hide in a directory this test forgot to walk. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The `## <id>` + one fenced yaml block shape of `readers.md` (docs/contracts/reader-profiles.md). */
function readerProfiles(text: string): { id: string; doc: any }[] {
  const out: { id: string; doc: any }[] = [];
  const re = /^## ([a-z][a-z0-9_]*)\s*$\n+```yaml\n([\s\S]*?)\n```/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ id: m[1]!, doc: parseYaml(m[2]!) });
  return out;
}

test("aftergrid.yaml configures the duckdb adapter at the path the data build writes, inside the Instance root", () => {
  const config: any = parseYaml(readFileSync(join(INSTANCE, "aftergrid.yaml"), "utf8"));
  assert.equal(config.schema_version, "0.1.0");
  assert.equal(config.connection?.adapter, "duckdb");

  const path = config.connection?.duckdb?.path;
  assert.equal(typeof path, "string");
  // `openInstanceAdapter` resolves this through `safePath`, which refuses `..` and absolute paths — so the
  // warehouse has to sit inside the Instance root and the demo cannot point one directory up at the example.
  assert.ok(!path.startsWith("/") && !path.split("/").includes(".."), `connection.duckdb.path '${path}' would be refused by safePath`);
  assert.equal(config.connection.duckdb.read_only, true);

  // The data is never committed, so the test asserts the wiring and not the file.
  const ignore = readFileSync(join(EXAMPLE, ".gitignore"), "utf8");
  assert.match(ignore, /^\*\.duckdb$/m, "the built database must stay gitignored");

  assert.equal(config.publication?.repository, "patrickjmorris/aftergrid");
  assert.deepEqual(config.publication?.trusted_approvers, ["patrickjmorris"]);
  assert.equal(config.publication?.automation_login, "github-actions[bot]");
  // GitHub does not let the author of a pull request approve it, so these two can never be the same account.
  assert.ok(!config.publication.trusted_approvers.includes(config.publication.automation_login));
  assert.ok(config.owner?.name && config.owner?.contact, "a Reader's flag has to reach somebody");
});

test("readers.md holds exactly the two demo Reader profiles, and each validates against the schema", () => {
  const text = readFileSync(join(INSTANCE, "readers.md"), "utf8");
  const profiles = readerProfiles(text);
  assert.deepEqual(profiles.map((p) => p.id).sort(), ["bike_product_manager", "city_transport_analyst"]);
  for (const { id, doc } of profiles) {
    assert.ok(ajv.validate(readerSchema, doc), `${id}: ${JSON.stringify(ajv.errors)}`);
    assert.equal(doc.id, id, `${id}: the heading and the block must name the same profile`);
    // Neither Reader writes SQL; a Finding here is read by somebody who cannot check the query themselves.
    assert.notEqual(doc.data_literacy, "writes_sql", `${id}: writes_sql is never a Reader profile in v0`);
  }
});

test("every definition is a well-formed, unapproved draft of this Instance's own vocabulary", () => {
  const dir = join(INSTANCE, "definitions");
  // README.md is the scaffold's guidance for this directory, not a definition; `loadDefinitions` skips it for
  // the same reason (it has no front matter).
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.equal(files.length, 8, `${files.length} definitions: ${files.join(", ")}`);
  assert.ok(!files.includes("example_definition.md"), "the scaffold's example is not one of this Instance's definitions");

  const loaded = loadDefinitions(INSTANCE);
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    assert.ok(m, `${file}: no front matter`);
    const front: any = parseYaml(m![1]!);
    assert.equal(front.id, file.replace(/\.md$/, ""), `${file}: id and filename disagree`);
    assert.match(String(front.id), /^[a-z][a-z0-9_]{0,63}$/);
    assert.equal(front.version, 1, `${file}: every definition here is at version 1`);
    assert.ok(["metric", "diagnostic"].includes(front.kind), `${file}: kind ${front.kind}`);
    // `proposed` is the contract's word for "not approved" (docs/contracts/instance-layout.md). Nothing here is
    // approved: approval is an attestation the owner gives later through the decide/approval flow.
    assert.equal(front.lifecycle, "proposed", `${file}: lifecycle ${front.lifecycle}`);
    assert.equal(front.approval, undefined, `${file}: a draft carries no approval block`);
    for (const field of ["grain", "population", "denominator", "window", "owner"]) {
      assert.ok(typeof front[field] === "string" && front[field].trim(), `${file}: ${field} is empty`);
    }
    assert.match(text, /## SQL \(duckdb\)\n+```sql\n[\s\S]+?\n```/, `${file}: no duckdb SQL block`);
    assert.equal(loaded.get(String(front.id))?.lifecycle, "proposed", `${file}: the loader reads it as proposed`);
  }
});

test("every Golden Question loads through the eval's own loader, validates, and names things that exist here", () => {
  const goldens = loadGoldens(INSTANCE);
  assert.equal(goldens.length, 5, "five reference cases");

  const readers = new Set(readerProfiles(readFileSync(join(INSTANCE, "readers.md"), "utf8")).map((p) => p.id));
  const outcomes = new Set<string>();
  for (const g of goldens as any[]) {
    assert.ok(ajv.validate(goldenSchema, g), `${g.id}: ${JSON.stringify(ajv.errors)}`);
    assert.ok(existsSync(join(INSTANCE, "golden", `${g.id}.yaml`)), `${g.id}: id and filename disagree`);
    assert.ok(g.reader === "generic" || readers.has(g.reader), `${g.id}: reader ${g.reader} is not in readers.md`);
    for (const d of g.expected.definition_ids) {
      assert.ok(existsSync(join(INSTANCE, "definitions", `${d}.md`)), `${g.id}: definition ${d}`);
    }
    for (const t of g.expected.tables_read) assert.ok(DEMO_TABLES.has(t), `${g.id}: table ${t} is not one the build writes`);
    // Nothing here was randomized: a policy that started on one date for everybody admits no causal Claim.
    assert.notEqual(g.expected.claim_type, "causal", `${g.id}: an observational before/after supports no causal Claim`);
    // A case may list more than one acceptable outcome; every one of them counts toward the range below.
    for (const o of Array.isArray(g.expected.outcome) ? g.expected.outcome : [g.expected.outcome]) outcomes.add(o);
    if (Array.isArray(g.expected.outcome)) {
      assert.ok(g.expected.falsifier_dependent === true, `${g.id}: a list of acceptable outcomes must say why more than one is honest`);
      assert.ok(typeof g.expected.falsifier_note === "string" && g.expected.falsifier_note.length > 0, `${g.id}: falsifier_dependent needs a note`);
    }
  }
  // The demo is meant to show a range, not five wins.
  assert.ok(outcomes.has("answered"), "no answerable case");
  assert.ok(outcomes.has("needs_reframing"), "no case that has to be reframed");
  assert.ok(outcomes.has("inconclusive") || outcomes.has("insufficient_data"), "no case that abstains");
});

test("nothing under analytics/ claims an approval, a review or a Finding that does not exist", () => {
  const files = walk(INSTANCE).filter((f) => !f.endsWith(".duckdb"));
  for (const file of files) {
    const rel = file.slice(INSTANCE.length + 1);
    const text = readFileSync(file, "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      // `lifecycle: approved` and an `approval:`/`attestations:` block are the three ways a file here could
      // claim a human said yes. The word may be discussed in prose — it may not be asserted in front matter.
      assert.doesNotMatch(line, /^\s*lifecycle:\s*approved\b/, `${rel}:${i + 1} claims an approved lifecycle`);
      assert.doesNotMatch(line, /^\s*approval:\s*$/, `${rel}:${i + 1} opens an approval block`);
      // An empty list is what `new finding` scaffolds and what an unreviewed draft carries; a block that opens
      // onto entries is a claim that someone reviewed or attested, which nothing here may make.
      assert.doesNotMatch(line, /^\s*attestations:\s*$/, `${rel}:${i + 1} opens an attestations block`);
      assert.doesNotMatch(line, /^\s*reviews:\s*$/, `${rel}:${i + 1} opens a reviews block`);
      // Agent reviews (reviewer `agent:…`) are what /analyze records and are not a human's word; attestations are.
      assert.doesNotMatch(line, /^\s*attestations:\s*\[\s*\{/, `${rel}:${i + 1} lists an inline attestation`);
    }
  }
  // Findings here are real run output, committed as produced, halts included. Each carries no review and no
  // attestation (nobody has reviewed or approved anything in this Instance), and a run that stopped says so in
  // analysis-progress.yaml rather than leaving a draft that looks finished.
  const findings = join(INSTANCE, "findings");
  for (const f of readdirSync(findings).filter((f) => f !== ".gitkeep")) {
    const dir = join(findings, f);
    const manifest = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
    for (const r of manifest.reviews ?? []) assert.match(String(r.reviewer), /^agent:/, `${f} carries a review by ${r.reviewer}, which reads as a human review nobody gave`);
    assert.deepEqual(manifest.attestations ?? [], [], `${f} carries an attestation nobody recorded`);
    // A committed Finding is a draft or complete-but-unapproved; nothing here may claim publication.
    assert.ok(["draft", "complete"].includes(manifest.finding.state), `${f} has state ${manifest.finding.state}`);
    if (manifest.finding.outcome === "pending") {
      const progress = parseYaml(readFileSync(join(dir, "analysis-progress.yaml"), "utf8"));
      assert.ok(["needs_attention", "needs_input", "permission_denied"].includes(progress.status), `${f} is pending but records no halt`);
      assert.ok(progress.reason && progress.reason.length > 20, `${f}'s halt gives no reason`);
    }
  }
  // decisions.md is the generated index of an empty Decision log.
  assert.deepEqual(readdirSync(join(INSTANCE, "decisions")).filter((f) => f !== ".gitkeep"), []);
});

test("every reference value is reproduced from the built database, when one is here", async (t) => {
  // `demo.duckdb` is gitignored, so this is a check a contributor gets after running the build and CI never
  // runs at all. It is skipped out loud rather than passing silently on data that is not there.
  const warehouse = join(INSTANCE, "demo.duckdb");
  if (!existsSync(warehouse)) {
    t.skip(`no ${warehouse}: run examples/nyc-open-data/scripts/build-data.mjs to reproduce the golden reference values`);
    return;
  }
  const { DuckDbAdapter } = await import("./adapters/duckdb.ts");
  const adapter = new DuckDbAdapter({ source: { kind: "duckdb_file", path: warehouse }, estimate_cap_rows: 1e9 });
  for (const g of loadGoldens(INSTANCE) as any[]) {
    const results: Record<string, Record<string, any>> = {};
    for (const q of g.reference.queries) {
      const r = await adapter.execute(q.sql, g.reference.parameters ?? {});
      assert.ok(r.columns.some((c) => c.name === q.row_key), `${g.id}: ${q.id} has no row_key column ${q.row_key}`);
      results[q.id] = Object.fromEntries(r.rows.map((row) => [String(row[q.row_key]), row]));
    }
    for (const v of g.expected.values ?? []) {
      const [qid, key, col] = v.reference.split(".");
      const row = results[qid!]?.[key!];
      assert.ok(row, `${g.id}/${v.id}: no row ${qid}.${key}`);
      const got = Number(row[col!]);
      assert.ok(
        Number.isFinite(got) && Math.abs(got - Number(v.value)) <= Number(v.tolerance),
        `${g.id}/${v.id}: declared ${v.value} +/-${v.tolerance}, computed ${String(row[col!])}. A difference on a count means the TLC restated the month; rebuild and date the new reference rather than widening the tolerance.`,
      );
    }
  }
});

/* ------------------------------------------------- the walkthrough (ag-demo-open-data-qsl.8) */
// `examples/nyc-open-data/README.md` is the new user's path, and a new user pastes it verbatim. So every
// command it shows has to name a script and flags that exist today, and every relative link has to resolve.
// Nothing here runs a command or fetches anything: it reads the README, the scripts it names and the CLI's own
// usage text, and compares them.

const WALKTHROUGH = join(EXAMPLE, "README.md");

/** The contents of every ```bash fence, as single logical lines with `\`-continuations joined. */
function bashCommands(markdown: string): string[] {
  const out: string[] = [];
  for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
    for (const line of block[1]!.replace(/\\\n\s*/g, " ").split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) out.push(trimmed);
    }
  }
  return out;
}

/** The `Usage:` section of `src/cli.ts` — what `aftergrid --help` prints. */
function cliUsage(): string {
  const cli = readFileSync(join(ROOT, "src", "cli.ts"), "utf8");
  const start = cli.indexOf("Usage:");
  const end = cli.indexOf("Lifecycle:", start);
  assert.ok(start !== -1 && end > start, "could not find the Usage: section of src/cli.ts");
  return cli.slice(start, end);
}

test("every `node examples/…` command in the walkthrough names a script and flags that exist", () => {
  const commands = bashCommands(readFileSync(WALKTHROUGH, "utf8")).filter((c) => c.startsWith("node examples/"));
  assert.ok(commands.length >= 3, `the walkthrough must still show the build and the derivation, found ${commands.length} command(s)`);

  for (const command of commands) {
    const scriptPath = command.split(/\s+/)[1];
    assert.ok(scriptPath && existsSync(join(ROOT, scriptPath)), `the walkthrough runs \`${scriptPath}\`, which is not in this repository`);
    // The script itself, not its README: the flags its own parser names are the only ones that work.
    const source = readFileSync(join(ROOT, scriptPath!), "utf8");
    for (const flag of command.matchAll(/(?<=\s)--[a-z][a-z-]*/g)) {
      assert.ok(source.includes(`"${flag[0]}"`), `the walkthrough passes \`${flag[0]}\` to ${scriptPath}, which does not parse it`);
    }
  }
});

test("every `aftergrid …` command in the walkthrough names a command and flags the CLI declares", () => {
  const usage = cliUsage();
  const commands = bashCommands(readFileSync(WALKTHROUGH, "utf8")).filter((c) => c.startsWith("aftergrid "));
  assert.ok(commands.length >= 1, "the walkthrough must still show how an Operator points setup at their own data");

  for (const command of commands) {
    const [, name, next] = command.split(/\s+/);
    assert.ok(usage.includes(`aftergrid ${name}`), `the walkthrough runs \`aftergrid ${name}\`, which is not in the CLI's usage`);
    // A two-word command (`review status`, `eval nightly`, `new finding`) is named as a pair in the usage.
    if (next && !next.startsWith("-")) {
      assert.ok(usage.includes(`aftergrid ${name} ${next}`), `\`aftergrid ${name} ${next}\` is not in the CLI's usage`);
    }
    for (const flag of command.matchAll(/(?<=\s)--[a-z][a-z-]*/g)) {
      assert.ok(usage.includes(flag[0]), `the walkthrough passes \`${flag[0]}\` to \`aftergrid ${name}\`, which the CLI's usage does not declare`);
    }
  }
});

test("every relative link in the walkthrough resolves to a file in this repository", () => {
  let checked = 0;
  for (const link of readFileSync(WALKTHROUGH, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = link[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#")[0]!;
    if (!path) continue;
    assert.ok(existsSync(join(EXAMPLE, path)), `the walkthrough links to ${target}, which does not exist`);
    checked++;
  }
  assert.ok(checked >= 8, `expected the walkthrough to link to its own material, found ${checked} relative link(s)`);
});
