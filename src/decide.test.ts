// `aftergrid decide` against a temp copy of the fixture Instance: what is recorded, what is refused, and what
// concurrency does to the log. Never mutates fixtures/instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import { decide, isIanaTimezone, type DecideOptions } from "./commands/decide.ts";
import { check } from "./commands/check.ts";
import { exitCodeFor } from "./report.ts";
import { DECISION_ID_RE } from "./ids.ts";

const FIXTURE_FINDING = "2026-07-20-onboarding-checklist-retention";
const FIXTURE_ID = "fnd_7k2m9q4w1xzb";
const FIXTURE_ROW = "| dec_2x7v4b9m1kqa | 2026-07-22 | Dana Okafor | fnd_7k2m9q4w1xzb r1 | c1 | Keep the onboarding checklist for all new users | 2026-11-01, or when falsifier_lift fails | pending |";

function instanceCopy(): { root: string; dir: string; decisions: string } {
  const src = fileURLToPath(new URL("../fixtures/instance/", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "ag-decide-"));
  cpSync(src, root, { recursive: true });
  return { root: join(root, "analytics"), dir: join(root, "analytics", "findings", FIXTURE_FINDING), decisions: join(root, "analytics", "decisions") };
}
const base = (dir: string): DecideOptions => ({
  owner: "Dana Okafor",
  decidedOn: "2026-09-15",
  findingDir: dir,
  restsOnClaims: ["c1"],
  action: { kind: "action", description: "Roll the checklist out to the remaining half of new users; review the rollout on 2026-10-01." },
  rationale: "The checklist arm cleared the pre-registered bar in the randomized comparison.",
  revisitWhen: { schedule: { kind: "on_date", date: "2026-12-01", timezone: "America/New_York" }, falsifier: { finding_id: FIXTURE_ID, check_id: "falsifier_lift" } },
  now: () => new Date("2026-09-15T12:00:00Z"),
});
const cats = (r: { errors: { category: string }[] }) => r.errors.map((e) => e.category);
const yamlFiles = (d: string) => readdirSync(d).filter((f) => f.endsWith(".yaml")).sort();

test("records an action bound to the exact revision and digest, and indexes it beside the existing record", async () => {
  const { root, dir, decisions } = instanceCopy();
  const r = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa1" });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.command, "decide");
  assert.equal(r.finding, `${FIXTURE_ID} r1`);
  assert.equal(r.content, "complete");
  assert.equal(r.evidence, "valid");
  assert.ok(r.info.some((i) => /^recorded dec_aaaaaaaaaaa1: action by Dana Okafor on 2026-09-15/.test(i)), r.info.join("\n"));
  assert.ok(r.info.some((i) => i.startsWith("path: ") && i.endsWith(`decisions/dec_aaaaaaaaaaa1.yaml`)), r.info.join("\n"));
  assert.ok(existsSync(join(decisions, "dec_aaaaaaaaaaa1.yaml")));

  const rec = parseYaml(readFileSync(join(decisions, "dec_aaaaaaaaaaa1.yaml"), "utf8"));
  const manifest = parseYaml(readFileSync(join(dir, "manifest.yaml"), "utf8"));
  assert.equal(rec.schema_version, "0.1.0");
  assert.deepEqual(rec.finding, { id: FIXTURE_ID, revision: 1, content_digest: { algorithm: "sha256", value: manifest.content_digest.value } });
  assert.deepEqual(rec.outcome, { state: "pending" }, "a missing outcome is pending, never invented");
  assert.equal(rec.recorded_at, "2026-09-15T12:00:00Z");

  const index = readFileSync(join(root, "decisions.md"), "utf8");
  assert.ok(index.includes(FIXTURE_ROW), "the pre-existing record is reindexed verbatim:\n" + index);
  assert.ok(index.includes("| dec_aaaaaaaaaaa1 | 2026-09-15 | Dana Okafor | fnd_7k2m9q4w1xzb r1 | c1 | Roll the checklist out to the remaining half of new users | 2026-12-01, or when falsifier_lift fails | pending |"), index);
  assert.ok(index.indexOf("dec_2x7v4b9m1kqa") < index.indexOf("dec_aaaaaaaaaaa1"), "ordered by decided_on");
});

