// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/map.js
// South Pole Polar Stereographic Map view
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class MapView {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.selectedSiteId = null;
      this.customPoint = null; // { lat, lon, nearestSite, distanceKm }
      this.onSelectSite = options.onSelectSite || (() => {});
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));

      this.renderSkeleton();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div class="card map-card">
          <div class="card-header">
            <h2 id="map-heading" class="card-title"></h2>
            <p id="map-desc" class="card-desc"></p>
          </div>
          <div class="map-body">
            <div class="map-svg-wrap">
              <svg id="south-pole-map-svg" class="map-svg" viewBox="0 0 500 500" width="100%" height="100%" role="img" aria-labelledby="map-heading">
                <defs>
                  <radialGradient id="map-bg-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="var(--map-glow-start)" />
                    <stop offset="100%" stop-color="var(--map-glow-end)" />
                  </radialGradient>
                </defs>
                <rect width="500" height="500" fill="url(#map-bg-glow)" rx="8" />
                <g id="map-grid-layer"></g>
                <g id="map-pins-layer"></g>
                <g id="map-labels-layer"></g>
              </svg>
            </div>
            <div class="map-sidebar">
              <div class="form-group coord-input-group">
                <h3 id="coord-heading" class="subheading"></h3>
                <form id="coord-form" class="coord-form" novalidate>
                  <div class="input-row">
                    <label for="input-lat" id="label-lat"></label>
                    <input type="number" id="input-lat" step="any" min="-90" max="-60" placeholder="-85.0" required />
                  </div>
                  <div class="input-row">
                    <label for="input-lon" id="label-lon"></label>
                    <input type="number" id="input-lon" step="any" min="-180" max="360" placeholder="0.0" required />
                  </div>
                  <button type="submit" id="btn-apply-coord" class="btn btn-primary"></button>
                  <div id="coord-feedback" class="coord-feedback" role="alert" aria-live="polite"></div>
                </form>
              </div>
              <div class="site-list-group">
                <h3 id="sites-heading" class="subheading"></h3>
                <div id="site-list" class="site-list" role="listbox" aria-label="Landing site selection"></div>
              </div>
            </div>
          </div>
          <div id="map-summary" class="view-summary" aria-live="polite"></div>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const form = this.container.querySelector('#coord-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleCoordSubmit();
        });
      }

      const siteList = this.container.querySelector('#site-list');
      if (siteList) {
        siteList.addEventListener('keydown', (e) => {
          this.handleListKeydown(e);
        });
      }
    }

    handleCoordSubmit() {
      const latInput = this.container.querySelector('#input-lat');
      const lonInput = this.container.querySelector('#input-lon');
      const feedback = this.container.querySelector('#coord-feedback');

      const lat = parseFloat(latInput.value);
      let lon = parseFloat(lonInput.value);

      if (isNaN(lat) || lat < -90 || lat > -60) {
        feedback.textContent = 'Invalid latitude: must be between -90 and -60.';
        feedback.className = 'coord-feedback error';
        return;
      }
      if (isNaN(lon) || lon < -180 || lon > 360) {
        feedback.textContent = 'Invalid longitude: must be between -180 and 360.';
        feedback.className = 'coord-feedback error';
        return;
      }

      // Normalize longitude to -180 .. 180 for distance calculations if needed
      let normLon = lon;
      if (normLon > 180) normLon -= 360;

      const nearest = LW.model.findNearestSite(lat, normLon, this.data ? this.data.sites : []);

      this.customPoint = {
        lat,
        lon,
        nearest
      };

      const noPrecomputedMsg = this.t('common.empty_no_precomputed');
      let nearestMsg = '';
      if (nearest) {
        const dStr = this.formatNumber(nearest.distanceKm.toFixed(1));
        nearestMsg = this.t('map.nearest_site', {
          name: nearest.site.name,
          distance: dStr
        });
      }

      feedback.textContent = `${noPrecomputedMsg}. ${nearestMsg}`;
      feedback.className = 'coord-feedback info';

      this.drawMap();
      this.updateSummary();
    }

    handleListKeydown(e) {
      const buttons = Array.from(this.container.querySelectorAll('.site-list-btn'));
      const activeIdx = buttons.findIndex((btn) => btn === document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (activeIdx + 1) % buttons.length;
        if (buttons[nextIdx]) buttons[nextIdx].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (activeIdx - 1 + buttons.length) % buttons.length;
        if (buttons[prevIdx]) buttons[prevIdx].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (activeIdx >= 0 && buttons[activeIdx]) {
          e.preventDefault();
          buttons[activeIdx].click();
        }
      }
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;

      this.container.querySelector('#map-heading').textContent = t('map.title');
      this.container.querySelector('#map-desc').textContent = t('map.description');
      this.container.querySelector('#coord-heading').textContent = t('map.custom_coord_title');
      this.container.querySelector('#label-lat').textContent = t('map.lat_label');
      this.container.querySelector('#label-lon').textContent = t('map.lon_label');
      this.container.querySelector('#btn-apply-coord').textContent = t('map.apply_coord');
      this.container.querySelector('#sites-heading').textContent = t('map.select_site_label');

      this.renderSiteList();
      this.drawMap();
      this.updateSummary();
    }

    setData(data, selectedSiteId) {
      this.data = data;
      this.selectedSiteId = selectedSiteId;

      this.renderSiteList();
      this.drawMap();
      this.updateSummary();
    }

    selectSite(siteId) {
      this.selectedSiteId = siteId;
      this.renderSiteList();
      this.drawMap();
      this.updateSummary();
    }

    getBoundLat() {
      const sites = (this.data && this.data.sites) || [];
      if (sites.length === 0) return -85;

      let maxLat = -90;
      for (const s of sites) {
        if (s.lat_deg > maxLat) maxLat = s.lat_deg;
      }
      // 1 degree further out towards equator
      const candidate = maxLat + 1.0;
      return Math.min(-60, Math.max(-85, candidate));
    }

    drawMap() {
      const svg = this.container.querySelector('#south-pole-map-svg');
      const gridLayer = svg.querySelector('#map-grid-layer');
      const pinsLayer = svg.querySelector('#map-pins-layer');
      const labelsLayer = svg.querySelector('#map-labels-layer');

      gridLayer.innerHTML = '';
      pinsLayer.innerHTML = '';
      labelsLayer.innerHTML = '';

      const cx = 250;
      const cy = 250;
      const maxR = 210;

      const boundLat = this.getBoundLat();

      // 1. Grid: concentric latitude circles
      const latSteps = [-88, -85, -80, -75, -70, -65, -60].filter((l) => l >= -90 && l <= boundLat);
      if (!latSteps.includes(boundLat)) {
        latSteps.push(boundLat);
      }

      for (const lat of latSteps) {
        const proj = LW.model.polarStereographicProject(lat, 0, boundLat, maxR, cx, cy);
        const r = proj.r;
        if (r > 0 && r <= maxR) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', cx);
          circle.setAttribute('cy', cy);
          circle.setAttribute('r', r);
          circle.setAttribute('class', 'map-lat-circle');
          gridLayer.appendChild(circle);

          // Lat label along 45 deg radial
          const lblPos = LW.model.polarStereographicProject(lat, 45, boundLat, maxR, cx, cy);
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', lblPos.x + 3);
          text.setAttribute('y', lblPos.y - 3);
          text.setAttribute('class', 'map-grid-label');
          text.textContent = `${Math.abs(Math.round(lat))} S`;
          gridLayer.appendChild(text);
        }
      }

      // Outer boundary circle
      const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outerCircle.setAttribute('cx', cx);
      outerCircle.setAttribute('cy', cy);
      outerCircle.setAttribute('r', maxR);
      outerCircle.setAttribute('class', 'map-outer-circle');
      gridLayer.appendChild(outerCircle);

      // Longitude radials every 30 deg
      for (let lon = 0; lon < 360; lon += 30) {
        const radPos = LW.model.polarStereographicProject(boundLat, lon, boundLat, maxR, cx, cy);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx);
        line.setAttribute('y1', cy);
        line.setAttribute('x2', radPos.x);
        line.setAttribute('y2', radPos.y);
        line.setAttribute('class', 'map-lon-line');
        gridLayer.appendChild(line);
      }

      // Cardinal Longitude labels: 0, 90E, 180, 90W
      const cardinalDefs = [
        { lon: 0, label: '0', dx: 0, dy: -8, anchor: 'middle' },
        { lon: 90, label: '90 E', dx: 10, dy: 4, anchor: 'start' },
        { lon: 180, label: '180', dx: 0, dy: 16, anchor: 'middle' },
        { lon: 270, label: '90 W', dx: -10, dy: 4, anchor: 'end' }
      ];

      for (const card of cardinalDefs) {
        const pos = LW.model.polarStereographicProject(boundLat, card.lon, boundLat, maxR, cx, cy);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x + card.dx);
        text.setAttribute('y', pos.y + card.dy);
        text.setAttribute('text-anchor', card.anchor);
        text.setAttribute('class', 'map-cardinal-label');
        text.textContent = card.label;
        gridLayer.appendChild(text);
      }

      // South Pole center marker
      const poleMark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      poleMark.setAttribute('cx', cx);
      poleMark.setAttribute('cy', cy);
      poleMark.setAttribute('r', 2);
      poleMark.setAttribute('class', 'map-pole-dot');
      gridLayer.appendChild(poleMark);

      // 2. Pins
      const sites = (this.data && this.data.sites) || [];
      if (sites.length === 0) {
        const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        emptyText.setAttribute('x', cx);
        emptyText.setAttribute('y', cy + 40);
        emptyText.setAttribute('text-anchor', 'middle');
        emptyText.setAttribute('class', 'map-empty-text');
        emptyText.textContent = this.t('common.empty_no_site_data');
        pinsLayer.appendChild(emptyText);
        return;
      }

      for (const site of sites) {
        const proj = LW.model.polarStereographicProject(site.lat_deg, site.lon_deg, boundLat, maxR, cx, cy);
        const isSelected = site.site_id === this.selectedSiteId;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `map-pin ${site.kind} ${isSelected ? 'selected' : ''}`);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${site.name} (${site.kind})`);
        g.dataset.siteId = site.site_id;
        const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        tip.textContent = site.approx ? `${site.name} (${this.t('common.approx_label')})` : site.name;
        g.appendChild(tip);

        // Selection ring
        if (isSelected) {
          const selRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          selRing.setAttribute('cx', proj.x);
          selRing.setAttribute('cy', proj.y);
          selRing.setAttribute('r', 11);
          selRing.setAttribute('class', 'map-pin-selection-ring');
          g.appendChild(selRing);
        }

        // Shape by kind: circle for landing_site, triangle for artemis3_region
        if (site.kind === 'landing_site') {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', proj.x);
          circle.setAttribute('cy', proj.y);
          circle.setAttribute('r', 5);
          circle.setAttribute('class', 'map-pin-shape');
          g.appendChild(circle);
        } else {
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          const s = 6;
          const p1 = `${proj.x},${proj.y - s}`;
          const p2 = `${proj.x - s},${proj.y + s * 0.8}`;
          const p3 = `${proj.x + s},${proj.y + s * 0.8}`;
          poly.setAttribute('points', `${p1} ${p2} ${p3}`);
          poly.setAttribute('class', 'map-pin-shape');
          g.appendChild(poly);
        }

        // Label only on the selected pin (all nine labels overlap near the pole); the list names every site
        if (isSelected) {
          const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          const flip = proj.x > cx + 80; // keep the label inside the map on the right side
          lbl.setAttribute('x', flip ? proj.x - 15 : proj.x + 14);
          lbl.setAttribute('y', proj.y + 4);
          if (flip) lbl.setAttribute('text-anchor', 'end');
          lbl.setAttribute('class', 'map-pin-label');
          let labelText = site.name;
          if (site.approx) {
            labelText += ` (${this.t('common.approx_label')})`;
          }
          lbl.textContent = labelText;
          labelsLayer.appendChild(lbl);

          // LOLA map values if present
          const mv = this.data && this.data.mapValuesBySite && this.data.mapValuesBySite[site.site_id];
          if (mv && (mv.sun_visible_pct != null || mv.earth_visible_pct != null)) {
            const mvLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            mvLbl.setAttribute('x', flip ? proj.x - 15 : proj.x + 14);
            mvLbl.setAttribute('y', proj.y + 16);
            if (flip) mvLbl.setAttribute('text-anchor', 'end');
            mvLbl.setAttribute('class', 'map-pin-val-label');
            const parts = [];
            if (mv.sun_visible_pct != null) parts.push(`Sun ${mv.sun_visible_pct}%`);
            if (mv.earth_visible_pct != null) parts.push(`Earth ${mv.earth_visible_pct}%`);
            parts.push(`(${this.t('map.lola_map_value')})`);
            mvLbl.textContent = parts.join(', ');
            labelsLayer.appendChild(mvLbl);
          }
        }

        g.addEventListener('click', () => {
          this.onSelectSite(site.site_id);
        });
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.onSelectSite(site.site_id);
          }
        });

        pinsLayer.appendChild(g);
      }

      // 3. Custom direct coordinate pin if placed
      if (this.customPoint) {
        const cp = this.customPoint;
        const proj = LW.model.polarStereographicProject(cp.lat, cp.lon, boundLat, maxR, cx, cy);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'map-pin custom-point');

        // Diamond shape
        const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const s = 7;
        diamond.setAttribute('points', `${proj.x},${proj.y - s} ${proj.x + s},${proj.y} ${proj.x},${proj.y + s} ${proj.x - s},${proj.y}`);
        diamond.setAttribute('class', 'map-custom-shape');
        g.appendChild(diamond);

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', proj.x + 10);
        lbl.setAttribute('y', proj.y + 4);
        lbl.setAttribute('class', 'map-custom-label');
        lbl.textContent = this.t('map.legend_custom');
        labelsLayer.appendChild(lbl);

        pinsLayer.appendChild(g);
      }
    }

    renderSiteList() {
      const listEl = this.container.querySelector('#site-list');
      listEl.innerHTML = '';

      const sites = (this.data && this.data.sites) || [];
      if (sites.length === 0) {
        listEl.innerHTML = `<div class="empty-state">${this.t('common.empty_no_site_data')}</div>`;
        return;
      }

      for (const site of sites) {
        const isSelected = site.site_id === this.selectedSiteId;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `site-list-btn ${isSelected ? 'active' : ''}`;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        btn.dataset.siteId = site.site_id;

        let nameHtml = `<span class="site-name">${site.name}</span>`;
        if (site.approx) {
          nameHtml += ` <span class="badge approx-badge">${this.t('common.approx_label')}</span>`;
        }
        const coordsHtml = `<span class="site-coords">${site.lat_deg.toFixed(2)} S, ${site.lon_deg.toFixed(2)} E</span>`;

        btn.innerHTML = `${nameHtml} ${coordsHtml}`;
        btn.addEventListener('click', () => {
          this.onSelectSite(site.site_id);
        });

        listEl.appendChild(btn);
      }
    }

    updateSummary() {
      const summaryEl = this.container.querySelector('#map-summary');
      const sites = (this.data && this.data.sites) || [];

      if (sites.length === 0) {
        summaryEl.textContent = this.t('common.empty_no_site_data');
        return;
      }

      const activeSite = sites.find((s) => s.site_id === this.selectedSiteId) || sites[0];
      if (!activeSite) {
        summaryEl.textContent = this.t('common.empty_summary');
        return;
      }

      const mv = this.data && this.data.mapValuesBySite && this.data.mapValuesBySite[activeSite.site_id];
      const track = this.data && this.data.tracks && this.data.tracks[activeSite.site_id];
      const hz = this.data && this.data.horizon && this.data.horizon[activeSite.site_id];
      const sunShare = LW.model.visibleShare ? LW.model.visibleShare(track, hz, 'sun') : null;
      const earthShare = LW.model.visibleShare ? LW.model.visibleShare(track, hz, 'earth') : null;
      if (!mv && sunShare != null && earthShare != null && track.start_utc) {
        // No LOLA map value at the site points: show the share of hours from our model over the loaded track
        const t0 = Date.parse(track.start_utc);
        const n = track.n || track.sun.el_deg.length;
        const t1 = t0 + (n - 1) * (track.step_minutes || 60) * 60000;
        summaryEl.textContent = this.t('map.live_summary_model', {
          name: activeSite.name,
          lat: `${this.formatNumber(activeSite.lat_deg.toFixed(3))} deg`,
          lon: `${this.formatNumber(activeSite.lon_deg.toFixed(3))} deg`,
          // non-breaking hyphens keep each date on one line
          start: new Date(t0).toISOString().slice(0, 10).replace(/-/g, '\u2011'),
          end: new Date(t1).toISOString().slice(0, 10).replace(/-/g, '\u2011'),
          sun: `${this.formatNumber((sunShare * 100).toFixed(1))}%`,
          earth: `${this.formatNumber((earthShare * 100).toFixed(1))}%`
        });
        return;
      }
      const sunStr = mv && mv.sun_visible_pct != null ? `${mv.sun_visible_pct}%` : this.t('common.na');
      const earthStr = mv && mv.earth_visible_pct != null ? `${mv.earth_visible_pct}%` : this.t('common.na');

      const text = this.t('map.live_summary', {
        name: activeSite.name,
        lat: `${this.formatNumber(activeSite.lat_deg.toFixed(3))} deg`,
        lon: `${this.formatNumber(activeSite.lon_deg.toFixed(3))} deg`,
        sun: sunStr,
        earth: earthStr
      });

      summaryEl.textContent = text;
    }
  }

  LW.MapView = MapView;
})();
