#!/usr/bin/env python3
"""Offline reproduction. Run from DIR: python3 -I -B analysis/calculate.py"""
import csv
import hashlib
import json
from decimal import Decimal as D
from pathlib import Path

source = Path("data/conversion.csv")
raw = source.read_bytes()
source_hash = hashlib.sha256(raw).hexdigest()
with source.open(newline="") as f:
    reader = csv.DictReader(f)
    assert reader.fieldnames == ["period", "channel", "eligible_sessions", "signups"]
    rows = list(reader)
assert len(rows) == 4
keys = [(r["period"], r["channel"]) for r in rows]
assert len(set(keys)) == len(keys)
assert set(r["period"] for r in rows) == {"baseline", "current"}
groups = {p: {} for p in ("baseline", "current")}
for r in rows:
    n, y = int(r["eligible_sessions"]), int(r["signups"])
    assert n > 0 and 0 <= y <= n
    groups[r["period"]][r["channel"]] = {"sessions": n, "signups": y, "rate": D(y)/D(n)}
assert set(groups["baseline"]) == set(groups["current"]) == {"direct", "paid"}
totals = {}
for p, channels in groups.items():
    n = sum(v["sessions"] for v in channels.values())
    y = sum(v["signups"] for v in channels.values())
    totals[p] = {"sessions": n, "signups": y, "rate": D(y)/D(n)}
    for v in channels.values():
        v["share"] = D(v["sessions"])/D(n)
b, c = groups["baseline"], groups["current"]
channels = sorted(b)
standardized_current = sum(b[k]["share"]*c[k]["rate"] for k in channels)
mix_only_current = sum(c[k]["share"]*b[k]["rate"] for k in channels)
within = {k: b[k]["share"]*(c[k]["rate"]-b[k]["rate"]) for k in channels}
mix = {k: (c[k]["share"]-b[k]["share"])*c[k]["rate"] for k in channels}
interaction = sum((c[k]["share"]-b[k]["share"])*(c[k]["rate"]-b[k]["rate"]) for k in channels)
delta = totals["current"]["rate"]-totals["baseline"]["rate"]
assert sum(within.values()) + sum(mix.values()) == delta
assert standardized_current-totals["baseline"]["rate"] == sum(within.values())
assert totals["current"]["rate"]-mix_only_current == D(".01")
assert interaction == 0
result = {
    "source": str(source), "source_sha256": source_hash,
    "validity_checks": {"rows": len(rows), "unique_period_channel_keys": True,
        "same_channels_both_periods": True, "positive_sessions_and_bounded_signups": True,
        "joins": "none", "exclusions": "none"},
    "by_period_channel": groups, "totals": totals,
    "change": {"rate_difference": delta,
        "rate_relative_to_baseline": delta/totals["baseline"]["rate"],
        "sessions": totals["current"]["sessions"]-totals["baseline"]["sessions"],
        "signups": totals["current"]["signups"]-totals["baseline"]["signups"]},
    "baseline_weighted_current_rate": standardized_current,
    "current_weights_baseline_rates": mix_only_current,
    "decomposition_rate_units": {"within": within, "mix": mix,
        "within_total": sum(within.values()), "mix_total": sum(mix.values()),
        "interaction": interaction, "sum": sum(within.values())+sum(mix.values())},
    "signup_difference_at_common_10000_sessions": {
        "within": sum(within.values())*D(10000),
        "mix": sum(mix.values())*D(10000),
        "total": delta*D(10000)}
}
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
Path("analysis/calculations.json").write_text(json.dumps(result, indent=2, default=str)+"\n")
print(json.dumps(result, indent=2, default=str))