test("records a deliberate inaction, mints an id when none is supplied, and keeps a recorded outcome", async () => {
  const { root, dir, decisions } = instanceCopy();
  const r = await decide({
    ...base(dir),
    action: { kind: "deliberate_inaction", description: "Leave onboarding as it is until the next pricing change." },
    outcome: { state: "recorded", description: "Nothing shipped; retention held.", recorded_on: "2026-10-01" },
    revisitWhen: { schedule: { kind: "every", every_days: 90, timezone: "UTC" } },
  });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const written = yamlFiles(decisions).filter((f) => f !== "dec_2x7v4b9m1kqa.yaml");
  assert.equal(written.length, 1);
  const id = written[0]!.replace(/\.yaml$/, "");
  assert.match(id, DECISION_ID_RE);
  const rec = parseYaml(readFileSync(join(decisions, written[0]!), "utf8"));
  assert.equal(rec.action.kind, "deliberate_inaction");
  assert.deepEqual(rec.revisit_when, { schedule: { kind: "every", every_days: 90, timezone: "UTC" } });
  assert.equal(rec.outcome.state, "recorded");
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  assert.ok(index.includes(`| ${id} | 2026-09-15 | Dana Okafor | fnd_7k2m9q4w1xzb r1 | c1 | Deliberate inaction: Leave onboarding as it is until the next pricing change | every 90 days | recorded 2026-10-01 |`), index);
});

test("a dry run writes nothing and shows the record it would write", async () => {
  const { root, dir, decisions } = instanceCopy();
  const before = readFileSync(join(root, "decisions.md"), "utf8");
  const r = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa2", dryRun: true });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml"]);
  assert.equal(readFileSync(join(root, "decisions.md"), "utf8"), before, "the index is untouched by a dry run");
  assert.ok(r.info.some((i) => /dry run: nothing written/.test(i)));
  assert.ok(r.info.some((i) => /id: dec_aaaaaaaaaaa2/.test(i) && /rests_on_claims/.test(i)), r.info.join("\n"));
});

test("a dry run works in an Instance that has no decisions directory yet, and writes nothing", async () => {
  const { root, dir, decisions } = instanceCopy();
  rmSync(decisions, { recursive: true, force: true });
  const r = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa9", dryRun: true });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.ok(!existsSync(decisions), "a dry run never creates the directory");
  assert.ok(r.info.some((i) => /dry run: nothing written/.test(i)));
  void root;
});

test("retrying the same id with identical input succeeds without duplicating the record", async () => {
  const { dir, decisions } = instanceCopy();
  const first = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa3" });
  const bytes = readFileSync(join(decisions, "dec_aaaaaaaaaaa3.yaml"));
  const second = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa3", now: () => new Date("2026-09-16T08:30:00Z") });
  assert.equal(first.errors.length, 0, JSON.stringify(first.errors));
  assert.equal(second.errors.length, 0, JSON.stringify(second.errors));
  assert.ok(second.info.some((i) => /already recorded with identical content/.test(i)), second.info.join("\n"));
  assert.deepEqual(readFileSync(join(decisions, "dec_aaaaaaaaaaa3.yaml")), bytes, "the stored record, recorded_at included, is untouched");
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_aaaaaaaaaaa3.yaml"]);
});

test("the same id with different content is a decision_conflict and nothing is appended", async () => {
  const { root, dir, decisions } = instanceCopy();
  await decide({ ...base(dir), id: "dec_aaaaaaaaaaa4" });
  const bytes = readFileSync(join(decisions, "dec_aaaaaaaaaaa4.yaml"));
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  const r = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa4", rationale: "A different reason." });
  assert.deepEqual(cats(r), ["decision_conflict"]);
  assert.equal(r.errors[0]!.location, "decisions/dec_aaaaaaaaaaa4.yaml");
  assert.deepEqual(readFileSync(join(decisions, "dec_aaaaaaaaaaa4.yaml")), bytes, "the existing record is never rewritten");
  assert.equal(readFileSync(join(root, "decisions.md"), "utf8"), index);
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_aaaaaaaaaaa4.yaml"]);
  assert.ok(readdirSync(decisions).every((f) => !f.startsWith(".tmp-")), "no temp file left behind");
});

