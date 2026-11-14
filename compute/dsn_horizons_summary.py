#!/usr/bin/env python3
"""Write verify/dsn-horizons-summary.json from the result of the DSN boundary check against Horizons.

The check itself (station position read from the NAIF station kernel, Horizons API with COMMAND 301,
CENTER coord@399, cylindrical site coordinates, 1 minute steps) was run on the server vipart-dev
by the project's check tool; this script only copies the per-boundary rows and the tolerance
into a small summary file next to the other verify files.

  python3 -I compute/dsn_horizons_summary.py <check result json> verify/dsn-horizons-summary.json
"""
import json
import sys

src = json.load(open(sys.argv[1], encoding="utf-8"))
h = src["dsn_horizons"]
rows = [
    {k: c[k] for k in ("station", "name", "edge", "claimed_utc", "horizons_utc", "diff_min", "pass")}
    for c in h["checks"]
]
out = {
    "n_boundaries": len(rows),
    "max_diff_min": max(r["diff_min"] for r in rows),
    "target_max_diff_min": h["tol_min"],
    "target_note": "Target set at hackathon start: boundary time within 5 minutes of Horizons.",
    "target_met": all(r["pass"] for r in rows),
    "reference": "Horizons API, target Moon (301), CENTER coord@399 with the station position from the NAIF station kernel, AIRLESS, 1 minute steps",
    "boundaries": rows,
    "checked_at_kst": src.get("checked_kst"),
    "generated_with": "Claude (Anthropic SI) copied these rows from the DSN check result with compute/dsn_horizons_summary.py",
}
with open(sys.argv[2], "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)
    fh.write("\n")
