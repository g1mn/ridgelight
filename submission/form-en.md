# Project page text for Ridgelight

Field names follow the 2026 "Project Page Form Field Instructions". Fields that need a link are filled in at submission.

## Project Name

Ridgelight

## High-Level Project Summary

Ridgelight answers one planning question: which Artemis III candidate region keeps the Sun up and Earth in view, and how far can each number be trusted? It is a static web app for the challenge "Lunar Landing Site Navigator". You pick one of the nine Artemis III candidate regions near the lunar south pole and see when the Sun and Earth are above the horizon there, with the horizon traced from LOLA elevation data. Inside each region it also finds the spot with the most hours of Sun and Earth together, lists landing dates that keep the Sun up for three days, and shows the longest shadow and the Deep Space Network station windows.

A site comparison is only useful if you know how far to trust the numbers, so the app shows each check next to the result it supports. Its terrain shadow model agrees with real LROC photographs on 94.1% of the frame and point pairs (37 frames, 200 points; Cohen's kappa 0.71). A flat horizon gets 56.1% and kappa 0.12, because most photographed points are in shadow. The SPICE code matches Horizons within 4.06e-7 degrees over 72 pairs, and that second check tests our implementation, not the Moon. Everything runs in a browser with no server and no network calls, and the interface is available in 10 languages.

## Link to Project Demo

(Link added at submission: a 30 second video with English subtitles or a 7 slide deck.)

## Link to Final Project

Live test site: https://lunar-window-two.vercel.app

(Repository link added at submission.)

## Detailed Project Description

What it does. The app has a south pole map, a sky dome with the Sun and Earth tracks over the terrain horizon, a timeline bar, a comparison of three sites with a date shift, a best point view for each region, an M1 panel that compares the model with LROC photographs, and a verification panel. The best point view searches a 7 by 7 grid with 2 km steps around each region point for the spot with the most joint Sun and Earth hours in 2027 to 2028. For that spot it lists the landing dates that keep the Sun lit for 72 hours in a row with Earth visible at least half of that time, the longest shadow, and the windows in which Goldstone, Madrid or Canberra can see the Moon above 10 degrees. The 72 hours, the 50% and the 10 degrees are example values, not mission requirements.

How it works. Sun and Earth directions come from NAIF SPICE with the DE440 ephemeris and the Moon principal axis (PA) frame, so lunar orientation and libration are included. The horizon at each point is traced over the LOLA elevation models out to 300 km. Sunlight is the mean visible fraction of the Sun disc over hourly epochs, and Earth is visible when any part of its disc is above the horizon.

How it is checked. Every result is shown as measured, next to its target. The SPICE and LOLA map targets are in docs/verification-protocol.md, which was added in the second commit together with those two checks. The LROC (M1) and DSN targets come from planning notes dated 2026-11-11 that are outside this repository, so they can be checked only against the commits that carry the results. The SPICE check against Horizons has a worst case of 4.06e-7 degrees against a target of 0.05 degrees. The terrain model matches the LOLA average visibility maps with a Sun mean absolute difference of 1.39 percentage points, but those maps are model outputs, so we treat this as a test of our ray tracing. The check against real sunlight is M1: 37 LROC frames, 200 points, agreement 94.1%, kappa 0.707, flat horizon 56.1%. The DSN window edges differ from Horizons by at most 0.003 minutes at the three edges we sampled.

Limits. Region positions are read from a NASA map picture and the 15 x 15 km region box is an assumption, so results describe that box and not an official site. We searched Moon Trek for official region coordinates and found none; as a cross-check the points lie 3.6 to 66.8 km from the centers of the same-named features in the IAU Gazetteer, which is expected since a region is not the center of its crater. Earth above the horizon is only an upper bound for a communication link. No power budget or hazard assessment is included.

Approximate and modeled values. Every Sun and Earth number is computed by our model, at hourly steps on a 2 km grid, and is a simulation. Only the M1 check compares it with real photographs. Region positions are approximate (a few km) and the 15 x 15 km box is an assumption. The landing date condition (72 hours, 50%) and the 10 degree DSN limit are example values. The app prints a note next to each of these.

Made during the hackathon. The first commit is 2026-11-14 10:03 KST (09:03 Taipei time), and all commits are by one author. Commits dated 2026-11-15 change documentation and display only; no calculation or result changed. Only planning notes (the M1 and DSN target values, dated 2026-11-11) existed before, outside the repository. All input data were downloaded on 2026-11-14.

Tools, libraries and licenses. The web app uses plain JavaScript, SVG and CSS, no library, no font file and no network call at run time. The calculations use Python 3.12.3 with spiceypy 8.3.0 (MIT, NAIF SPICE Toolkit), NumPy 2.5.4 (BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0) and Pillow 13.0.0 (MIT-CMU), run on a small server. Tests and build scripts use Node.js built-ins only. The demo narration uses kokoro-onnx 0.6.1 (MIT), ONNX Runtime 1.31.1 (MIT) and the Kokoro-82M model (Apache-2.0 per its model card). The video is assembled with FFmpeg 6.1.1 and rendered with headless Chrome 150. The live site is hosted on Vercel. The full list with sources is in the README section "Software, services and licenses". Versions and licenses were read from the installed package metadata.

## Use of Super Intelligence (SI)

SI tools were used in this project, and most of the work was done with them. The AI model (Claude, from Anthropic) wrote the app code, the tests and the calculation scripts. It drafted the README, this form and the verification notes, translated the interface into the 9 other languages, wrote the script that fills the README table from the result files, and measured the region positions off the NASA map picture by pixel. The author ran the scripts and read through the code and the results. If the demo video is used, its narration is synthetic speech (Kokoro text-to-speech) and its screens are recordings of the app and cards drawn in code. No AI-generated photo is used. A logo from an image model, if added, carries a visible label. Audio and video made with SI carry a label in the description and in the file metadata. Generated JSON files carry a note saying which script and which SI model produced them.

The author decided the problem and the scope (which challenge, nine regions, Sun and Earth visibility, and what to leave out), the verification design and its target values, which NASA data to use, and how to read the results: what counts as met or not met, and which limits to print next to them. No NASA logos, flags or mission patches are used.

## NASA Data

NASA JPL Horizons and NAIF SPICE kernels (de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, pck00011.tpc, naif0012.tls and the DSN station kernels): Sun and Earth directions, Moon orientation, station positions. LRO LOLA polar elevation models (ldem_85s_20m, ldem_85s_40m, ldem_80s_80m, ldem_75s_120m, ldem_60s_240m): the terrain horizon. LOLA average visibility maps (AVGVISIB_85S_060M_201608 and AVGVISIB_75S_120M_201608, Sun and Earth): reference for the terrain model check. LROC wide angle camera south pole movie frames and the WAC_POLE_ILL_PCT_SOUTH_100M illumination map: the check against photographs. File names and SHA-256 sums are in the repository (verify/data-sha256.txt). Citation from the challenge Resources tab: the item "Horizons System" (NASA JPL) is used for a check and for the SPICE kernels behind every Sun and Earth direction. The item "Moon Trek" was searched for region coordinates without a usable result. The item "Quickmap" and the partner item "Moon Exploration" (CSA) were not used. The LROC and LOLA products were downloaded from the PDS archives, not through QuickMap or Moon Trek.

## Space Agency Partner Data and Other References

No Space Agency Partner data was used. References: Mazarico et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030. Speyerer and Robinson (2013), Persistently illuminated regions at the lunar poles, Icarus 222, 122-136, doi:10.1016/j.icarus.2012.10.010. Smith et al. (2010), Initial observations from the Lunar Orbiter Laser Altimeter, Geophysical Research Letters 37, doi:10.1029/2010GL043751. Artemis III candidate region names and map: NASA, October 2024 release. The repository code is original and licensed Apache-2.0. No third-party code, font or image is copied into it; the libraries above are used from their own packages. The IAU Gazetteer of Planetary Nomenclature (USGS) was read for feature centers only.