test("an unknown Claim id, an unknown falsifier Check and a missing predecessor are refused before any write", async () => {
  const { dir, decisions } = instanceCopy();
  const unknownClaim = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa5", restsOnClaims: ["c1", "c9"] });
  assert.deepEqual(cats(unknownClaim), ["decision_binding"]);
  assert.match(unknownClaim.errors[0]!.message, /Claim c9 is not in fnd_7k2m9q4w1xzb r1/);

  const unknownCheck = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa6", revisitWhen: { falsifier: { finding_id: FIXTURE_ID, check_id: "unique_users" } } });
  assert.deepEqual(cats(unknownCheck), ["decision_binding"], JSON.stringify(unknownCheck.errors));
  assert.match(unknownCheck.errors[0]!.message, /is not a falsifier Check/);

  const noPredecessor = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa7", supersedes: "dec_zzzzzzzzzzzz" });
  assert.deepEqual(cats(noPredecessor), ["decision_binding"]);
  const self = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa8", supersedes: "dec_aaaaaaaaaaa8" });
  assert.match(self.errors[0]!.message, /cannot supersede itself/);

  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml"], "nothing was written");
});

test("an impossible date and an unknown timezone are refused", async () => {
  const { dir, decisions } = instanceCopy();
  const badDate = await decide({ ...base(dir), id: "dec_aaaaaaaaaaa9", decidedOn: "2026-02-30" });
  assert.deepEqual(cats(badDate), ["schema"]);
  assert.match(badDate.errors[0]!.message, /2026-02-30 is not a real calendar date/);

  const badRevisit = await decide({ ...base(dir), id: "dec_aaaaaaaaaab1", revisitWhen: { schedule: { kind: "on_date", date: "2027-13-01", timezone: "America/New_York" } } });
  assert.deepEqual(cats(badRevisit), ["schema"]);
  assert.match(badRevisit.errors[0]!.message, /2027-13-01 is not a real calendar date/);

  const badZone = await decide({ ...base(dir), id: "dec_aaaaaaaaaab2", revisitWhen: { schedule: { kind: "on_date", date: "2026-12-01", timezone: "Mars/Phobos" } } });
  assert.deepEqual(cats(badZone), ["value_type"]);
  const offset = await decide({ ...base(dir), id: "dec_aaaaaaaaaab3", revisitWhen: { schedule: { kind: "on_date", date: "2026-12-01", timezone: "+05:00" } } });
  assert.deepEqual(cats(offset), ["value_type"]);
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml"]);
});

// `decide` does every filesystem step synchronously and its first `await` is the index lock, whose uncontended
// path never yields, so `Promise.all` in one process runs these calls one after another. That is worth asserting —
// repeated appends and repeated retries of one id — but it is NOT a concurrency test, and it does not claim to be.
// Real interleaving is covered by "eight separate OS processes appending at once" and by the index-lock test below.
test("repeated appends in one process lose no record, and repeated retries of one id write it once", async () => {
  const { root, dir, decisions } = instanceCopy();
  const ids = ["dec_bbbbbbbbbbb1", "dec_bbbbbbbbbbb2", "dec_bbbbbbbbbbb3", "dec_bbbbbbbbbbb4", "dec_bbbbbbbbbbb5"];
  const many = await Promise.all(ids.map((id) => decide({ ...base(dir), id, decidedOn: "2026-09-1" + (ids.indexOf(id) + 1) })));
  for (const r of many) assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", ...ids.map((i) => `${i}.yaml`)]);
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  for (const id of ids) assert.ok(index.includes(`| ${id} |`), `${id} missing from the index:\n${index}`);

  const same = await Promise.all([0, 1, 2].map(() => decide({ ...base(dir), id: "dec_bbbbbbbbbbb6" })));
  for (const r of same) assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(yamlFiles(decisions).filter((f) => f === "dec_bbbbbbbbbbb6.yaml").length, 1);
  assert.ok(readdirSync(decisions).every((f) => !f.startsWith(".tmp-") && f !== ".index.lock"), readdirSync(decisions).join(","));
});

test("a correction supersedes without touching the original, and check still finds the evidence valid", async () => {
  const { root, dir, decisions } = instanceCopy();
  const original = await decide({ ...base(dir), id: "dec_ccccccccccc1" });
  assert.equal(original.errors.length, 0, JSON.stringify(original.errors));
  const originalBytes = readFileSync(join(decisions, "dec_ccccccccccc1.yaml"));

  const correction = await decide({
    ...base(dir),
    id: "dec_ccccccccccc2",
    decidedOn: "2026-09-20",
    supersedes: "dec_ccccccccccc1",
    action: { kind: "action", description: "Roll the checklist out to new users on iOS only." },
    rationale: "The lift is carried by mobile; the web arm does not clear the bar.",
    now: () => new Date("2026-09-20T09:00:00Z"),
  });
  assert.equal(correction.errors.length, 0, JSON.stringify(correction.errors));
  assert.deepEqual(readFileSync(join(decisions, "dec_ccccccccccc1.yaml")), originalBytes, "the superseded record is never modified");
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  assert.ok(index.includes("| dec_ccccccccccc1 (superseded by dec_ccccccccccc2) |"), index);

  const c = await check({ dir });
  assert.equal(c.evidence, "valid", JSON.stringify(c.errors));
  assert.ok(c.info.some((i) => /^3 Decision record\(s\) cite this Finding/.test(i)), c.info.join("\n"));
});

