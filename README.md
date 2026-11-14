# Lunar Window

Lunar Window is a static web app for the NASA Space Apps Challenge 2026 challenge "Lunar Landing Site Navigator". Pick one of the nine Artemis III candidate regions near the lunar south pole and see when the Sun and Earth are above the horizon there, which spot inside the region has the most light and line of sight to Earth, and how much of that rests on checks against NASA data.

**Result in one line:** our terrain shadow model agrees with real LROC photographs at 94.1%<!--v:verify/m1-summary.json#agreement_pct--> of the frame and point pairs with valid data (kappa 0.71<!--v:verify/m1-summary.json#kappa-->), against 56.1%<!--v:verify/m1-summary.json#baseline.agreement_pct--> for a flat horizon, over 37 frames<!--v:verify/m1-summary.json#frames--> and 200 points near the pole. The SPICE code reproduces Horizons Sun and Earth directions within 4.06e-7 deg<!--v:verify/l1a-summary.json#max_sep_deg--> over 72 pairs<!--v:verify/l1a-summary.json#n_pairs-->, which is an implementation check and not a ground truth comparison. Both numbers, and every other row, are in the table below with the target we wrote down before the data was downloaded.

Work on this repository started on 2026-11-14 at 10:00 KST (09:00 Taipei time), when the hackathon began. Unofficial entry, not affiliated with or endorsed by NASA.

License: Apache-2.0 (see `LICENSE`).

## Run it

Open `web/index.html` (or the root `index.html`) in a browser. No server, no install, no network calls at run time. `node --test` runs the tests. `node tools/build-data.mjs` regenerates `web/gen/*.js` from `data/`, `verify/` and `web/i18n/`. `node tools/gen-readme.mjs` regenerates this file from `tools/readme-template.md` and the JSON files, so the table and the numbers in the result sentences are not typed by hand.

Screens: south pole map, sky dome (Sun and Earth tracks over the terrain horizon), timeline bar, 3-site comparison with date shift, best point and windows inside a region (grid, landing date calendar, longest shadow, DSN station windows), M1 check against LROC photographs, verification panel. The interface is available in 10 languages (en, ko, ja, zh-Hans, zh-Hant, es, fr, de, pt, vi).

## What was checked

