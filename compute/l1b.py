#!/usr/bin/env python3
"""L1(b): terrain model (horizon ray tracing on LOLA DEMs + 18.6 year Sun/Earth visibility) against the
LOLA average visibility maps (AVGVISIB, Sun and Earth) at 500 seeded points. Gate for the hackathon plan.

Run on the data server (needs ~/nasa-lunar-data):
    ~/venvs/nasa-lunar/bin/python -I l1b.py            # all steps
    ~/venvs/nasa-lunar/bin/python -I l1b.py --n-test 12  # quick self test on 12 points (writes ./out-test)
Outputs go to ./out (copied to data/ and verify/ by hand):
    out/data/horizon/<site_id>.json, out/data/horizon/points/masks-500.json,
    out/verify/l1b-scatter.csv, out/verify/l1b-l1a-sun-el.csv, out/verify/l1b-summary.json

Method (the plan fixed these before the contest, see docs/verification-protocol.md):
  * sampling: numpy.random.default_rng(20261114), layers A (88-90 S, 200), B (85-88 S, 150), C (80-85 S, 150),
    uniform in the polar stereographic plane, snapped to the pixel center of the comparison map.
  * horizon: 720 azimuths (0.5 deg), ray out to 300 km, sphere geometry (R=1737.4 km), bilinear DEM samples
    spaced by the DEM pixel size: 85S 20 m (0-5 km), 85S 40 m (5-20), 80S 80 m (20-50), 75S 120 m (50-150),
    60S 240 m (150-300); a sample outside a DEM falls back to the next coarser one. Observer = DEM surface + 2 m.
  * visibility: 163,056 hourly epochs from 2026-01-01T00:00 UTC. Sun: mean of the visible disc fraction f;
    Earth: fraction of epochs with any part of the disc above the horizon.
Code written with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import csv, datetime as dt, json, math, os, re, statistics, sys, time
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("LW_DATA", os.path.expanduser("~/nasa-lunar-data"))
R0 = 1737400.0
SEED = 20261114
AZ_N, AZ_STEP = 720, 0.5
OBS_H = 2.0
T0, N_T = "2026-01-01 00:00:00 UTC", 163056
R_SUN_KM, R_EARTH_KM = 696000.0, 6378.1366
DEM_CHAIN = [("ldem_85s_20m", 20.0), ("ldem_85s_40m", 40.0), ("ldem_80s_80m", 80.0), ("ldem_75s_120m", 120.0), ("ldem_60s_240m", 240.0)]
BANDS = [(0.0, 5000.0, 0), (5000.0, 20000.0, 1), (20000.0, 50000.0, 2), (50000.0, 150000.0, 3), (150000.0, 300000.0, 4)]
LAYERS = [("A", 88.0, 90.0, 200), ("B", 85.0, 88.0, 150), ("C", 80.0, 85.0, 150)]
MAP85, MAP75 = "AVGVISIB_85S_060M_201608", "AVGVISIB_75S_120M_201608"
TARGETS = {"target_mae_sun_pp": 5, "target_r_sun": 0.95, "target_mae_earth_pp": 5, "target_r_earth": 0.95}
RULES = {
    "pass": "500 points computed, Sun MAE 10 pp or less and correlation 0.8 or more, and the Sun elevation from the visibility code matches L1(a) at 3 of the 9 sites at all 4 epochs within 0.01 deg",
    "pass_earth_map": "Sun conditions met but Earth MAE above 10 pp or correlation below 0.8: Earth visibility is read from the map and labelled as such",
    "fail": "Sun condition not met, or the 500 points were not finished by 20:00",
}
RULE_SOURCE = "docs/verification-protocol.md"


# ---------------------------------------------------------------- raster files
def pds_label(path):
    t = open(path, encoding="latin-1").read()

    def g(k, cast=float):
        m = re.search(r"^\s*" + k + r"\s*=\s*([-+0-9.eE]+)", t, re.M)
        return cast(m.group(1)) if m else None
    return {"lines": g("LINES", int), "samples": g("LINE_SAMPLES", int), "scale": g("SCALING_FACTOR"),
            "map_scale_m": g("MAP_SCALE"), "off_l": g("LINE_PROJECTION_OFFSET"), "off_s": g("SAMPLE_PROJECTION_OFFSET"),
            "text": t}


class Raster:
    def __init__(self, folder, stem, img_name=None, lbl_name=None):
        lbl = os.path.join(ROOT, folder, lbl_name or (stem + ".lbl"))
        if not os.path.exists(lbl):
            lbl = os.path.join(ROOT, folder, stem + ".LBL")
        self.stem = stem
        L = pds_label(lbl)
        self.L, self.S = L["lines"], L["samples"]
        self.scale_val, self.px = L["scale"], L["map_scale_m"]
        self.off_l, self.off_s = L["off_l"], L["off_s"]
        img = os.path.join(ROOT, folder, img_name or (stem + ".img"))
        if not os.path.exists(img):
            img = os.path.join(ROOT, folder, stem + ".IMG")
        self.path = img
        self.mm = np.memmap(img, dtype="<i2", mode="r", shape=(self.L, self.S))
        self.flat = self.mm.reshape(-1)
        assert os.path.getsize(img) == self.L * self.S * 2, img

    def pix(self, x, y):
        return self.off_s + x / self.px, self.off_l - y / self.px

    def dn(self, s0, l0):
        return self.mm[l0, s0]

    def bilinear(self, x, y):
        """DN * scaling at plane coordinates (m); NaN outside the raster (pixel centers at integer indices)."""
        s, l = self.pix(x, y)
        ok = (s >= 0) & (s <= self.S - 1) & (l >= 0) & (l <= self.L - 1)
        s = np.where(ok, s, 0.0)
        l = np.where(ok, l, 0.0)
        s0 = np.minimum(np.floor(s).astype(np.int64), self.S - 2)
        l0 = np.minimum(np.floor(l).astype(np.int64), self.L - 2)
        fs, fl = s - s0, l - l0
        i = l0 * self.S + s0
        a, b = self.flat[i].astype(np.float32), self.flat[i + 1].astype(np.float32)
        c, d = self.flat[i + self.S].astype(np.float32), self.flat[i + self.S + 1].astype(np.float32)
        v = (a * (1 - fs) + b * fs) * (1 - fl) + (c * (1 - fs) + d * fs) * fl
        return np.where(ok, v * self.scale_val, np.nan)


def rho_of(lat_abs_deg):
    return 2 * R0 * math.tan(math.radians(90.0 - lat_abs_deg) / 2)


def xy_to_latlon(x, y):
    rho = math.hypot(x, y)
    lat = -90.0 + math.degrees(2 * math.atan(rho / (2 * R0)))
    lon = math.degrees(math.atan2(x, y))
    return lat, lon


# ---------------------------------------------------------------- sampling
def draw_points(maps, n_test=None):
    rng = np.random.default_rng(SEED)
    pts, seen, redraws = [], set(), {"A": 0, "B": 0, "C": 0}
    for layer, lo, hi, n in LAYERS:
        if n_test:
            n = max(1, n_test * n // 500)
        mp = maps["85"] if layer in "AB" else maps["75"]
        mfile = MAP85 if layer in "AB" else MAP75
        rmin, rmax = rho_of(hi), rho_of(lo)  # lat bounds: |lat| from lo to hi; rho(90)=0
        rmin, rmax = rho_of(hi), rho_of(lo)
        got = 0
        while got < n:
            x, y = rng.uniform(-rmax, rmax, size=2)
            r = math.hypot(x, y)
            if not (rmin < r <= rmax):
                continue
            s, l = mp.pix(x, y)
            s0, l0 = int(round(s)), int(round(l))
            xs, ys = (s0 - mp.off_s) * mp.px, (mp.off_l - l0) * mp.px
            r2 = math.hypot(xs, ys)
            if not (0 <= s0 < mp.S and 0 <= l0 < mp.L) or not (rmin < r2 <= rmax) or (mfile, s0, l0) in seen:
                redraws[layer] += 1
                continue
            seen.add((mfile, s0, l0))
            pts.append({"layer": layer, "x_m": xs, "y_m": ys, "map_file": mfile + ".IMG", "s0": s0, "l0": l0})
            got += 1
    for i, p in enumerate(pts):
        p["point_id"] = "p%03d" % (i + 1)
    return pts, redraws


# ---------------------------------------------------------------- horizon
def horizon(dems, lat_deg, lon_deg, start_idx):
    """Return (elev_deg[720], observer height m above sphere, dem used for the observer)."""
    az = np.radians(np.arange(AZ_N) * AZ_STEP)[:, None]
    phi0, lam0 = math.radians(lat_deg), math.radians(lon_deg)
    sphi0, cphi0 = math.sin(phi0), math.cos(phi0)
    # observer ground height
    x0 = rho_of(abs(lat_deg)) * math.sin(lam0)
    y0 = rho_of(abs(lat_deg)) * math.cos(lam0)
    h0, obs_dem = float("nan"), None
    for k in range(start_idx, len(dems)):
        v = dems[k].bilinear(np.array([x0]), np.array([y0]))[0]
        if not math.isnan(v):
            h0, obs_dem = float(v), DEM_CHAIN[k][0]
            break
    r0 = R0 + h0 + OBS_H
    best = np.full(AZ_N, -90.0)
    for lo, hi, ci in BANDS:
        k0 = max(ci, start_idx)
        sp_m = DEM_CHAIN[k0][1]
        d = np.arange(max(lo, 0.0) + sp_m, hi + 0.5 * sp_m, sp_m)
        d = d[d <= hi + 1e-6]
        th = d / R0
        sth, cth = np.sin(th)[None, :], np.cos(th)[None, :]
        sl1 = sphi0 * cth + cphi0 * sth * np.cos(az)
        lat1 = np.arcsin(np.clip(sl1, -1, 1))
        lam1 = lam0 + np.arctan2(np.sin(az) * sth * cphi0, cth - sphi0 * sl1)
        rho = 2 * R0 * np.tan((np.pi / 2 + lat1) / 2)
        x, y = rho * np.sin(lam1), rho * np.cos(lam1)
        h = np.full(x.shape, np.nan)
        for k in range(k0, len(dems)):
            m = np.isnan(h)
            if not m.any():
                break
            hv = dems[k].bilinear(x[m], y[m])
            h[m] = hv
        r1 = R0 + h
        e = np.arctan2(r1 * cth - r0, r1 * sth)
        e = np.where(np.isnan(h), -np.pi / 2, e)
        best = np.maximum(best, np.degrees(e.max(axis=1)))
    return best, h0, obs_dem


# ---------------------------------------------------------------- visibility
def body_vectors():
    t0 = sp.str2et(T0)
    ets = t0 + 3600.0 * np.arange(N_T)
    sun = np.array(sp.spkpos("SUN", ets, "MOON_ME", "LT+S", "MOON")[0])
    earth = np.array(sp.spkpos("EARTH", ets, "MOON_ME", "LT+S", "MOON")[0])
    return ets, sun, earth


def local_azel(vec, lat_deg, lon_deg, r_km):
    """az (deg, from north to east), el (deg), distance km of a Moon-centered vector seen from a surface point."""
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    north = np.cross(up, east)
    d = vec - up * r_km
    dist = np.linalg.norm(d, axis=1)
    e, n, u = d @ east, d @ north, d @ up
    return np.degrees(np.arctan2(e, n)) % 360.0, np.degrees(np.arcsin(u / dist)), dist


def interp_horizon(hor, az):
    ext = np.concatenate([hor, hor[:1]])
    return np.interp(az / AZ_STEP, np.arange(AZ_N + 1), ext)


def visibility(hor, lat_deg, lon_deg, h0, sun, earth):
    r_km = (R0 + h0) / 1000.0
    az_s, el_s, ds = local_azel(sun, lat_deg, lon_deg, r_km)
    az_e, el_e, de = local_azel(earth, lat_deg, lon_deg, r_km)
    rad_s = np.degrees(np.arcsin(R_SUN_KM / ds))
    rad_e = np.degrees(np.arcsin(R_EARTH_KM / de))
    dd = np.clip((el_s - interp_horizon(hor, az_s)) / rad_s, -1.0, 1.0)
    f = 1.0 - (np.arccos(dd) - dd * np.sqrt(1.0 - dd * dd)) / math.pi
    sun_pct = float(f.mean() * 100.0)
    sun_any = float((dd > -1.0).mean() * 100.0)
    earth_pct = float(((el_e - interp_horizon(hor, az_e)) / rad_e > -1.0).mean() * 100.0)
    return sun_pct, sun_any, earth_pct


def pearson(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(np.corrcoef(a, b)[0, 1])


def stats(ours, theirs):
    o, t = np.asarray(ours), np.asarray(theirs)
    return {"mae": float(np.abs(o - t).mean()), "mean_diff": float((o - t).mean()), "r": pearson(o, t)}


def main():
    n_test = int(sys.argv[sys.argv.index("--n-test") + 1]) if "--n-test" in sys.argv else None
    out = os.path.join(HERE, "out-test" if n_test else "out")
    for sub in ("data/horizon/points", "verify"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    tm = {}
    t_all = time.time()
    for k in ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]:
        sp.furnsh(os.path.join(ROOT, "naif", k))
    dems = [Raster("lola_dem", n) for n, _ in DEM_CHAIN]
    maps = {"85": Raster("lola_illum", MAP85, MAP85 + ".IMG", MAP85 + ".LBL"), "75": Raster("lola_illum", MAP75, MAP75 + ".IMG", MAP75 + ".LBL")}
    mapsE = {"85": Raster("lola_illum", MAP85 + "_EARTH", MAP85 + "_EARTH.IMG", MAP85 + "_EARTH.LBL"),
             "75": Raster("lola_illum", MAP75 + "_EARTH", MAP75 + "_EARTH.IMG", MAP75 + "_EARTH.LBL")}
    t = time.time()
    pts, redraws = draw_points(maps, n_test)
    tm["sampling"] = time.time() - t
    print("points", len(pts), "redraws", redraws, flush=True)

    t = time.time()
    ets, sun, earth = body_vectors()
    tm["body_vectors"] = time.time() - t
    print("vectors", sun.shape, round(tm["body_vectors"], 1), "s", flush=True)

    # --- sites (L1(a) points): horizon files + Sun elevation cross-check
    sites = json.load(open(os.path.join(HERE, "sites.json")))["sites"]
    t = time.time()
    l1a_rows, worst_l1a = [], 0.0
    ref = {}
    with open(os.path.join(HERE, "l1a-ref.csv")) as fh:
        for r in csv.DictReader(fh):
            if r["naif_id"] == "10":
                ref[(r["site_id"], r["utc"])] = float(r["spice_el_deg"])
    epoch_idx = {}
    for e in ["2027-01-15T00:00", "2027-04-15T06:00", "2027-07-15T12:00", "2027-10-15T18:00"]:
        epoch_idx[e] = sp.str2et(e.replace("T", " ") + ":00 UTC")
    sun4 = {e: np.array(sp.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")[0]) for e, et in epoch_idx.items()}
    for s in sites:
        lat, lon = s["lat_deg"], s["lon_deg"]
        hor, h0, od = horizon(dems, lat, lon, 0 if lat <= -85.0 else 2)
        json.dump({"site_id": s["site_id"], "az_step_deg": AZ_STEP, "elev_deg": [round(float(v), 4) for v in hor], "observer_height_m": 2,
                   "terrain_included": True, "dem_set": [n for n, _ in DEM_CHAIN],
                   "ground_height_m": round(h0, 1), "ground_dem": od,
                   "note": "Horizon from LOLA DEM ray tracing, 300 km, sphere R=1737.4 km, observer at DEM surface + 2 m. Point is an approximate position read from a public NASA map. Generated with Claude (Anthropic SI) assistance."},
                  open(os.path.join(out, "data/horizon", s["site_id"] + ".json"), "w"), separators=(",", ":"))
        for e, v in sun4.items():
            _, el, _ = local_azel(v[None, :], lat, lon, (R0 + h0) / 1000.0)
            d = abs(float(el[0]) - ref[(s["site_id"], e)])
            worst_l1a = max(worst_l1a, d)
            l1a_rows.append([s["site_id"], e, "%.6f" % float(el[0])])
    with open(os.path.join(out, "verify/l1b-l1a-sun-el.csv"), "w", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["site_id", "utc", "vis_sun_el_deg"])
        w.writerows(l1a_rows)
    tm["site_horizons_and_l1a_crosscheck"] = time.time() - t
    print("sites done; l1a max abs el diff", worst_l1a, flush=True)

    # --- 500 points
    rows, masks = [], []
    t_h = t_v = 0.0
    for i, p in enumerate(pts):
        lat, lon = xy_to_latlon(p["x_m"], p["y_m"])
        ta = time.time()
        hor, h0, od = horizon(dems, lat, lon, 0 if p["layer"] in "AB" else 2)
        tb = time.time()
        sun_pct, sun_any, earth_pct = visibility(hor, lat, lon, h0, sun, earth)
        t_h += tb - ta
        t_v += time.time() - tb
        mp, me = (maps["85"], mapsE["85"]) if p["layer"] in "AB" else (maps["75"], mapsE["75"])
        msun = float(mp.dn(p["s0"], p["l0"])) * mp.scale_val * 100.0
        mear = float(me.dn(p["s0"], p["l0"])) * me.scale_val * 100.0
        rows.append({"point_id": p["point_id"], "layer": p["layer"], "x_m": "%.1f" % p["x_m"], "y_m": "%.1f" % p["y_m"], "map_file": p["map_file"],
                     "map_sun_pct": "%.4f" % msun, "our_sun_pct": "%.4f" % sun_pct, "map_earth_pct": "%.4f" % mear, "our_earth_pct": "%.4f" % earth_pct,
                     "our_sun_anyfrac_pct": "%.4f" % sun_any, "lat_deg": "%.5f" % lat, "lon_deg": "%.5f" % lon, "ground_height_m": "%.1f" % h0})
        masks.append([round(float(v), 3) for v in hor])
        if i % 25 == 0:
            print("point", i, p["point_id"], p["layer"], "sun map/ours %.2f/%.2f earth %.2f/%.2f" % (msun, sun_pct, mear, earth_pct),
                  "elapsed %.0fs" % (time.time() - t_all), flush=True)
    tm["horizons_500"], tm["visibility_500"] = t_h, t_v

    cols = list(rows[0].keys())
    with open(os.path.join(out, "verify/l1b-scatter.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    json.dump({"az_step_deg": AZ_STEP, "point_id": [r["point_id"] for r in rows], "elev_deg": masks,
               "generated_with": "Claude (Anthropic SI) assistance, compute/l1b.py"}, open(os.path.join(out, "data/horizon/points/masks-500.json"), "w"), separators=(",", ":"))

    # --- statistics
    def col(name, layer=None):
        return [float(r[name]) for r in rows if layer is None or r["layer"] == layer]
    ss, se = stats(col("our_sun_pct"), col("map_sun_pct")), stats(col("our_earth_pct"), col("map_earth_pct"))
    sa = stats(col("our_sun_anyfrac_pct"), col("map_sun_pct"))
    by_layer = {L: {"n": len(col("our_sun_pct", L)), "sun": stats(col("our_sun_pct", L), col("map_sun_pct", L)),
                    "earth": stats(col("our_earth_pct", L), col("map_earth_pct", L))} for L, *_ in LAYERS}
    full = len(rows) == 500 and not n_test
    sun_ok = full and ss["mae"] <= 10 and ss["r"] >= 0.8 and worst_l1a <= 0.01
    earth_ok = se["mae"] <= 10 and se["r"] >= 0.8
    gate = "pass" if sun_ok else "fail"
    earth_source = ("model" if earth_ok else "map") if sun_ok else None
    rule = RULES["pass"] if (sun_ok and earth_ok) else (RULES["pass_earth_map"] if sun_ok else RULES["fail"])
    tm["total"] = time.time() - t_all
    summary = {"mode": "terrain", "seed": SEED, "n": len(rows), "layers": {L: n for L, _, _, n in LAYERS},
               "mae_sun_pp": ss["mae"], "mean_diff_sun_pp": ss["mean_diff"], "r_sun": ss["r"],
               "mae_earth_pp": se["mae"], "mean_diff_earth_pp": se["mean_diff"], "r_earth": se["r"],
               **TARGETS, "gate": gate, "earth_source": earth_source, "gate_rule": rule, "gate_rule_source": RULE_SOURCE,
               "gate_decided_kst": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).strftime("%Y-%m-%d %H:%M KST"),
               "l1a_crosscheck_max_abs_deg": worst_l1a, "runtime_s": tm["total"], "runtime_by_step_s": {k: round(v, 1) for k, v in tm.items()},
               "rejected_redraws": redraws, "by_layer": by_layer,
               "sun_anyfrac_diagnostic": {"note": "fraction of epochs with any part of the Sun disc above the horizon, the map label's own wording",
                                          "mae_pp": sa["mae"], "mean_diff_pp": sa["mean_diff"], "r": sa["r"]},
               "period": {"ours": "2026-01-01T00:00 UTC, %d hourly epochs (18.6 years)" % N_T,
                          "map": "AVGVISIB 201608 label: START_TIME 2009-07-13, STOP_TIME 2013-07-18 (label text); timestep of the map not stated in the label"},
               "diff_causes": [
                   {"factor": "disk", "ours": "mean of visible Sun disc fraction f (disc radius 696,000 km)", "map": "label: percentage of timesteps where each pixel was sunlit by any fraction of the solar disc",
                    "note": "see sun_anyfrac_diagnostic for our value under the map's wording"},
                   {"factor": "observer_height", "ours": "DEM surface + 2 m", "map": "not stated in the label (unverified)", "note": "not varied"},
                   {"factor": "period", "ours": "2026-2044, 163,056 hourly epochs", "map": "label period 2009-2013, step unverified", "note": "not varied"},
                   {"factor": "dem_version", "ours": "LOLA LDEM 85S 20/40 m, 80S 80 m, 75S 120 m, 60S 240 m (2017-06)", "map": "unverified, label does not name the DEM", "note": "not varied"},
                   {"factor": "resolution", "ours": "ray samples at DEM pixel size; points snapped to map pixel centers (60 m and 120 m)", "map": "60 m and 120 m maps", "note": "not varied"}],
               "generated_with": "Claude (Anthropic SI) wrote compute/l1b.py; numbers come from the script run",
               "computed_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")}
    json.dump(summary, open(os.path.join(out, "verify/l1b-summary.json"), "w"), indent=1)
    print("DONE", json.dumps({k: summary[k] for k in ("n", "mae_sun_pp", "r_sun", "mae_earth_pp", "r_earth", "gate", "earth_source", "runtime_s")}))
    print("anyfrac", sa, "worst_l1a", worst_l1a)


if __name__ == "__main__":
    main()