test("decide refuses when the cited Finding does not verify, and never invents a Finding", async () => {
  const { dir, decisions } = instanceCopy();
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nEdited after the digest was pinned.\n");
  const r = await decide({ ...base(dir), id: "dec_ddddddddddd1" });
  assert.equal(r.evidence, "invalid");
  assert.ok(cats(r).includes("digest"), JSON.stringify(r.errors));
  assert.ok(r.info.some((i) => /refused: nothing was written/.test(i)));
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml"]);

  const { root } = instanceCopy();
  const missing = await decide({ ...base(""), findingDir: undefined, findingId: "fnd_000000000000", findingRevision: 1, instanceDir: root });
  assert.deepEqual(cats(missing), ["unresolved_reference"]);
});

test("a Finding named by id and revision resolves inside the Instance", async () => {
  const { root, decisions } = instanceCopy();
  const r = await decide({ ...base(""), findingDir: undefined, findingId: FIXTURE_ID, findingRevision: 1, instanceDir: root, id: "dec_eeeeeeeeeee1" });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.ok(existsSync(join(decisions, "dec_eeeeeeeeeee1.yaml")));
  assert.equal(r.finding, `${FIXTURE_ID} r1`);
});

test("a falsifier binds to the cited Finding by default, and to another Finding of the Instance when named", async () => {
  const { dir, decisions } = instanceCopy();
  const r = await decide({ ...base(dir), id: "dec_fffffffffff1", revisitWhen: { falsifier: { check_id: "falsifier_lift" } } });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const rec = parseYaml(readFileSync(join(decisions, "dec_fffffffffff1.yaml"), "utf8"));
  assert.deepEqual(rec.revisit_when.falsifier, { finding_id: FIXTURE_ID, check_id: "falsifier_lift" });

  const other = await decide({ ...base(dir), id: "dec_fffffffffff2", revisitWhen: { falsifier: { finding_id: "fnd_3p8r5t2y7vnc", check_id: "falsifier_cancel_rate" } } });
  assert.equal(other.errors.length, 0, JSON.stringify(other.errors));

  const absent = await decide({ ...base(dir), id: "dec_fffffffffff3", revisitWhen: { falsifier: { finding_id: FIXTURE_ID, check_id: "falsifier_lift", revision: 7 } } });
  assert.deepEqual(cats(absent), ["decision_binding"]);
  assert.match(absent.errors[0]!.message, /holds no fnd_7k2m9q4w1xzb r7/);
});

// ---- regressions from the ag-v0-spec-9an.1 review ----

test("a record file with no id is reported and excluded, never dropped in silence", async () => {
  const { root, dir, decisions } = instanceCopy();
  // Everything the schema requires except `id`, a digest matching nothing, and a Claim the Finding does not have.
  const planted = parseYaml(readFileSync(join(decisions, "dec_2x7v4b9m1kqa.yaml"), "utf8"));
  delete planted.id;
  planted.rests_on_claims = ["c99"];
  planted.finding.content_digest.value = "0".repeat(64);
  writeFileSync(join(decisions, "dec_9999999999zz.yaml"), toYaml(planted));

  const r = await decide({ ...base(dir), id: "dec_ggggggggggg1" });
  const noId = r.warnings.find((w) => w.location.startsWith("decisions/dec_9999999999zz.yaml"));
  assert.ok(noId, "the record with no id is reported: " + JSON.stringify(r.warnings));
  assert.equal(noId!.category, "schema");
  assert.match(noId!.message, /no string id/);
  assert.match(noId!.message, /excluded from the generated index/);

  // `check` is where the log is adjudicated: it must not pass over the file in silence.
  const c = await check({ dir });
  const asError = c.errors.find((e) => e.location.startsWith("decisions/dec_9999999999zz.yaml"));
  assert.ok(asError, "check reports it as an error: " + JSON.stringify(c.errors));
  assert.equal(asError!.category, "schema");

  // The records that are whole keep their rows, so nothing else was lost with it.
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  assert.ok(index.includes(FIXTURE_ROW), index);
  assert.ok(index.includes("| dec_ggggggggggg1 |"), index);
});

