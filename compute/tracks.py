#!/usr/bin/env python3
"""Sky-dome tracks (Sun and Earth az/el) for the 9 Artemis III region points, no terrain.
Same SPICE setup as spice_check.py (azlcpo ELLIPSOID, LT+S, MOON observer, MOON_ME, surface height 0).
Start = hackathon start 2026-11-14 10:00 KST = 01:00 UTC, 60 min step, 45 days (1081 samples).
Run: ~/venvs/nasa-lunar/bin/python -I tracks.py  (writes ./out/tracks/<site_id>.json)
Code and data generated with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import json, math, os
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("LW_DATA", os.path.expanduser("~/nasa-lunar-data"))
START = "2026-11-14 01:00:00 UTC"
STEP_MIN, DAYS = 60, 45
N = DAYS * 24 * 60 // STEP_MIN + 1
R = 1737.4
for k in ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]:
    sp.furnsh(os.path.join(ROOT, "naif", k))
et0 = sp.str2et(START)
out = os.path.join(HERE, "out", "tracks")
os.makedirs(out, exist_ok=True)
for s in json.load(open(os.path.join(HERE, "sites.json")))["sites"]:
    pos = sp.latrec(R, math.radians(s["lon_deg"] % 360.0), math.radians(s["lat_deg"]))
    d = {"sun": ([], []), "earth": ([], [])}
    for i in range(N):
        et = et0 + i * STEP_MIN * 60.0
        for name, tid in (("sun", "10"), ("earth", "399")):
            st, _ = sp.azlcpo("ELLIPSOID", tid, et, "LT+S", False, True, pos, "MOON", "MOON_ME")
            d[name][0].append(round(st[1] * sp.dpr(), 4))
            d[name][1].append(round(st[2] * sp.dpr(), 4))
    rec = {"site_id": s["site_id"], "start_utc": "2026-11-14T01:00:00Z", "step_minutes": STEP_MIN, "n": N,
           "sun": {"az_deg": d["sun"][0], "el_deg": d["sun"][1]},
           "earth": {"az_deg": d["earth"][0], "el_deg": d["earth"][1]},
           "terrain_included": False,
           "source": "SPICE azlcpo (spiceypy, de440s, MOON_ME), LT+S, surface height 0, no terrain, no refraction; site position is an approximate point read from a public NASA map. Generated with Claude (Anthropic SI) assistance, compute/tracks.py",
           "generated_with": "Claude (Anthropic SI)"}
    json.dump(rec, open(os.path.join(out, s["site_id"] + ".json"), "w"), separators=(",", ":"))
    print("track", s["site_id"], N, flush=True)
