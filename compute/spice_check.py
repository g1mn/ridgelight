#!/usr/bin/env python3
"""L1(a): SPICE implementation check against JPL Horizons (same ephemeris family, so not a ground-truth comparison).
9 Artemis III region points x 4 epochs x 2 bodies (Sun 10, Earth 399) = 72 pairs.
Ours: spiceypy azlcpo ELLIPSOID, LT+S, azccw False, elplsz True, MOON observer, MOON_ME frame, surface height 0.
Reference: Horizons API, CENTER coord@301 GEODETIC, QUANTITIES 4, APPARENT AIRLESS.
Run: ~/venvs/nasa-lunar/bin/python -I spice_check.py   (writes ./out/*, needs network for Horizons)
Code and data generated with Claude (Anthropic SI) assistance, 2026-11-14.
"""
import csv, datetime as dt, json, math, os, re, statistics, sys, time, urllib.parse, urllib.request
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("LW_DATA", os.path.expanduser("~/nasa-lunar-data"))
OUT = os.path.join(HERE, "out")
EPOCHS = ["2027-01-15T00:00", "2027-04-15T06:00", "2027-07-15T12:00", "2027-10-15T18:00"]
BODIES = [(10, "sun"), (399, "earth")]
TARGET = 0.05
R_MOON = 1737.4
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
HZ = "https://ssd.jpl.nasa.gov/api/horizons.api"


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def sep(az1, el1, az2, el2):
    r = math.radians
    a = math.sin(r(el2 - el1) / 2) ** 2 + math.cos(r(el1)) * math.cos(r(el2)) * math.sin(r(wrap(az2 - az1)) / 2) ** 2
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(a))))


def load_kernels():
    for k in ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]:
        sp.furnsh(os.path.join(ROOT, "naif", k))


def spice_azel(lon_e, lat, utc, naif):
    et = sp.str2et(utc.replace("T", " ") + ":00 UTC")
    pos = sp.latrec(R_MOON, math.radians(lon_e), math.radians(lat))
    st, _lt = sp.azlcpo("ELLIPSOID", str(naif), et, "LT+S", False, True, pos, "MOON", "MOON_ME")
    return st[1] * sp.dpr(), st[2] * sp.dpr()


def hz_url(lon_s, lat_s, naif, epochs):
    tl = " ".join("'%d-%s-%02d %02d:%02d'" % (t.year, MON[t.month - 1], t.day, t.hour, t.minute) for t in epochs)
    q = {"format": "json", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "OBJ_DATA": "NO", "COMMAND": "'%d'" % naif,
         "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'", "SITE_COORD": "'%s,%s,0'" % (lon_s, lat_s), "QUANTITIES": "'4'",
         "APPARENT": "'AIRLESS'", "ANG_FORMAT": "'DEG'", "EXTRA_PREC": "'YES'", "TIME_TYPE": "'UT'", "CSV_FORMAT": "'YES'",
         "TLIST_TYPE": "'CAL'", "TLIST": tl}
    return HZ + "?" + "&".join("%s=%s" % (k, urllib.parse.quote(v, safe="@,:")) for k, v in q.items())