test("a refusal after the record is written is reported, not thrown, and says the record exists", async () => {
  const { root, dir, decisions } = instanceCopy();
  rmSync(join(root, "decisions.md"));
  symlinkSync(join(tmpdir(), "ag-decide-elsewhere.md"), join(root, "decisions.md"));

  const r = await decide({ ...base(dir), id: "dec_ggggggggggg2" });
  assert.equal(r.errors.length, 1, JSON.stringify(r.errors));
  assert.equal(r.errors[0]!.category, "unsafe_path");
  assert.equal(r.errors[0]!.location, "decisions.md");
  assert.match(r.errors[0]!.message, /the record was written but the index could not be regenerated/);
  assert.match(r.errors[0]!.remedy!, /--id dec_ggggggggggg2/);
  assert.ok(existsSync(join(decisions, "dec_ggggggggggg2.yaml")), "the record really is on disk");
  assert.ok(r.info.some((i) => i.includes("the record was written before this problem: dec_ggggggggggg2")), r.info.join("\n"));
  assert.ok(!r.info.some((i) => /refused: nothing was written/.test(i)), "it must not claim nothing was written");

  // The retry the remedy names is idempotent: one decision, one record, never a second minted id.
  const again = await decide({ ...base(dir), id: "dec_ggggggggggg2", now: () => new Date("2026-09-16T08:00:00Z") });
  assert.ok(again.info.some((i) => /already recorded with identical content/.test(i)), again.info.join("\n"));
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_ggggggggggg2.yaml"]);
});

test("a stale record elsewhere in the log does not invalidate this Finding's evidence or fail this run", async () => {
  const { dir, decisions } = instanceCopy();
  const stale = parseYaml(readFileSync(join(decisions, "dec_2x7v4b9m1kqa.yaml"), "utf8"));
  stale.id = "dec_8888888888zz";
  stale.finding.content_digest.value = "0".repeat(64);
  writeFileSync(join(decisions, "dec_8888888888zz.yaml"), toYaml(stale));

  const r = await decide({ ...base(dir), id: "dec_ggggggggggg3" });
  assert.deepEqual(cats(r), [], "another record's stale digest is not this run's error");
  assert.equal(exitCodeFor(r), 0, "a run that recorded what it was asked to record does not exit 1");
  assert.equal(r.evidence, "valid", "evidence reflects the shared Finding validator, not the state of the log");
  const warned = r.warnings.find((w) => w.location.startsWith("decisions/dec_8888888888zz.yaml"));
  assert.ok(warned, JSON.stringify(r.warnings));
  assert.match(warned!.message, /a pre-existing record, not the one this run wrote/);
  assert.ok(existsSync(join(decisions, "dec_ggggggggggg3.yaml")));

  // check still adjudicates the log as an error, so nothing is lost by being a warning here.
  const c = await check({ dir });
  assert.ok(c.errors.some((e) => e.location === "decisions/dec_8888888888zz.yaml#/finding/content_digest"), JSON.stringify(c.errors));
});

test("evidence still reports the cited Finding as invalid when the Finding itself does not verify", async () => {
  const { dir, decisions } = instanceCopy();
  const r = await decide({ ...base(dir), id: "dec_ggggggggggg4" });
  assert.deepEqual(cats(r), []);
  assert.equal(r.evidence, "valid");
  // Tamper with the memo after the record pinned the digest: the Finding validator owns `evidence`, and it says so.
  writeFileSync(join(dir, "memo.md"), readFileSync(join(dir, "memo.md"), "utf8") + "\nEdited after the digest was pinned.\n");
  const retry = await decide({ ...base(dir), id: "dec_ggggggggggg4" });
  assert.equal(retry.evidence, "invalid");
  assert.ok(cats(retry).includes("digest"), JSON.stringify(retry.errors));
  assert.ok(existsSync(join(decisions, "dec_ggggggggggg4.yaml")));
});

