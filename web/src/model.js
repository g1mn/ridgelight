// Written with SI (AI coding model) assistance and reviewed by the author.
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

  function round(x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return x;
    const f = Math.pow(10, d);
    return Math.round(x * f) / f;
  }

  /** Accept both M1 key spellings and give one shape. Percent values are 0..100. */
  function normalizeM1(m1) {
    const out = { agreement: null, kappa: null, baseline: null, targetMin: null, targetMet: null };
    if (!m1 || typeof m1 !== 'object') return out;
    const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
    out.agreement = num(m1.agreement_pct);
    if (out.agreement == null) out.agreement = num(m1.agreement_layer_a);
    out.kappa = num(m1.kappa);
    out.baseline = m1.baseline && typeof m1.baseline === 'object' ? num(m1.baseline.agreement_pct) : null;
    if (out.baseline == null) out.baseline = num(m1.baseline_no_terrain_agreement);
    out.targetMin = m1.target && typeof m1.target === 'object' ? num(m1.target.agreement_pct_min) : null;
    out.targetMet = typeof m1.target_met === 'boolean' ? m1.target_met : null;
    return out;
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
        noteKey: null,
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
      if (l1b.mae_sun_pp != null) measuredParts.push(`Sun MAE ${round(l1b.mae_sun_pp, 2)} pp, r ${round(l1b.r_sun, 3)}`);
      if (l1b.mae_earth_pp != null) measuredParts.push(`Earth MAE ${round(l1b.mae_earth_pp, 2)} pp, r ${round(l1b.r_earth, 3)}`);
      const measuredVal = measuredParts.length ? measuredParts.join('; ') : 'Measured';

      const targetParts = [];
      if (l1b.target_mae_sun_pp != null) targetParts.push(`MAE <= ${l1b.target_mae_sun_pp} pp, r >= ${l1b.target_r_sun}`);
      const targetVal = targetParts.length ? targetParts.join(', ') : '-';

      rows.push({
        id: 'l1b',
        titleKey: 'verify.l1b_title',
        noteKey: 'verify.l1b_note',
        comparison: 'Terrain horizon model vs LOLA illumination maps (a model-to-model check of the implementation)',
        n: nVal,
        measured: measuredVal,
        target: targetVal,
        status,
        source: 'verify/l1b-summary.json',
        isError: false
      });
    }

    // Row 3: M1 LROC images vs predicted shadow (N10 shape: agreement_pct, kappa, baseline.agreement_pct,
    // target.agreement_pct_min, target_met; the earlier brief names agreement_layer_a and
    // baseline_no_terrain_agreement are accepted too)
    const m1 = v.m1;
    const m1Norm = normalizeM1(m1);
    if (!m1 || typeof m1 !== 'object') {
      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        noteKey: null,
        comparison: 'LROC wide angle images vs predicted shadow',
        n: '-',
        measured: 'Not measured yet',
        target: '-',
        status: 'not_measured',
        source: 'verify/m1-summary.json',
        isError: false
      });
    } else if (m1.blocked || m1.mode === 'blocked') {
      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        noteKey: null,
        comparison: 'LROC wide angle images vs predicted shadow',
        n: m1.frames != null ? String(m1.frames) : '-',
        measured: `Observation check not done: ${m1.blocked || m1.mode}`,
        target: '-',
        status: 'not_measured',
        source: 'verify/m1-summary.json',
        isError: false
      });
    } else {
      const parts = [];
      if (m1Norm.agreement != null) parts.push(`agreement ${round(m1Norm.agreement, 1)}%`);
      if (m1Norm.kappa != null) parts.push(`kappa ${round(m1Norm.kappa, 3)}`);
      if (m1Norm.baseline != null) parts.push(`no terrain ${round(m1Norm.baseline, 1)}%`);
      let status = 'info';
      if (typeof m1Norm.targetMet === 'boolean') status = m1Norm.targetMet ? 'met' : 'not_met';
      rows.push({
        id: 'm1',
        titleKey: 'verify.m1_title',
        noteKey: 'verify.m1_note',
        comparison: 'LROC wide angle camera frames vs the terrain shadow model at points near the pole (real photographs)',
        n: m1.frames != null ? String(m1.frames) : '-',
        measured: parts.length ? parts.join(', ') : 'Measured',
        target: m1Norm.targetMin != null ? `agreement >= ${m1Norm.targetMin}%, beat no terrain` : '-',
        status,
        source: 'verify/m1-summary.json',
        isError: false
      });
      const yc = m1.year_compare;
      if (yc && typeof yc === 'object' && yc.mae_pp != null) {
        rows.push({
          id: 'm1_year',
          titleKey: 'verify.m1_year_title',
          noteKey: null,
          comparison: 'Share of one year in sunlight, LROC frames vs model',
          n: yc.n != null ? String(yc.n) : '-',
          measured: `MAE ${round(yc.mae_pp, 2)} pp, r ${round(yc.r, 3)}`,
          target: '-',
          status: 'info',
          source: 'verify/m1-summary.json',
          isError: false
        });
      }
    }

    // L2 best points and DSN windows (A scope)
    const l2 = v.l2;
    if (l2 && typeof l2 === 'object' && l2.rank_pairs_total != null) {
      const gains = l2.best_vs_center_hours ? Object.values(l2.best_vs_center_hours).filter((x) => typeof x === 'number') : [];
      const gMin = gains.length ? Math.min(...gains) : null;
      const gMax = gains.length ? Math.max(...gains) : null;
      rows.push({
        id: 'l2',
        titleKey: 'verify.l2_title',
        noteKey: 'verify.l2_note',
        comparison: 'Best point per region and the effect of a 5 day shift of the landing date',
        n: l2.regions != null ? String(l2.regions) : '-',
        measured: `+${gMin} to +${gMax} h vs center; ${l2.rank_changed_combos} of ${l2.rank_pairs_total} rank pairs flipped`,
        target: '-',
        status: 'info',
        source: 'verify/l2-summary.json',
        isError: false
      });
    }
    const dh = v.dsn_horizons;
    if (dh && typeof dh === 'object' && dh.max_diff_min != null) {
      rows.push({
        id: 'dsn',
        titleKey: 'verify.dsn_title',
        noteKey: 'verify.dsn_note',
        comparison: 'DSN station window edges vs Horizons',
        n: dh.n_boundaries != null ? String(dh.n_boundaries) : '-',
        measured: `max ${dh.max_diff_min} min`,
        target: dh.target_max_diff_min != null ? `<= ${dh.target_max_diff_min} min` : '-',
        status: typeof dh.target_met === 'boolean' ? (dh.target_met ? 'met' : 'not_met') : 'info',
        source: 'verify/dsn-horizons-summary.json',
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
   * Normalize the L2 products (A scope): best point per region, landing date calendar,
   * longest shadow, DSN windows. Returns { available: false } when nothing is loaded.
   */
  function normalizeL2(rawL2, verifyL2) {
    const out = {
      available: false,
      summary: verifyL2 && typeof verifyL2 === 'object' ? verifyL2 : null,
      calendar: null,
      dsn: null,
      shadowDefinition: null,
      bySite: {}
    };
    if (!rawL2 || typeof rawL2 !== 'object') return out;
    const regions = rawL2.sites && typeof rawL2.sites === 'object' ? rawL2.sites : {};
    for (const [id, r] of Object.entries(regions)) {
      if (!r || !Array.isArray(r.points) || !r.center || typeof r.best_point_id !== 'string') continue;
      out.bySite[id] = {
        region: r,
        calendar: null,
        shadow: [],
        dsn: null
      };
    }
    const cal = rawL2.calendar;
    if (cal && typeof cal === 'object') {
      out.calendar = {
        period: cal.period || null,
        landing_time_utc: cal.landing_time_utc || null,
        x_hours: cal.x_hours,
        y_earth_pct: cal.y_earth_pct,
        example_values: cal.example_values === true,
        note: cal.note || ''
      };
      for (const cs of Array.isArray(cal.sites) ? cal.sites : []) {
        if (cs && out.bySite[cs.site_id]) {
          out.bySite[cs.site_id].calendar = {
            point_id: cs.point_id,
            dates_ok: Array.isArray(cs.dates_ok) ? cs.dates_ok : [],
            n_dates_ok: typeof cs.n_dates_ok === 'number' ? cs.n_dates_ok : Array.isArray(cs.dates_ok) ? cs.dates_ok.length : 0
          };
        }
      }
    }
    const sh = rawL2.shadow;
    if (sh && typeof sh === 'object') {
      out.shadowDefinition = sh.definition || null;
      for (const row of Array.isArray(sh.rows) ? sh.rows : []) {
        if (row && out.bySite[row.site_id]) out.bySite[row.site_id].shadow.push(row);
      }
    }
    const dsn = rawL2.dsn;
    if (dsn && typeof dsn === 'object') {
      out.dsn = {
        min_elev_deg: dsn.min_elev_deg,
        note: dsn.note || '',
        period: dsn.period || null,
        stations: Array.isArray(dsn.stations) ? dsn.stations : [],
        window_definition: dsn.window_definition || ''
      };
      for (const ds of Array.isArray(dsn.sites) ? dsn.sites : []) {
        if (ds && out.bySite[ds.site_id]) out.bySite[ds.site_id].dsn = ds;
      }
    }
    out.available = Object.keys(out.bySite).length > 0;
    return out;
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
      l2: normalizeL2(null, null),
      m1: normalizeM1(null),
      m1Raw: null,
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
    result.l2 = normalizeL2(rawData.l2, rawData.verify && rawData.verify.l2);
    const m1raw = rawData.verify && rawData.verify.m1;
    if (m1raw && typeof m1raw === 'object' && !m1raw.blocked && m1raw.mode !== 'blocked') {
      result.m1Raw = m1raw;
      result.m1 = normalizeM1(m1raw);
    }

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
    normalizeL2,
    normalizeM1,
    normalizeData
  };
})();