def hz_query(lon_s, lat_s, naif, epochs):
    url = hz_url(lon_s, lat_s, naif, epochs)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                js = json.loads(r.read().decode("utf-8"))
            if "$$SOE" in js.get("result", ""):
                break
            raise ValueError(str(js.get("error") or js.get("result"))[:300])
        except Exception as e:
            if attempt == 3:
                raise
            print("retry", attempt, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    res = js["result"].splitlines()
    i0 = res.index("$$SOE")
    head = [c.strip() for c in res[i0 - 2].split(",")] if "Azimuth" in res[i0 - 2] else [c.strip() for c in res[i0 - 1].split(",")]
    ia, ie = head.index("Azimuth_(a-app)"), head.index("Elevation_(a-app)")
    rows = [[c.strip() for c in x.split(",")] for x in res[i0 + 1:res.index("$$EOE")]]
    got = {dt.datetime.strptime(r[0], "%Y-%b-%d %H:%M:%S.%f"): (float(r[ia]), float(r[ie])) for r in rows}
    meta = {k: next((x.split(":", 1)[1].strip() for x in res if x.startswith(k)), "") for k in
            ("Center pole/equ", "Center radii", "Center geodetic", "Atmos refraction")}
    return got, meta, url


def main():
    os.makedirs(OUT, exist_ok=True)
    load_kernels()
    sites = json.load(open(os.path.join(HERE, "sites.json")))["sites"]
    ep = [dt.datetime.fromisoformat(e) for e in EPOCHS]
    rows, meta0, urls = [], None, []
    for s in sites:
        lon_e = s["lon_deg"] % 360.0
        lon_s, lat_s = "%.3f" % lon_e, "%.3f" % s["lat_deg"]
        for naif, name in BODIES:
            got, meta, url = hz_query(lon_s, lat_s, naif, ep)
            meta0 = meta0 or meta
            urls.append(url)
            for e, es in zip(ep, EPOCHS):
                hz_az, hz_el = got[e]
                az, el = spice_azel(float(lon_s), float(lat_s), es, naif)
                s_ = sep(az, el, hz_az, hz_el)
                rows.append({"site_id": s["site_id"], "lon_e_deg": lon_s, "lat_deg": lat_s, "utc": es, "body": name, "naif_id": naif,
                             "spice_az_deg": "%.9f" % az, "spice_el_deg": "%.9f" % el, "hz_az_deg": "%.9f" % hz_az, "hz_el_deg": "%.9f" % hz_el,
                             "daz_cos_el_deg": "%.9f" % (wrap(az - hz_az) * math.cos(math.radians(hz_el))),
                             "del_deg": "%.9f" % (el - hz_el), "sep_deg": "%.9f" % s_})
            time.sleep(1)
        print("done", s["site_id"], flush=True)
    # recompute the three difference columns from the printed 9-decimal values so the CSV is self-consistent
    seps = []
    for r in rows:
        az, el, ha, he = (float(r[k]) for k in ("spice_az_deg", "spice_el_deg", "hz_az_deg", "hz_el_deg"))
        r["daz_cos_el_deg"] = "%.9f" % (wrap(az - ha) * math.cos(math.radians(he)))
        r["del_deg"] = "%.9f" % (el - he)
        r["sep_deg"] = "%.9f" % sep(az, el, ha, he)
        seps.append(float(r["sep_deg"]))
    cols = list(rows[0].keys())
    with open(os.path.join(OUT, "l1a-spice-vs-horizons.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    mx, md = max(seps), statistics.median(seps)
    worst = max(rows, key=lambda r: float(r["sep_deg"]))
    fk = open(os.path.join(ROOT, "naif", "moon_de440_250416.tf"), errors="replace").read()
    alias = [l.strip() for l in fk.splitlines() if "MOON_ME" in l][:8]
    summary = {"n_pairs": len(rows), "max_sep_deg": mx, "median_sep_deg": md, "target_max_sep_deg": TARGET,
               "target_note": "Target set at hackathon start: max separation <= 0.05 deg. Implementation check against Horizons, same ephemeris family, not a ground-truth comparison.",
               "epochs_utc": EPOCHS, "sites": len(sites), "bodies": ["sun", "earth"], "worst_pair": {k: worst[k] for k in ("site_id", "utc", "body", "sep_deg")},
               "met_target": mx <= TARGET, "spice": sp.tkvrsn("TOOLKIT"),
               "computed_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
               "generated_with": "Claude (Anthropic SI) wrote compute/spice_check.py; numbers come from the script run"}
    json.dump(summary, open(os.path.join(OUT, "l1a-summary.json"), "w"), indent=1)
    json.dump({"horizons_header": meta0, "moon_me_lines_in_fk": alias, "horizons_calls": len(urls), "first_url": urls[0],
               "kernels": ["naif0012.tls", "de440s.bsp", "moon_de440_250416.tf", "moon_pa_de440_200625.bpc", "pck00011.tpc"]},
              open(os.path.join(OUT, "l1a-horizons-meta.json"), "w"), indent=1)
    print("n_pairs", len(rows), "max_sep_deg", mx, "median_sep_deg", md, "worst", summary["worst_pair"])


if __name__ == "__main__":
    main()