test("the timezone gate is ICU acceptance minus fixed offsets, not a slash heuristic", async () => {
  // ICU accepts every one of these, so ICU alone cannot be the whole gate.
  for (const offset of ["+05:00", "-08:00", "+0500", "Etc/GMT+5", "Etc/GMT-14"]) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: offset }), `${offset} is ICU-accepted`);
    assert.equal(isIanaTimezone(offset), false, `${offset} names an offset, not a place`);
  }
  // Zone names ICU knows, including the legacy aliases with no slash in them.
  for (const zone of ["UTC", "GMT", "EST", "EST5EDT", "Japan", "Singapore", "Zulu", "Etc/UTC", "America/New_York"])
    assert.equal(isIanaTimezone(zone), true, `${zone} is a zone name this runtime knows`);
  for (const bad of ["Mars/Phobos", "America/Nowhere", "", "UTC+5", 5, null, undefined])
    assert.equal(isIanaTimezone(bad), false, `${String(bad)} is not a zone name`);

  const { dir, decisions } = instanceCopy();
  const sched = (timezone: string) => ({ schedule: { kind: "on_date" as const, date: "2026-12-01", timezone } });
  const alias = await decide({ ...base(dir), id: "dec_ggggggggggg5", revisitWhen: sched("Japan") });
  assert.deepEqual(cats(alias), [], "a zone name ICU knows is not refused for lacking a slash");
  assert.equal(parseYaml(readFileSync(join(decisions, "dec_ggggggggggg5.yaml"), "utf8")).revisit_when.schedule.timezone, "Japan");

  const offsetZone = await decide({ ...base(dir), id: "dec_ggggggggggg6", revisitWhen: sched("Etc/GMT+5") });
  assert.deepEqual(cats(offsetZone), ["value_type"], "a slash does not make an offset a place");
  assert.match(offsetZone.errors[0]!.message, /is a fixed UTC offset, not a zone name/);

  const plainOffset = await decide({ ...base(dir), id: "dec_ggggggggggg7", revisitWhen: sched("+05:00") });
  assert.match(plainOffset.errors[0]!.message, /is a fixed UTC offset, not a zone name/);
  const unknown = await decide({ ...base(dir), id: "dec_ggggggggggg8", revisitWhen: sched("Mars/Phobos") });
  assert.match(unknown.errors[0]!.message, /is not a timezone this runtime's ICU knows/);
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_ggggggggggg5.yaml"]);
});

test("a dry run reaches the same verdict the real run would: conflict, or idempotent retry", async () => {
  const { root, dir, decisions } = instanceCopy();
  await decide({ ...base(dir), id: "dec_hhhhhhhhhhh1" });
  const bytes = readFileSync(join(decisions, "dec_hhhhhhhhhhh1.yaml"));
  const index = readFileSync(join(root, "decisions.md"), "utf8");

  const conflict = await decide({ ...base(dir), id: "dec_hhhhhhhhhhh1", rationale: "Totally different reason.", dryRun: true });
  assert.deepEqual(cats(conflict), ["decision_conflict"], "a dry run never promises a write the real run refuses");
  assert.ok(!conflict.info.some((i) => /would be created/.test(i)), conflict.info.join("\n"));
  const real = await decide({ ...base(dir), id: "dec_hhhhhhhhhhh1", rationale: "Totally different reason." });
  assert.deepEqual(cats(real), cats(conflict), "the dry run and the real run agree");

  const retry = await decide({ ...base(dir), id: "dec_hhhhhhhhhhh1", dryRun: true });
  assert.deepEqual(cats(retry), []);
  assert.ok(retry.info.some((i) => /already holds this record byte-for-byte; the real run would be an idempotent retry/.test(i)), retry.info.join("\n"));

  assert.deepEqual(readFileSync(join(decisions, "dec_hhhhhhhhhhh1.yaml")), bytes, "no dry run wrote anything");
  assert.equal(readFileSync(join(root, "decisions.md"), "utf8"), index);
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_hhhhhhhhhhh1.yaml"]);
});

test("a file name that disagrees with its record id is reported without claiming the row is missing", async () => {
  const { root, dir, decisions } = instanceCopy();
  const rec = parseYaml(readFileSync(join(decisions, "dec_2x7v4b9m1kqa.yaml"), "utf8"));
  rec.id = "dec_mismatched01";
  writeFileSync(join(decisions, "dec_wrongname0001.yaml"), toYaml(rec));

  const r = await decide({ ...base(dir), id: "dec_hhhhhhhhhhh2" });
  const w = r.warnings.find((x) => x.location === "decisions/dec_wrongname0001.yaml" && /file name does not match/.test(x.message));
  assert.ok(w, JSON.stringify(r.warnings));
  assert.ok(!/excluded from the generated index/.test(w!.message), "the row IS in the index: " + w!.message);
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  assert.ok(index.includes("| dec_mismatched01 |"), index);
  assert.equal(r.evidence, "valid", "someone else's misnamed file is not a verdict on this Finding's evidence");
});

