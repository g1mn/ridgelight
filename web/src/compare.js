// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/compare.js
// 3-Site Comparison & Date Shift view (Scope A)
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class CompareView {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.siteIds = [null, null, null];
      this.shiftDays = 0;
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));

      this.renderSkeleton();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div class="card compare-card">
          <div class="card-header">
            <h2 id="compare-heading" class="card-title"></h2>
            <p id="compare-desc" class="card-desc"></p>
          </div>
          <div class="compare-body">
            <div class="shift-control-box">
              <div class="shift-label-row">
                <label for="shift-slider" id="lbl-shift-slider" class="subheading"></label>
                <span id="shift-val-badge" class="shift-badge">0 d</span>
              </div>
              <input type="range" id="shift-slider" class="shift-slider" min="-10" max="10" step="1" value="0" aria-label="Date shift slider" />
              <div class="shift-ticks">
                <span>-10d</span>
                <span>0d</span>
                <span>+10d</span>
              </div>
              <div id="rank-change-notice" class="rank-notice" role="status" aria-live="polite"></div>
            </div>

            <div class="sites-compare-grid">
              <!-- Site 1 Card -->
              <div class="compare-site-card" id="card-site-0">
                <div class="site-select-wrap">
                  <label for="sel-site-0" id="lbl-sel-site-0" class="site-slot-label"></label>
                  <select id="sel-site-0" class="site-dropdown" aria-label="Compare Site 1"></select>
                </div>
                <div class="site-rank-badge" id="rank-badge-0">-</div>
                <div class="metrics-list">
                  <div class="metric-row"><span id="lbl-m-sun-0">Sunlight:</span> <strong id="val-sun-0" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-earth-0">Earth visible:</span> <strong id="val-earth-0" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-shadow-0">Max shadow:</span> <strong id="val-shadow-0" class="metric-val">-</strong></div>
                </div>
              </div>

              <!-- Site 2 Card -->
              <div class="compare-site-card" id="card-site-1">
                <div class="site-select-wrap">
                  <label for="sel-site-1" id="lbl-sel-site-1" class="site-slot-label"></label>
                  <select id="sel-site-1" class="site-dropdown" aria-label="Compare Site 2"></select>
                </div>
                <div class="site-rank-badge" id="rank-badge-1">-</div>
                <div class="metrics-list">
                  <div class="metric-row"><span id="lbl-m-sun-1">Sunlight:</span> <strong id="val-sun-1" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-earth-1">Earth visible:</span> <strong id="val-earth-1" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-shadow-1">Max shadow:</span> <strong id="val-shadow-1" class="metric-val">-</strong></div>
                </div>
              </div>

              <!-- Site 3 Card -->
              <div class="compare-site-card" id="card-site-2">
                <div class="site-select-wrap">
                  <label for="sel-site-2" id="lbl-sel-site-2" class="site-slot-label"></label>
                  <select id="sel-site-2" class="site-dropdown" aria-label="Compare Site 3"></select>
                </div>
                <div class="site-rank-badge" id="rank-badge-2">-</div>
                <div class="metrics-list">
                  <div class="metric-row"><span id="lbl-m-sun-2">Sunlight:</span> <strong id="val-sun-2" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-earth-2">Earth visible:</span> <strong id="val-earth-2" class="metric-val">-</strong></div>
                  <div class="metric-row"><span id="lbl-m-shadow-2">Max shadow:</span> <strong id="val-shadow-2" class="metric-val">-</strong></div>
                </div>
              </div>
            </div>
          </div>
          <div id="compare-summary" class="view-summary" aria-live="polite"></div>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const slider = this.container.querySelector('#shift-slider');
      if (slider) {
        slider.addEventListener('input', (e) => {
          this.shiftDays = parseInt(e.target.value, 10) || 0;
          this.container.querySelector('#shift-val-badge').textContent = `${this.shiftDays > 0 ? '+' : ''}${this.shiftDays} d`;
          this.updateDisplay();
        });
      }

      for (let i = 0; i < 3; i++) {
        const sel = this.container.querySelector(`#sel-site-${i}`);
        if (sel) {
          sel.addEventListener('change', (e) => {
            this.siteIds[i] = e.target.value;
            this.updateDisplay();
          });
        }
      }
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;

      this.container.querySelector('#compare-heading').textContent = t('compare.title');
      this.container.querySelector('#compare-desc').textContent = t('compare.description');
      this.container.querySelector('#lbl-shift-slider').textContent = t('compare.date_shift_label');

      for (let i = 0; i < 3; i++) {
        this.container.querySelector(`#lbl-sel-site-${i}`).textContent = t(`compare.site_${i + 1}`);
        this.container.querySelector(`#lbl-m-sun-${i}`).textContent = `${t('compare.metric_sunlight')}:`;
        this.container.querySelector(`#lbl-m-earth-${i}`).textContent = `${t('compare.metric_earth')}:`;
        this.container.querySelector(`#lbl-m-shadow-${i}`).textContent = `${t('compare.metric_shadow')}:`;
      }

      this.populateDropdowns();
      this.updateDisplay();
    }

    setData(data, selectedSiteId) {
      this.data = data;
      const sites = (data && data.sites) || [];

      // Default pick first 3 distinct sites if available
      if (sites.length > 0) {
        this.siteIds[0] = selectedSiteId || sites[0].site_id;
        this.siteIds[1] = sites[1] ? sites[1].site_id : sites[0].site_id;
        this.siteIds[2] = sites[2] ? sites[2].site_id : sites[0].site_id;
      }

      this.populateDropdowns();
      this.updateDisplay();
    }

    populateDropdowns() {
      const sites = (this.data && this.data.sites) || [];
      for (let i = 0; i < 3; i++) {
        const sel = this.container.querySelector(`#sel-site-${i}`);
        if (!sel) continue;
        sel.innerHTML = '';

        if (sites.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = this.t('common.empty_no_site_data');
          sel.appendChild(opt);
          continue;
        }

        for (const s of sites) {
          const opt = document.createElement('option');
          opt.value = s.site_id;
          opt.textContent = `${s.name}${s.approx ? ` (${this.t('common.approx_label')})` : ''}`;
          if (s.site_id === this.siteIds[i]) {
            opt.selected = true;
          }
          sel.appendChild(opt);
        }
      }
    }

    computeSiteMetrics(siteId, shift) {
      if (!this.data || !siteId) return null;
      const track = this.data.tracks && this.data.tracks[siteId];
      const horizon = this.data.horizon && this.data.horizon[siteId];

      if (!track || !track.sun || !Array.isArray(track.sun.el_deg) || track.sun.el_deg.length === 0) {
        return null;
      }

      const n = track.n || track.sun.el_deg.length;
      const stepMin = track.step_minutes || 60;
      const totalDays = (n * stepMin) / (24 * 60);

      // 14-day evaluation window
      const windowDays = Math.min(14, totalDays);
      const windowSteps = Math.round((windowDays * 24 * 60) / stepMin);

      // Base offset: day 10 if totalDays >= 30, otherwise mid
      const baseStartDay = totalDays >= 30 ? 10 : Math.max(0, (totalDays - windowDays) / 2);
      const shiftedStartDay = Math.max(0, Math.min(totalDays - windowDays, baseStartDay + shift));

      const startStep = Math.round((shiftedStartDay * 24 * 60) / stepMin);
      const endStep = Math.min(n, startStep + windowSteps);
      const countSteps = Math.max(1, endStep - startStep);

      let sunVisSteps = 0;
      let earthVisSteps = 0;
      let currentShadowRun = 0;
      let maxShadowRun = 0;

      for (let i = startStep; i < endStep; i++) {
        const sAz = track.sun.az_deg[i];
        const sEl = track.sun.el_deg[i];
        const isSunVis = LW.model.isBodyVisible(sAz, sEl, horizon);

        if (isSunVis) {
          sunVisSteps++;
          if (currentShadowRun > maxShadowRun) maxShadowRun = currentShadowRun;
          currentShadowRun = 0;
        } else {
          currentShadowRun++;
        }

        if (track.earth && Array.isArray(track.earth.el_deg)) {
          const eAz = track.earth.az_deg[i];
          const eEl = track.earth.el_deg[i];
          if (LW.model.isBodyVisible(eAz, eEl, horizon)) {
            earthVisSteps++;
          }
        }
      }
      if (currentShadowRun > maxShadowRun) maxShadowRun = currentShadowRun;

      const sunPct = (sunVisSteps / countSteps) * 100;
      const earthPct = (earthVisSteps / countSteps) * 100;
      const maxShadowHours = (maxShadowRun * stepMin) / 60;

      return {
        sunPct,
        earthPct,
        maxShadowHours
      };
    }

    updateDisplay() {
      const noticeEl = this.container.querySelector('#rank-change-notice');
      const summaryEl = this.container.querySelector('#compare-summary');

      const sites = (this.data && this.data.sites) || [];
      if (sites.length === 0) {
        noticeEl.textContent = '';
        summaryEl.textContent = this.t('common.empty_no_site_data');
        for (let i = 0; i < 3; i++) {
          this.container.querySelector(`#rank-badge-${i}`).textContent = '-';
          this.container.querySelector(`#val-sun-${i}`).textContent = '-';
          this.container.querySelector(`#val-earth-${i}`).textContent = '-';
          this.container.querySelector(`#val-shadow-${i}`).textContent = '-';
        }
        return;
      }

      // Compute metrics at shift = 0 (baseline) and current shift
      const baselineMetrics = [];
      const currentMetrics = [];

      for (let i = 0; i < 3; i++) {
        const sId = this.siteIds[i];
        baselineMetrics.push(this.computeSiteMetrics(sId, 0));
        currentMetrics.push(this.computeSiteMetrics(sId, this.shiftDays));
      }

      // Rank helper
      function rankSites(metrics) {
        const indices = [0, 1, 2];
        indices.sort((a, b) => {
          const ma = metrics[a];
          const mb = metrics[b];
          if (!ma && !mb) return 0;
          if (!ma) return 1;
          if (!mb) return -1;
          // Sort by sunlight % desc, then earth % desc
          if (Math.abs(mb.sunPct - ma.sunPct) > 1e-4) {
            return mb.sunPct - ma.sunPct;
          }
          return mb.earthPct - ma.earthPct;
        });
        return indices; // e.g. [1, 0, 2] means slot 1 is 1st, slot 0 is 2nd, slot 2 is 3rd
      }

      const baselineOrder = rankSites(baselineMetrics);
      const currentOrder = rankSites(currentMetrics);

      // Assign ranks to slots (1, 2, 3)
      const currentRanks = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        currentRanks[currentOrder[r]] = r + 1;
      }

      // Count swapped pairs compared to baseline
      // An inversion between baselineOrder and currentOrder
      let swappedPairs = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const baseA = baselineOrder.indexOf(i);
          const baseB = baselineOrder.indexOf(j);
          const currA = currentOrder.indexOf(i);
          const currB = currentOrder.indexOf(j);
          if ((baseA < baseB && currA > currB) || (baseA > baseB && currA < currB)) {
            swappedPairs++;
          }
        }
      }

      // Update UI for each card
      for (let i = 0; i < 3; i++) {
        const badge = this.container.querySelector(`#rank-badge-${i}`);
        const m = currentMetrics[i];

        if (m) {
          badge.textContent = `${this.t('compare.rank_prefix')} ${currentRanks[i]}`;
          badge.className = `site-rank-badge rank-${currentRanks[i]}`;
          this.container.querySelector(`#val-sun-${i}`).textContent = `${this.formatNumber(m.sunPct.toFixed(1))}%`;
          this.container.querySelector(`#val-earth-${i}`).textContent = `${this.formatNumber(m.earthPct.toFixed(1))}%`;
          this.container.querySelector(`#val-shadow-${i}`).textContent = `${this.formatNumber(m.maxShadowHours.toFixed(1))} ${this.t('common.hours_unit')}`;
        } else {
          badge.textContent = '-';
          badge.className = 'site-rank-badge';
          this.container.querySelector(`#val-sun-${i}`).textContent = this.t('common.empty_no_track');
          this.container.querySelector(`#val-earth-${i}`).textContent = this.t('common.empty_no_track');
          this.container.querySelector(`#val-shadow-${i}`).textContent = this.t('common.empty_no_track');
        }
      }

      // Notice about rank change
      if (swappedPairs > 0) {
        noticeEl.textContent = this.t('compare.rank_swapped', { count: String(swappedPairs) }) + ' ' + this.t('compare.rank_of', { total: '3' });
        noticeEl.className = 'rank-notice rank-changed';
      } else {
        noticeEl.textContent = this.t('compare.rank_unchanged');
        noticeEl.className = 'rank-notice rank-steady';
      }

      // Summary
      const topSlot = currentOrder[0];
      const topSiteObj = sites.find((s) => s.site_id === this.siteIds[topSlot]);
      const topName = topSiteObj ? topSiteObj.name : `Site ${topSlot + 1}`;
      const topM = currentMetrics[topSlot];

      summaryEl.textContent = this.t('compare.live_summary', {
        shift: `${this.shiftDays > 0 ? '+' : ''}${this.shiftDays}`,
        top_site: topName,
        sun_pct: topM ? this.formatNumber(topM.sunPct.toFixed(1)) : '0'
      });
    }
  }

  LW.CompareView = CompareView;
})();
