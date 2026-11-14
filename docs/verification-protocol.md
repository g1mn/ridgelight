# Verification protocol (fixed at hackathon start)

These checks, seeds and thresholds were written down before the data was downloaded. Results are reported next to the targets. A missed target is reported as measured and marked "not met". Targets are never presented as results.

Written with Claude (Anthropic SI) assistance. Numbers in `verify/` come from scripts in `compute/`.

## 0. Common settings

| Item | Value |
|---|---|
| Moon-fixed frame | MOON_ME (`moon_de440_250416.tf`, `moon_pa_de440_200625.bpc`), same family as the LOLA products and Horizons `MEAN_ME` |
| Reference sphere | radius 1737.4 km (LOLA maps and the Horizons header agree) |
| Ephemeris | `de440s.bsp`, leap seconds `naif0012.tls`, UTC input |
| Light time and aberration | LT+S, the same meaning as Horizons "apparent" |
| Azimuth and elevation | azimuth from north (toward increasing latitude) toward east; elevation above the local horizontal; no atmospheric refraction |
| Sun disc | angular radius from 696,000 km, computed per epoch |
| Earth disc | angular radius from the pck00011 equatorial radius, computed per epoch |
| Observer height | DEM surface + 2 m; L1(a) uses sphere height 0 |
| 18.6 year span | 163,056 hourly epochs from 2026-01-01T00:00 UTC |

## 1. L1(a) SPICE implementation check (matches Horizons)

Both sides use the same ephemeris family, so this is an implementation check and not a comparison with ground truth.

| Item | Value |
|---|---|
| Points | the 9 Artemis III candidate regions (approximate representative points read from a public NASA map), sphere height 0 |
| Epochs (UTC) | 2027-01-15T00:00, 2027-04-15T06:00, 2027-07-15T12:00, 2027-10-15T18:00 |
| Bodies | Sun (10), Earth (399) |
| Pairs | 9 x 4 x 2 = 72 |
| Ours | spiceypy `azlcpo(method="ELLIPSOID", abcorr="LT+S", azccw=False, elplsz=True, obsctr="MOON", obsref="MOON_ME")` |
| Reference | Horizons API, `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='east_lon,lat,0'`, `QUANTITIES='4'`, `APPARENT='AIRLESS'`, `EXTRA_PREC='YES'` |
| Measured | per pair: azimuth difference x cos(elevation), elevation difference, angular separation; maximum and median |
| Files | `verify/l1a-spice-vs-horizons.csv`, `verify/l1a-summary.json` |

Target set at hackathon start: maximum angular separation over the 72 pairs of 0.05 deg or less.

## 2. L1(b) terrain model against LOLA maps at 500 points (gate)

The LOLA average visibility maps (Mazarico et al. 2011 method) are model outputs built from the same kind of terrain data. This comparison checks our ray tracing implementation. Whether it agrees with real sunlight is the job of the LROC image check.

Sampling (seed fixed): `numpy.random.default_rng(20261114)`, layers A, B, C in that order.

| Layer | Range | Points | Comparison map |
|---|---|---|---|
| A | 88 to 90 deg S | 200 | AVGVISIB_85S_060M_201608 (Sun and `_EARTH`) |
| B | 85 to 88 deg S | 150 | AVGVISIB_85S_060M_201608 |
| C | 80 to 85 deg S | 150 | AVGVISIB_75S_120M_201608 |

Points are drawn uniformly in the polar stereographic plane (sphere radius 1737.4 km, scale 1 at the pole) and kept when the radius is in the layer's ring. Each point is moved to the pixel center of its comparison map and our calculation runs from that pixel center. A repeated pixel or a pixel outside the map is dropped and redrawn; the number of redraws is recorded.