test("a stale index lock is broken, and a held one degrades to a warning rather than a lost record", async () => {
  const { root, dir, decisions } = instanceCopy();
  const lock = join(decisions, ".index.lock");
  mkdirSync(lock);
  const longAgo = new Date(Date.now() - 60_000);
  utimesSync(lock, longAgo, longAgo);
  const broken = await decide({ ...base(dir), id: "dec_iiiiiiiiiii1" });
  assert.deepEqual(cats(broken), []);
  assert.ok(!broken.warnings.some((w) => /index lock/.test(w.message)), JSON.stringify(broken.warnings));
  assert.ok(!existsSync(lock), "a lock left by a dead writer is broken and released");
  assert.ok(readFileSync(join(root, "decisions.md"), "utf8").includes("| dec_iiiiiiiiiii1 |"));

  // A lock a live writer still holds: after the five-second budget the index is rebuilt unlocked and the report says so.
  mkdirSync(lock);
  const held = await decide({ ...base(dir), id: "dec_iiiiiiiiiii2", decidedOn: "2026-09-16" });
  assert.deepEqual(cats(held), [], "the record is never lost to a contended index");
  assert.ok(held.warnings.some((w) => /another writer held the index lock/.test(w.message)), JSON.stringify(held.warnings));
  assert.ok(existsSync(join(decisions, "dec_iiiiiiiiiii2.yaml")));
  assert.ok(readFileSync(join(root, "decisions.md"), "utf8").includes("| dec_iiiiiiiiiii2 |"));
  rmSync(lock, { recursive: true, force: true });
});

test("eight separate OS processes appending at once lose no record and no index row", async () => {
  const { root, dir, decisions } = instanceCopy();
  const decidePath = fileURLToPath(new URL("./commands/decide.ts", import.meta.url));
  const worker = join(root, "..", "worker.mjs");
  writeFileSync(worker, `
import { pathToFileURL } from "node:url";
const [decidePath, findingDir, id, decidedOn] = process.argv.slice(2);
const { decide } = await import(pathToFileURL(decidePath).href);
const r = await decide({
  owner: "Dana Okafor", decidedOn, findingDir, restsOnClaims: ["c1"],
  action: { kind: "action", description: "Roll the checklist out." },
  rationale: "The checklist arm cleared the pre-registered bar.",
  revisitWhen: { schedule: { kind: "on_date", date: "2026-12-01", timezone: "America/New_York" } },
  id,
});
process.stdout.write(JSON.stringify({ errors: r.errors, warnings: r.warnings }));
process.exit(r.errors.length ? 1 : 0);
`);
  const ids = Array.from({ length: 8 }, (_, i) => `dec_jjjjjjjjjjj${i + 1}`);
  const runs = await Promise.all(ids.map((id, i) => new Promise<{ code: number | null; out: string }>((done) => {
    const child = spawn(process.execPath, [worker, decidePath, dir, id, `2026-09-1${i + 1}`], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; child.stdout.on("data", (b) => { out += b; }); child.stderr.on("data", (b) => { out += b; });
    child.on("close", (code) => done({ code, out }));
  })));
  for (const [i, run] of runs.entries()) assert.equal(run.code, 0, `${ids[i]}: ${run.out}`);

  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", ...ids.map((i) => `${i}.yaml`)], "every record file survived");
  const index = readFileSync(join(root, "decisions.md"), "utf8");
  for (const id of ids) assert.ok(index.includes(`| ${id} |`), `${id} missing from the index:\n${index}`);
  assert.ok(index.includes(FIXTURE_ROW), index);
  assert.ok(!existsSync(join(decisions, ".index.lock")), "no lock is left behind");
  assert.ok(readdirSync(decisions).every((f) => !f.startsWith(".tmp-")), readdirSync(decisions).join(","));
});

test("CLI: a revisit schedule without --timezone is a usage error, and with one it records", async () => {
  const { root, dir, decisions } = instanceCopy();
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, "decide", ...args], { encoding: "utf8" });
  const common = ["--finding", dir, "--owner", "Dana Okafor", "--date", "2026-09-15", "--claims", "c1",
    "--action", "action", "--description", "Ship it.", "--rationale", "It works."];

  for (const schedule of [["--revisit-date", "2026-12-01"], ["--revisit-every", "30"]]) {
    const missing = run([...common, ...schedule]);
    assert.equal(missing.status, 2, missing.stdout + missing.stderr);
    assert.match(missing.stderr, /--timezone is required with --revisit-date or --revisit-every/);
    assert.match(missing.stderr, /^usage: aftergrid decide/m);
    assert.doesNotMatch(missing.stdout + missing.stderr, /must have required property/, "not a raw schema pointer");
  }
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml"], "a usage error writes nothing");

  const ok = run([...common, "--revisit-date", "2026-12-01", "--timezone", "America/New_York", "--id", "dec_kkkkkkkkkkk1"]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /recorded dec_kkkkkkkkkkk1: action by Dana Okafor on 2026-09-15/);
  assert.match(ok.stdout, /path: .*dec_kkkkkkkkkkk1\.yaml/);
  assert.ok(existsSync(join(decisions, "dec_kkkkkkkkkkk1.yaml")));
  assert.ok(readFileSync(join(root, "decisions.md"), "utf8").includes("| dec_kkkkkkkkkkk1 |"));

  // A falsifier alone still needs no zone: it is not a schedule.
  const falsifier = run([...common, "--falsifier-check", "falsifier_lift", "--id", "dec_kkkkkkkkkkk2"]);
  assert.equal(falsifier.status, 0, falsifier.stdout + falsifier.stderr);
});

