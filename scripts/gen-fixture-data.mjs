// Deterministic synthetic warehouse for the Engine's fixture Instance.
// PostHog-shaped: users, events, subscriptions, for a fictional habit app "Loop".
// Planted effects: an onboarding-checklist experiment (2026-06-01..2026-07-12, randomized by user id)
// raises 7-day retention on mobile and not on web; a price change on 2026-09-08 with only 7 days of data.
// Nothing here is real company data. Seed is fixed; output is byte-identical across runs.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../fixtures/instance/data/", import.meta.url));
mkdirSync(OUT, { recursive: true });

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260915);
const pick = (arr, weights) => {
  const r = rnd(); let acc = 0;
  for (let i = 0; i < arr.length; i++) { acc += weights[i]; if (r < acc) return arr[i]; }
  return arr[arr.length - 1];
};
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const day = (s) => Date.parse(s + "T00:00:00Z");
const hex = (n) => n.toString(16).padStart(8, "0");

// Data window: signups 2026-05-01 .. 2026-09-14 inclusive. The last full New York day ends at 2026-09-15T04:00:00Z (exclusive).
const START = day("2026-05-01"), END = day("2026-09-14");
const EXP_START = day("2026-06-01"), EXP_END = day("2026-07-12");
const ROLLOUT = day("2026-08-20");
const PRICE_CHANGE = day("2026-09-08");
const CAPTURE = Date.parse("2026-09-15T04:00:00Z");

// ---- users ----
const users = [];
let uid = 1000;
for (let d = START; d <= END; d += DAY) {
  const n = 24 + Math.floor(rnd() * 14); // 24..37 signups a day
  for (let i = 0; i < n; i++) {
    uid += 1 + Math.floor(rnd() * 3);
    const user_id = "u_" + hex(uid);
    const signed_up_at = d + Math.floor(rnd() * DAY);
    const platform = pick(["ios", "android", "web"], [0.45, 0.30, 0.25]);
    let onboarding_variant = "";
    if (d >= EXP_START && d <= EXP_END) onboarding_variant = rnd() < 0.5 ? "checklist" : "control";
    else if (d >= ROLLOUT) onboarding_variant = "checklist";
    const country = pick(["US", "GB", "CA", "DE", "AU"], [0.55, 0.15, 0.12, 0.1, 0.08]);
    users.push({ user_id, signed_up_at, platform, onboarding_variant, country });
  }
}

// ---- events (app_open) ----
// Planted 7-day retention: mobile control 0.27, mobile checklist 0.38; web control 0.30, web checklist 0.30.
// Users outside the experiment: mobile 0.28, web 0.30 (post-rollout mobile 0.37).
function p7(u) {
  const mobile = u.platform !== "web";
  if (u.onboarding_variant === "checklist") return mobile ? 0.38 : 0.30;
  if (u.onboarding_variant === "control") return mobile ? 0.27 : 0.30;
  return mobile ? 0.28 : 0.30;
}
const events = [];
let eid = 0;
const ev = (u, ts) => { if (ts < CAPTURE) events.push({ event_id: "e_" + hex(++eid), user_id: u.user_id, event: "app_open", timestamp: ts }); };
for (const u of users) {
  ev(u, u.signed_up_at + Math.floor(rnd() * 3600000)); // day-0 open
  const retained = rnd() < p7(u);
  if (retained) {
    const opens = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < opens; k++) {
      // Land inside calendar days 1..7 after signup in America/New_York: whole-day offsets 1..6 plus at most 20h,
      // so a late-evening signup still cannot spill past day 7.
      const dayOffset = 1 + Math.floor(rnd() * 6); // days 1..6 (+ up to 20h)
      const ts = u.signed_up_at + dayOffset * DAY + Math.floor(rnd() * 20 * 3600000);
      ev(u, ts);
    }
  }
  if (rnd() < 0.12) { // some later opens, days 8..14
    const ts = u.signed_up_at + (8 + Math.floor(rnd() * 7)) * DAY + Math.floor(rnd() * DAY);
    ev(u, ts);
  }
}
events.sort((a, b) => a.timestamp - b.timestamp || (a.event_id < b.event_id ? -1 : 1));

// ---- subscriptions ----
// ~42% of users subscribe 0..10 days after signup; monthly plan; daily cancel hazard ~1.1%.
const subs = [];
let sid = 0;
for (const u of users) {
  if (rnd() >= 0.42) continue; // ~42% of users subscribe (keeps ~1,700 subs so ~7 cancellations/day)
  const started_at = u.signed_up_at + Math.floor(rnd() * 10 * DAY);
  if (started_at >= END + DAY) continue;
  const plan_price_cents = started_at >= PRICE_CHANGE ? 1299 : 999;
  let canceled_at = "";
  for (let t = started_at + DAY; t < END + DAY; t += DAY) {
    if (rnd() < 0.011) {
      const candidate = t + Math.floor(rnd() * DAY);
      if (candidate < CAPTURE) canceled_at = iso(candidate);
      break;
    }
  }
  subs.push({ subscription_id: "s_" + hex(++sid), user_id: u.user_id, started_at: iso(started_at), canceled_at, plan_price_cents });
}

// Planted edge case: a subscription that started after the price change and cancelled the next day. It is NOT in the
// "active at the change" population, so cohort-correct queries must not count its cancellation.
subs.push({ subscription_id: "s_" + hex(++sid), user_id: users[users.length - 1].user_id, started_at: iso(PRICE_CHANGE + DAY + 3600000), canceled_at: iso(PRICE_CHANGE + 2 * DAY + 7200000), plan_price_cents: 1299 });

// ---- write CSV ----
const csv = (rows, cols) => cols.join(",") + "\n" + rows.map((r) => cols.map((c) => r[c]).join(",")).join("\n") + "\n";
writeFileSync(join(OUT, "users.csv"), csv(users.map((u) => ({ ...u, signed_up_at: iso(u.signed_up_at) })), ["user_id", "signed_up_at", "platform", "onboarding_variant", "country"]));
writeFileSync(join(OUT, "events.csv"), csv(events.map((e) => ({ ...e, timestamp: iso(e.timestamp) })), ["event_id", "user_id", "event", "timestamp"]));
writeFileSync(join(OUT, "subscriptions.csv"), csv(subs, ["subscription_id", "user_id", "started_at", "canceled_at", "plan_price_cents"]));
console.log(`users ${users.length}, events ${events.length}, subscriptions ${subs.length}, cancellations ${subs.filter((s) => s.canceled_at).length}`);
