// `aftergrid decide` against a temp copy of the fixture Instance: what is recorded, what is refused, and what
// concurrency does to the log. Never mutates fixtures/instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { decide, type DecideOptions } from "./commands/decide.ts";
import { check } from "./commands/check.ts";
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

test("concurrent appends lose no record, and concurrent retries of one id write it once", async () => {
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
