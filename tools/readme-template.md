# Ridgelight

<img src="web/assets/logo-mark.png" width="96" alt="Ridgelight logo, AI-generated image">

*When sunlight reaches every lunar landing site.*

![Ridgelight at a glance: answer, processing flow from NASA data to best point and dates, agreement with LROC photographs, limits. Diagram drafted with AI assistance (SI) and drawn by code from the verify files, not an AI-generated image.](docs/ridgelight-at-a-glance.png)

Live test site: https://lunar-window-two.vercel.app

Ridgelight is a static web app for the NASA Space Apps Challenge 2026 challenge "Lunar Landing Site Navigator". Pick one of the nine Artemis III candidate regions near the lunar south pole and see when the Sun and Earth are above the horizon there, which spot inside the region has the most light and line of sight to Earth, and how much of that rests on checks against NASA data.

**Result in one line:** our terrain shadow model agrees with real LROC photographs at {{v verify/m1-summary.json#agreement_pct|1|%}} of the frame and point pairs with valid data (kappa {{v verify/m1-summary.json#kappa|2|}}), against {{v verify/m1-summary.json#baseline.agreement_pct|1|%}} for a flat horizon, over {{v verify/m1-summary.json#frames|0| frames}} and 200 points near the pole. The SPICE code reproduces Horizons Sun and Earth directions within {{e verify/l1a-summary.json#max_sep_deg|2| deg}} over {{v verify/l1a-summary.json#n_pairs|0| pairs}}, which is an implementation check and not a ground truth comparison. Both numbers, and every other row, are in the table below with the target we wrote down before the data was downloaded.

Work on this repository started on 2026-11-14 at 10:00 KST (09:00 Taipei time), when the hackathon began. Unofficial entry, not affiliated with or endorsed by NASA.

License: Apache-2.0 (see `LICENSE`).

## Run it

Open `web/index.html` (or the root `index.html`) in a browser. No server, no install, no network calls at run time. `node --test` runs the tests. `node tools/build-data.mjs` regenerates `web/gen/*.js` from `data/`, `verify/` and `web/i18n/`. `node tools/gen-readme.mjs` regenerates this file from `tools/readme-template.md` and the JSON files, so the table and the numbers in the result sentences are not typed by hand.

Screens: south pole map, sky dome (Sun and Earth tracks over the terrain horizon), timeline bar, 3-site comparison with date shift, best point and windows inside a region (grid, landing date calendar, longest shadow, DSN station windows), M1 check against LROC photographs, verification panel. The interface is available in 10 languages (en, ko, ja, zh-Hans, zh-Hant, es, fr, de, pt, vi).

## What was checked

Every row shows the measured value, and next to it the target that was written down at the start of the hackathon (`docs/verification-protocol.md`). A missed target would be shown as "not met". The M1 target (agreement of {{v verify/m1-summary.json#target.agreement_pct_min|0|%}} or more and above the flat horizon) and the DSN tolerance were fixed in planning notes dated 2026-11-11 and copied into the scripts, so this repository shows them only from the commits that carry the results. The L1(a) and L1(b) targets are in the protocol file from the first commit.

{{table}}

Reading the table:

- The SPICE implementation check compares our SPICE calls with the Horizons service. Both sides use the same JPL ephemeris family, so this is not counted as a comparison with ground truth. Of {{v verify/l1a-summary.json#sites|0| regions}} the worst of {{v verify/l1a-summary.json#n_pairs|0| pairs}} is {{e verify/l1a-summary.json#max_sep_deg|2| deg}}, against a target of {{v verify/l1a-summary.json#target_max_sep_deg|2| deg}}.
- The LOLA average visibility maps (Mazarico et al. 2011, doi:10.1016/j.icarus.2010.10.030) are model outputs from LOLA topography. Matching them shows that our ray tracing is implemented the same way, not that the Sun really shines there. On {{v verify/l1b-summary.json#n|0| points}} Sun MAE is {{v verify/l1b-summary.json#mae_sun_pp|2| pp}} with correlation {{v verify/l1b-summary.json#r_sun|3|}}. The comparison against real sunlight is M1.
- The map label defines its value as the "percentage of timesteps where each pixel was sunlit (by any fraction of the solar disc)". Our Sun value is the mean visible fraction of the Sun disc, which is a different definition. Under the map's own wording (any part of the disc above the horizon) our mean absolute difference is {{v verify/l1b-summary.json#sun_anyfrac_diagnostic.mae_pp|2| pp}}.
- M1 uses LROC wide angle camera frames (Speyerer and Robinson 2013, doi:10.1016/j.icarus.2012.10.010). Lit or shadow in a photograph comes from one brightness cut per frame, so the result is a consistency check with limits listed in `verify/m1-summary.json`. Points lie 88 to 90 deg S where scattered light can blur the cut.
- The DSN window edges are compared with Horizons for {{v verify/dsn-horizons-summary.json#n_boundaries|0| boundaries}} chosen by a fixed seed, one per station. That is a sample, not every edge.

## Challenge objectives

| Objective | Where in the app | Coverage |
|---|---|---|
| Interactive site selection and comparison | South pole map with pins and a site list, 3-site comparison, best point grid inside a region | Partly. Nine Artemis III candidate regions only. A typed coordinate shows the nearest region and no values |
| Date and time flexibility | Sky dome time slider over a 45 day track, date shift of 10 days either way in the comparison, landing date calendar for 2027 to 2028 | Partly. The calendar uses the best point of each region and example conditions (X {{v data/calendar.json#x_hours|0| h}}, Y {{v data/calendar.json#y_earth_pct|0|%}}) |
| Sun and Earth position visualization | Sky dome with the terrain horizon, Sun and Earth tracks | Yes |
| Power and communication assessment | Share of time lit, longest shadow, Earth visibility, DSN station windows | Partly. No power model. Earth above the horizon is only an upper bound for a link, and the {{v data/dsn.json#min_elev_deg|0| degree}} station limit is an example value |
| Multiple visualization approaches | Polar map, sky dome, timeline bar, best point grid, calendar strip, bar charts | Yes, all 2D. No 3D surface view |
| Temporal dynamics | Timeline bar (7, 30, 90 days), date shift, calendar strip, longest shadow over 18.6 years | Yes |
| Accessibility across skill levels | 10 languages, keyboard operation, one spoken-style summary sentence per screen, patterns in addition to colour | Partly. No formal accessibility audit or user test |
| Libration of the Moon (challenge text, not one of the seven objectives) | Moon orientation and libration come from SPICE with the DE440 ephemeris and the Moon principal axis (PA) frame, kernels `moon_pa_de440_200625.bpc` and `moon_de440_250416.tf` | Yes, through the kernels. There is no separate libration view |

## NASA data used

- NASA JPL Horizons and NAIF SPICE kernels (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`, DSN station kernel `earthstns_itrf93_260814.bsp`, `earth_topo_260814.tf`, `earth_1962_260806_2126_combined.bpc`): Sun and Earth directions, Moon orientation, station positions (`verify/l1a-summary.json`, `data/tracks/`, `data/dsn.json`).
- LRO LOLA polar digital elevation models `ldem_85s_20m`, `ldem_85s_40m`, `ldem_80s_80m`, `ldem_75s_120m`, `ldem_60s_240m`: the terrain horizon at each point and in each region (`data/horizon/`, `data/sites/`).
- LOLA average visibility maps `AVGVISIB_85S_060M_201608` and `AVGVISIB_75S_120M_201608` with their `_EARTH` versions: reference for the terrain model check (`verify/l1b-summary.json`).
- LROC wide angle camera south pole movie frames (`WAC_MOVIE_S*`) and the `WAC_POLE_ILL_PCT_SOUTH_100M` illumination map: M1 (`verify/m1-summary.json`).

Resources tab of the challenge: NASA JPL Horizons is used (the L1(a) check). Moon Trek was used to look for official region coordinates (WMTS capabilities and the search service, no data kept from it). LROC QuickMap and the CSA Moon Exploration page were not used for any result. The LROC and LOLA products above are the same data QuickMap and Moon Trek show, but we downloaded them from the PDS archives (`compute/manifest.json`), not through those portals. The footer of the app links to QuickMap and Moon Trek for looking at a region by hand.

The IAU Gazetteer of Planetary Nomenclature (USGS) was used for the feature center cross-check in `data/sites.json`. It is not NASA data.

The LOLA elevation models are described in Smith et al. (2010), Geophysical Research Letters 37, doi:10.1029/2010GL043751.

File names and SHA-256 sums of the inputs are in `verify/data-sha256.txt` and the sums of the generated files are in `LW_DATA.sources` inside `web/gen/data.js`. Numbers shown in the app come from `data/` and `verify/`, not from the page code. Download addresses are in `compute/manifest.json`. No data from Space Agency partners was used beyond these NASA products.

## Method in short

- Sites: the nine Artemis III candidate region names are from the NASA 2024-10 release. Their positions were read from the yellow region boxes in the picture that comes with it, so they are approximate (a few km) and are not landing site coordinates (`data/sites.json`, `coord_quality` and `source_note` per site). We looked for official region coordinates on 2026-11-14 and found none: the Moon Trek search service answered with Apollo bookmarks only and QuickMap has no query interface we could use. As a cross-check we compared each point with the center of the named feature in the IAU Gazetteer of Planetary Nomenclature (USGS), stored as `iau_*` fields per site. The nine points lie {{iau_min}} to {{iau_max}} km from those centers. That is expected, since a region is not the center of the crater it is named after, so the check shows the names and areas fit and does not make the positions more exact.
- Regions: a region is taken as a 15 x 15 km square around its point. That size is an assumption from a NASA 2022 description, not stated for the 2024 list. Inside it a 7 x 7 grid at 2 km steps is searched.
- Projection: polar stereographic on a sphere of radius 1737.4 km, x = rho sin(lon), y = rho cos(lon), longitude measured east from the +y axis, latitude from rho. Map pixels are addressed by pixel centre (`pixel_rule` in `verify/m1-summary.json`). No separate east-west check against a named crater is recorded in `verify/`. The only check that could expose a mirrored orientation is M1, where the model matches the photographs at {{v verify/m1-summary.json#agreement_pct|1|%}} against {{v verify/m1-summary.json#baseline.agreement_pct|1|%}} for a flat horizon. We did not run a mirrored variant to see how much lower it would score.
- Horizon: 720 azimuths, each ray followed 300 km with sphere curvature over the DEMs listed above. Observer height 2 m.
- Sunlight and Earth visibility: hourly epochs with SPICE (`azlcpo`, light time and stellar aberration, no refraction). The Sun counts as lit when at least half of its disc is above the horizon in the calendar and score calculations.
- Calendar: a landing date at 00:00 UTC counts when the Sun stays lit for X hours in a row and Earth is visible for at least Y% of that time at the best point of the region. X and Y are example values, not mission requirements.
- DSN windows: when the Moon is above the station elevation limit at Goldstone, Madrid and Canberra, using the NAIF station kernel. The limit is an example value. Earth above the horizon is not a communication guarantee.

## Use of Super Intelligence (SI)

Almost everything in this repository was made with an AI model (Claude, from Anthropic), working inside the author's coding session. We list it by kind so nobody has to guess.

Made by the AI model, then run and read through by the author:
- The app code in `web/` and the tests in `test/`.
- The calculation scripts in `compute/` (SPICE calls, horizon tracing, the comparisons with LOLA maps and LROC frames, DSN windows) and the build scripts in `tools/`.
- Drafts of this README, the project page text and the verification notes, including the script that fills the table and the numbers in this file from the JSON files.
- The translations of the interface into the 9 languages other than English.
- The region positions: the AI read the yellow boxes off the NASA map picture by pixel measurement. The result is approximate and is marked so in `data/sites.json`.
- The logo mark (web/assets/logo-mark.png, favicon.png) is an AI-generated image (SI, Gemini image model via agy), cropped and resized by the author. The app shows a small AI-generated credit in its footer; video and submission image frames carry a visible watermark.
- The overview figure `docs/ridgelight-at-a-glance.png` is a screenshot of a diagram page drawn by code (Archify renderer). Its text was drafted with AI assistance (SI) and its numbers are read from `verify/*.json`. It is not an AI-generated image and has no NASA logos, flags or mission patches.
- The demo narration, if the demo video is used, is synthetic speech (Kokoro text-to-speech). The video screens are recordings of the app and cards drawn in code. No AI-generated photo is in the repository. If a logo from an image model is added, it carries a visible label.

Decided by the author, not by the AI:
- The problem and the scope: which challenge, nine regions, Sun and Earth visibility as the question, and what to leave out (no power model, no hazard map).
- The verification design: which checks to run, which NASA products to compare against, and the target values, written down before the data was downloaded (`docs/verification-protocol.md`).
- Which NASA data to use and which to drop.
- Reading the results: what counts as met or not met, which numbers get shown next to the results, and the limits section below.

Generated JSON files carry a `generated_with` note. Audio and video made with SI carry a label in the description and in the file metadata. No NASA logos, flags or mission patches are used.

## Limits

- The terrain model uses public elevation maps at the stated resolution and ignores boulders and any change of the surface.
- Matching LOLA maps is a model-to-model check. Matching LROC photographs is a consistency check against one brightness cut per frame, on points 88 to 90 deg S only. Neither guarantees conditions for a real landing.
- The check against Horizons tests our implementation, not the physics.
- Region positions are read from a map picture and the region box size is an assumption. Results for a region describe that box. No official region coordinates were found, so we did not rerun the results with other positions; the IAU feature centers are {{iau_min}} to {{iau_max}} km away and describe different things.
- The landing date condition (X hours, Y percent) and the DSN station limit are example values.
- Most photographed points are in shadow, so agreement alone flatters. Cohen's kappa is the fairer number: {{v verify/m1-summary.json#kappa|3|}} for the terrain model against {{v verify/m1-summary.json#baseline.kappa|3|}} for the flat horizon.
- No mirrored-orientation variant of M1 was run, so the east-west orientation rests on the agreement above (see Method in short).
- The best point is the best by joint Sun and Earth hours over 2027 to 2028 at hourly resolution on a 2 km grid. A finer grid can find better spots.
- No power budget, no slope or rock hazard assessment, no surface 3D view.

## Reproduce

All scripts are in `compute/`. Data are downloaded with `compute/fetch.sh` (inputs listed in `compute/manifest.json`, sums in `verify/data-sha256.txt`), then `compute/spice_check.py` (L1(a)), `compute/tracks.py` (sky tracks), `compute/l1b.py` (L1(b), took {{v verify/l1b-summary.json#runtime_s|1| s}} here), `compute/m1_lroc.py` (M1, {{v verify/m1-summary.json#runtime_s|1| s}}), `compute/l2_sites.py` (L2, {{v verify/l2-summary.json#runtime_s|1| s}}) and `compute/dsn.py` (DSN windows). `compute/dsn_horizons_summary.py` copies the Horizons comparison of the DSN edges into `verify/dsn-horizons-summary.json`. The outputs that should match are the files in `verify/` and `data/`. `node --test` checks that `web/gen/data.js` was built from them.

## Project page form: evidence map

| Form field | Where the evidence is |
|---|---|
| Project Name | Ridgelight |
| High-Level Project Summary | First paragraphs above and `submission/form-en.md` |
| Link to Project Demo | Added at submission (30 second video or 7 slide deck with English subtitles) |
| Link to Final Project | https://lunar-window-two.vercel.app (static page), repository link added at submission |
| Detailed Project Description | This file, `docs/verification-protocol.md`, the verification panel in the app, `submission/form-en.md` |
| Use of Super Intelligence (SI) | The SI section above and `submission/form-en.md` |
| NASA Data | The NASA data section above |
| Space Agency Partner Data | None beyond the NASA and LRO products listed above |
