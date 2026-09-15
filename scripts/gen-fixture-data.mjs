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

// ============================================================================================================
// Planted learning and failure fixtures (ag-synthetic-golden-nightly-5vm). Everything below uses a SECOND random
// stream and only ADDS rows (or removes rows outside both exemplars' extracts), so the reviewed exemplars keep their
// bytes. Each item is described, with its expected layer, in fixtures/instance/planted-effects.yaml.
// ============================================================================================================
const rnd2 = mulberry32(5150);
const pick2 = (arr, weights) => { const r = rnd2(); let acc = 0; for (let i = 0; i < arr.length; i++) { acc += weights[i]; if (r < acc) return arr[i]; } return arr[arr.length - 1]; };
const AUG = day("2026-08-01"), SEP = day("2026-09-01");
const FUNNEL_BREAK = day("2026-08-24");   // first_habit_created stops firing on android (instrumentation, not behaviour)
// New York calendar days start at 04:00Z in summer; planted day boundaries follow the analytical timezone.
const NY = 4 * 3600000;
const OUTAGE_FROM = day("2026-09-03") + NY, OUTAGE_TO = day("2026-09-06") + NY; // web events not ingested (coverage gap), exclusive end
const LATE_DAY = day("2026-09-01") + NY;   // ios events of this NY day ingested five days late
const DUP_DAY = day("2026-08-31") + NY;    // exact duplicate app_open rows on this NY day

// (M) Mix shift: a paid promo in August brings extra web signups (acquisition channel "promo") who come back far less
// often (p = 0.18) than organic users. Organic retention per platform is unchanged, so overall August retention falls
// with no product change: the denominator changed, not the product. Recorded in the acquisition table.
const augWeb = [];
for (let d = AUG; d < SEP; d += DAY) {
  const n = 14 + Math.floor(rnd2() * 8);
  for (let i = 0; i < n; i++) {
    uid += 1 + Math.floor(rnd2() * 3);
    // Signups land inside the New York calendar day (UTC-4 in August), so the promo cohort is entirely August in $tz.
    const u = { user_id: "u_" + hex(uid), signed_up_at: d + 5 * 3600000 + Math.floor(rnd2() * 19 * 3600000), platform: "web", onboarding_variant: d >= ROLLOUT ? "checklist" : "", country: pick2(["US", "GB", "CA", "DE", "AU"], [0.55, 0.15, 0.12, 0.1, 0.08]) };
    users.push(u); augWeb.push(u);
    ev(u, u.signed_up_at + Math.floor(rnd2() * 3600000));
    if (rnd2() < 0.18) { const opens = 1 + Math.floor(rnd2() * 4); for (let k = 0; k < opens; k++) ev(u, u.signed_up_at + (1 + Math.floor(rnd2() * 6)) * DAY + Math.floor(rnd2() * 20 * 3600000)); }
  }
}

// (F) Signup funnel for users signed up from August on: signup_completed for everyone, first_habit_created for ~62%
// within two days, EXCEPT android users signed up on/after FUNNEL_BREAK, whose first_habit_created is never recorded.
for (const u of users) {
  if (u.signed_up_at < AUG) continue;
  ev2(u, "signup_completed", u.signed_up_at + 60000);
  const creates = rnd2() < 0.62;
  const broken = u.platform === "android" && u.signed_up_at >= FUNNEL_BREAK;
  if (creates && !broken) ev2(u, "first_habit_created", u.signed_up_at + Math.floor(rnd2() * 2 * DAY));
}
function ev2(u, event, ts) { if (ts < CAPTURE) events.push({ event_id: "e_" + hex(++eid), user_id: u.user_id, event, timestamp: ts }); }

// (R) Referral campaign in September: only a dozen referred signups, far too few to evaluate.
const referred = users.filter((u) => u.signed_up_at >= SEP).slice(0, 12);
for (const u of referred) ev2(u, "referral_signup", u.signed_up_at + 30000);

