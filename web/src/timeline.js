// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/timeline.js
// Timeline Bar view (Scope A)
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class TimelineView {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.selectedSiteId = null;
      this.daysRange = 7;
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));

      this.renderSkeleton();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div class="card timeline-card">
          <div class="card-header">
            <div class="card-title-row">
              <h2 id="timeline-heading" class="card-title"></h2>
              <div class="range-selector" role="group" aria-label="Timeline window duration">
                <button type="button" class="btn btn-range active" data-days="7">7d</button>
                <button type="button" class="btn btn-range" data-days="30">30d</button>
                <button type="button" class="btn btn-range" data-days="90">90d</button>
              </div>
            </div>
            <p id="timeline-desc" class="card-desc"></p>
          </div>
          <div class="timeline-body">
            <div class="timeline-svg-wrap">
              <svg id="timeline-svg" class="timeline-svg" viewBox="0 0 1000 70" width="100%" height="70" role="img" aria-labelledby="timeline-heading">
                <defs>
                  <!-- Pattern 1: Both (cross-hatch) -->
                  <pattern id="pat-both" width="8" height="8" patternUnits="userSpaceOnUse">
                    <path d="M0,0 L8,8 M8,0 L0,8" stroke="var(--pat-both-stroke)" stroke-width="1.5" />
                  </pattern>
                  <!-- Pattern 2: Sun only (diagonal hatch) -->
                  <pattern id="pat-sun" width="8" height="8" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="8" x2="8" y2="0" stroke="var(--pat-sun-stroke)" stroke-width="2" />
                  </pattern>
                  <!-- Pattern 3: Earth only (dots) -->
                  <pattern id="pat-earth" width="8" height="8" patternUnits="userSpaceOnUse">
                    <circle cx="4" cy="4" r="2" fill="var(--pat-earth-fill)" />
                  </pattern>
                  <!-- Pattern 4: Neither (horizontal lines) -->
                  <pattern id="pat-neither" width="8" height="8" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="4" x2="8" y2="4" stroke="var(--pat-neither-stroke)" stroke-width="1" />
                  </pattern>
                </defs>
                <rect x="0" y="5" width="1000" height="40" rx="4" class="timeline-base-rect" />
                <g id="timeline-intervals-layer"></g>
                <g id="timeline-axis-layer"></g>
              </svg>
            </div>
            <div class="timeline-legend">
              <div class="legend-item"><span class="legend-swatch swatch-both" aria-hidden="true"></span><span id="lbl-leg-both"></span> <strong id="val-pct-both">-%</strong></div>
              <div class="legend-item"><span class="legend-swatch swatch-sun" aria-hidden="true"></span><span id="lbl-leg-sun"></span> <strong id="val-pct-sun">-%</strong></div>
              <div class="legend-item"><span class="legend-swatch swatch-earth" aria-hidden="true"></span><span id="lbl-leg-earth"></span> <strong id="val-pct-earth">-%</strong></div>
              <div class="legend-item"><span class="legend-swatch swatch-neither" aria-hidden="true"></span><span id="lbl-leg-neither"></span> <strong id="val-pct-neither">-%</strong></div>
            </div>
          </div>
          <div id="timeline-summary" class="view-summary" aria-live="polite"></div>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const rangeBtns = this.container.querySelectorAll('.btn-range');
      for (const btn of rangeBtns) {
        btn.addEventListener('click', (e) => {
          for (const b of rangeBtns) b.classList.remove('active');
          btn.classList.add('active');
          this.daysRange = parseInt(btn.dataset.days, 10) || 7;
          this.updateDisplay();
        });
      }
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;

      this.container.querySelector('#timeline-heading').textContent = t('timeline.title');
      this.container.querySelector('#timeline-desc').textContent = t('timeline.description');
      this.container.querySelector('#lbl-leg-both').textContent = t('timeline.legend_both');
      this.container.querySelector('#lbl-leg-sun').textContent = t('timeline.legend_sun_only');
      this.container.querySelector('#lbl-leg-earth').textContent = t('timeline.legend_earth_only');
      this.container.querySelector('#lbl-leg-neither').textContent = t('timeline.legend_neither');

      this.updateDisplay();
    }

    setData(data, selectedSiteId) {
      this.data = data;
      this.selectedSiteId = selectedSiteId;
      this.updateDisplay();
    }

    selectSite(siteId) {
      this.selectedSiteId = siteId;
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
      const svg = this.container.querySelector('#timeline-svg');
      const intervalsLayer = svg.querySelector('#timeline-intervals-layer');
      const axisLayer = svg.querySelector('#timeline-axis-layer');
      const summaryEl = this.container.querySelector('#timeline-summary');

      intervalsLayer.innerHTML = '';
      axisLayer.innerHTML = '';

      const track = this.getActiveTrack();
      const horizon = this.getActiveHorizon();

      if (!track || !track.sun || !Array.isArray(track.sun.el_deg) || track.sun.el_deg.length === 0) {
        summaryEl.textContent = this.t('common.empty_no_track');
        this.container.querySelector('#val-pct-both').textContent = '-%';
        this.container.querySelector('#val-pct-sun').textContent = '-%';
        this.container.querySelector('#val-pct-earth').textContent = '-%';
        this.container.querySelector('#val-pct-neither').textContent = '-%';
        return;
      }

      const nStepsTotal = track.n || track.sun.el_deg.length;
      const stepMin = track.step_minutes || 60;
      const stepsForDays = Math.round((this.daysRange * 24 * 60) / stepMin);
      const evalSteps = Math.min(nStepsTotal, stepsForDays);

      let countBoth = 0;
      let countSunOnly = 0;
      let countEarthOnly = 0;
      let countNeither = 0;

      // Classify step states: 'both' | 'sun' | 'earth' | 'neither'
      const states = [];
      for (let i = 0; i < evalSteps; i++) {
        const sAz = track.sun.az_deg[i];
        const sEl = track.sun.el_deg[i];
        const sunVis = LW.model.isBodyVisible(sAz, sEl, horizon);

        let earthVis = false;
        if (track.earth && Array.isArray(track.earth.el_deg)) {
          const eAz = track.earth.az_deg[i];
          const eEl = track.earth.el_deg[i];
          earthVis = LW.model.isBodyVisible(eAz, eEl, horizon);
        }

        let st = 'neither';
        if (sunVis && earthVis) {
          st = 'both';
          countBoth++;
        } else if (sunVis) {
          st = 'sun';
          countSunOnly++;
        } else if (earthVis) {
          st = 'earth';
          countEarthOnly++;
        } else {
          countNeither++;
        }
        states.push(st);
      }

      // Group into contiguous intervals
      const intervals = [];
      let currentSt = states[0];
      let startIdx = 0;

      for (let i = 1; i <= evalSteps; i++) {
        if (i === evalSteps || states[i] !== currentSt) {
          intervals.push({
            state: currentSt,
            start: startIdx,
            end: i
          });
          if (i < evalSteps) {
            currentSt = states[i];
            startIdx = i;
          }
        }
      }

      // Render rectangles on SVG
      const totalWidth = 1000;
      for (const inter of intervals) {
        const x = (inter.start / evalSteps) * totalWidth;
        const w = ((inter.end - inter.start) / evalSteps) * totalWidth;

        // Background color fill rect
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('x', x.toFixed(1));
        bgRect.setAttribute('y', 5);
        bgRect.setAttribute('width', Math.max(0.5, w).toFixed(1));
        bgRect.setAttribute('height', 40);
        bgRect.setAttribute('class', `timeline-interval-bg bg-${inter.state}`);
        intervalsLayer.appendChild(bgRect);

        // Pattern overlay rect
        const patRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        patRect.setAttribute('x', x.toFixed(1));
        patRect.setAttribute('y', 5);
        patRect.setAttribute('width', Math.max(0.5, w).toFixed(1));
        patRect.setAttribute('height', 40);
        patRect.setAttribute('fill', `url(#pat-${inter.state})`);
        patRect.setAttribute('class', `timeline-interval-pat pat-${inter.state}`);
        intervalsLayer.appendChild(patRect);
      }

      // Axis ticks and labels (0, 25%, 50%, 75%, 100% of days)
      const numTicks = 5;
      for (let t = 0; t <= numTicks; t++) {
        const frac = t / numTicks;
        const x = frac * totalWidth;
        const dayVal = (frac * this.daysRange).toFixed(0);

        const tickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tickLine.setAttribute('x1', x);
        tickLine.setAttribute('y1', 45);
        tickLine.setAttribute('x2', x);
        tickLine.setAttribute('y2', 51);
        tickLine.setAttribute('class', 'timeline-tick');
        axisLayer.appendChild(tickLine);

        const tickText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tickText.setAttribute('x', x);
        tickText.setAttribute('y', 63);
        tickText.setAttribute('text-anchor', t === 0 ? 'start' : t === numTicks ? 'end' : 'middle');
        tickText.setAttribute('class', 'timeline-axis-label');
        tickText.textContent = `${dayVal}d`;
        axisLayer.appendChild(tickText);
      }

      // Percentages
      const pctBoth = evalSteps > 0 ? (countBoth / evalSteps) * 100 : 0;
      const pctSun = evalSteps > 0 ? (countSunOnly / evalSteps) * 100 : 0;
      const pctEarth = evalSteps > 0 ? (countEarthOnly / evalSteps) * 100 : 0;
      const pctNeither = evalSteps > 0 ? (countNeither / evalSteps) * 100 : 0;

      this.container.querySelector('#val-pct-both').textContent = `${this.formatNumber(pctBoth.toFixed(1))}%`;
      this.container.querySelector('#val-pct-sun').textContent = `${this.formatNumber(pctSun.toFixed(1))}%`;
      this.container.querySelector('#val-pct-earth').textContent = `${this.formatNumber(pctEarth.toFixed(1))}%`;
      this.container.querySelector('#val-pct-neither').textContent = `${this.formatNumber(pctNeither.toFixed(1))}%`;

      // Summary
      const sites = (this.data && this.data.sites) || [];
      const activeSite = sites.find((s) => s.site_id === this.selectedSiteId);
      const siteName = activeSite ? activeSite.name : this.selectedSiteId;

      summaryEl.textContent = this.t('timeline.live_summary', {
        site: siteName,
        range: `${this.daysRange}d`,
        sun_pct: this.formatNumber((pctSun + pctBoth).toFixed(1)),
        earth_pct: this.formatNumber((pctEarth + pctBoth).toFixed(1)),
        both_pct: this.formatNumber(pctBoth.toFixed(1))
      });
    }
  }

  LW.TimelineView = TimelineView;
})();