test("CLI: --instance is the flag the no-Instance remedy names, and it resolves the Instance", async () => {
  const { root, dir } = instanceCopy();
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  const outside = mkdtempSync(join(tmpdir(), "ag-decide-outside-"));
  const run = (args: string[]) => spawnSync(process.execPath, [cli, "decide", ...args], { encoding: "utf8" });
  const common = ["--owner", "Dana Okafor", "--date", "2026-09-15", "--claims", "c1", "--action", "action",
    "--description", "Ship it.", "--rationale", "It works.", "--falsifier-check", "falsifier_lift"];

  const noInstance = run([...common, "--finding", join(outside, "nothing")]);
  assert.equal(noInstance.status, 1, noInstance.stdout + noInstance.stderr);
  assert.match(noInstance.stdout, /no aftergrid\.yaml found here or above/);
  assert.match(noInstance.stdout, /pass --instance <dir>/);

  // The flag the remedy names exists and does what it says, rather than crashing on an unknown option.
  const withInstance = run([...common, "--finding", dir, "--instance", root, "--id", "dec_kkkkkkkkkkk3", "--dry-run"]);
  assert.equal(withInstance.status, 0, withInstance.stdout + withInstance.stderr);
  assert.doesNotMatch(withInstance.stderr, /ERR_PARSE_ARGS_UNKNOWN_OPTION/);
  assert.match(withInstance.stdout, /dry run: nothing written/);
});

test("the rationale and a recorded outcome are stored verbatim, and an impossible recorded_on is refused", async () => {
  const { dir, decisions } = instanceCopy();
  const rationale = "The checklist arm cleared the pre-registered bar; the web arm did not, and we accept that asymmetry.";
  const r = await decide({
    ...base(dir), id: "dec_lllllllllll1", rationale,
    outcome: { state: "recorded", description: "Shipped to all new users.", recorded_on: "2026-10-01" },
  });
  assert.deepEqual(cats(r), []);
  const rec = parseYaml(readFileSync(join(decisions, "dec_lllllllllll1.yaml"), "utf8"));
  assert.equal(rec.rationale, rationale, "the owner's words are stored as given, never summarised");
  assert.deepEqual(rec.outcome, { state: "recorded", description: "Shipped to all new users.", recorded_on: "2026-10-01" });

  const impossible = await decide({
    ...base(dir), id: "dec_lllllllllll2",
    outcome: { state: "recorded", description: "Shipped.", recorded_on: "2026-02-30" },
  });
  assert.deepEqual(cats(impossible), ["schema"]);
  assert.equal(impossible.errors[0]!.location, "record#/outcome/recorded_on");
  assert.deepEqual(yamlFiles(decisions), ["dec_2x7v4b9m1kqa.yaml", "dec_lllllllllll1.yaml"]);
});