Every row shows the measured value, and next to it the target that was written down at the start of the hackathon (`docs/verification-protocol.md`). A missed target would be shown as "not met". The M1 target (agreement of 85%<!--v:verify/m1-summary.json#target.agreement_pct_min--> or more and above the flat horizon) and the DSN tolerance were fixed in planning notes dated 2026-11-11 and copied into the scripts, so this repository shows them only from the commits that carry the results. The L1(a) and L1(b) targets are in the protocol file from the first commit.

| Check | n | Measured | Target set at hackathon start | Status | Source |
|---|---|---|---|---|---|
| SPICE implementation check (matches Horizons) | 72 | max 4.06e-7, median 1.17e-7 deg | 0.05 deg | met | `verify/l1a-summary.json` `n_pairs` `max_sep_deg` `median_sep_deg` `target_max_sep_deg` |
| Terrain model vs LOLA average visibility maps (model against model) | 500 | Sun MAE 1.39 pp, r 0.995, Earth MAE 0.68 pp, r 0.996 | 5 pp, 0.95, 5 pp, 0.95 | met (gate pass) | `verify/l1b-summary.json` `n` `mae_sun_pp` `r_sun` `mae_earth_pp` `r_earth` `target_mae_sun_pp` `target_r_sun` `target_mae_earth_pp` `target_r_earth` `gate` |
| LROC images vs predicted shadow (real photographs, points 88 to 90 deg S) | 37 | agreement 94.11%, kappa 0.707, flat horizon 56.10% | 85% and above the flat horizon result | met | `verify/m1-summary.json` `frames` `agreement_pct` `kappa` `baseline.agreement_pct` `target.agreement_pct_min` `target_met` |
| Share of a year in sunlight, LROC illumination map vs model | - | points 199, MAE 2.14 pp, r 0.964 | - | reported | `verify/m1-summary.json` `year_compare.n` `year_compare.mae_pp` `year_compare.r` |
| Best point vs region point, joint Sun and Earth hours (smallest gain de Gerlache Rim 2, largest Nobile Rim 1) | 9 | +2,028 h to +8,152 h | - | reported | `verify/l2-summary.json` `region_ids[]` `best_vs_center_hours.a3-de-gerlache-rim-2` `best_vs_center_hours.a3-nobile-rim-1` |
| 5 day shift of the landing date: region pairs whose order flipped, dates whose top region changed | 9 | flipped 6,659 of 26,136; top region changed on 477 of 726 | - | reported | `verify/l2-summary.json` `region_ids[]` `rank_changed_combos` `rank_pairs_total` `top1_changed_dates` `dates_total` |
| Longest continuous shadow, shortest (Nobile Rim 1, best point, 2027 to 2028) and longest (Slater Plain, region point, 18.6 years) | 36 | 319.1 h to 5,665.0 h | - | reported | `data/shadow.json` `rows[]` `rows.21.longest_shadow_hours` `rows.34.longest_shadow_hours` |
| DSN station window edges vs Horizons | 3 | max 0.003 min | 5 min | met | `verify/dsn-horizons-summary.json` `n_boundaries` `max_diff_min` `target_max_diff_min` `target_met` |
| Share of 2027 to 2028 with Earth visible and a DSN station able to see the Moon, lowest (Slater Plain) and highest (Malapert Massif); station limit 10 deg is an example | 9 | 47.2% to 98.3% | - | reported | `data/dsn.json` `sites[]` `sites[a3-slater-plain].comm_fraction` x100 `sites[a3-malapert-massif].comm_fraction` x100 |

Reading the table:

- The SPICE implementation check compares our SPICE calls with the Horizons service. Both sides use the same JPL ephemeris family, so this is not counted as a comparison with ground truth. Of 9 regions<!--v:verify/l1a-summary.json#sites--> the worst of 72 pairs<!--v:verify/l1a-summary.json#n_pairs--> is 4.06e-7 deg<!--v:verify/l1a-summary.json#max_sep_deg-->, against a target of 0.05 deg<!--v:verify/l1a-summary.json#target_max_sep_deg-->.
- The LOLA average visibility maps (Mazarico et al. 2011, doi:10.1016/j.icarus.2010.10.030) are model outputs from LOLA topography. Matching them shows that our ray tracing is implemented the same way, not that the Sun really shines there. On 500 points<!--v:verify/l1b-summary.json#n--> Sun MAE is 1.39 pp<!--v:verify/l1b-summary.json#mae_sun_pp--> with correlation 0.995<!--v:verify/l1b-summary.json#r_sun-->. The comparison against real sunlight is M1.
- The map label defines its value as the "percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)". Our Sun value is the mean visible fraction of the Sun disc, which is a different definition. Under the map's own wording (any part of the disc above the horizon) our mean absolute difference is 0.68 pp<!--v:verify/l1b-summary.json#sun_anyfrac_diagnostic.mae_pp-->.
- M1 uses LROC wide angle camera frames (Speyerer and Robinson 2013, doi:10.1016/j.icarus.2012.10.010). Lit or shadow in a photograph comes from one brightness cut per frame, so the result is a consistency check with limits listed in `verify/m1-summary.json`. Points lie 88 to 90 deg S where scattered light can blur the cut.
- The DSN window edges are compared with Horizons for 3 boundaries<!--v:verify/dsn-horizons-summary.json#n_boundaries--> chosen by a fixed seed, one per station. That is a sample, not every edge.

## Challenge objectives

| Objective | Where in the app | Coverage |
|---|---|---|
| Interactive site selection and comparison | South pole map with pins and a site list, 3-site comparison, best point grid inside a region | Partly. Nine Artemis III candidate regions only. A typed coordinate shows the nearest region and no values |
| Date and time flexibility | Sky dome time slider over a 45 day track, date shift of 10 days either way in the comparison, landing date calendar for 2027 to 2028 | Partly. The calendar uses the best point of each region and example conditions (X 72 h<!--v:data/calendar.json#x_hours-->, Y 50%<!--v:data/calendar.json#y_earth_pct-->) |
| Sun and Earth position visualization | Sky dome with the terrain horizon, Sun and Earth tracks | Yes |
| Power and communication assessment | Share of time lit, longest shadow, Earth visibility, DSN station windows | Partly. No power model. Earth above the horizon is only an upper bound for a link, and the 10 degree<!--v:data/dsn.json#min_elev_deg--> station limit is an example value |
| Multiple visualization approaches | Polar map, sky dome, timeline bar, best point grid, calendar strip, bar charts | Yes, all 2D. No 3D surface view |
| Temporal dynamics | Timeline bar (7, 30, 90 days), date shift, calendar strip, longest shadow over 18.6 years | Yes |
| Accessibility across skill levels | 10 languages, keyboard operation, one spoken-style summary sentence per screen, patterns in addition to colour | Partly. No formal accessibility audit or user test |
| Libration of the Moon (challenge text, not one of the seven objectives) | Moon orientation and libration come from SPICE with the DE440 ephemeris and the Moon principal axis (PA) frame, kernels `moon_pa_de440_200625.bpc` and `moon_de440_250416.tf` | Yes, through the kernels. There is no separate libration view |

## NASA data used

- NASA JPL Horizons and NAIF SPICE kernels (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`, DSN station kernel `earthstns_itrf93_260814.bsp`, `earth_topo_260814.tf`, `earth_1962_260806_2126_combined.bpc`): Sun and Earth directions, Moon orientation, station positions (`verify/l1a-summary.json`, `data/tracks/`, `data/dsn.json`).
- LRO LOLA polar digital elevation models `ldem_85s_20m`, `ldem_85s_40m`, `ldem_80s_80m`, `ldem_75s_120m`, `ldem_60s_240m`: the terrain horizon at each point and in each region (`data/horizon/`, `data/sites/`).
- LOLA average visibility maps `AVGVISIB_85S_060M_201608` and `AVGVISIB_75S_120M_201608` with their `_EARTH` versions: reference for the terrain model check (`verify/l1b-summary.json`).
- LROC wide angle camera south pole movie frames (`WAC_MOVIE_S*`) and the `WAC_POLE_ILL_PCT_SOUTH_100M` illumination map: M1 (`verify/m1-summary.json`).

The LOLA elevation models are described in Smith et al. (2010), Geophysical Research Letters 37, doi:10.1029/2010GL043751.

File names and SHA-256 sums of the inputs are in `verify/data-sha256.txt` and the sums of the generated files are in `LW_DATA.sources` inside `web/gen/data.js`. Numbers shown in the app come from `data/` and `verify/`, not from the page code. Download addresses are in `compute/manifest.json`. No data from Space Agency partners was used beyond these NASA products.

## Method in short

- Sites: the nine Artemis III candidate region names are from the NASA 2024-10 release. Their positions were read from the yellow region boxes in the picture that comes with it, so they are approximate (a few km) and are not landing site coordinates (`data/sites.json`, `coord_quality` and `source_note` per site).
- Regions: a region is taken as a 15 x 15 km square around its point. That size is an assumption from a NASA 2022 description, not stated for the 2024 list. Inside it a 7 x 7 grid at 2 km steps is searched.
- Projection: polar stereographic on a sphere of radius 1737.4 km, x = rho sin(lon), y = rho cos(lon), longitude measured east from the +y axis, latitude from rho. Map pixels are addressed by pixel centre (`pixel_rule` in `verify/m1-summary.json`). No separate east-west check against a named crater is recorded in `verify/`. The only check that could expose a mirrored orientation is M1, where the model matches the photographs at 94.1%<!--v:verify/m1-summary.json#agreement_pct--> against 56.1%<!--v:verify/m1-summary.json#baseline.agreement_pct--> for a flat horizon. We did not run a mirrored variant to see how much lower it would score.
- Horizon: 720 azimuths, each ray followed 300 km with sphere curvature over the DEMs listed above. Observer height 2 m.
- Sunlight and Earth visibility: hourly epochs with SPICE (`azlcpo`, light time and stellar aberration, no refraction). The Sun counts as lit when at least half of its disc is above the horizon in the calendar and score calculations.
- Calendar: a landing date at 00:00 UTC counts when the Sun stays lit for X hours in a row and Earth is visible for at least Y% of that time at the best point of the region. X and Y are example values, not mission requirements.
- DSN windows: when the Moon is above the station elevation limit at Goldstone, Madrid and Canberra, using the NAIF station kernel. The limit is an example value. Earth above the horizon is not a communication guarantee.

## Use of Super Intelligence (SI)

SI (AI assistance) was used for: the app code and tests (generated by an AI coding model, then run and reviewed by the author), the calculation scripts in `compute/`, the interface translations for the 9 non-English languages, text drafts, and the checks that compare numbers in this file with the JSON files. Code and text in this repository are SI generated or SI assisted, and the generated JSON files carry a `generated_with` note. The project idea and its scope were chosen by the author, not by an SI tool. Any image or video made with SI carries a visible watermark, and audio carries an SI label in its description and metadata. No NASA logos, flags or mission patches are used.

## Limits

- The terrain model uses public elevation maps at the stated resolution and ignores boulders and any change of the surface.
- Matching LOLA maps is a model-to-model check. Matching LROC photographs is a consistency check against one brightness cut per frame, on points 88 to 90 deg S only. Neither guarantees conditions for a real landing.
- The check against Horizons tests our implementation, not the physics.
- Region positions are read from a map picture and the region box size is an assumption. Results for a region describe that box.
- The landing date condition (X hours, Y percent) and the DSN station limit are example values.
- Most photographed points are in shadow, so agreement alone flatters. Cohen's kappa is the fairer number: 0.707<!--v:verify/m1-summary.json#kappa--> for the terrain model against 0.119<!--v:verify/m1-summary.json#baseline.kappa--> for the flat horizon.
- No mirrored-orientation variant of M1 was run, so the east-west orientation rests on the agreement above (see Method in short).
- The best point is the best by joint Sun and Earth hours over 2027 to 2028 at hourly resolution on a 2 km grid. A finer grid can find better spots.
- No power budget, no slope or rock hazard assessment, no surface 3D view.

## Reproduce

All scripts are in `compute/`. Data are downloaded with `compute/fetch.sh` (inputs listed in `compute/manifest.json`, sums in `verify/data-sha256.txt`), then `compute/spice_check.py` (L1(a)), `compute/tracks.py` (sky tracks), `compute/l1b.py` (L1(b), took 148.7 s<!--v:verify/l1b-summary.json#runtime_s--> here), `compute/m1_lroc.py` (M1, 115.0 s<!--v:verify/m1-summary.json#runtime_s-->), `compute/l2_sites.py` (L2, 105.1 s<!--v:verify/l2-summary.json#runtime_s-->) and `compute/dsn.py` (DSN windows). `compute/dsn_horizons_summary.py` copies the Horizons comparison of the DSN edges into `verify/dsn-horizons-summary.json`. The outputs that should match are the files in `verify/` and `data/`. `node --test` checks that `web/gen/data.js` was built from them.

## Project page form: evidence map

| Form field | Where the evidence is |
|---|---|
| Project Name | Lunar Window (working name) |
| High-Level Project Summary | First paragraphs above and `submission/form-en.md` |
| Link to Project Demo | Added at submission (30 second video or 7 slide deck with English subtitles) |
| Link to Final Project | Public repository link, added at submission |
| Detailed Project Description | This file, `docs/verification-protocol.md`, the verification panel in the app, `submission/form-en.md` |
| Use of Super Intelligence (SI) | The SI section above and `submission/form-en.md` |
| NASA Data | The NASA data section above |
| Space Agency Partner Data | None beyond the NASA and LRO products listed above |
