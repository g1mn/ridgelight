#!/usr/bin/env python3
"""M2: Deep Space Network ground-station windows (Moon above an example elevation) and per-region communication fraction.

Run on the data server after l2_sites.py (needs out/l2/best_points.json and ~/nasa-lunar-data/naif):
    ~/venvs/nasa-lunar/bin/python -I dsn.py
Outputs: out/l2/data/dsn.json and a patched out/l2/verify/l2-summary.json (runtime_by_step_s gets a dsn entry).

Rules fixed before the contest (docs/verification-protocol.md section 4):
  * Stations DSS-14 Goldstone (399014), DSS-63 Madrid (399063), DSS-43 Canberra (399043) from earthstns_itrf93_260814.bsp,
    frame DSS-nn_TOPO (earth_topo_260814.tf), Earth orientation earth_1962_260806_2126_combined.bpc.
  * Moon centre, light time and stellar aberration (LT+S), no refraction. Elevation threshold 10 deg is an example value,
    not a DSN requirement.
  * Period 2027-01-01T00:00 .. 2028-12-31T23:00 UTC, hourly epochs (17,544). Window edges: the hourly elevation series is
    scanned for crossings of the threshold, the crossing is placed by linear interpolation between the two hourly epochs and
    then refined by two secant steps evaluated directly with SPICE. Edges at the period ends are marked clipped.
  * Communication possible at a region point: the Earth is visible there (same definition as L2) and at least one of the three
    stations sees the Moon above the threshold, evaluated on the hourly epochs.
Code written with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import datetime as dt, json, math, os, sys, time
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import l1b  # noqa: E402

ROOT = l1b.ROOT
OUT = os.path.join(HERE, "out", "l2")
STATIONS = [(399014, "DSS-14", "Goldstone"), (399063, "DSS-63", "Madrid"), (399043, "DSS-43", "Canberra")]
MIN_ELEV = 10.0
N_CAL = 17544
T_START = dt.datetime(2027, 1, 1)
CAL_START = (T_START - dt.datetime(2026, 1, 1)).days * 24


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def moon_elev(name, ets):
    """Elevation (deg) of the Moon centre above the station's local horizon (TOPO frame, z up), LT+S."""
    pos, _ = sp.spkpos("MOON", np.atleast_1d(ets), name + "_TOPO", "LT+S", name)
    pos = np.array(pos)
    return np.degrees(np.arcsin(pos[:, 2] / np.linalg.norm(pos, axis=1)))


