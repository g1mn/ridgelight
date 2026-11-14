// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/m1.js
// M1 panel: LROC wide angle camera frames against the terrain shadow model.
// Numbers come from verify/m1-summary.json through LW.model (data.m1, data.m1Raw).
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  class M1View {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));
    }

    setData(data) {
      this.data = data;
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

    render() {
      const t = this.t;
      const raw = this.data && this.data.m1Raw;
      if (!raw) {
        this.container.innerHTML = `
          <div class="card m1-card">
            <div class="card-header"><h2 class="card-title">${esc(t('m1.title'))}</h2>
            <p class="card-desc">${esc(t('m1.empty'))}</p></div>
          </div>`;
        return;
      }
      const m = this.data.m1;
      const frames = Array.isArray(raw.frame_list) ? raw.frame_list : [];
      const yc = raw.year_compare && typeof raw.year_compare === 'object' ? raw.year_compare : null;
      const targetTxt = m.targetMin != null ? t('m1.target_line', { pct: this.fmt(m.targetMin, 0) }) : '';
      const metCls = m.targetMet === true ? 'status-met' : m.targetMet === false ? 'status-not-met' : 'status-info';
      const metTxt = m.targetMet === true ? t('verify.status_met') : m.targetMet === false ? t('verify.status_not_met') : t('verify.status_info');
      const metIcon = m.targetMet === true ? '✓' : m.targetMet === false ? '✗' : 'ℹ';

      // Frame bars
      const W = 1000;
      const H = 210;
      const padL = 44;
      const padB = 24;
      const plotH = H - padB - 8;
      const n = frames.length || 1;
      const slot = (W - padL - 8) / n;
      const bw = Math.max(2, slot * 0.38);
      let bars = '';
      frames.forEach((f, i) => {
        const x0 = padL + i * slot + slot * 0.08;
        const a = typeof f.agreement_pct === 'number' ? f.agreement_pct : 0;
        const b = typeof f.baseline_agreement_pct === 'number' ? f.baseline_agreement_pct : 0;
        const ha = (a / 100) * plotH;
        const hb = (b / 100) * plotH;
        bars += `<rect class="m1-bar-model" x="${x0.toFixed(1)}" y="${(8 + plotH - ha).toFixed(1)}" width="${bw.toFixed(1)}" height="${ha.toFixed(1)}"/>`;
        bars += `<rect class="m1-bar-base" x="${(x0 + bw + 1).toFixed(1)}" y="${(8 + plotH - hb).toFixed(1)}" width="${bw.toFixed(1)}" height="${hb.toFixed(1)}" fill="url(#m1-pat-base)"/>`;
      });
      let ticks = '';
      [0, 50, 100].forEach((v) => {
        const y = 8 + plotH - (v / 100) * plotH;
        ticks += `<line class="m1-grid" x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}"/><text class="m1-axis-text" x="${padL - 6}" y="${y + 4}" text-anchor="end">${v}%</text>`;
      });
      const firstUtc = frames.length ? String(frames[0].utc_mid).slice(0, 10) : '';
      const lastUtc = frames.length ? String(frames[frames.length - 1].utc_mid).slice(0, 10) : '';
      const axisLbl = `<text class="m1-axis-text" x="${padL}" y="${H - 6}">${esc(firstUtc)}</text><text class="m1-axis-text" x="${W - 8}" y="${H - 6}" text-anchor="end">${esc(lastUtc)}</text>`;
      const chartLabel = t('m1.chart_label', { frames: this.fmt(frames.length, 0) });

      const rows = frames
        .map(
          (f) => `<tr><td class="cell-nowrap">${esc(String(f.utc_mid).replace('T', ' ').slice(0, 16))} UTC</td><td class="cell-nowrap">${esc(f.valid_points)}</td><td class="cell-nowrap">${this.fmt(f.agreement_pct, 1)}%</td><td class="cell-nowrap">${this.fmt(f.baseline_agreement_pct, 1)}%</td></tr>`
        )
        .join('');

      const limits = Array.isArray(raw.limits) ? raw.limits.map((x) => `<li>${esc(x)}</li>`).join('') : '';

      this.container.innerHTML = `
        <div class="card m1-card">
          <div class="card-header">
            <div class="card-title-row">
              <h2 id="m1-heading" class="card-title">${esc(t('m1.title'))}</h2>
              <span class="badge ${metCls}"><span class="badge-icon" aria-hidden="true">${metIcon}</span> ${esc(metTxt)}</span>
            </div>
            <p class="card-desc">${esc(t('m1.description', { frames: this.fmt(raw.frames, 0), points: this.fmt(raw.points, 0) }))}</p>
          </div>
          <div class="m1-body">
            <div class="m1-tiles">
              <div class="m1-tile"><div class="m1-tile-label">${esc(t('m1.agreement'))}</div><div class="m1-tile-value">${this.fmt(m.agreement, 1)}%</div><div class="m1-tile-sub">${esc(targetTxt)}</div></div>
              <div class="m1-tile"><div class="m1-tile-label">${esc(t('m1.kappa'))}</div><div class="m1-tile-value">${this.fmt(m.kappa, 3)}</div><div class="m1-tile-sub">${esc(t('m1.kappa_note'))}</div></div>
              <div class="m1-tile"><div class="m1-tile-label">${esc(t('m1.baseline'))}</div><div class="m1-tile-value">${this.fmt(m.baseline, 1)}%</div><div class="m1-tile-sub">${esc(t('m1.baseline_note'))}</div></div>
              ${yc ? `<div class="m1-tile"><div class="m1-tile-label">${esc(t('m1.year'))}</div><div class="m1-tile-value">${this.fmt(yc.mae_pp, 2)} pp</div><div class="m1-tile-sub">${esc(t('m1.year_note', { n: this.fmt(yc.n, 0), r: this.fmt(yc.r, 3) }))}</div></div>` : ''}
            </div>
            <div class="m1-chart-wrap">
              <svg class="m1-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(chartLabel)}">
                <defs>
                  <pattern id="m1-pat-base" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" stroke="currentColor" stroke-width="1.6"/></pattern>
                </defs>
                ${ticks}${bars}${axisLbl}
              </svg>
              <div class="timeline-legend m1-legend">
                <div class="legend-item"><span class="legend-swatch m1-sw-model" aria-hidden="true"></span>${esc(t('m1.legend_model'))}</div>
                <div class="legend-item"><span class="legend-swatch m1-sw-base" aria-hidden="true"></span>${esc(t('m1.legend_base'))}</div>
              </div>
            </div>
            <details class="m1-details">
              <summary>${esc(t('m1.frames_table'))}</summary>
              <div class="table-responsive" tabindex="0" role="region" aria-label="${esc(t('m1.frames_table'))}">
                <table class="verify-table"><thead><tr><th scope="col">${esc(t('m1.col_time'))}</th><th scope="col">${esc(t('m1.col_points'))}</th><th scope="col">${esc(t('m1.col_model'))}</th><th scope="col">${esc(t('m1.col_base'))}</th></tr></thead><tbody>${rows}</tbody></table>
              </div>
            </details>
            ${limits ? `<div class="m1-limits"><h3 class="subheading">${esc(t('m1.limits'))}</h3><ul>${limits}</ul></div>` : ''}
          </div>
          <div class="view-summary" aria-live="polite">${esc(t('m1.live_summary', { agreement: this.fmt(m.agreement, 1), baseline: this.fmt(m.baseline, 1), kappa: this.fmt(m.kappa, 3), frames: this.fmt(raw.frames, 0) }))}</div>
        </div>`;
    }
  }

  LW.M1View = M1View;
})();