// (G) Coverage gap: web app_open events on OUTAGE days were never ingested (removed here, recorded in ingestion_log).
const byUser = new Map(users.map((u) => [u.user_id, u]));
const inOutage = (e) => e.event === "app_open" && byUser.get(e.user_id)?.platform === "web" && e.timestamp >= OUTAGE_FROM && e.timestamp < OUTAGE_TO;
const removedByOutage = events.filter(inOutage).length;
for (let i = events.length - 1; i >= 0; i--) if (inOutage(events[i])) events.splice(i, 1);

// (D) Duplicates: every ios app_open on DUP_DAY appears twice with the same event_id (an ingestion replay).
const dups = events.filter((e) => e.event === "app_open" && byUser.get(e.user_id)?.platform === "ios" && e.timestamp >= DUP_DAY && e.timestamp < DUP_DAY + DAY);
for (const e of dups) events.push({ ...e });

events.sort((a, b) => a.timestamp - b.timestamp || (a.event_id < b.event_id ? -1 : 1));

// (L) Ingestion log: when each event became visible. Normal: within 10 minutes. ios events on LATE_DAY: five days late.
const ingestion = [];
{
  const seen = new Set();
  for (const e of events) {
    if (seen.has(e.event_id)) continue; seen.add(e.event_id);
    const late = byUser.get(e.user_id)?.platform === "ios" && e.timestamp >= LATE_DAY && e.timestamp < LATE_DAY + DAY;
    const ingested_at = late ? LATE_DAY + 5 * DAY + 3600000 : e.timestamp + Math.floor(rnd2() * 600000);
    if (ingested_at < CAPTURE) ingestion.push({ event_id: e.event_id, ingested_at: iso(ingested_at) });
  }
}

// Acquisition channel per user: promo for the August web cohort, organic for everyone else.
const promoIds = new Set(augWeb.map((u) => u.user_id));
const acquisition = users.map((u) => ({ user_id: u.user_id, channel: promoIds.has(u.user_id) ? "promo" : "organic" }));

// (Z) Platform dimension including a platform with no users at all, so a per-platform rate meets a zero denominator.
const platforms = [{ platform: "ios", label: "iPhone app" }, { platform: "android", label: "Android app" }, { platform: "web", label: "Web" }, { platform: "tv", label: "TV app (launched 2026-09-20, no users in this data)" }];

// ---- write CSV ----
// CSV policy (docs/contracts/checks-and-results.md): NULL is an empty unquoted field, an empty string is "", and any
// field holding a quote, comma, CR or LF is quoted with doubled quotes. Existing tables carry no such values, so their
// bytes are unchanged by this rule.
const csvField = (v) => { if (v === null || v === undefined) return ""; const t = String(v); return t === "" && v !== "" ? "" : /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csv = (rows, cols) => cols.join(",") + "\n" + rows.map((r) => cols.map((c) => csvField(r[c])).join(",")).join("\n") + "\n";
writeFileSync(join(OUT, "ingestion_log.csv"), csv(ingestion, ["event_id", "ingested_at"]));
writeFileSync(join(OUT, "acquisition.csv"), csv(acquisition, ["user_id", "channel"]));
writeFileSync(join(OUT, "platforms.csv"), csv(platforms, ["platform", "label"]));
writeFileSync(join(OUT, "users.csv"), csv(users.map((u) => ({ ...u, signed_up_at: iso(u.signed_up_at) })), ["user_id", "signed_up_at", "platform", "onboarding_variant", "country"]));
writeFileSync(join(OUT, "events.csv"), csv(events.map((e) => ({ ...e, timestamp: iso(e.timestamp) })), ["event_id", "user_id", "event", "timestamp"]));
writeFileSync(join(OUT, "subscriptions.csv"), csv(subs, ["subscription_id", "user_id", "started_at", "canceled_at", "plan_price_cents"]));
console.log(`users ${users.length}, events ${events.length}, subscriptions ${subs.length}, cancellations ${subs.filter((s) => s.canceled_at).length}, august web extra ${augWeb.length}, outage removed ${removedByOutage}, duplicates ${dups.length}, ingestion rows ${ingestion.length}`);