def main():
    t_all = time.time()
    print("dsn.py start %s" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), flush=True)
    for k in ["naif0012.tls", "de440s.bsp", "pck00011.tpc", "earthstns_itrf93_260814.bsp", "earth_topo_260814.tf",
              "earth_1962_260806_2126_combined.bpc", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc"]:
        sp.furnsh(os.path.join(ROOT, "naif", k))
    t0 = sp.str2et("2027-01-01 00:00:00 UTC")
    ets = t0 + 3600.0 * np.arange(N_CAL)
    stations, up_any = [], np.zeros(N_CAL, bool)
    for sid, name, place in STATIONS:
        el = moon_elev(name, ets)
        up = el >= MIN_ELEV
        up_any |= up
        wins = []
        idx = np.nonzero(np.diff(up.astype(np.int8)) != 0)[0]  # crossing between idx and idx+1

        def refine(i, rising):
            ta, tb = float(ets[i]), float(ets[i + 1])
            ea, eb = float(el[i]) - MIN_ELEV, float(el[i + 1]) - MIN_ELEV
            t = ta + (tb - ta) * (ea / (ea - eb))
            for _ in range(2):
                e1 = float(moon_elev(name, [t])[0]) - MIN_ELEV
                e2 = float(moon_elev(name, [t + 60.0])[0]) - MIN_ELEV
                slope = (e2 - e1) / 60.0
                if slope == 0:
                    break
                t = t - e1 / slope
            return t
        edges = [(refine(int(i), bool(up[i + 1])), bool(up[i + 1])) for i in idx]
        events = []
        if up[0]:
            events.append(("up", None))
        for t, rising in edges:
            events.append(("up" if rising else "down", t))
        # build windows
        start, clip_s = (None, None)
        if up[0]:
            start, clip_s = t0, True
        for kind, t in events:
            if kind == "up" and t is not None:
                start, clip_s = t, False
            elif kind == "down":
                wins.append((start, t, clip_s, False))
                start = None
        if start is not None and up[-1]:
            wins.append((start, t0 + 3600.0 * (N_CAL - 1), clip_s, True))

        out_w = []
        for s, e, cs, ce in wins:
            clipped = "both" if (cs and ce) else ("start" if cs else ("end" if ce else None))
            ts = dt.datetime.fromisoformat(sp.et2utc(s, "ISOC", 3))
            te = dt.datetime.fromisoformat(sp.et2utc(e, "ISOC", 3))
            out_w.append({"start_utc": ts.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (ts.microsecond // 1000),
                          "end_utc": te.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (te.microsecond // 1000), "clipped": clipped})
        stations.append({"id": sid, "name": name, "place": place, "windows": out_w})
        print("%s windows %d (first %s, last %s)" % (name, len(out_w), out_w[0]["start_utc"], out_w[-1]["end_utc"]), flush=True)

    # ---- per-region communication fraction at the best point
    best = json.load(open(os.path.join(OUT, "best_points.json")))
    ets_all, sun_all, earth_all = l1b.body_vectors()
    earth_c = earth_all[CAL_START:CAL_START + N_CAL]
    sites = []
    for rid, b in best.items():
        lat, lon = l1b.xy_to_latlon(b["x_m"], b["y_m"])
        hor = np.array(b["hor"])
        r_km = (l1b.R0 + b["ground_height_m"]) / 1000.0
        az_e, el_e, de = l1b.local_azel(earth_c, lat, lon, r_km)
        rad_e = np.degrees(np.arcsin(l1b.R_EARTH_KM / de))
        eu = ((el_e - l1b.interp_horizon(hor, az_e)) / rad_e) > -1.0
        sites.append({"site_id": rid, "point_id": b["point_id"], "earth_visible_fraction": float(eu.mean()),
                      "comm_fraction": float((eu & up_any).mean())})
    doc = {"min_elev_deg": MIN_ELEV, "example_value": True, "note": "10 degrees is an example threshold, not a DSN requirement",
           "period": {"start": "2027-01-01", "end": "2028-12-31"}, "epochs": N_CAL,
           "boundary_method": "hourly elevation series, threshold crossing by linear interpolation between hourly epochs, then two secant steps evaluated with SPICE; edges at the period ends are clipped",
           "aiming": "Moon centre, LT+S, no refraction; frames DSS-nn_TOPO (earth_topo_260814.tf), Earth orientation earth_1962_260806_2126_combined.bpc",
           "window_definition": "windows use station elevation only, before overlap with Earth visibility at a region",
           "stations": stations, "sites": sites,
           "generated_with": "Claude (Anthropic SI) wrote compute/dsn.py; numbers come from the script run"}
    json.dump(doc, open(os.path.join(OUT, "data", "dsn.json"), "w"), indent=1)
    sp_ = os.path.join(OUT, "verify", "l2-summary.json")
    S = json.load(open(sp_))
    dt_dsn = round(time.time() - t_all, 1)
    S["runtime_by_step_s"]["dsn"] = dt_dsn
    S["runtime_s"] = round(S["runtime_s"] + dt_dsn, 1)
    json.dump(S, open(sp_, "w"), indent=1)
    print("DONE dsn %.0fs; comm fraction range %.3f..%.3f" % (dt_dsn, min(s["comm_fraction"] for s in sites), max(s["comm_fraction"] for s in sites)), flush=True)


if __name__ == "__main__":
    main()