Horizon: 720 azimuths (0.5 deg step), each ray followed to 300 km with sphere curvature. Samples are spaced by the pixel size of the DEM in use and bilinearly interpolated. DEMs by distance from the observer: 85S 20 m (0 to 5 km), 85S 40 m (5 to 20 km), 80S 80 m (20 to 50 km), 75S 120 m (50 to 150 km), 60S 240 m (150 to 300 km). A ray outside a DEM uses the next coarser one. Points at 80 to 85 deg S use 80S 80 m from 0 km.

Visibility over the 163,056 epochs:
- Sun: the horizon is read at the Sun's azimuth. With d = (elevation - horizon) / angular radius clipped to [-1, 1], the visible fraction is f = 1 - (acos(d) - d sqrt(1 - d^2)) / pi. Our value is the mean of f times 100 (%).
- Earth: visible when any part of the disc is above the horizon, the same as the map definition. Our value is the share of epochs visible times 100 (%).

Measured: for Sun and Earth separately, n, MAE (percentage points), mean difference (ours minus map), Pearson correlation; also per layer. Raw data in `verify/l1b-scatter.csv`, summary in `verify/l1b-summary.json`, with a table of difference causes (disc, observer height, period, DEM version, resolution).

Target set at hackathon start: Sun and Earth MAE each 5 pp or less, correlation each 0.95 or more.

Gate (decided 11/14 20:00 and recorded in the `gate` field):

| Result | Condition | After |
|---|---|---|
| pass | 500 points computed, Sun MAE 10 pp or less and correlation 0.8 or more, and the Sun elevation from the visibility code matches L1(a) at 3 of the 9 sites at all 4 epochs within 0.01 deg | continue with the planned checks |
| pass, Earth from map | Sun conditions met but Earth MAE above 10 pp or correlation below 0.8: Earth visibility is read from the map and labelled as such | `earth_source` is `map` |
| fail | Sun condition not met, or the 500 points were not finished by 20:00 | minimal build: map values read at sites, labelled as such |

The gate line (10 pp, 0.8) differs from the target (5 pp, 0.95). It is a usable line that allows for differences in period, observer height and DEM version on the map side (not stated in the map label). Passing the gate without meeting the target is reported as measured together with "target not met".

## 3. M1 LROC photographs against the shadow model

Added to this file on 2026-11-14 after the results existed. The target below was written in planning notes dated 2026-11-11 (outside this repository) and copied into `compute/m1_lroc.py`; the repository history shows it only from the commit that carries the results.

| Item | Value |
|---|---|
| Points | the 200 layer A points of section 2 (88 to 90 deg S) |
| Frames | LROC wide angle camera south pole movie frames (`WAC_MOVIE_S*`), 37 frames; lit or shadow from one Otsu brightness cut per frame |
| Model | the terrain model of section 2 at the frame time, Sun lit when the visible disc fraction is 0.5 or more |
| Baseline | the same check with a flat horizon |
| Measured | agreement, Cohen's kappa, confusion counts, one year share of sunlight against the LROC illumination map |

Target set at hackathon start: agreement of 85% or more and higher than the flat horizon baseline.

## 4. L2 best point, landing dates, shadow

Added after the results existed, from the settings in `compute/l2_sites.py`. A region is a 15 x 15 km square around its point (assumption from a NASA 2022 description) with a 7 x 7 grid at 2 km steps. The score is the number of hours with the Sun lit (disc fraction 0.5 or more) and Earth visible together in 2027 to 2028. The period was fixed to the calendar period before the results were looked at, as in the planning notes. These rows have no pass or fail target; they are reported values. The landing date condition (72 hours of Sun in a row, Earth visible at least 50% of that time) is an example, not a mission requirement.

## 5. DSN window edges against Horizons

Added after the results existed. Window edges come from the NAIF station kernel with a station elevation limit of 10 degrees (an example value). One edge per station, chosen by the fixed seed 20261114, is compared with Horizons (target Moon, centre at the station position). Target set at hackathon start (planning notes, 2026-11-11): difference of 5 minutes or less.

## 6. Changes after the start

None to the targets of sections 1 and 2 (they are in the first commit of this file). Sections 3 to 5 were written down in this file after the results existed, as stated in each section.

