// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/verify.js
// Verification Panel table view
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class VerifyView {
    constructor(containerEl, options) {
      this.container = containerEl;
      this.options = options || {};
      this.data = null;
      this.t = options.t || ((k) => k);
      this.formatNumber = options.formatNumber || ((n) => String(n));

      this.renderSkeleton();
    }

    renderSkeleton() {
      this.container.innerHTML = `
        <div class="card verify-card">
          <div class="card-header">
            <h2 id="verify-heading" class="card-title"></h2>
            <p id="verify-desc" class="card-desc"></p>
            <p id="verify-scope" class="card-method-note"></p>
          </div>
          <div class="verify-body">
            <div class="table-responsive" tabindex="0" role="region" aria-label="Verification table">
              <table class="verify-table">
                <thead>
                  <tr>
                    <th id="th-comp" scope="col"></th>
                    <th id="th-n" scope="col"></th>
                    <th id="th-meas" scope="col"></th>
                    <th id="th-target" scope="col"></th>
                    <th id="th-status" scope="col"></th>
                    <th id="th-source" scope="col"></th>
                  </tr>
                </thead>
                <tbody id="verify-tbody"></tbody>
              </table>
            </div>
          </div>
          <div id="verify-summary" class="view-summary" aria-live="polite"></div>
        </div>
      `;
    }

    updateLanguage(t, formatNumber) {
      this.t = t;
      this.formatNumber = formatNumber;

      this.container.querySelector('#verify-heading').textContent = t('verify.title');
      this.container.querySelector('#verify-desc').textContent = t('verify.description');
      this.container.querySelector('#verify-scope').textContent = t('verify.scope_note');
      this.container.querySelector('#th-comp').textContent = t('verify.col_comparison');
      this.container.querySelector('#th-n').textContent = t('verify.col_n');
      this.container.querySelector('#th-meas').textContent = t('verify.col_measured');
      this.container.querySelector('#th-target').textContent = t('verify.col_target');
      this.container.querySelector('#th-status').textContent = t('verify.col_status');
      this.container.querySelector('#th-source').textContent = t('verify.col_source');

      this.renderTable();
      this.updateSummary();
    }

    setData(data) {
      this.data = data;
      this.renderTable();
      this.updateSummary();
    }

    renderTable() {
      const tbody = this.container.querySelector('#verify-tbody');
      tbody.innerHTML = '';

      const rows = (this.data && this.data.verifyRows) || [];

      for (const row of rows) {
        const tr = document.createElement('tr');
        tr.className = `verify-row verify-row-${row.id} ${row.isError ? 'row-error' : ''}`;

        // 1. Comparison title + description
        const tdComp = document.createElement('td');
        tdComp.className = 'cell-comparison';
        const titleText = row.titleKey ? this.t(row.titleKey) : row.comparison;
        tdComp.innerHTML = `<strong class="comp-title">${titleText}</strong><div class="comp-desc">${row.comparison}</div>`;
        tr.appendChild(tdComp);

        // 2. n
        const tdN = document.createElement('td');
        tdN.className = 'cell-n cell-nowrap';
        tdN.textContent = row.n;
        tr.appendChild(tdN);

        // 3. Measured
        const tdMeas = document.createElement('td');
        tdMeas.className = 'cell-measured cell-nowrap';
        tdMeas.textContent = row.measured;
        tr.appendChild(tdMeas);

        // 4. Target
        const tdTarget = document.createElement('td');
        tdTarget.className = 'cell-target cell-nowrap';
        tdTarget.textContent = row.target;
        tr.appendChild(tdTarget);

        // 5. Status
        const tdStatus = document.createElement('td');
        tdStatus.className = 'cell-status cell-nowrap';
        let icon = '○';
        let statusKey = 'verify.status_not_measured';
        let statusClass = 'status-not-measured';

        if (row.status === 'met') {
          icon = '✓';
          statusKey = 'verify.status_met';
          statusClass = 'status-met';
        } else if (row.status === 'not_met') {
          icon = '✗';
          statusKey = 'verify.status_not_met';
          statusClass = 'status-not-met';
        } else if (row.status === 'info') {
          icon = 'ℹ';
          statusKey = 'verify.status_info';
          statusClass = 'status-info';
        }

        tdStatus.innerHTML = `<span class="badge ${statusClass}"><span class="badge-icon" aria-hidden="true">${icon}</span> ${this.t(statusKey)}</span>`;
        tr.appendChild(tdStatus);

        // 6. Source
        const tdSource = document.createElement('td');
        tdSource.className = 'cell-source cell-nowrap';
        tdSource.innerHTML = `<code>${row.source}</code>`;
        tr.appendChild(tdSource);

        tbody.appendChild(tr);

        // Subrow note under a row (L1(a) is not counted as a truth comparison, and so on)
        if (row.noteKey) {
          const subTr = document.createElement('tr');
          subTr.className = 'verify-subrow l1a-subrow';
          const subTd = document.createElement('td');
          subTd.colSpan = 6;
          subTd.className = 'subrow-text';
          subTd.textContent = this.t(row.noteKey);
          subTr.appendChild(subTd);
          tbody.appendChild(subTr);
        }
      }
    }

    updateSummary() {
      const summaryEl = this.container.querySelector('#verify-summary');
      const rows = (this.data && this.data.verifyRows) || [];
      const count = rows.length;

      summaryEl.textContent = this.t('verify.live_summary', {
        count: String(count)
      });
    }
  }

  LW.VerifyView = VerifyView;
})();
