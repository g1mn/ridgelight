// Written with SI (AI coding model) assistance and reviewed by the author.
// web/src/app.js
// Main application entry: coordinates views, URL params, i18n, and theme.
(function () {
  const LW = (globalThis.LW = globalThis.LW || {});

  class App {
    constructor() {
      this.currentLang = 'en';
      this.currentTheme = 'dark';
      this.selectedSiteId = null;
      this.timeIndex = 0;
      this.data = null;

      this.views = {
        map: null,
        dome: null,
        verify: null,
        timeline: null,
        compare: null,
        l2: null,
        m1: null
      };

      this.t = this.t.bind(this);
      this.formatNumber = this.formatNumber.bind(this);
    }

    init() {
      // 1. Process URL parameters
      const search = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      const urlParams = new URLSearchParams(search);
      const urlLang = urlParams.get('lang');
      const urlTheme = urlParams.get('theme');
      const urlSite = urlParams.get('site');
      const urlT = urlParams.get('t');

      // 2. Resolve Theme (Dark is default)
      let savedTheme = null;
      try {
        savedTheme = localStorage.getItem('lw_theme');
      } catch {
        // LocalStorage blocked
      }
      if (urlTheme === 'light' || urlTheme === 'dark') {
        this.currentTheme = urlTheme;
      } else if (savedTheme === 'light' || savedTheme === 'dark') {
        this.currentTheme = savedTheme;
      } else {
        this.currentTheme = 'dark';
      }
      this.applyTheme(this.currentTheme, false);

      // 3. Resolve Language ('en' is default)
      const supportedLangs = ['en', 'ko', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'vi'];
      let savedLang = null;
      try {
        savedLang = localStorage.getItem('lw_lang');
      } catch {
        // LocalStorage blocked
      }
      if (urlLang && supportedLangs.includes(urlLang)) {
        this.currentLang = urlLang;
      } else if (savedLang && supportedLangs.includes(savedLang)) {
        this.currentLang = savedLang;
      } else {
        this.currentLang = 'en';
      }
      document.documentElement.lang = this.currentLang;

      // 4. Resolve track index
      if (urlT != null) {
        const parsedT = parseInt(urlT, 10);
        if (!isNaN(parsedT) && parsedT >= 0) {
          this.timeIndex = parsedT;
        }
      }

      // 5. Parse Data
      const rawData = globalThis.LW_DATA || null;
      this.data = LW.model.normalizeData(rawData);

      // 6. Resolve Initial Site
      if (urlSite && this.data.sitesMap[urlSite]) {
        this.selectedSiteId = urlSite;
      } else if (this.data.sites.length > 0) {
        this.selectedSiteId = this.data.sites[0].site_id;
      }

      // 7. Bind Header & Footer elements
      this.bindControls();

      // 8. Initialize Views
      this.initViews();

      // 9. Update all UI text
      this.updateAllLanguage();
    }

    applyTheme(theme, saveToStorage = true) {
      this.currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      if (saveToStorage) {
        try {
          localStorage.setItem('lw_theme', theme);
        } catch {
          // ignore
        }
      }
      this.updateUrlParams();
      this.updateThemeButton();
    }

    applyLang(lang, saveToStorage = true) {
      this.currentLang = lang;
      document.documentElement.lang = lang;
      if (saveToStorage) {
        try {
          localStorage.setItem('lw_lang', lang);
        } catch {
          // ignore
        }
      }
      this.updateUrlParams();
      this.updateAllLanguage();
    }

    t(key, params) {
      const i18n = globalThis.LW_I18N || {};
      const dict = i18n[this.currentLang] || i18n['en'] || {};

      const parts = key.split('.');
      let val = dict;
      for (const p of parts) {
        if (val && typeof val === 'object' && p in val) {
          val = val[p];
        } else {
          val = null;
          break;
        }
      }

      // Fallback to English dict
      if (typeof val !== 'string' && dict !== (i18n['en'] || {})) {
        let fallbackVal = i18n['en'] || {};
        for (const p of parts) {
          if (fallbackVal && typeof fallbackVal === 'object' && p in fallbackVal) {
            fallbackVal = fallbackVal[p];
          } else {
            fallbackVal = null;
            break;
          }
        }
        if (typeof fallbackVal === 'string') val = fallbackVal;
      }

      if (typeof val !== 'string') {
        return key;
      }

      if (params && typeof params === 'object') {
        return val.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
      }

      return val;
    }

    formatNumber(num) {
      try {
        return new Intl.NumberFormat(this.currentLang).format(num);
      } catch {
        return String(num);
      }
    }

    bindControls() {
      const themeBtn = document.getElementById('btn-theme-toggle');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
          this.applyTheme(nextTheme, true);
        });
      }

      const langSelect = document.getElementById('select-lang');
      if (langSelect) {
        langSelect.value = this.currentLang;
        langSelect.addEventListener('change', (e) => {
          this.applyLang(e.target.value, true);
        });
      }
    }

    updateThemeButton() {
      const themeBtn = document.getElementById('btn-theme-toggle');
      if (themeBtn) {
        const isDark = this.currentTheme === 'dark';
        const labelText = isDark ? this.t('app.theme_light') : this.t('app.theme_dark');
        themeBtn.setAttribute('aria-label', `${this.t('app.theme_toggle')} (${labelText})`);
        themeBtn.innerHTML = `<span class="theme-icon" aria-hidden="true">${isDark ? '☀️' : '🌙'}</span> <span class="theme-label">${labelText}</span>`;
      }
    }

    initViews() {
      const mapContainer = document.getElementById('map-view-container');
      if (mapContainer && LW.MapView) {
        this.views.map = new LW.MapView(mapContainer, {
          t: this.t,
          formatNumber: this.formatNumber,
          onSelectSite: (siteId) => this.selectSite(siteId)
        });
        this.views.map.setData(this.data, this.selectedSiteId);
      }

      const domeContainer = document.getElementById('dome-view-container');
      if (domeContainer && LW.DomeView) {
        this.views.dome = new LW.DomeView(domeContainer, {
          t: this.t,
          formatNumber: this.formatNumber,
          initialTimeIndex: this.timeIndex,
          onTimeChange: (timeIdx) => this.onTimeChange(timeIdx)
        });
        this.views.dome.setData(this.data, this.selectedSiteId, this.timeIndex);
      }

      const verifyContainer = document.getElementById('verify-view-container');
      if (verifyContainer && LW.VerifyView) {
        this.views.verify = new LW.VerifyView(verifyContainer, {
          t: this.t,
          formatNumber: this.formatNumber
        });
        this.views.verify.setData(this.data);
      }

      const timelineContainer = document.getElementById('timeline-view-container');
      if (timelineContainer && LW.TimelineView) {
        this.views.timeline = new LW.TimelineView(timelineContainer, {
          t: this.t,
          formatNumber: this.formatNumber
        });
        this.views.timeline.setData(this.data, this.selectedSiteId);
      }

      const l2Container = document.getElementById('l2-view-container');
      if (l2Container && LW.L2View) {
        this.views.l2 = new LW.L2View(l2Container, {
          t: this.t,
          formatNumber: this.formatNumber
        });
        this.views.l2.setData(this.data, this.selectedSiteId);
      }

      const m1Container = document.getElementById('m1-view-container');
      if (m1Container && LW.M1View) {
        this.views.m1 = new LW.M1View(m1Container, {
          t: this.t,
          formatNumber: this.formatNumber
        });
        this.views.m1.setData(this.data);
      }

      const compareContainer = document.getElementById('compare-view-container');
      if (compareContainer && LW.CompareView) {
        this.views.compare = new LW.CompareView(compareContainer, {
          t: this.t,
          formatNumber: this.formatNumber
        });
        this.views.compare.setData(this.data, this.selectedSiteId);
      }
    }

    selectSite(siteId) {
      if (this.selectedSiteId === siteId) return;
      this.selectedSiteId = siteId;
      this.updateUrlParams();

      if (this.views.map) this.views.map.selectSite(siteId);
      if (this.views.dome) this.views.dome.selectSite(siteId);
      if (this.views.timeline) this.views.timeline.selectSite(siteId);
      if (this.views.compare) this.views.compare.setData(this.data, siteId);
      if (this.views.l2) this.views.l2.selectSite(siteId);
    }

    onTimeChange(timeIdx) {
      this.timeIndex = timeIdx;
      this.updateUrlParams();
    }

    updateUrlParams() {
      try {
        if (typeof window === 'undefined' || !window.location || !window.location.href) return;
        const url = new URL(window.location.href);
        url.searchParams.set('lang', this.currentLang);
        url.searchParams.set('theme', this.currentTheme);
        if (this.selectedSiteId) {
          url.searchParams.set('site', this.selectedSiteId);
        } else {
          url.searchParams.delete('site');
        }
        url.searchParams.set('t', String(this.timeIndex));
        window.history.replaceState({}, '', url.toString());
      } catch {
        // In file:// protocol or restricted environments, replaceState may be restricted
      }
    }

    updateAllLanguage() {
      const appTitle = document.getElementById('app-title');
      if (appTitle) appTitle.textContent = this.t('app.title');

      const appSubtitle = document.getElementById('app-subtitle');
      if (appSubtitle) appSubtitle.textContent = this.t('app.subtitle');
      const appTagline = document.getElementById('app-tagline');
      if (appTagline) appTagline.textContent = this.t('app.tagline');

      const langLabel = document.getElementById('lbl-lang-select');
      if (langLabel) langLabel.textContent = this.t('app.language');

      const footerSource = document.getElementById('footer-source-note');
      if (footerSource) footerSource.textContent = this.t('footer.data_source_note');

      const footerDisclaimer = document.getElementById('footer-disclaimer');
      if (footerDisclaimer) footerDisclaimer.textContent = this.t('footer.unofficial_disclaimer');

      const langSelect = document.getElementById('select-lang');
      if (langSelect) langSelect.value = this.currentLang;

      this.updateThemeButton();

      if (this.views.map) this.views.map.updateLanguage(this.t, this.formatNumber);
      if (this.views.dome) this.views.dome.updateLanguage(this.t, this.formatNumber);
      if (this.views.verify) this.views.verify.updateLanguage(this.t, this.formatNumber);
      if (this.views.timeline) this.views.timeline.updateLanguage(this.t, this.formatNumber);
      if (this.views.compare) this.views.compare.updateLanguage(this.t, this.formatNumber);
      if (this.views.l2) this.views.l2.updateLanguage(this.t, this.formatNumber);
      if (this.views.m1) this.views.m1.updateLanguage(this.t, this.formatNumber);
    }
  }

  LW.App = App;

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const app = new App();
      LW.appInstance = app;
      app.init();
    });
  } else {
    const app = new App();
    LW.appInstance = app;
    app.init();
  }
})();
