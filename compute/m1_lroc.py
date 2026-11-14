#!/usr/bin/env python3
"""M1: compare the terrain shadow model with real LROC WAC south polar frames (88-90 S).

Run on the data server (needs ~/nasa-lunar-data and compute/in/ copies of the L1(b) outputs):
    cp ../verify/l1b-scatter.csv in/ ; cp ../data/horizon/points/masks-500.json in/
    ~/venvs/nasa-lunar/bin/python -I m1_lroc.py
Outputs go to ./out/m1 (copied to verify/ and data/m1/ by hand):
    out/m1/m1-summary.json, m1-points.csv, m1-confusion.csv, m1-year.csv, fig-median.png, fig-az90.png

Rules were fixed before the contest (docs/verification-protocol.md section 3) and are not tuned to the result:
  * frames: the 37 frames chosen from file-name times alone (compute/manifest.json, lroc_frame_selection).
  * time of a frame: middle of start_date_time / stop_date_time in the PDS4 label.
  * points: the 200 layer A points (88-90 S) of L1(b), same x_m / y_m. Pixel: offset = upperleft_corner_x / pixel_scale_x
    (3039.5), sample = floor(offset + x/100 + 0.5), line = floor(offset - y/100 + 0.5).
  * observation: median of the 3x3 pixels around the point, valid only if all 9 are valid. Valid = MASK.TIF true (checked
    to be identical to DN > 0 on every frame). Lit = DN > T, T = Otsu threshold of the valid pixels inside the 88-90 S
    circle (256 bins, class 0 = DN <= t, ties go to the smaller t), one T per frame.
  * prediction: Sun disc fraction f from the L1(b) horizon mask (0.5 deg steps, linear interpolation), lit if f >= 0.5.
    Baseline without terrain: lit if the Sun centre is above the local horizontal plane.
  * year comparison: hourly 2010-02-15T00:00 .. 2011-02-05T00:00 UTC (8,520 steps), share of hours with f >= 0.5 against
    the LROC percentage map (WAC_POLE_ILL_PCT_SOUTH_100M) and the time-weighted map (..._TWI_...).
Figures also use a dense shadow map: Sun-centre ray march over the 20 m LOLA DEM for every pixel of the 88-90 S circle
(a check for the eye, not part of the 200-point numbers).
Code written with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import csv, datetime as dt, json, math, os, re, statistics, struct, sys, time
import numpy as np
import spiceypy as sp
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import l1b  # noqa: E402  (Raster, horizon helpers; its main() is guarded)

Image.MAX_IMAGE_PIXELS = None
ROOT = l1b.ROOT
R0 = l1b.R0
SEED = 20261114
OUT = os.path.join(HERE, "out", "m1")
IN = os.path.join(HERE, "in")
FRAME_DIR = os.path.join(ROOT, "lroc_movie_south")
PERIOD = ("2010-02-15T00:00", "2011-02-05T00:00")
STEPS = 8520
CELLS = ["obs_lit_pred_lit", "obs_lit_pred_shadow", "obs_shadow_pred_lit", "obs_shadow_pred_shadow", "no_data"]
PT_COLS = ["frame", "point_id", "x_m", "y_m", "line", "sample", "valid", "obs_dn", "threshold_T", "obs_lit",
           "sun_az_deg", "sun_el_deg", "sun_radius_deg", "f_disk", "pred_lit", "baseline_lit"]
MIN_VALID = 100  # a frame with fewer valid layer A points is excluded (half of 200)


def label_info(name):
    t = open(os.path.join(FRAME_DIR, "bdr_xml", name + ".xml"), encoding="utf-8", errors="replace").read()

    def g(tag):
        m = re.search(r"<(?:\w+:)?" + tag + r"[^>]*>([^<]+)<", t)
        return m.group(1).strip() if m else None
    ul = float(g("upperleft_corner_x"))
    sc = float(g("pixel_scale_x"))
    el = re.findall(r"<(?:\w+:)?elements>(\d+)<", t)
    return {"start": g("start_date_time"), "stop": g("stop_date_time"), "offset_px": ul / sc, "scale_m": sc,
            "lines": int(el[0]), "samples": int(el[1])}


def parse_z(s):
    return dt.datetime.strptime(s.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")


def otsu(hist):
    """Integer Otsu on a 256 bin histogram: class 0 = DN <= t, t in 0..254, ties go to the smaller t."""
    n = int(sum(hist))
    s_all = sum(i * int(h) for i, h in enumerate(hist))
    best, T, w0, s0 = None, None, 0, 0
    for t in range(255):
        w0 += int(hist[t])
        s0 += t * int(hist[t])
        w1, s1 = n - w0, s_all - s0
        if w0 == 0 or w1 == 0:
            continue
        num, den = (s0 * w1 - s1 * w0) ** 2, w0 * w1
        if best is None or num * best[1] > best[0] * den:
            best, T = (num, den), t
    return T, n


def metrics(c):
    LL, LS, SL, SS = (c[k] for k in CELLS[:4])
    n = LL + LS + SL + SS
    if n == 0:
        return None, None
    po = (LL + SS) / n
    pe = ((LL + LS) * (LL + SL) + (SL + SS) * (LS + SS)) / (n * n)
    return 100.0 * po, ((po - pe) / (1 - pe) if pe != 1 else float("nan"))


def cell(obs, pred, valid):
    if not valid:
        return "no_data"
    return ("obs_lit" if obs else "obs_shadow") + ("_pred_lit" if pred else "_pred_shadow")


def fdisk(el, h, rad):
    d = max(-1.0, min(1.0, (el - h) / rad))
    return 1 - (math.acos(d) - d * math.sqrt(1 - d * d)) / math.pi


def hz_lin(mask, az, step=0.5):
    k = (az % 360.0) / step
    n = len(mask)
    i0 = int(math.floor(k)) % n
    fr = k - math.floor(k)
    return mask[i0] * (1 - fr) + mask[(i0 + 1) % n] * fr


def circ(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def vec_azel(vec, lat_deg, lon_deg, r_km):
    """vec: (3,) Moon-centred vector in MOON_ME (km). Returns az (deg, north to east), el (deg), distance (km)."""
    az, el, d = l1b.local_azel(np.asarray(vec)[None, :], lat_deg, lon_deg, r_km)
    return float(az[0]), float(el[0]), float(d[0])


# ------------------------------------------------------------------ dense shadow map (figures only)
def dense_lit(dems, sun_vec, xs, ys, h_ground):
    """Sun-centre visible (True) at plane points xs, ys (m): Sun above the ray-marched horizon of that azimuth."""
    n = len(xs)
    rho = np.hypot(xs, ys)
    lat = -90.0 + np.degrees(2 * np.arctan(rho / (2 * R0)))
    lon = np.degrees(np.arctan2(xs, ys))
    la, lo = np.radians(lat), np.radians(lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], 1)
    east = np.stack([-np.sin(lo), np.cos(lo), np.zeros(n)], 1)
    north = np.cross(up, east)
    r_km = (R0 + h_ground) / 1000.0
    dvec = sun_vec[None, :] - up * r_km[:, None]
    dist = np.linalg.norm(dvec, axis=1)
    e, nn, u = (dvec * east).sum(1), (dvec * north).sum(1), (dvec * up).sum(1)
    az = np.arctan2(e, nn)
    sun_el = np.degrees(np.arcsin(u / dist))
    d = np.concatenate([np.arange(100.0, 5000.0 + 1, 100.0), np.arange(5200.0, 20000.0 + 1, 200.0), np.arange(20500.0, 100000.0 + 1, 500.0)])
    th = d / R0
    sth, cth = np.sin(th)[None, :], np.cos(th)[None, :]
    sphi0, cphi0 = np.sin(la)[:, None], np.cos(la)[:, None]
    sl1 = sphi0 * cth + cphi0 * sth * np.cos(az)[:, None]
    lat1 = np.arcsin(np.clip(sl1, -1, 1))
    lam1 = lo[:, None] + np.arctan2(np.sin(az)[:, None] * sth * cphi0, cth - sphi0 * sl1)
    rr = 2 * R0 * np.tan((np.pi / 2 + lat1) / 2)
    x, y = rr * np.sin(lam1), rr * np.cos(lam1)
    h = np.full(x.shape, np.nan)
    for k, dem in enumerate(dems):
        m = np.isnan(h)
        if not m.any():
            break
        h[m] = dem.bilinear(x[m], y[m])
    r1 = R0 + h
    r0 = (R0 + h_ground + 2.0)[:, None]
    ang = np.arctan2(r1 * cth - r0, r1 * sth)
    ang = np.where(np.isnan(h), -np.pi / 2, ang)
    hor = np.degrees(ang.max(axis=1))
    return sun_el >= hor


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def stretch(a, T):
    """8 bit display: DN 0 (no data) black, shadows dark, lit ground bright. Gamma on DN / (4 T)."""
    v = np.clip(a.astype(np.float32) / max(4.0 * T, 8.0), 0, 1) ** 0.6
    return (v * 255).astype(np.uint8)


def make_figure(path, name, a, valid, circle_idx, lit_pred, T, pts, title_lines):
    """Left: the LROC frame; right: same frame with the predicted terminator (red) and the 200 points."""
    c, rad = 3039.5, 606.5
    l0, l1 = int(c - rad) - 2, int(c + rad) + 3
    crop = a[l0:l1, l0:l1]
    img = Image.fromarray(stretch(crop, T)).convert("RGB")
    W = img.size[0]
    pred = np.zeros(a.shape, dtype=np.int8)  # -1 outside, 0 shadow, 1 lit
    pred[:] = -1
    rr, cc = circle_idx
    pred[rr, cc] = lit_pred.astype(np.int8)
    pc = pred[l0:l1, l0:l1]
    edge = np.zeros(pc.shape, bool)
    lit = pc == 1
    sh_ = pc == 0
    edge[:-1, :] |= (lit[:-1, :] & sh_[1:, :]) | (sh_[:-1, :] & lit[1:, :])
    edge[:, :-1] |= (lit[:, :-1] & sh_[:, 1:]) | (sh_[:, :-1] & lit[:, 1:])
    edge &= valid[l0:l1, l0:l1]  # no terminator where the frame has no data
    over = np.array(img)
    over[edge] = (255, 60, 40)
    img2 = Image.fromarray(over)
    d2 = ImageDraw.Draw(img2)
    for (ln, sm, ok) in pts:
        y, x = ln - l0, sm - l0
        col = (0, 230, 255) if ok else (255, 0, 220)
        d2.ellipse([x - 4, y - 4, x + 4, y + 4], outline=col, width=2)
    head = 200
    canvas = Image.new("RGB", (2 * W + 24, W + head), (12, 14, 20))
    canvas.paste(img, (0, head))
    canvas.paste(img2, (W + 24, head))
    d = ImageDraw.Draw(canvas)
    f1, f2 = font(30), font(24)
    y = 10
    for i, t in enumerate(title_lines):
        d.text((14, y), t, fill=(235, 238, 245), font=f1 if i == 0 else f2)
        y += 40 if i == 0 else 32
    d.text((14, head - 34), "LROC WAC frame, 88-90 S", fill=(160, 170, 190), font=f2)
    d.text((W + 38, head - 34), "red: predicted terminator; rings: 200 points (cyan agree, magenta differ)", fill=(160, 170, 190), font=f2)
    canvas.save(path, optimize=True)


def main():
    t_all = time.time()
    os.makedirs(OUT, exist_ok=True)
    print("m1_lroc.py start %s" % dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), flush=True)
    for k in ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]:
        sp.furnsh(os.path.join(ROOT, "naif", k))
    man = json.load(open(os.path.join(HERE, "manifest.json")))
    sel = man["lroc_frame_selection"]["frames"]
    names = [f["name"] for f in sel]

    # ---- layer A points (same x_m, y_m strings as L1(b))
    A = []
    with open(os.path.join(IN, "l1b-scatter.csv")) as fh:
        for r in csv.DictReader(fh):
            if r["layer"] == "A":
                A.append(r)
    assert len(A) == 200
    masks_j = json.load(open(os.path.join(IN, "masks-500.json")))
    M = dict(zip(masks_j["point_id"], masks_j["elev_deg"]))
    step = masks_j.get("az_step_deg", 0.5)
    px = [float(r["x_m"]) for r in A]
    py = [float(r["y_m"]) for r in A]
    pll = [l1b.xy_to_latlon(x, y) for x, y in zip(px, py)]
    ph = [float(r["ground_height_m"]) for r in A]
    pid = [r["point_id"] for r in A]

    # ---- frames
    rows, per_frame, excluded, loaded = [], {}, [], {}
    for k, nm in enumerate(names):
        lab = label_info(nm)
        assert lab["offset_px"] == 3039.5 and lab["scale_m"] == 100.0 and lab["lines"] == 6080 and lab["samples"] == 6080, (nm, lab)
        t0, t1 = parse_z(lab["start"]), parse_z(lab["stop"])
        mid = t0 + (t1 - t0) / 2
        utc_mid = mid.strftime("%Y-%m-%dT%H:%M:%SZ")
        et = sp.str2et(mid.strftime("%Y-%m-%d %H:%M:%S") + " UTC")
        sun_vec = np.array(sp.spkpos("SUN", et, "MOON_ME", "LT+S", "MOON")[0])
        sub_lon = math.degrees(math.atan2(sun_vec[1], sun_vec[0]))
        im = np.array(Image.open(os.path.join(FRAME_DIR, nm + ".TIF")))
        mk = np.array(Image.open(os.path.join(FRAME_DIR, nm + ".MASK.TIF"))).astype(bool)
        assert im.shape == (6080, 6080) and mk.shape == im.shape
        mism = int(((im > 0) != mk).sum())
        c, rad = 3039.5, 2 * R0 * math.tan(math.radians(1.0)) / 100.0
        yy, xx = np.ogrid[0:6080, 0:6080]
        circle = ((xx - c) ** 2 + (yy - c) ** 2) <= rad * rad
        inside = circle & mk
        hist = np.bincount(im[inside], minlength=256)
        T, npx = otsu(hist)
        pts, nvalid = [], 0
        for i in range(200):
            sm = math.floor(3039.5 + px[i] / 100.0 + 0.5)
            ln = math.floor(3039.5 - py[i] / 100.0 + 0.5)
            blk = (slice(ln - 1, ln + 2), slice(sm - 1, sm + 2))
            ok = ln >= 1 and sm >= 1 and ln <= 6078 and sm <= 6078 and bool(mk[blk].all())
            dn = int(np.median(im[blk])) if ok else None
            nvalid += ok
            lat, lon = pll[i]
            az, el, ds = vec_azel(sun_vec, lat, lon, (R0 + ph[i]) / 1000.0)
            rs = math.degrees(math.asin(l1b.R_SUN_KM / ds))
            az, el, rs = round(az, 9), round(el, 9), round(rs, 9)
            f = fdisk(el, hz_lin(M[pid[i]], az, step), rs)
            f = float("%.10f" % f)
            pts.append({"frame": nm, "point_id": pid[i], "x_m": A[i]["x_m"], "y_m": A[i]["y_m"], "line": ln, "sample": sm,
                        "valid": 1 if ok else 0, "obs_dn": dn if ok else "", "threshold_T": T,
                        "obs_lit": (1 if dn > T else 0) if ok else "", "sun_az_deg": "%.9f" % az, "sun_el_deg": "%.9f" % el,
                        "sun_radius_deg": "%.9f" % rs, "f_disk": "%.10f" % f, "pred_lit": 1 if f >= 0.5 else 0,
                        "baseline_lit": 1 if el > 0 else 0})
        print("frame %2d %s mid %s T=%d valid %d/200 mask!=dn>0: %d subsolar_lon %.1f" % (k, nm, utc_mid, T, nvalid, mism, sub_lon), flush=True)
        if nvalid < MIN_VALID:
            excluded.append({"name": nm, "reason": "only %d of 200 layer A points have a valid 3x3 neighbourhood (rule: at least 100)" % nvalid})
            continue
        per_frame[nm] = {"utc_mid": utc_mid, "subsolar_lon_deg": sub_lon, "threshold_T": T, "valid_points": nvalid, "pts": pts,
                         "n_otsu_pixels": npx, "sun_vec": sun_vec, "mask_vs_dn_mismatch_px": mism}
        rows.extend(pts)
        del im, mk
    fr_names = [n for n in names if n in per_frame]
    assert 30 <= len(fr_names) <= 40, "frames after exclusion: %d (fetch fallbacks from the manifest)" % len(fr_names)

    # ---- csv, confusion, metrics (computed from the written strings, as an independent reader would)
    with open(os.path.join(OUT, "m1-points.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=PT_COLS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    P = list(csv.DictReader(open(os.path.join(OUT, "m1-points.csv"))))
    cnt = {}
    for r in P:
        v = r["valid"] == "1"
        for model, key in (("terrain", "pred_lit"), ("no_terrain", "baseline_lit")):
            for fr in (r["frame"], "ALL"):
                d = cnt.setdefault((fr, model), dict.fromkeys(CELLS, 0))
                d[cell(r["obs_lit"] == "1", r[key] == "1", v)] += 1
    with open(os.path.join(OUT, "m1-confusion.csv"), "w", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["frame", "model"] + CELLS)
        for fr in fr_names + ["ALL"]:
            for model in ("terrain", "no_terrain"):
                w.writerow([fr, model] + [cnt[(fr, model)][k] for k in CELLS])
    ag, ka = metrics(cnt[("ALL", "terrain")])
    bag, bka = metrics(cnt[("ALL", "no_terrain")])
    sens = {}
    dnf = lambda r: float(r["obs_dn"] or "nan")
    ttf = lambda r: float(r["threshold_T"] or "nan")
    for key, ofn, pfn in (("T0.5", lambda r: dnf(r) > 0.5 * ttf(r), lambda r: r["pred_lit"] == "1"),
                          ("T1.5", lambda r: dnf(r) > 1.5 * ttf(r), lambda r: r["pred_lit"] == "1"),
                          ("f_gt_0", lambda r: r["obs_lit"] == "1", lambda r: float(r["f_disk"]) > 0),
                          ("f_ge_0.99", lambda r: r["obs_lit"] == "1", lambda r: float(r["f_disk"]) >= 0.99)):
        c = dict.fromkeys(CELLS, 0)
        for r in P:
            v = r["valid"] == "1"
            c[cell(ofn(r) if v else False, pfn(r), v)] += 1
        sens[key] = {"agreement_pct": metrics(c)[0]}
    frame_list = []
    for nm in fr_names:
        pf = per_frame[nm]
        frame_list.append({"name": nm, "utc_mid": pf["utc_mid"], "utc_source": "label", "subsolar_lon_deg": pf["subsolar_lon_deg"],
                           "threshold_T": pf["threshold_T"], "valid_points": pf["valid_points"],
                           "agreement_pct": metrics(cnt[(nm, "terrain")])[0],
                           "baseline_agreement_pct": metrics(cnt[(nm, "no_terrain")])[0]})
    met = ag >= 85 and ag > bag

    # ---- year comparison
    t0 = sp.str2et(PERIOD[0].replace("T", " ") + ":00 UTC")
    ets = t0 + 3600.0 * np.arange(STEPS)
    sunY = np.array(sp.spkpos("SUN", ets, "MOON_ME", "LT+S", "MOON")[0])
    ill = {}
    for key, fn in (("pct", "WAC_POLE_ILL_PCT_SOUTH_100M"), ("twi", "WAC_POLE_ILL_TWI_SOUTH_100M")):
        arr = np.memmap(os.path.join(ROOT, "lroc_ill", fn + ".IMG"), dtype="<f4", mode="r", offset=4856, shape=(1214, 1214))
        raw = np.array(arr).view("<u4")
        ok = ~((raw >= 0xFF7FFFFB) & (raw <= 0xFF7FFFFF))
        v = np.array(arr).astype(np.float64)
        ill[key] = (v, ok)
    def factor(key):
        v, ok = ill[key]
        return 100.0 if float(v[ok].max()) <= 1.0001 else 1.0
    fac, fac_t = factor("pct"), factor("twi")
    yrows, our_l, pct_l, twi_l = [], [], [], []
    for i in range(200):
        lat, lon = pll[i]
        az_s, el_s, ds = l1b.local_azel(sunY, lat, lon, (R0 + ph[i]) / 1000.0)
        rad_s = np.degrees(np.arcsin(l1b.R_SUN_KM / ds))
        hz = l1b.interp_horizon(np.array(M[pid[i]]), az_s)
        dd = np.clip((el_s - hz) / rad_s, -1.0, 1.0)
        f = 1.0 - (np.arccos(dd) - dd * np.sqrt(1.0 - dd * dd)) / math.pi
        our = float((f >= 0.5).mean() * 100.0)
        sm = math.floor(606.5 + px[i] / 100.0 + 0.5)
        ln = math.floor(606.5 - py[i] / 100.0 + 0.5)
        vals = []
        for key, fc in (("pct", fac), ("twi", fac_t)):
            v, ok = ill[key]
            vals.append(float(v[ln, sm]) * fc if (0 <= ln < 1214 and 0 <= sm < 1214 and ok[ln, sm]) else None)
        yrows.append([pid[i], "%.6f" % our, "" if vals[0] is None else "%.6f" % vals[0], "" if vals[1] is None else "%.6f" % vals[1]])
    with open(os.path.join(OUT, "m1-year.csv"), "w", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["point_id", "our_pct", "lroc_pct", "lroc_twi_pct"])
        w.writerows(yrows)

    def pair_stats(col):
        pr = [(float(r[1]), float(r[col])) for r in yrows if r[col] != ""]
        a_, b_ = [x for x, _ in pr], [y for _, y in pr]
        return len(pr), sum(abs(x - y) for x, y in pr) / len(pr), statistics.correlation(a_, b_), sum(x - y for x, y in pr) / len(pr)
    n1, mae1, r1, md1 = pair_stats(2)
    n2, mae2, r2, md2 = pair_stats(3)
    year = {"period_utc": list(PERIOD), "steps": STEPS, "lroc_pct_factor": fac, "lroc_twi_pct_factor": fac_t, "n": n1, "mae_pp": mae1,
            "r": r1, "mean_diff_pp": md1, "n_twi": n2, "mae_pp_twi": mae2, "r_twi": r2, "mean_diff_pp_twi": md2,
            "note": "ours: share of hours with Sun disc fraction f >= 0.5 over one year; LROC: share of 3,807 frames (plus 229 gap fillers) judged lit with a conservative global threshold, and a time-weighted variant"}

    # ---- figures: median frame and a frame whose sub-solar longitude differs by more than 90 degrees
    fa = {f["name"]: f["agreement_pct"] for f in frame_list}
    lon = {f["name"]: f["subsolar_lon_deg"] for f in frame_list}
    med = statistics.median(fa.values())
    m1 = min(fa, key=lambda n: (abs(fa[n] - med), n))
    cand = [n for n in fa if circ(lon[n], lon[m1]) > 90]
    m2 = min(cand, key=lambda n: (abs(fa[n] - med), n))
    dems = [l1b.Raster("lola_dem", n) for n, _ in l1b.DEM_CHAIN[:1]] + [l1b.Raster("lola_dem", "ldem_80s_80m"), l1b.Raster("lola_dem", "ldem_75s_120m")]
    c, rad = 3039.5, 2 * R0 * math.tan(math.radians(1.0)) / 100.0
    yy, xx = np.nonzero(((np.arange(6080)[None, :] - c) ** 2 + (np.arange(6080)[:, None] - c) ** 2) <= rad * rad)
    figs, dense = [], {}
    for role, nm in (("median", m1), ("az90", m2)):
        td = time.time()
        pf = per_frame[nm]
        xs = (xx - 3039.5) * 100.0
        ys = (3039.5 - yy) * 100.0
        hg = dems[0].bilinear(xs, ys)
        hg = np.where(np.isnan(hg), 0.0, hg)
        lit_pred = np.empty(len(xs), dtype=bool)
        CH = 4000
        for s in range(0, len(xs), CH):
            lit_pred[s:s + CH] = dense_lit(dems, pf["sun_vec"], xs[s:s + CH], ys[s:s + CH], hg[s:s + CH])
        im = np.array(Image.open(os.path.join(FRAME_DIR, nm + ".TIF")))
        mk = np.array(Image.open(os.path.join(FRAME_DIR, nm + ".MASK.TIF"))).astype(bool)
        okp = mk[yy, xx]
        obs = im[yy, xx] > pf["threshold_T"]
        dag = float(((obs == lit_pred) & okp).sum() / okp.sum() * 100.0)
        dense[nm] = {"pixels": int(okp.sum()), "agreement_pct": dag}
        pts = [(int(r["line"]), int(r["sample"]), (r["obs_lit"] == r["pred_lit"])) for r in pf["pts"] if r["valid"] == 1]
        title = ["%s  (%s)" % (nm, role), "UTC %s, sub-solar longitude %.1f deg, Otsu T=%d" % (pf["utc_mid"], pf["subsolar_lon_deg"], pf["threshold_T"]),
                 "200-point agreement of this frame %.1f %%, all frames %.1f %% (no-terrain baseline %.1f %%), dense pixel check %.1f %%" % (fa[nm], ag, bag, dag),
                 "Image: real LROC frame. Terminator: our LOLA DEM ray march for the Sun centre. Both drawn from data, no generated imagery."]
        path = os.path.join(OUT, "fig-%s.png" % role)
        make_figure(path, nm, im, mk, (yy, xx), lit_pred, pf["threshold_T"], pts, title)
        figs.append({"role": role, "path": "data/m1/fig-%s.png" % role, "frame": nm, "agreement_pct": fa[nm], "dense_pixel_agreement_pct": dag})
        print("figure %s %s dense agreement %.2f %% (%.0fs)" % (role, nm, dag, time.time() - td), flush=True)
        del im, mk

    def strip(c):
        return dict(c)
    summary = {
        "mode": "observed", "seed": SEED, "layer": "A", "points": 200, "frames": len(fr_names), "utc_parsed": len(fr_names),
        "valid_source": "mask", "mask_valid_when": "nonzero", "threshold_method": "otsu_88_90S_256",
        "mask_equals_dn_gt_0": all(per_frame[n]["mask_vs_dn_mismatch_px"] == 0 for n in fr_names),
        "frame_list": frame_list, "excluded_frames": excluded,
        "confusion": strip(cnt[("ALL", "terrain")]), "agreement_pct": ag, "kappa": ka,
        "baseline": {"confusion": strip(cnt[("ALL", "no_terrain")]), "agreement_pct": bag, "kappa": bka},
        "sensitivity": sens,
        "target": {"label": "Target set at hackathon start", "agreement_pct_min": 85, "beat_baseline": True}, "target_met": met,
        "year_compare": year, "figures": figs, "dense_check": dense,
        "pixel_rule": "offset = upperleft_corner_x / pixel_scale_x = 3039.5; sample = floor(offset + x/100 + 0.5), line = floor(offset - y/100 + 0.5)",
        "limits": ["observation is a single global Otsu cut per frame, not a calibrated shadow detector",
                   "layer A points lie in 88-90 S where scattered light and low Sun make DN near the cut uncertain",
                   "LOLA DEM (20 m) and the LROC frames use different projections and ephemeris, a shift of a few pixels is possible",
                   "the model is evaluated at the Sun centre with disc fraction f >= 0.5 as lit"],
        "generated_with": "Claude (Anthropic SI) wrote compute/m1_lroc.py; numbers come from the script run; figures are generated from LROC data and our model",
        "computed_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "runtime_s": time.time() - t_all}
    json.dump(summary, open(os.path.join(OUT, "m1-summary.json"), "w"), indent=1)
    print("DONE frames %d agreement %.2f kappa %.3f baseline %.2f target_met %s year mae %.2f r %.3f runtime %.0fs"
          % (len(fr_names), ag, ka, bag, met, mae1, r1, summary["runtime_s"]), flush=True)


if __name__ == "__main__":
    main()
