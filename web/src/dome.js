// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/dome.js
// Sky Dome local horizontal projection view
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class DomeView {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.selectedSiteId = null;
      this.timeIndex = options.initialTimeIndex || 0;
      this.onTimeChange = options.onTimeChange || (() => {});
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));

      this.renderSkeleton();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div class="card dome-card">
          <div class="card-header">
            <h2 id="dome-heading" class="card-title"></h2>
            <p id="dome-desc" class="card-desc"></p>
            <p id="dome-method" class="card-method-note"></p>
          </div>
          <div class="dome-body">
            <div class="dome-svg-wrap">
              <svg id="sky-dome-svg" class="dome-svg" viewBox="0 0 500 500" width="100%" height="100%" role="img" aria-labelledby="dome-heading">
                <defs>
                  <pattern id="horizon-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="8" stroke="var(--hatch-color)" stroke-width="1.5" />
                  </pattern>
                  <radialGradient id="dome-sky-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="var(--dome-sky-center)" />
                    <stop offset="100%" stop-color="var(--dome-sky-edge)" />
                  </radialGradient>
                </defs>
                <circle cx="250" cy="250" r="200" fill="url(#dome-sky-glow)" />
                <g id="dome-grid-layer"></g>
                <g id="dome-horizon-layer"></g>
                <g id="dome-tracks-layer"></g>
                <g id="dome-bodies-layer"></g>
                <g id="dome-labels-layer"></g>
              </svg>
            </div>
            <div class="dome-controls">
              <div class="time-slider-box">
                <div class="time-header-row">
                  <label for="time-slider" id="label-time-slider" class="subheading"></label>
                  <span id="current-epoch-val" class="epoch-badge"></span>
                </div>
                <input type="range" id="time-slider" class="time-slider" min="0" max="0" value="0" aria-label="Time index slider" />
                <div class="slider-step-indicator">
                  <span id="slider-start-label">0</span>
                  <span id="slider-end-label">0</span>
                </div>
              </div>

              <div class="dome-status-grid">
                <div class="status-card sun-status-card">
                  <div class="status-head">
                    <span class="status-icon sun-icon" aria-hidden="true"></span>
                    <span id="sun-status-title" class="status-title"></span>
                  </div>
                  <div id="sun-visibility-val" class="status-badge"></div>
                  <div class="status-details">
                    <div class="detail-row"><span id="lbl-sun-el">El:</span> <span id="sun-el-val" class="detail-val">-</span></div>
                    <div class="detail-row"><span id="lbl-sun-az">Az:</span> <span id="sun-az-val" class="detail-val">-</span></div>
                    <div class="detail-row" id="row-disk-fraction"><span id="lbl-disk-fraction">Disk:</span> <span id="disk-fraction-val" class="detail-val">-</span></div>
                    <div class="detail-row highlight-row"><span id="lbl-next-sunset">Next sunset:</span> <span id="next-sunset-val" class="detail-val">-</span></div>
                  </div>
                </div>

                <div class="status-card earth-status-card">
                  <div class="status-head">
                    <span class="status-icon earth-icon" aria-hidden="true"></span>
                    <span id="earth-status-title" class="status-title"></span>
                  </div>
                  <div id="earth-visibility-val" class="status-badge"></div>
                  <div class="status-details">
                    <div class="detail-row"><span id="lbl-earth-el">El:</span> <span id="earth-el-val" class="detail-val">-</span></div>
                    <div class="detail-row"><span id="lbl-earth-az">Az:</span> <span id="earth-az-val" class="detail-val">-</span></div>
                    <div class="detail-row highlight-row"><span id="lbl-next-earthset">Next earthset:</span> <span id="next-earthset-val" class="detail-val">-</span></div>
                  </div>
                </div>
              </div>

              <div id="terrain-notice-box" class="terrain-notice-box"></div>
            </div>
          </div>
          <div id="dome-summary" class="view-summary" aria-live="polite"></div>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const slider = this.container.querySelector('#time-slider');
      if (slider) {
        slider.addEventListener('input', (e) => {
          this.timeIndex = parseInt(e.target.value, 10) || 0;
          this.updateDisplay();
          this.onTimeChange(this.timeIndex);
        });
      }
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;

      this.container.querySelector('#dome-heading').textContent = t('dome.title');
      this.container.querySelector('#dome-desc').textContent = t('dome.description');
      this.container.querySelector('#dome-method').textContent = t('dome.method_note');
      this.container.querySelector('#label-time-slider').textContent = t('dome.time_slider_label');
      this.container.querySelector('#sun-status-title').textContent = t('dome.sun_status');
      this.container.querySelector('#earth-status-title').textContent = t('dome.earth_status');
      this.container.querySelector('#lbl-disk-fraction').textContent = `${t('dome.disk_fraction')}:`;
      this.container.querySelector('#lbl-next-sunset').textContent = `${t('dome.next_sunset')}:`;
      this.container.querySelector('#lbl-next-earthset').textContent = `${t('dome.next_earthset')}:`;

      this.updateDisplay();
    }

    setData(data, selectedSiteId, timeIndex) {
      this.data = data;
      this.selectedSiteId = selectedSiteId;
      if (typeof timeIndex === 'number') {
        this.timeIndex = timeIndex;
      }
      this.updateDisplay();
    }

    selectSite(siteId) {
      this.selectedSiteId = siteId;
      this.updateDisplay();
    }

    setTimeIndex(timeIndex) {
      this.timeIndex = timeIndex;
      const slider = this.container.querySelector('#time-slider');
      if (slider) slider.value = timeIndex;
      this.updateDisplay();
    }

    getActiveTrack() {
      if (!this.data || !this.data.tracks || !this.selectedSiteId) return null;
      return this.data.tracks[this.selectedSiteId] || null;
    }

    getActiveHorizon() {
      if (!this.data || !this.data.horizon || !this.selectedSiteId) return null;
      return this.data.horizon[this.selectedSiteId] || null;
    }

    updateDisplay() {
      this.drawDome();
      this.updateStatus();
      this.updateSummary();
    }

    drawDome() {
      const svg = this.container.querySelector('#sky-dome-svg');
      const gridLayer = svg.querySelector('#dome-grid-layer');
      const horizonLayer = svg.querySelector('#dome-horizon-layer');
      const tracksLayer = svg.querySelector('#dome-tracks-layer');
      const bodiesLayer = svg.querySelector('#dome-bodies-layer');
      const labelsLayer = svg.querySelector('#dome-labels-layer');

      gridLayer.innerHTML = '';
      horizonLayer.innerHTML = '';
      tracksLayer.innerHTML = '';
      bodiesLayer.innerHTML = '';
      labelsLayer.innerHTML = '';

      const cx = 250;
      const cy = 250;
      const maxR = 200; // el = 0

      // 1. Elevation concentric circles: 0, 30, 60
      const elevSteps = [0, 30, 60];
      for (const el of elevSteps) {
        const proj = LW.model.skyDomeProject(0, el, maxR, cx, cy);
        const r = maxR * ((90 - el) / 90);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('class', el === 0 ? 'dome-horizon-circle' : 'dome-elev-circle');
        gridLayer.appendChild(circle);

        if (el > 0) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', cx + 4);
          text.setAttribute('y', cy - r + 12);
          text.setAttribute('class', 'dome-grid-label');
          text.textContent = `${el}`;
          gridLayer.appendChild(text);
        }
      }

      // Azimuth radial lines every 45 deg
      for (let az = 0; az < 360; az += 45) {
        const pos = LW.model.skyDomeProject(az, 0, maxR, cx, cy);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx);
        line.setAttribute('y1', cy);
        line.setAttribute('x2', pos.x);
        line.setAttribute('y2', pos.y);
        line.setAttribute('class', 'dome-az-line');
        gridLayer.appendChild(line);
      }

      // Cardinal direction labels (N, E, S, W)
      const cardinals = [
        { az: 0, label: 'N', x: cx, y: cy - maxR - 12 },
        { az: 90, label: 'E', x: cx + maxR + 16, y: cy + 4 },
        { az: 180, label: 'S', x: cx, y: cy + maxR + 18 },
        { az: 270, label: 'W', x: cx - maxR - 16, y: cy + 4 }
      ];

      for (const card of cardinals) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', card.x);
        text.setAttribute('y', card.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'dome-cardinal-label');
        text.textContent = card.label;
        gridLayer.appendChild(text);
      }

      // Zenith dot (el = 90)
      const zenithDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      zenithDot.setAttribute('cx', cx);
      zenithDot.setAttribute('cy', cy);
      zenithDot.setAttribute('r', 2);
      zenithDot.setAttribute('class', 'dome-zenith-dot');
      gridLayer.appendChild(zenithDot);

      // 2. Horizon mask
      const horizon = this.getActiveHorizon();
      const noticeBox = this.container.querySelector('#terrain-notice-box');

      if (!horizon || !horizon.terrain_included || !Array.isArray(horizon.elev_deg) || horizon.elev_deg.length === 0) {
        if (noticeBox) {
          noticeBox.innerHTML = `<span class="badge info-badge">${this.t('common.empty_no_horizon')}</span>`;
        }
      } else {
        if (noticeBox) noticeBox.innerHTML = '';
        const elev = horizon.elev_deg;
        const nElev = elev.length;
        const step = horizon.az_step_deg || 360 / nElev;

        // Construct polygon connecting horizon elevation points and closing at outer circle
        const pts = [];
        for (let i = 0; i <= nElev; i++) {
          const az = (i % nElev) * step;
          const el = elev[i % nElev];
          const pos = LW.model.skyDomeProject(az, el, maxR, cx, cy);
          pts.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
        }
        // Outer circle rim in reverse
        for (let i = nElev; i >= 0; i--) {
          const az = (i % nElev) * step;
          const pos = LW.model.skyDomeProject(az, 0, maxR, cx, cy);
          pts.push(`${pos.x.toFixed(1)},${pos.y.toFixed(1)}`);
        }

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', pts.join(' '));
        poly.setAttribute('class', 'dome-horizon-mask');
        poly.setAttribute('fill', 'url(#horizon-hatch)');
        horizonLayer.appendChild(poly);

        // Horizon outline line
        const linePts = [];
        for (let i = 0; i < nElev; i++) {
          const az = i * step;
          const el = elev[i];
          const pos = LW.model.skyDomeProject(az, el, maxR, cx, cy);
          linePts.push(`${i === 0 ? 'M' : 'L'} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
        }
        linePts.push('Z');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', linePts.join(' '));
        path.setAttribute('class', 'dome-horizon-outline');
        horizonLayer.appendChild(path);
      }

      // 3. Ephemeris Tracks
      const track = this.getActiveTrack();
      if (!track || !track.sun || !Array.isArray(track.sun.el_deg) || track.sun.el_deg.length === 0) {
        const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        emptyText.setAttribute('x', cx);
        emptyText.setAttribute('y', cy + 30);
        emptyText.setAttribute('text-anchor', 'middle');
        emptyText.setAttribute('class', 'dome-empty-text');
        emptyText.textContent = this.t('common.empty_no_track');
        tracksLayer.appendChild(emptyText);
        return;
      }

      const nSteps = track.n || track.sun.el_deg.length;

      // Update slider bounds
      const slider = this.container.querySelector('#time-slider');
      slider.max = String(Math.max(0, nSteps - 1));
      this.container.querySelector('#slider-end-label').textContent = String(Math.max(0, nSteps - 1));
      if (this.timeIndex >= nSteps) this.timeIndex = nSteps - 1;
      slider.value = String(this.timeIndex);

      // Sun track line (solid)
      const sunPathD = [];
      for (let i = 0; i < nSteps; i++) {
        const az = track.sun.az_deg[i];
        const el = track.sun.el_deg[i];
        const pos = LW.model.skyDomeProject(az, el, maxR, cx, cy);
        sunPathD.push(`${i === 0 ? 'M' : 'L'} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
      }
      const sunPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      sunPath.setAttribute('d', sunPathD.join(' '));
      sunPath.setAttribute('class', 'dome-sun-track');
      tracksLayer.appendChild(sunPath);

      // Earth track line (dashed)
      if (track.earth && Array.isArray(track.earth.el_deg)) {
        const earthPathD = [];
        for (let i = 0; i < nSteps; i++) {
          const az = track.earth.az_deg[i];
          const el = track.earth.el_deg[i];
          const pos = LW.model.skyDomeProject(az, el, maxR, cx, cy);
          earthPathD.push(`${i === 0 ? 'M' : 'L'} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`);
        }
        const earthPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        earthPath.setAttribute('d', earthPathD.join(' '));
        earthPath.setAttribute('class', 'dome-earth-track');
        tracksLayer.appendChild(earthPath);
      }

      // 4. Current positions
      const currIdx = Math.min(this.timeIndex, nSteps - 1);

      // Sun current position (circle)
      const sunAz = track.sun.az_deg[currIdx];
      const sunEl = track.sun.el_deg[currIdx];
      const sunPos = LW.model.skyDomeProject(sunAz, sunEl, maxR, cx, cy);
      const isSunVis = LW.model.isBodyVisible(sunAz, sunEl, horizon);

      const sunG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      sunG.setAttribute('class', `body-marker sun-marker ${isSunVis ? 'visible' : 'hidden'}`);

      const sunHalo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      sunHalo.setAttribute('cx', sunPos.x);
      sunHalo.setAttribute('cy', sunPos.y);
      sunHalo.setAttribute('r', 10);
      sunHalo.setAttribute('class', 'sun-halo');
      sunG.appendChild(sunHalo);

      const sunDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      sunDot.setAttribute('cx', sunPos.x);
      sunDot.setAttribute('cy', sunPos.y);
      sunDot.setAttribute('r', 5);
      sunDot.setAttribute('class', 'sun-dot');
      sunG.appendChild(sunDot);

      bodiesLayer.appendChild(sunG);

      // Earth current position (diamond)
      if (track.earth && Array.isArray(track.earth.el_deg)) {
        const earthAz = track.earth.az_deg[currIdx];
        const earthEl = track.earth.el_deg[currIdx];
        const earthPos = LW.model.skyDomeProject(earthAz, earthEl, maxR, cx, cy);
        const isEarthVis = LW.model.isBodyVisible(earthAz, earthEl, horizon);

        const earthG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        earthG.setAttribute('class', `body-marker earth-marker ${isEarthVis ? 'visible' : 'hidden'}`);

        const earthDiamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const s = 6;
        earthDiamond.setAttribute('points', `${earthPos.x},${earthPos.y - s} ${earthPos.x + s},${earthPos.y} ${earthPos.x},${earthPos.y + s} ${earthPos.x - s},${earthPos.y}`);
        earthDiamond.setAttribute('class', 'earth-shape');
        earthG.appendChild(earthDiamond);

        bodiesLayer.appendChild(earthG);
      }
    }

    formatTimeFromStart(startIso, stepMin, index) {
      if (!startIso) return `Step ${index}`;
      try {
        const date = new Date(startIso);
        date.setUTCMinutes(date.getUTCMinutes() + index * stepMin);
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        const h = String(date.getUTCHours()).padStart(2, '0');
        const min = String(date.getUTCMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min} UTC`;
      } catch {
        return `Step ${index}`;
      }
    }

    updateStatus() {
      const track = this.getActiveTrack();
      const horizon = this.getActiveHorizon();

      const epochVal = this.container.querySelector('#current-epoch-val');
      const sunVis = this.container.querySelector('#sun-visibility-val');
      const sunEl = this.container.querySelector('#sun-el-val');
      const sunAz = this.container.querySelector('#sun-az-val');
      const diskRow = this.container.querySelector('#row-disk-fraction');
      const diskVal = this.container.querySelector('#disk-fraction-val');
      const nextSunsetVal = this.container.querySelector('#next-sunset-val');

      const earthVis = this.container.querySelector('#earth-visibility-val');
      const earthEl = this.container.querySelector('#earth-el-val');
      const earthAz = this.container.querySelector('#earth-az-val');
      const nextEarthsetVal = this.container.querySelector('#next-earthset-val');

      if (!track || !track.sun || !Array.isArray(track.sun.el_deg) || track.sun.el_deg.length === 0) {
        epochVal.textContent = '-';
        sunVis.textContent = this.t('common.na');
        sunVis.className = 'status-badge';
        sunEl.textContent = '-';
        sunAz.textContent = '-';
        diskRow.style.display = 'none';
        nextSunsetVal.textContent = '-';

        earthVis.textContent = this.t('common.na');
        earthVis.className = 'status-badge';
        earthEl.textContent = '-';
        earthAz.textContent = '-';
        nextEarthsetVal.textContent = '-';
        return;
      }

      const nSteps = track.n || track.sun.el_deg.length;
      const idx = Math.min(this.timeIndex, nSteps - 1);
      const stepMin = track.step_minutes || 60;

      // Time string
      const timeStr = this.formatTimeFromStart(track.start_utc, stepMin, idx);
      epochVal.textContent = timeStr;

      // Sun status
      const sAz = track.sun.az_deg[idx];
      const sEl = track.sun.el_deg[idx];
      const isSunVis = LW.model.isBodyVisible(sAz, sEl, horizon);

      sunVis.textContent = isSunVis ? this.t('dome.visible') : this.t('dome.hidden');
      sunVis.className = `status-badge ${isSunVis ? 'badge-visible' : 'badge-hidden'}`;
      sunEl.textContent = `${this.formatNumber(sEl.toFixed(2))} deg`;
      sunAz.textContent = `${this.formatNumber(sAz.toFixed(1))} deg`;

      // Disk fraction if available
      if (track.sun.disk_fraction && track.sun.disk_fraction[idx] != null) {
        diskRow.style.display = 'flex';
        diskVal.textContent = this.formatNumber(track.sun.disk_fraction[idx].toFixed(2));
      } else {
        diskRow.style.display = 'none';
      }

      // Next sunset
      const sunsetResult = LW.model.findNextSunset(track, horizon, idx);
      if (sunsetResult) {
        nextSunsetVal.textContent = `${this.formatNumber(sunsetResult.hours.toFixed(1))} ${this.t('common.hours_unit')}`;
      } else {
        nextSunsetVal.textContent = this.t('common.empty_not_within_track');
      }

      // Earth status
      if (track.earth && Array.isArray(track.earth.el_deg)) {
        const eAz = track.earth.az_deg[idx];
        const eEl = track.earth.el_deg[idx];
        const isEarthVis = LW.model.isBodyVisible(eAz, eEl, horizon);

        earthVis.textContent = isEarthVis ? this.t('dome.visible') : this.t('dome.hidden');
        earthVis.className = `status-badge ${isEarthVis ? 'badge-visible' : 'badge-hidden'}`;
        earthEl.textContent = `${this.formatNumber(eEl.toFixed(2))} deg`;
        earthAz.textContent = `${this.formatNumber(eAz.toFixed(1))} deg`;

        const earthsetResult = LW.model.findNextEarthset(track, horizon, idx);
        if (earthsetResult) {
          nextEarthsetVal.textContent = `${this.formatNumber(earthsetResult.hours.toFixed(1))} ${this.t('common.hours_unit')}`;
        } else {
          nextEarthsetVal.textContent = this.t('common.empty_not_within_track');
        }
      } else {
        earthVis.textContent = this.t('common.na');
        earthVis.className = 'status-badge';
        earthEl.textContent = '-';
        earthAz.textContent = '-';
        nextEarthsetVal.textContent = this.t('common.empty_not_within_track');
      }
    }

    updateSummary() {
      const summaryEl = this.container.querySelector('#dome-summary');
      const track = this.getActiveTrack();
      const horizon = this.getActiveHorizon();

      if (!track || !track.sun || !Array.isArray(track.sun.el_deg) || track.sun.el_deg.length === 0) {
        summaryEl.textContent = this.t('common.empty_no_track');
        return;
      }

      const nSteps = track.n || track.sun.el_deg.length;
      const idx = Math.min(this.timeIndex, nSteps - 1);
      const stepMin = track.step_minutes || 60;
      const timeStr = this.formatTimeFromStart(track.start_utc, stepMin, idx);

      const sAz = track.sun.az_deg[idx];
      const sEl = track.sun.el_deg[idx];
      const isSunVis = LW.model.isBodyVisible(sAz, sEl, horizon);
      const sunStatus = isSunVis ? this.t('dome.visible') : this.t('dome.hidden');

      let earthStatus = this.t('common.na');
      let eElStr = '-';
      if (track.earth && Array.isArray(track.earth.el_deg)) {
        const eAz = track.earth.az_deg[idx];
        const eEl = track.earth.el_deg[idx];
        const isEarthVis = LW.model.isBodyVisible(eAz, eEl, horizon);
        earthStatus = isEarthVis ? this.t('dome.visible') : this.t('dome.hidden');
        eElStr = `${this.formatNumber(eEl.toFixed(1))} deg`;
      }

      const sunsetResult = LW.model.findNextSunset(track, horizon, idx);
      const sunsetStr = sunsetResult ? `${this.formatNumber(sunsetResult.hours.toFixed(1))} ${this.t('common.hours_unit')}` : this.t('common.empty_not_within_track');

      const earthsetResult = LW.model.findNextEarthset(track, horizon, idx);
      const earthsetStr = earthsetResult ? `${this.formatNumber(earthsetResult.hours.toFixed(1))} ${this.t('common.hours_unit')}` : this.t('common.empty_not_within_track');

      const text = this.t('dome.live_summary', {
        time: timeStr,
        sun_status: sunStatus,
        sun_el: `${this.formatNumber(sEl.toFixed(1))} deg`,
        earth_status: earthStatus,
        earth_el: eElStr,
        sunset: sunsetStr,
        earthset: earthsetStr
      });

      summaryEl.textContent = text;
    }
  }

  LW.DomeView = DomeView;
})();
