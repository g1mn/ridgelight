# Project page text for Lunar Window

Field names follow the 2026 "Project Page Form Field Instructions". Fields that need a link are filled in at submission.

## Project Name

Lunar Window (working name)

## High-Level Project Summary

Lunar Window is a static web app for the challenge "Lunar Landing Site Navigator". You pick one of the nine Artemis III candidate regions near the lunar south pole and see when the Sun and Earth are above the horizon there, over the real terrain. Inside each region it also finds the spot with the most hours of Sun and Earth together, lists landing dates that keep the Sun up for three days, and shows the longest shadow and the Deep Space Network station windows.

It matters because a site is only useful if you can say how far to trust the numbers. The app puts the checks next to the results. Its terrain shadow model agrees with real LROC photographs at 94.1% of 200 points, against 56.1% for a flat horizon. The SPICE code matches Horizons within 4.06e-7 degrees over 72 pairs, and we say plainly that this second check tests our implementation, not the Moon. Everything runs in a browser with no server and no network calls, and the interface is available in 10 languages.

## Link to Project Demo

(Link added at submission: a 30 second video with English subtitles or a 7 slide deck.)

## Link to Final Project

(Link added at submission: the public repository and the page that serves the app.)

## Detailed Project Description

What it does. The app has a south pole map, a sky dome with the Sun and Earth tracks over the terrain horizon, a timeline bar, a comparison of three sites with a date shift, a best point view for each region, an M1 panel that compares the model with LROC photographs, and a verification panel. The best point view searches a 7 by 7 grid with 2 km steps around each region point for the spot with the most joint Sun and Earth hours in 2027 to 2028. For that spot it lists the landing dates that keep the Sun lit for 72 hours in a row with Earth visible at least half of that time, the longest shadow, and the windows in which Goldstone, Madrid or Canberra can see the Moon above 10 degrees. The 72 hours, the 50% and the 10 degrees are example values, not mission requirements.

How it works. Sun and Earth directions come from NAIF SPICE with the DE440 ephemeris and the Moon principal axis (PA) frame, so lunar orientation and libration are included. The horizon at each point is traced over the LOLA elevation models out to 300 km. Sunlight is the mean visible fraction of the Sun disc over hourly epochs, and Earth is visible when any part of its disc is above the horizon.

How it is checked. Every check is written with its target before the data was downloaded, and the results are shown as measured. The SPICE check against Horizons has a worst case of 4.06e-7 degrees against a target of 0.05 degrees. The terrain model matches the LOLA average visibility maps with a Sun mean absolute difference of 1.39 percentage points, but those maps are model outputs, so we treat this as a test of our ray tracing. The check against real sunlight is M1: 37 LROC frames, 200 points, agreement 94.1%, kappa 0.707, flat horizon 56.1%. The DSN window edges differ from Horizons by at most 0.003 minutes at the three edges we sampled.

Limits. Region positions are read from a NASA map picture and the 15 x 15 km region box is an assumption, so results describe that box and not an official site. Earth above the horizon is only an upper bound for a communication link. No power budget or hazard assessment is included.

Tools. JavaScript, SVG and CSS with no libraries and no network calls at run time. Python with SPICE (spiceypy), NumPy and public NASA data for the calculations, run on a small server. Node tests and a script that builds the README table from the result files.

## Use of Super Intelligence (SI)

SI tools were used in this project. An AI coding model wrote the app code, the tests and the calculation scripts, and the author ran and reviewed them. SI also helped draft text, translated the interface into nine languages, and produced scripts that compare the numbers in the README and this form with the result files. Generated JSON files carry a note saying which script and which SI model produced them. The idea of the project and its scope were chosen by the author. Any image or video made with SI carries a visible watermark, audio is labelled as SI generated in its description and metadata, and no NASA logos, flags or mission patches are used.

## NASA Data

NASA JPL Horizons and NAIF SPICE kernels (de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, pck00011.tpc, naif0012.tls and the DSN station kernels): Sun and Earth directions, Moon orientation, station positions. LRO LOLA polar elevation models (ldem_85s_20m, ldem_85s_40m, ldem_80s_80m, ldem_75s_120m, ldem_60s_240m): the terrain horizon. LOLA average visibility maps (AVGVISIB_85S_060M_201608 and AVGVISIB_75S_120M_201608, Sun and Earth): reference for the terrain model check. LROC wide angle camera south pole movie frames and the WAC_POLE_ILL_PCT_SOUTH_100M illumination map: the check against photographs. File names and SHA-256 sums are in the repository (verify/data-sha256.txt).

## Space Agency Partner Data and Other References

No Space Agency Partner data was used. References: Mazarico et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030. Speyerer and Robinson (2013), Persistently illuminated regions at the lunar poles, Icarus 222, 122-136, doi:10.1016/j.icarus.2012.10.010. Smith et al. (2010), Initial observations from the Lunar Orbiter Laser Altimeter, Geophysical Research Letters 37, doi:10.1029/2010GL043751. Artemis III candidate region names and map: NASA, October 2024 release. Code is original and licensed Apache-2.0; no third-party code or images are included.
