// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/l2.js
// L2 view: best point inside the selected region, landing date calendar, longest shadow, DSN windows.
// All numbers come from data/sites/*.json, data/calendar.json, data/shadow.json, data/dsn.json
// (through LW.model.normalizeL2); nothing is computed here except layout and counting dates.
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function dayIndex(iso, startIso) {
    const a = Date.parse(iso + 'T00:00:00Z');
    const b = Date.parse(startIso + 'T00:00:00Z');
    return Math.round((a - b) / 86400000);
  }

  class L2View {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.siteId = null;
      this.dsnDay = null;
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));
    }

    setData(data, siteId) {
      this.data = data;
      this.siteId = siteId;
      this.dsnDay = null;
      this.render();
    }

    selectSite(siteId) {
      this.siteId = siteId;
      this.render();
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;
      this.render();
    }

    fmt(x, d) {
      if (typeof x !== 'number' || !isFinite(x)) return '-';
      try {
        return new Intl.NumberFormat(document.documentElement.lang || 'en', {
          minimumFractionDigits: d,
          maximumFractionDigits: d
        }).format(x);
      } catch {
        return x.toFixed(d);
      }
    }

    siteName() {
      const s = this.data && this.data.sitesMap && this.data.sitesMap[this.siteId];
      return s ? s.name : this.siteId || '';
    }

    gridSvg(region) {
      const pts = region.points;
      const step = region.grid_step_m || 2000;
      const xs = pts.map((p) => p.x_m);
      const ys = pts.map((p) => p.y_m);
      const xmin = Math.min(...xs);
      const ymax = Math.max(...ys);
      const nx = Math.round((Math.max(...xs) - xmin) / step) + 1;
      const ny = Math.round((ymax - Math.min(...ys)) / step) + 1;
      const cell = 54;
      const pad = 6;
      const W = nx * cell + pad * 2;
      const H = ny * cell + pad * 2;
      const field = region.score_field || 'joint_sun_earth_hours';
      const maxV = Math.max(...pts.map((p) => p[field] || 0), 1);
      let out = '';
      for (const p of pts) {
        const ix = Math.round((p.x_m - xmin) / step);
        const iy = Math.round((ymax - p.y_m) / step);
        const x = pad + ix * cell;
        const y = pad + iy * cell;
        const v = p[field] || 0;
        const isBest = p.point_id === region.best_point_id;
        out += `<g><rect class="l2-cell${isBest ? ' l2-cell-best' : ''}" x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="3" style="--v:${(0.08 + 0.72 * v / maxV).toFixed(3)}"><title>${esc(p.point_id)}: ${this.fmt(v, 0)} h</title></rect>`;
        out += `<text class="l2-cell-text" x="${x + (cell - 2) / 2}" y="${y + (cell - 2) / 2 + 4}" text-anchor="middle">${this.fmt(v, 0)}</text>`;
        if (isBest) out += `<text class="l2-cell-tag" x="${x + 5}" y="${y + 13}">${esc(this.t('l2.tag_best'))}</text>`;
        out += '</g>';
      }
      // region point (center of the 15 km box)
      const cx = pad + ((region.center.x_m - xmin) / step) * cell + (cell - 2) / 2;
      const cy = pad + ((ymax - region.center.y_m) / step) * cell + (cell - 2) / 2;
      out += `<g class="l2-center" aria-hidden="true"><line x1="${cx - 9}" x2="${cx + 9}" y1="${cy - 14}" y2="${cy - 14}"/><line x1="${cx}" x2="${cx}" y1="${cy - 23}" y2="${cy - 5}"/></g>`;
      const label = this.t('l2.grid_label', { name: this.siteName() });
      return `<svg class="l2-grid-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">${out}</svg>`;
    }

    calendarSvg(entry) {
      const cal = this.data.l2.calendar;
      const period = cal && cal.period;
      if (!entry || !period) return '';
      const total = dayIndex(period.end, period.start) + 1;
      const W = 1000;
      const sw = W / total;
      let ticks = '';
      for (const d of entry.dates_ok) {
        const i = dayIndex(d, period.start);
        if (i >= 0 && i < total) ticks += `<rect class="l2-day-ok" x="${(i * sw).toFixed(2)}" y="6" width="${Math.max(1, sw).toFixed(2)}" height="30"/>`;
      }
      let labels = '';
      const start = new Date(period.start + 'T00:00:00Z');
      for (let k = 0; k < 24; k += 3) {
        const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1));
        const i = Math.round((dt.getTime() - start.getTime()) / 86400000);
        if (i >= total) break;
        const lbl = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
        labels += `<line class="l2-month-line" x1="${(i * sw).toFixed(1)}" x2="${(i * sw).toFixed(1)}" y1="6" y2="40"/><text class="l2-axis-text" x="${(i * sw + 3).toFixed(1)}" y="54">${lbl}</text>`;
      }
      return `<svg class="l2-cal-svg" viewBox="0 0 ${W} 60" width="100%" role="img" aria-label="${esc(this.t('l2.calendar_label'))}"><rect class="l2-cal-base" x="0" y="6" width="${W}" height="30" rx="3"/>${ticks}${labels}</svg>`;
    }

    dsnBlock(dsnSite) {
      const dsn = this.data.l2.dsn;
      if (!dsn || !dsn.period) return '';
      const t = this.t;
      const day = this.dsnDay || dsn.period.start;
      const t0 = Date.parse(day + 'T00:00:00Z');
      const t1 = t0 + 86400000;
      const W = 1000;
      const rowH = 28;
      let svg = '';
      const lines = [];
      dsn.stations.forEach((st, r) => {
        const y = 4 + r * (rowH + 6);
        svg += `<rect class="l2-dsn-base" x="0" y="${y}" width="${W}" height="${rowH}" rx="3"/>`;
        const spans = [];
        for (const w of st.windows) {
          const a = Date.parse(w.start_utc);
          const b = Date.parse(w.end_utc);
          if (b <= t0 || a >= t1) continue;
          const xa = (Math.max(a, t0) - t0) / 86400000 * W;
          const xb = (Math.min(b, t1) - t0) / 86400000 * W;
          svg += `<rect class="l2-dsn-win" x="${xa.toFixed(1)}" y="${y}" width="${Math.max(2, xb - xa).toFixed(1)}" height="${rowH}" rx="3"/>`;
          spans.push(`${new Date(Math.max(a, t0)).toISOString().slice(11, 16)}-${new Date(Math.min(b, t1)).toISOString().slice(11, 16)}`);
        }
        lines.push(`<li><strong>${esc(st.name)}</strong> (${esc(st.place)}): <span class="cell-nowrap">${spans.length ? esc(spans.join(', ')) : esc(t('l2.dsn_none'))}</span></li>`);
      });
      for (let h = 0; h <= 24; h += 6) {
        const x = (h / 24) * W;
        svg += `<text class="l2-axis-text" x="${Math.min(x + 3, W - 28)}" y="${4 + dsn.stations.length * (rowH + 6) + 8}">${String(h).padStart(2, '0')}:00</text>`;
      }
      const H = 4 + dsn.stations.length * (rowH + 6) + 14;
      const fr = dsnSite
        ? `<p class="l2-fact">${esc(t('l2.dsn_fraction', { comm: this.fmt(dsnSite.comm_fraction * 100, 1), earth: this.fmt(dsnSite.earth_visible_fraction * 100, 1) }))}</p>`
        : '';
      return `
        <div class="l2-block">
          <h3 class="subheading">${esc(t('l2.dsn_title'))}</h3>
          <p class="card-desc">${esc(t('l2.dsn_desc', { deg: this.fmt(dsn.min_elev_deg, 0) }))}</p>
          ${fr}
          <label class="l2-day-label" for="l2-dsn-day">${esc(t('l2.dsn_day'))}</label>
          <input id="l2-dsn-day" class="l2-day-input" type="date" value="${esc(day)}" min="${esc(dsn.period.start)}" max="${esc(dsn.period.end)}">
          <svg class="l2-dsn-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t('l2.dsn_chart_label', { day }))}">${svg}</svg>
          <ul class="l2-dsn-list">${lines.join('')}</ul>
        </div>`;
    }

    shadowBlock(rows) {
      if (!rows || !rows.length) return '';
      const t = this.t;
      const kindOf = (r) => t(r.point_kind === 'best' ? 'l2.point_best' : r.point_kind === 'center' ? 'l2.point_center' : 'l2.point_other');
      const perOf = (r) => (r.period === 'calendar' ? t('l2.period_calendar') : t('l2.period_long'));
      const body = rows
        .map(
          (r) => `<tr><td>${esc(kindOf(r))}</td><td>${esc(perOf(r))}</td><td class="cell-nowrap">${this.fmt(r.longest_shadow_hours, 1)} h (${this.fmt(r.longest_shadow_hours / 24, 1)} d)</td><td class="cell-nowrap">${esc(String(r.shadow_start_utc).slice(0, 16).replace('T', ' '))}</td><td class="cell-nowrap">${esc(String(r.shadow_end_utc).slice(0, 16).replace('T', ' '))}</td><td class="cell-nowrap">${this.fmt(r.sens_longest_hours, 1)} h</td></tr>`
        )
        .join('');
      const def = this.data.l2.shadowDefinition;
      return `
        <div class="l2-block">
          <h3 class="subheading">${esc(t('l2.shadow_title'))}</h3>
          <p class="card-desc">${esc(t('l2.shadow_desc'))}</p>
          <div class="table-responsive" tabindex="0" role="region" aria-label="${esc(t('l2.shadow_title'))}">
            <table class="verify-table"><thead><tr><th scope="col">${esc(t('l2.col_point'))}</th><th scope="col">${esc(t('l2.col_period'))}</th><th scope="col">${esc(t('l2.col_longest'))}</th><th scope="col">${esc(t('l2.col_start'))}</th><th scope="col">${esc(t('l2.col_end'))}</th><th scope="col">${esc(t('l2.col_sens'))}</th></tr></thead><tbody>${body}</tbody></table>
          </div>
          ${def ? `<p class="l2-fine">${esc(def.representative || '')}</p>` : ''}
        </div>`;
    }

    render() {
      const t = this.t;
      const l2 = this.data && this.data.l2;
      if (!l2 || !l2.available) {
        this.container.innerHTML = `<div class="card l2-card"><div class="card-header"><h2 class="card-title">${esc(t('l2.title'))}</h2><p class="card-desc">${esc(t('l2.empty'))}</p></div></div>`;
        return;
      }
      const bundle = l2.bySite[this.siteId];
      if (!bundle) {
        this.container.innerHTML = `<div class="card l2-card"><div class="card-header"><h2 class="card-title">${esc(t('l2.title'))}</h2><p class="card-desc">${esc(t('l2.empty_site'))}</p></div></div>`;
        return;
      }
      const reg = bundle.region;
      const field = reg.score_field || 'joint_sun_earth_hours';
      const best = reg.points.find((p) => p.point_id === reg.best_point_id);
      const bestV = best ? best[field] : null;
      const cal = l2.calendar;
      const calEntry = bundle.calendar;
      const periodTxt = reg.score_period ? `${reg.score_period.start} to ${reg.score_period.end}` : '';
      const total = cal && cal.period ? dayIndex(cal.period.end, cal.period.start) + 1 : null;
      const sum = l2.summary;

      const bestLine = t('l2.best_line', {
        name: this.siteName(),
        point: reg.best_point_id,
        best: this.fmt(bestV, 0),
        center: this.fmt(reg.center[field], 0),
        gain: this.fmt(reg.best_vs_center_hours, 0),
        period: periodTxt
      });
      const calLine = cal && calEntry && total
        ? t('l2.calendar_count', { n: this.fmt(calEntry.n_dates_ok, 0), total: this.fmt(total, 0), x: this.fmt(cal.x_hours, 0), y: this.fmt(cal.y_earth_pct, 0) })
        : '';
      const flipLine = sum && sum.rank_pairs_total != null
        ? t('l2.flip_line', { shift: this.fmt(sum.shift_days, 0), a: this.fmt(sum.rank_changed_combos, 0), b: this.fmt(sum.rank_pairs_total, 0), c: this.fmt(sum.top1_changed_dates, 0), d: this.fmt(sum.dates_total, 0) })
        : '';

      this.container.innerHTML = `
        <div class="card l2-card">
          <div class="card-header">
            <h2 id="l2-heading" class="card-title">${esc(t('l2.title'))}</h2>
            <p class="card-desc">${esc(t('l2.description'))}</p>
          </div>
          <div class="l2-body">
            <div class="l2-block l2-top">
              <div class="l2-grid-wrap">${this.gridSvg(reg)}
                <p class="l2-fine">${esc(t('l2.grid_note', { step: this.fmt((reg.grid_step_m || 2000) / 1000, 0) }))}</p>
              </div>
              <div class="l2-facts">
                <h3 class="subheading">${esc(t('l2.best_title'))}</h3>
                <p class="l2-fact l2-fact-main">${esc(bestLine)}</p>
                <p class="l2-fine">${esc(reg.region_box_assumption || '')}</p>
                <p class="l2-fine">${esc(t('l2.approx_note'))}</p>
              </div>
            </div>
            <div class="l2-block">
              <h3 class="subheading">${esc(t('l2.calendar_title'))}</h3>
              <p class="l2-fact">${esc(calLine)}</p>
              ${this.calendarSvg(calEntry)}
              <p class="l2-fine">${esc(t('l2.example_note', { x: cal ? this.fmt(cal.x_hours, 0) : '-', y: cal ? this.fmt(cal.y_earth_pct, 0) : '-' }))}</p>
              <p class="l2-fact">${esc(flipLine)}</p>
            </div>
            ${this.shadowBlock(bundle.shadow)}
            ${this.dsnBlock(bundle.dsn)}
          </div>
          <div class="view-summary" aria-live="polite">${esc(t('l2.live_summary', { name: this.siteName(), point: reg.best_point_id, gain: this.fmt(reg.best_vs_center_hours, 0) }))}</div>
        </div>`;

      const inp = this.container.querySelector('#l2-dsn-day');
      if (inp) {
        inp.addEventListener('change', (e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            this.dsnDay = v;
            this.render();
            const again = this.container.querySelector('#l2-dsn-day');
            if (again) again.focus();
          }
        });
      }
    }
  }

  LW.L2View = L2View;
})();
