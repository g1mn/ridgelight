#!/usr/bin/env python3
"""L2 (best point inside each Artemis III region), L4 (landing-date calendar, 5-day shift ranking) and M3 (longest shadow).

Run on the data server (needs ~/nasa-lunar-data, compute/sites.json, compute/in/ not needed):
    ~/venvs/nasa-lunar/bin/python -I l2_sites.py
Outputs go to ./out/l2 (copied to data/ and verify/ by hand):
    out/l2/data/sites/<region_id>.json, out/l2/data/calendar.json, out/l2/data/shadow.json, out/l2/verify/l2-summary.json,
    out/l2/best_points.json (input for dsn.py)

Rules fixed before the contest (docs/verification-protocol.md sections 5 and 6), not tuned to the result:
  * Region: the NASA release caption of 2022-08-19 says each candidate region is about 15 x 15 km. The 2024 release that names
    the nine regions gives no size, so a 15 x 15 km axis-aligned square in the south polar stereographic plane around the
    region point (itself read from a public NASA map, error a few km) is an assumption, labelled as such.
  * Grid: 2 km spacing, 7 x 7 points at -6..+6 km around the region point (49 points, the centre point is a grid point).
  * Horizon: the L1(b) ray tracer (compute/l1b.py), 720 azimuths, observer = DEM surface + 2 m.
  * Score = hours in 2027-01-01T00:00 .. 2028-12-31T23:00 UTC (17,544 hourly epochs) with the Sun disc fraction f >= 0.5 and
    any part of the Earth disc above the horizon at the same hour. Best point = largest score, ties go to the earlier point id.
  * Calendar: one landing time per day (00:00 UTC) in 2027-01-01 .. 2028-12-31. A day is OK if the Sun stays lit (f >= 0.5)
    for X = 72 hours and the Earth is visible in at least Y = 50 % of those hours (example values, not mission requirements).
  * Rank shift: S(region, d) = hours of joint light and Earth in the 14 days from d (uses 14 more days after the period).
  * Shadow: longest run of hourly epochs with f = 0 (sensitivity: f < 0.5), edges by linear interpolation of
    (Sun top edge - horizon) between hourly epochs; best and centre point of each region over 18.6 years and the calendar period.
Code written with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import datetime as dt, json, math, os, sys, time
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import l1b  # noqa: E402

R0, ROOT = l1b.R0, l1b.ROOT
OUT = os.path.join(HERE, "out", "l2")
STEP_M = 2000.0
OFFS = [-6000.0, -4000.0, -2000.0, 0.0, 2000.0, 4000.0, 6000.0]
SCORE_FIELD = "joint_sun_earth_hours"
T0 = dt.datetime(2026, 1, 1)
N_ALL = l1b.N_T
CAL_START = (dt.datetime(2027, 1, 1) - T0).days * 24  # index of 2027-01-01T00:00 in the 18.6 year series
N_CAL = 17544
X_HOURS, Y_PCT, WIN_DAYS, SHIFT = 72, 50, 14, 5


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S.%fZ")  # microseconds: the duration is exactly end minus start


def series(hor, lat, lon, h0, sun, earth):
    """Hourly arrays: f (disc fraction), earth_up (bool), Sun upper edge minus horizon (deg), Sun centre minus horizon (deg)."""
    r_km = (R0 + h0) / 1000.0
    az_s, el_s, ds = l1b.local_azel(sun, lat, lon, r_km)
    az_e, el_e, de = l1b.local_azel(earth, lat, lon, r_km)
    rad_s = np.degrees(np.arcsin(l1b.R_SUN_KM / ds))
    rad_e = np.degrees(np.arcsin(l1b.R_EARTH_KM / de))
    hs = l1b.interp_horizon(hor, az_s)
    dd = np.clip((el_s - hs) / rad_s, -1.0, 1.0)
    f = 1.0 - (np.arccos(dd) - dd * np.sqrt(1.0 - dd * dd)) / math.pi
    earth_up = ((el_e - l1b.interp_horizon(hor, az_e)) / rad_e) > -1.0
    return f, earth_up, el_s + rad_s - hs, el_s - hs


def longest_run(mask, top, times):
    """Longest run of True in mask. Edges interpolate the zero crossing of `top` (Sun upper edge - horizon).
    Returns (hours, start_dt, end_dt, i_first, i_last) or None."""
    if not mask.any():
        return None
    m = np.concatenate([[False], mask, [False]]).astype(np.int8)
    d = np.diff(m)
    starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0] - 1
    k = int(np.argmax(ends - starts))
    i, j = int(starts[k]), int(ends[k])
    n = len(mask)

    def cross(a, b):  # between epoch a (top > 0) and b (top <= 0) or the reverse
        ta, tb = float(top[a]), float(top[b])
        fr = ta / (ta - tb) if ta != tb else 0.5
        return times[a] + (times[b] - times[a]) * fr
    s = times[0] if i == 0 else cross(i - 1, i)
    e = times[n - 1] if j == n - 1 else cross(j + 1, j)
    # cross(j + 1, j): top at j+1 is > 0, at j <= 0, interpolate from j+1 back to j and place in time
    hours = (e - s).total_seconds() / 3600.0
    return hours, s, e, i, j


def main():
    t_all = time.time()
    tm = {}
    os.makedirs(os.path.join(OUT, "data", "sites"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "verify"), exist_ok=True)
    print("l2_sites.py start %s" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), flush=True)
    for k in ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]:
        sp.furnsh(os.path.join(ROOT, "naif", k))
    dems = [l1b.Raster("lola_dem", n) for n, _ in l1b.DEM_CHAIN]
    t = time.time()
    ets, sun_all, earth_all = l1b.body_vectors()
    tm["body_vectors"] = round(time.time() - t, 1)
    times_all = [T0 + dt.timedelta(hours=i) for i in range(N_ALL)]
    sites = [s for s in json.load(open(os.path.join(HERE, "sites.json")))["sites"] if s["kind"] == "artemis3_region"]
    rids = [s["site_id"] for s in sites]
    assert len(rids) == 9
    cs = slice(CAL_START, CAL_START + N_CAL + WIN_DAYS * 24)  # calendar period + 14 days for the 14-day windows
    sun_c, earth_c = sun_all[cs], earth_all[cs]
    sc_slice = slice(0, N_CAL)

    regions, best_info, cal_series, grid_t = {}, {}, {}, time.time()
    for s in sites:
        rid = s["site_id"]
        lat0, lon0 = s["lat_deg"], s["lon_deg"]
        rho0 = l1b.rho_of(abs(lat0))
        cx, cy = rho0 * math.sin(math.radians(lon0)), rho0 * math.cos(math.radians(lon0))
        pts = []
        for iy, dy in enumerate(OFFS):
            for ix, dx in enumerate(OFFS):
                x, y = cx + dx, cy + dy
                lat, lon = l1b.xy_to_latlon(x, y)
                hor, h0, od = l1b.horizon(dems, lat, lon, 0 if lat <= -85.0 else 2)
                f, eu, _top, _ctr = series(hor, lat, lon, h0, sun_c, earth_c)
                lit = f >= 0.5
                joint = lit & eu
                score = float(joint[sc_slice].sum())
                pts.append({"point_id": "%s-%02d" % (rid, len(pts) + 1), "x_m": round(x, 1), "y_m": round(y, 1), "lat_deg": round(lat, 5),
                            "lon_deg": round(lon, 5), "ground_height_m": round(h0, 1),
                            "sun_pct": round(float(lit[sc_slice].mean() * 100.0), 4),
                            "earth_pct": round(float(eu[sc_slice].mean() * 100.0), 4), SCORE_FIELD: score,
                            "_hor": hor, "_lit": lit, "_eu": eu, "_dx": dx, "_dy": dy})
        center = next(p for p in pts if p["_dx"] == 0.0 and p["_dy"] == 0.0)
        best = max(pts, key=lambda p: (p[SCORE_FIELD], -pts.index(p)))
        regions[rid] = {"pts": pts, "center": center, "best": best}
        print("region %s best %s score %.0f center %.0f (%.0fs)" % (rid, best["point_id"], best[SCORE_FIELD], center[SCORE_FIELD], time.time() - grid_t), flush=True)
    tm["grid_horizons_and_scores"] = round(time.time() - grid_t, 1)

    # ---- data/sites/<rid>.json
    summary_best, summary_bvc, ppr = {}, {}, {}
    for s in sites:
        rid = s["site_id"]
        R = regions[rid]
        c, b = R["center"], R["best"]
        keep = lambda p: {k: v for k, v in p.items() if not k.startswith("_")}
        doc = {"region_id": rid, "name": s["name"], "grid_step_m": STEP_M, "score_field": SCORE_FIELD,
               "score_period": {"start": "2027-01-01", "end": "2028-12-31", "epochs": N_CAL},
               "region_box_assumption": "15 x 15 km square in the polar stereographic plane around the region point (NASA 2022-08-19 caption: each candidate region is about 15 x 15 km; size for the 2024 list not stated)",
               "region_point_quality": "approximate position read from a public NASA map",
               "center": {k: c[k] for k in ("x_m", "y_m", "sun_pct", "earth_pct", SCORE_FIELD)},
               "points": [keep(p) for p in R["pts"]], "best_point_id": b["point_id"],
               "best_vs_center_hours": b[SCORE_FIELD] - c[SCORE_FIELD],
               "generated_with": "Claude (Anthropic SI) wrote compute/l2_sites.py; numbers come from the script run"}
        json.dump(doc, open(os.path.join(OUT, "data", "sites", rid + ".json"), "w"), indent=1)
        summary_best[rid], summary_bvc[rid], ppr[rid] = b["point_id"], doc["best_vs_center_hours"], len(R["pts"])

    # ---- calendar
    t = time.time()
    n_days = (dt.date(2028, 12, 31) - dt.date(2027, 1, 1)).days + 1
    dates = [dt.date(2027, 1, 1) + dt.timedelta(days=i) for i in range(n_days)]
    by_region, cal_sites = {}, []
    for rid in rids:
        b = regions[rid]["best"]
        joint = (b["_lit"] & b["_eu"]).astype(np.int32)
        cs14 = np.concatenate([[0], np.cumsum(joint)])
        by_region[rid] = [float(cs14[24 * d + WIN_DAYS * 24] - cs14[24 * d]) for d in range(n_days)]
        lit = b["_lit"].astype(np.int32)
        cl = np.concatenate([[0], np.cumsum(lit)])
        ce = np.concatenate([[0], np.cumsum(b["_eu"].astype(np.int32))])
        ok = [(cl[24 * d + X_HOURS] - cl[24 * d] == X_HOURS) and (ce[24 * d + X_HOURS] - ce[24 * d] >= X_HOURS * Y_PCT / 100.0) for d in range(n_days)]
        okd = [dates[d].isoformat() for d in range(n_days) if ok[d]]
        cal_sites.append({"site_id": rid, "point_id": b["point_id"], "dates_ok": okd if okd else "none", "n_dates_ok": len(okd)})
    cal = {"period": {"start": "2027-01-01", "end": "2028-12-31"}, "landing_time_utc": "00:00", "x_hours": X_HOURS, "y_earth_pct": Y_PCT,
           "example_values": True, "note": "X and Y are example values, not mission requirements",
           "ephemeris_only": False, "sites": cal_sites,
           "score_14d": {"window_days": WIN_DAYS, "dates": [d.isoformat() for d in dates], "by_region": by_region,
                         "note": "hours of joint Sun (f >= 0.5) and Earth visibility in the 14 days from each date at the region's best point; the last dates use 14 days after the period"},
           "generated_with": "Claude (Anthropic SI) wrote compute/l2_sites.py; numbers come from the script run"}
    json.dump(cal, open(os.path.join(OUT, "data", "calendar.json"), "w"))
    # rank change counts (same rules as the checker: ties do not count, top = largest score, ties to the earlier region)
    idx = {d: i for i, d in enumerate(dates)}
    flips = n_d = top_ch = 0
    order = {rid: k for k, rid in enumerate(rids)}
    for d, i in idx.items():
        j = idx.get(d + dt.timedelta(days=SHIFT))
        if j is None:
            continue
        n_d += 1
        for x in range(len(rids)):
            for y in range(x + 1, len(rids)):
                a1 = by_region[rids[x]][i] - by_region[rids[y]][i]
                a2 = by_region[rids[x]][j] - by_region[rids[y]][j]
                if a1 * a2 < 0:
                    flips += 1
        top = lambda k: max(rids, key=lambda q: (by_region[q][k], -order[q]))
        top_ch += top(i) != top(j)
    tm["calendar"] = round(time.time() - t, 1)

    # ---- M3 shadow
    t = time.time()
    rows, cc_pick = [], None
    for rid in rids:
        for kind in ("best", "center"):
            p = regions[rid][kind]
            lat, lon = l1b.xy_to_latlon(p["x_m"], p["y_m"])
            hor, h0 = p["_hor"], p["ground_height_m"]
            # recompute with the unrounded height used for the horizon
            f, eu, top, ctr = series(hor, lat, lon, float(h0), sun_all, earth_all)
            for period, sl in (("18.6y", slice(0, N_ALL)), ("calendar", slice(CAL_START, CAL_START + N_CAL))):
                ff, tt, cc_ = f[sl], top[sl], ctr[sl]
                tms = times_all[sl]
                r0 = longest_run(ff <= 0.0, tt, tms)
                r1 = longest_run(ff < 0.5, cc_, tms)  # f < 0.5 edges: the Sun centre crosses the horizon
                if r0 is None:
                    rows.append({"site_id": rid, "point_id": p["point_id"], "point_kind": kind, "period": period, "longest_shadow_hours": 0.0,
                                 "shadow_start_utc": None, "shadow_end_utc": None, "sens_longest_hours": r1[0] if r1 else 0.0})
                    continue
                rows.append({"site_id": rid, "point_id": p["point_id"], "point_kind": kind, "period": period,
                             "longest_shadow_hours": r0[0], "shadow_start_utc": iso(r0[1]), "shadow_end_utc": iso(r0[2]),
                             "sens_longest_hours": r1[0] if r1 else 0.0, "_i": (r0[3], r0[4], sl.start or 0)})
                if cc_pick is None and kind == "best" and period == "calendar":
                    cc_pick = (rid, kind, period, p, lat, lon, float(h0), r0, sl)
    # cross-check one row with SPICE azlcpo (independent of the series code), edges bracket +-1 hour
    rid, kind, period, p, lat, lon, h0, r0, sl = cc_pick
    _, s_dt, e_dt, i, j = r0
    i_abs, j_abs = (sl.start or 0) + i, (sl.start or 0) + j
    latr, lonr = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(latr) * math.cos(lonr), math.cos(latr) * math.sin(lonr), math.sin(latr)])
    obs = up * (R0 + h0) / 1000.0

    def top_azlcpo(k):
        rec, _ = sp.azlcpo("ELLIPSOID", "SUN", float(ets[k]), "LT+S", False, True, list(obs), "MOON", "MOON_ME")
        rng, az, el = rec[0], math.degrees(rec[1]) % 360.0, math.degrees(rec[2])
        rad = math.degrees(math.asin(l1b.R_SUN_KM / rng))
        return el + rad - float(l1b.interp_horizon(np.array(p["_hor"]), np.array([az]))[0])
    edges, maxdiff = [], 0.0
    _, _, top_series, _ = series(p["_hor"], lat, lon, h0, sun_all, earth_all)
    for edge, kb, ka in (("start", i_abs - 1, i_abs), ("end", j_abs, j_abs + 1)):
        vb, va = top_azlcpo(kb), top_azlcpo(ka)
        maxdiff = max(maxdiff, abs(vb - float(top_series[kb])), abs(va - float(top_series[ka])))
        edges.append({"edge": edge, "utc_before": iso(times_all[kb]), "utc_after": iso(times_all[ka]),
                      "sun_top_minus_horizon_before_deg": vb, "sun_top_minus_horizon_after_deg": va})
    signs_ok = edges[0]["sun_top_minus_horizon_before_deg"] > 0 >= edges[0]["sun_top_minus_horizon_after_deg"] and \
        edges[1]["sun_top_minus_horizon_before_deg"] <= 0 < edges[1]["sun_top_minus_horizon_after_deg"]
    crosscheck = {"site_id": rid, "point_kind": kind, "period": period, "method": "SPICE azlcpo (ELLIPSOID, LT+S, MOON_ME), horizon from the same mask",
                  "edges": edges, "max_abs_diff_vs_series_deg": maxdiff, "pass": bool(signs_ok and maxdiff < 0.01)}
    clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
    json.dump({"rows": clean, "crosscheck": crosscheck, "definition": {"representative": "Sun disc fully hidden (f = 0) at consecutive hourly epochs, edges interpolated",
                                                                     "sensitivity": "f < 0.5", "periods": {"18.6y": "2026-01-01T00:00 UTC, 163,056 hourly epochs",
                                                                                                          "calendar": "2027-01-01T00:00 .. 2028-12-31T23:00 UTC"}},
               "generated_with": "Claude (Anthropic SI) wrote compute/l2_sites.py; numbers come from the script run"},
              open(os.path.join(OUT, "data", "shadow.json"), "w"), indent=1)
    tm["shadow"] = round(time.time() - t, 1)

    # ---- inputs for dsn.py
    json.dump({rid: {"point_id": regions[rid]["best"]["point_id"], "x_m": regions[rid]["best"]["x_m"], "y_m": regions[rid]["best"]["y_m"],
                     "ground_height_m": regions[rid]["best"]["ground_height_m"], "hor": [float(v) for v in regions[rid]["best"]["_hor"]]}
               for rid in rids}, open(os.path.join(OUT, "best_points.json"), "w"))

    tm["total"] = round(time.time() - t_all, 1)
    summary = {"regions": 9, "region_ids": rids, "reduced": [], "reduced_reason": "", "grid_step_m": STEP_M, "score_field": SCORE_FIELD,
               "score_period": {"start": "2027-01-01", "end": "2028-12-31"}, "score_epochs": N_CAL, "points_per_region": ppr,
               "best_point": summary_best, "best_vs_center_hours": summary_bvc,
               "rank_changed_combos": flips, "rank_pairs_total": 36 * n_d, "top1_changed_dates": top_ch, "dates_total": n_d, "shift_days": SHIFT,
               "region_box_assumption": "15 x 15 km square around the approximate region point (NASA 2022 caption), 7 x 7 grid at 2 km",
               "runtime_s": tm["total"], "runtime_by_step_s": tm,
               "generated_with": "Claude (Anthropic SI) wrote compute/l2_sites.py; numbers come from the script run"}
    json.dump(summary, open(os.path.join(OUT, "verify", "l2-summary.json"), "w"), indent=1)
    print("DONE rank_changed %d / %d, top1 changed %d / %d, crosscheck pass %s, runtime %.0fs" % (flips, 36 * n_d, top_ch, n_d, crosscheck["pass"], tm["total"]), flush=True)


if __name__ == "__main__":
    main()
