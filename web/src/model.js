// web/src/model.js
// Classic script attaching normalized data model and math functions to globalThis.LW.
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  const R_MOON_KM = 1737.4;

  /**
   * Great circle distance between two points on the Moon (radius 1737.4 km).
   * Angles in degrees.
   */
  function greatCircleDistanceKm(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const sinHalfPhi = Math.sin(deltaPhi / 2);
    const sinHalfLambda = Math.sin(deltaLambda / 2);

    const a = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;
    const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
    return R_MOON_KM * c;
  }

  /**
   * Polar stereographic projection from the lunar South Pole (-90 deg).
   * Center (cx, cy) corresponds to the South Pole.
   * Longitude 0 deg points up (North/top).
   * Longitude 90 deg East points right (East).
   * Radius increases as latitude moves away from South Pole towards the equator.
   */
  function polarStereographicProject(latDeg, lonDeg, boundLatDeg, radiusPx, cx, cy) {
    // Co-latitude theta from South Pole (-90): at -90, theta = 0; at equator, theta = 90.
    const theta = (90 + latDeg) / 2;
    const thetaBound = (90 + boundLatDeg) / 2;

    const tanTheta = Math.tan((theta * Math.PI) / 180);
    const tanBound = Math.tan((thetaBound * Math.PI) / 180);

    const r = tanBound > 0 ? radiusPx * (tanTheta / tanBound) : 0;
    const lambda = (lonDeg * Math.PI) / 180;

    const x = cx + r * Math.sin(lambda);
    const y = cy - r * Math.cos(lambda);

    return { x, y, r };
  }

  /**
   * Inverse polar stereographic projection to recover lat/lon from x, y.
   */
  function polarStereographicUnproject(x, y, boundLatDeg, radiusPx, cx, cy) {
    const dx = x - cx;
    const dy = cy - y; // inverted y because up is positive
    const r = Math.hypot(dx, dy);

    const thetaBound = (90 + boundLatDeg) / 2;
    const tanBound = Math.tan((thetaBound * Math.PI) / 180);

    const tanTheta = (r / radiusPx) * tanBound;
    const theta = (Math.atan(tanTheta) * 180) / Math.PI;
    const latDeg = 2 * theta - 90;

    let lonDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (lonDeg < -180) lonDeg += 360;
    if (lonDeg > 180) lonDeg -= 360;

    return { latDeg, lonDeg };
  }

  /**
   * Sky dome horizontal projection.
   * Center is zenith (el = 90 deg).
   * Outer circle is horizon (el = 0 deg).
   * Azimuth 0 deg is North (top).
   * Azimuth 90 deg is East (right).
   */
  function skyDomeProject(azDeg, elDeg, radiusPx, cx, cy) {
    const clampedEl = Math.max(-90, Math.min(90, elDeg));
    // Linear radius from zenith (el = 90 -> r = 0, el = 0 -> r = radiusPx)
    const r = radiusPx * ((90 - clampedEl) / 90);
    const azRad = (azDeg * Math.PI) / 180;

    const x = cx + r * Math.sin(azRad);
    const y = cy - r * Math.cos(azRad);

    return { x, y, r };
  }

  /**
   * Interpolate terrain horizon elevation at a given azimuth.
   * If terrain data is missing or empty, returns 0.
   */
  function getHorizonElevation(horizon, azDeg) {
    if (!horizon || !Array.isArray(horizon.elev_deg) || horizon.elev_deg.length === 0) {
      return 0;
    }
    const elev = horizon.elev_deg;
    const n = elev.length;
    const normAz = ((azDeg % 360) + 360) % 360;
    const step = horizon.az_step_deg || 360 / n;

    const idx = (normAz / step) % n;
    const i0 = Math.floor(idx) % n;
    const i1 = (i0 + 1) % n;
    const frac = idx - Math.floor(idx);

    return elev[i0] * (1 - frac) + elev[i1] * frac;
  }

  /**
   * Visibility test: body center elevation > terrain horizon elevation at azimuth.
   */
  function isBodyVisible(azDeg, elDeg, horizon) {
    const h = getHorizonElevation(horizon, azDeg);
    return elDeg > h;
  }

  /**
   * Find next sunset from currentIndex.
   * A sunset is the first step where the sun transitions from above horizon to on or below horizon.
   * Returns { index, hours } or null if none in loaded track.
   */
  function findNextSunset(track, horizon, currentIndex) {
    if (!track || !track.sun || !Array.isArray(track.sun.el_deg)) {
      return null;
    }
    const n = track.n || track.sun.el_deg.length;
    const startIdx = typeof currentIndex === 'number' ? Math.max(0, currentIndex) : 0;
    if (startIdx >= n) return null;

    const stepMin = track.step_minutes || 60;

    // Check visibility states from startIdx forward
    let currentlyVisible = isBodyVisible(track.sun.az_deg[startIdx], track.sun.el_deg[startIdx], horizon);

    for (let i = startIdx + 1; i < n; i++) {
      const vis = isBodyVisible(track.sun.az_deg[i], track.sun.el_deg[i], horizon);
      if (currentlyVisible && !vis) {
        // Sunset transition!
        const hours = ((i - startIdx) * stepMin) / 60;
        return { index: i, hours };
      }
      currentlyVisible = vis;
    }
    return null;
  }

  /**
   * Find next earthset from currentIndex.
   * Returns { index, hours } or null if none in loaded track.
   */
  function findNextEarthset(track, horizon, currentIndex) {
    if (!track || !track.earth || !Array.isArray(track.earth.el_deg)) {
      return null;
    }
    const n = track.n || track.earth.el_deg.length;
    const startIdx = typeof currentIndex === 'number' ? Math.max(0, currentIndex) : 0;
    if (startIdx >= n) return null;

    const stepMin = track.step_minutes || 60;

    let currentlyVisible = isBodyVisible(track.earth.az_deg[startIdx], track.earth.el_deg[startIdx], horizon);

    for (let i = startIdx + 1; i < n; i++) {
      const vis = isBodyVisible(track.earth.az_deg[i], track.earth.el_deg[i], horizon);
      if (currentlyVisible && !vis) {
        const hours = ((i - startIdx) * stepMin) / 60;
        return { index: i, hours };
      }
      currentlyVisible = vis;
    }
    return null;
  }

  /**
   * Find nearest site from given coordinates.
   */
  function findNearestSite(latDeg, lonDeg, sites) {
    if (!Array.isArray(sites) || sites.length === 0) {
      return null;
    }
    let nearest = null;
    let minD = Infinity;

    for (const site of sites) {
      const d = greatCircleDistanceKm(latDeg, lonDeg, site.lat_deg, site.lon_deg);
      if (d < minD) {
        minD = d;
        nearest = site;
      }
    }

    return nearest ? { site: nearest, distanceKm: minD } : null;
  }

  /**
   * Normalize a single site record according to data contract.
   */
  function normalizeSite(rawSite) {
    if (!rawSite || typeof rawSite !== 'object') return null;

    const siteId = String(rawSite.site_id || rawSite.id || '').trim();
    if (!siteId) return null;

    const name = String(rawSite.name || siteId).trim();
    const kind = rawSite.kind === 'landing_site' ? 'landing_site' : 'artemis3_region';
    const latDeg = Number(rawSite.lat_deg);
    const lonDeg = Number(rawSite.lon_deg);

    if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) {
      return null;
    }

    // Determine approx
    const knownQualities = ['approx_from_public_map', 'published_text', 'landing_report'];
    let coordQuality = typeof rawSite.coord_quality === 'string' ? rawSite.coord_quality.trim() : '';
    let approx = false;

    if (typeof rawSite.approx === 'boolean') {
      approx = rawSite.approx;
    } else if (coordQuality) {
      if (!knownQualities.includes(coordQuality)) {
        // Unknown quality: treat approx as true, preserve original string
        approx = true;
      } else {
        approx = coordQuality.startsWith('approx_');
      }
    } else {
      approx = true;
    }

    const readAt = String(rawSite.read_at_utc || rawSite.read_at_kst || '').trim();
    const sourceUrl = String(rawSite.source_url || '').trim();
    const sourceNote = String(rawSite.source_note || '').trim();

    return {
      site_id: siteId,
      id: siteId,
      name,
      kind,
      lat_deg: latDeg,
      lon_deg: lonDeg,
      coord_quality: coordQuality,
      approx,
      read_at: readAt,
      source_url: sourceUrl,
      source_note: sourceNote,
      raw: rawSite
    };
  }

  /**
   * Normalize verification data.
   */
  function normalizeVerify(rawVerify, mapValues) {
    const v = rawVerify || {};
    const rows = [];

    // Row 1: L1(a) SPICE implementation check (matches Horizons) - ALWAYS present
    const l1a = v.l1a;
    if (!l1a || typeof l1a !== 'object') {
      rows.push({
        id: 'l1a',
        titleKey: 'verify.l1a_title',
        noteKey: 'verify.l1a_note',
        comparison: 'SPICE implementation vs JPL Horizons ephemerides',
        n: '-',
        measured: 'Not measured yet',
        target: '-',
        status: 'not_measured',
        source: 'verify/l1a-summary.json',
        isError: false
      });
    } else {
      const hasMax = typeof l1a.max_sep_deg === 'number';
      const hasMed = typeof l1a.median_sep_deg === 'number';
      if (!hasMax || !hasMed) {
        rows.push({
          id: 'l1a',
          titleKey: 'verify.l1a_title',
          noteKey: 'verify.l1a_note',
          comparison: 'SPICE implementation vs JPL Horizons ephemerides',
          n: '-',
          measured: 'Malformed data',
          target: '-',
          status: 'not_met',
          source: 'verify/l1a-summary.json',
          isError: true
        });
      } else {
        const nVal = l1a.n_pairs != null ? String(l1a.n_pairs) : '-';
        const targetVal = l1a.target_max_sep_deg != null ? `${l1a.target_max_sep_deg} deg` : '-';
        const measuredVal = `max ${l1a.max_sep_deg} deg, med ${l1a.median_sep_deg} deg`;

        let status = 'met';
        if (l1a.target_max_sep_deg != null && l1a.max_sep_deg > l1a.target_max_sep_deg) {
          status = 'not_met';
        }

        rows.push({
          id: 'l1a',
          titleKey: 'verify.l1a_title',
          noteKey: 'verify.l1a_note',
          comparison: 'SPICE implementation vs JPL Horizons ephemerides',
          n: nVal,
          measured: measuredVal,
          target: targetVal,
          status,
          source: 'verify/l1a-summary.json',
          isError: false
        });
      }
    }

    // Row 2: L1(b) Terrain model vs LOLA average visibility maps
    const l1b = v.l1b;
    if (!l1b || typeof l1b !== 'object') {
      rows.push({
        id: 'l1b',
        titleKey: 'verify.l1b_title',
        comparison: 'Terrain horizon model vs LOLA illumination maps',
        n: '-',
        measured: 'Not measured yet',
        target: '-',
        status: 'not_measured',
        source: 'verify/l1b-summary.json',
        isError: false
      });
    } else {
      const nVal = l1b.n != null ? String(l1b.n) : '-';
      const status = l1b.gate === 'pass' ? 'met' : l1b.gate === 'fail' ? 'not_met' : 'info';
      const measuredParts = [];
      if (l1b.mae_sun_pp != null) measuredParts.push(`Sun MAE ${l1b.mae_sun_pp} pp`);
      if (l1b.r_sun != null) measuredParts.push(`r ${l1b.r_sun}`);
      const measuredVal = measuredParts.length ? measuredParts.join(', ') : 'Measured';

      const targetParts = [];
      if (l1b.target_mae_sun_pp != null) targetParts.push(`MAE <= ${l1b.target_mae_sun_pp} pp`);
      const targetVal = targetParts.length ? targetParts.join(', ') : '-';

      rows.push({
        id: 'l1b',
        titleKey: 'verify.l1b_title',
        comparison: 'Terrain horizon model vs LOLA illumination maps',
        n: nVal,
        measured: measuredVal,
        target: targetVal,
        status,
        source: 'verify/l1b-summary.json',
        isError: false
      });
    }

    // Row 3: M1 LROC images vs predicted shadow
    const m1 = v.m1;
    if (!m1 || typeof m1 !== 'object') {
      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        comparison: 'LROC NAC images vs predicted shadow polygons',
        n: '-',
        measured: 'Not measured yet',
        target: '-',
        status: 'not_measured',
        source: 'verify/m1-summary.json',
        isError: false
      });
    } else if (m1.blocked) {
      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        comparison: 'LROC NAC images vs predicted shadow polygons',
        n: m1.frames != null ? String(m1.frames) : '-',
        measured: `Observation check not done: ${m1.blocked}`,
        target: '-',
        status: 'not_measured',
        source: 'verify/m1-summary.json',
        isError: false
      });
    } else {
      const nVal = m1.frames != null ? String(m1.frames) : '-';
      const measuredParts = [];
      if (m1.kappa != null) measuredParts.push(`kappa ${m1.kappa}`);
      if (m1.agreement_layer_a != null) measuredParts.push(`agreement ${m1.agreement_layer_a}`);
      const measuredVal = measuredParts.length ? measuredParts.join(', ') : 'Measured';

      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        comparison: 'LROC NAC images vs predicted shadow polygons',
        n: nVal,
        measured: measuredVal,
        target: '-',
        status: 'met',
        source: 'verify/m1-summary.json',
        isError: false
      });
    }

    // Row 4: If map-values.json present, add LOLA map values row
    if (mapValues && typeof mapValues === 'object') {
      const siteList = Array.isArray(mapValues.sites) ? mapValues.sites : [];
      rows.push({
        id: 'map_values',
        titleKey: 'verify.map_values_title',
        comparison: 'LOLA map values read at sites (no terrain model in this build)',
        n: String(siteList.length),
        measured: siteList.length > 0 ? `${siteList.length} sites extracted` : 'None',
        target: '-',
        status: 'info',
        source: 'data/map-values.json',
        isError: false
      });
    }

    return rows;
  }

  /**
   * Main entry: normalize raw globalThis.LW_DATA.
   */
  function normalizeData(rawData) {
    const errors = [];
    const result = {
      sites: [],
      sitesMap: {},
      horizon: {},
      tracks: {},
      mapValues: null,
      mapValuesBySite: {},
      verifyRows: [],
      sources: {},
      errors
    };

    if (!rawData || typeof rawData !== 'object') {
      result.verifyRows = normalizeVerify(null, null);
      return result;
    }

    result.sources = rawData.sources || {};

    // 1. Parse sites
    let rawSitesList = [];
    if (Array.isArray(rawData)) {
      rawSitesList = rawData;
    } else if (Array.isArray(rawData.sites)) {
      rawSitesList = rawData.sites;
    } else if (rawData.sites && Array.isArray(rawData.sites.sites)) {
      rawSitesList = rawData.sites.sites;
    }

    for (const rawSite of rawSitesList) {
      const normalized = normalizeSite(rawSite);
      if (normalized) {
        result.sites.push(normalized);
        result.sitesMap[normalized.site_id] = normalized;
      }
    }

    // 2. Horizon
    if (rawData.horizon && typeof rawData.horizon === 'object') {
      result.horizon = rawData.horizon;
    }

    // 3. Tracks
    if (rawData.tracks && typeof rawData.tracks === 'object') {
      result.tracks = rawData.tracks;
    }

    // 4. Map values
    if (rawData.map_values && typeof rawData.map_values === 'object') {
      result.mapValues = rawData.map_values;
      if (Array.isArray(rawData.map_values.sites)) {
        for (const mv of rawData.map_values.sites) {
          if (mv && mv.site_id) {
            result.mapValuesBySite[mv.site_id] = mv;
          }
        }
      }
    }

    // 5. Verification rows
    result.verifyRows = normalizeVerify(rawData.verify, result.mapValues);

    return result;
  }

  // Export on LW.model
  LW.model = {
    R_MOON_KM,
    greatCircleDistanceKm,
    polarStereographicProject,
    polarStereographicUnproject,
    skyDomeProject,
    getHorizonElevation,
    isBodyVisible,
    findNextSunset,
    findNextEarthset,
    findNearestSite,
    normalizeSite,
    normalizeVerify,
    normalizeData
  };
})();
