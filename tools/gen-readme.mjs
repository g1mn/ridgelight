// Written with SI (AI coding model) assistance and reviewed by the author.
// tools/gen-readme.mjs
// Builds README.md from tools/readme-template.md and the JSON files in verify/ and data/.
// No number in the verification table or in the result sentences is typed by hand:
//   {{table}}                        the verification table (rows defined below, cells filled from the JSON files)
//   {{v file#key|decimals|unit}}     value from a JSON file, followed by the hidden marker <!--v:file#key-->
//   {{v file#key|decimals|unit|x100}} the same, value times 100
//   {{note l1a}} and similar        small facts that are words, taken from the JSON files
// Run: node tools/gen-readme.mjs   (writes README.md)   or   node tools/gen-readme.mjs --check   (exit 1 if README.md is stale)

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const cache = {};
function load(rel) {
  if (!(rel in cache)) {
    const p = path.join(root, rel);
    cache[rel] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  return cache[rel];
}

// key path: a.b, rows.3.x, sites[id].x, list[] (length)
function getKey(obj, key) {
  let cur = obj;
  const parts = key.split('.');
  for (let i = 0; i < parts.length; i++) {
    const m = /^([A-Za-z_][\w-]*|\d+)(?:\[([\w-]*)\])?$/.exec(parts[i]);
    if (!m) throw new Error('bad key ' + key);
    const [, name, sel] = m;
    if (cur == null || !(name in Object(cur))) throw new Error('no key ' + key);
    cur = cur[name];
    if (sel === undefined) continue;
    if (!Array.isArray(cur)) throw new Error('not a list ' + key);
    if (sel === '') {
      if (i !== parts.length - 1) throw new Error('bad key ' + key);
      return cur.length;
    }
    const hit = cur.filter((e) => e && ['site_id', 'region_id', 'point_id', 'id'].some((f) => String(e[f]) === sel));
    if (hit.length !== 1) throw new Error('no unique element ' + key);
    cur = hit[0];
  }
  return cur;
}

function val(rel, key) {
  const d = load(rel);
  if (d == null) throw new Error('missing file ' + rel);
  return getKey(d, key);
}

function fmtNum(x, dec, mode) {
  if (mode === 'e') return x.toExponential(dec).replace('e-0', 'e-').replace('e+0', 'e+').replace('e+', 'e');
  const s = x.toFixed(dec);
  const [i, f] = s.split('.');
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? withCommas + '.' + f : withCommas;
}

function numTok(rel, key, dec, x100, mode) {
  let x = val(rel, key);
  if (typeof x !== 'number') throw new Error('not a number ' + rel + '#' + key);
  if (x100) x *= 100;
  return fmtNum(x, dec, mode);
}

// ---- table rows ----------------------------------------------------------------------------------------------
// m: measured [key, decimals, mode?, x100?, label before the number]; t: target keys; n: n keys
function siteName(id) {
  const s = (load('data/sites.json') || { sites: [] }).sites.find((e) => (e.site_id || e.id) === id);
  return s ? s.name : id;
}

function rowsDef() {
  const rows = [];
  const l1a = 'verify/l1a-summary.json';
  rows.push({
    check: 'SPICE implementation check (matches Horizons)',
    file: l1a,
    n: ['n_pairs'],
    m: [['max_sep_deg', 2, 'e', false, 'max'], ['median_sep_deg', 2, 'e', false, 'median']],
    unit: 'deg',
    t: [['target_max_sep_deg', 2, '', false]],
    keys: ['n_pairs', 'max_sep_deg', 'median_sep_deg', 'target_max_sep_deg']
  });
  const l1b = 'verify/l1b-summary.json';
  rows.push({
    check: 'Terrain model vs LOLA average visibility maps (model against model)',
    file: l1b,
    n: ['n'],
    m: [['mae_sun_pp', 2, '', false, 'Sun MAE'], ['r_sun', 3, '', false, 'r'], ['mae_earth_pp', 2, '', false, 'Earth MAE'], ['r_earth', 3, '', false, 'r']],
    unitAfter: { mae_sun_pp: ' pp', mae_earth_pp: ' pp' },
    t: [['target_mae_sun_pp', 0], ['target_r_sun', 2], ['target_mae_earth_pp', 0], ['target_r_earth', 2]],
    tUnit: { target_mae_sun_pp: ' pp', target_mae_earth_pp: ' pp' },
    keys: ['n', 'mae_sun_pp', 'r_sun', 'mae_earth_pp', 'r_earth', 'target_mae_sun_pp', 'target_r_sun', 'target_mae_earth_pp', 'target_r_earth', 'gate'],
    text: ['gate'],
    statusExtra: (d) => ` (gate ${d.gate})`
  });
  const m1 = 'verify/m1-summary.json';
  rows.push({
    check: 'LROC images vs predicted shadow (real photographs, points 88 to 90 deg S)',
    file: m1,
    n: ['frames'],
    m: [['agreement_pct', 2, '', false, 'agreement', '%'], ['kappa', 3, '', false, 'kappa'], ['baseline.agreement_pct', 2, '', false, 'flat horizon', '%']],
    t: [['target.agreement_pct_min', 0, '', false]],
    tUnit: { 'target.agreement_pct_min': '%' },
    tSuffix: ' and above the flat horizon result',
    keys: ['frames', 'agreement_pct', 'kappa', 'baseline.agreement_pct', 'target.agreement_pct_min', 'target_met']
  });
  rows.push({
    check: 'Share of a year in sunlight, LROC illumination map vs model',
    file: m1,
    n: [],
    m: [['year_compare.n', 0, '', false, 'points'], ['year_compare.mae_pp', 2, '', false, 'MAE', ' pp'], ['year_compare.r', 3, '', false, 'r']],
    t: [],
    keys: ['year_compare.n', 'year_compare.mae_pp', 'year_compare.r']
  });
  const l2 = 'verify/l2-summary.json';
  const gains = val(l2, 'best_vs_center_hours');
  const ids = Object.keys(gains);
  const lo = ids.reduce((a, b) => (gains[b] < gains[a] ? b : a));
  const hi = ids.reduce((a, b) => (gains[b] > gains[a] ? b : a));
  rows.push({
    check: `Best point vs region point, joint Sun and Earth hours (smallest gain ${siteName(lo)}, largest ${siteName(hi)})`,
    file: l2,
    n: ['region_ids[]'],
    m: [[`best_vs_center_hours.${lo}`, 0, '', false, '+', ' h'], [`best_vs_center_hours.${hi}`, 0, '', false, '+', ' h']],
    sign: '+',
    t: [],
    keys: ['region_ids[]', `best_vs_center_hours.${lo}`, `best_vs_center_hours.${hi}`]
  });
  rows.push({
    check: `${val(l2, 'shift_days')} day shift of the landing date: region pairs whose order flipped, dates whose top region changed`,
    file: l2,
    n: ['region_ids[]'],
    m: [['rank_changed_combos', 0, '', false, 'flipped'], ['rank_pairs_total', 0, '', false, 'of'], ['top1_changed_dates', 0, '', false, 'top region changed on'], ['dates_total', 0, '', false, 'of']],
    t: [],
    keys: ['region_ids[]', 'rank_changed_combos', 'rank_pairs_total', 'top1_changed_dates', 'dates_total']
  });
  const sh = load('data/shadow.json').rows;
  let iLo = 0;
  let iHi = 0;
  sh.forEach((r, i) => {
    if (r.longest_shadow_hours < sh[iLo].longest_shadow_hours) iLo = i;
    if (r.longest_shadow_hours > sh[iHi].longest_shadow_hours) iHi = i;
  });
  const dsc = (r) => `${siteName(r.site_id)}, ${r.point_kind === 'best' ? 'best point' : 'region point'}, ${r.period === 'calendar' ? '2027 to 2028' : '18.6 years'}`;
  rows.push({
    check: `Longest continuous shadow, shortest (${dsc(sh[iLo])}) and longest (${dsc(sh[iHi])})`,
    file: 'data/shadow.json',
    n: ['rows[]'],
    m: [[`rows.${iLo}.longest_shadow_hours`, 1, '', false, '', ' h'], [`rows.${iHi}.longest_shadow_hours`, 1, '', false, '', ' h']],
    t: [],
    keys: ['rows[]', `rows.${iLo}.longest_shadow_hours`, `rows.${iHi}.longest_shadow_hours`]
  });
  const dh = 'verify/dsn-horizons-summary.json';
  rows.push({
    check: 'DSN station window edges vs Horizons',
    file: dh,
    n: ['n_boundaries'],
    m: [['max_diff_min', 3, '', false, 'max', ' min']],
    t: [['target_max_diff_min', 0, '', false]],
    tUnit: { target_max_diff_min: ' min' },
    keys: ['n_boundaries', 'max_diff_min', 'target_max_diff_min', 'target_met']
  });
  const dsn = load('data/dsn.json').sites;
  const dLo = dsn.reduce((a, b) => (b.comm_fraction < a.comm_fraction ? b : a));
  const dHi = dsn.reduce((a, b) => (b.comm_fraction > a.comm_fraction ? b : a));
  rows.push({
    check: `Share of 2027 to 2028 with Earth visible and a DSN station able to see the Moon, lowest (${siteName(dLo.site_id)}) and highest (${siteName(dHi.site_id)}); station limit ${fmtNum(val('data/dsn.json', 'min_elev_deg'), 0)} deg is an example`,
    file: 'data/dsn.json',
    n: ['sites[]'],
    m: [[`sites[${dLo.site_id}].comm_fraction`, 1, '', true, '', '%'], [`sites[${dHi.site_id}].comm_fraction`, 1, '', true, '', '%']],
    t: [],
    keys: ['sites[]', `sites[${dLo.site_id}].comm_fraction`, `sites[${dHi.site_id}].comm_fraction`],
    x100: true
  });
  return rows;
}

function buildTable() {
  const head = '| Check | n | Measured | Target set at hackathon start | Status | Source |\n|---|---|---|---|---|---|';
  const lines = [head];
  for (const r of rowsDef()) {
    const d = load(r.file);
    const nCell = r.n.length ? r.n.map((k) => numTok(r.file, k, 0, false)).join(', ') : '-';
    const mParts = r.m.map(([k, dec, mode, x100, label, unit]) => {
      const tok = numTok(r.file, k, dec, x100, mode);
      const u = (r.unitAfter && r.unitAfter[k]) || unit || '';
      const lab = label === '+' ? '+' : label ? label + ' ' : '';
      return lab === '+' ? `+${tok}${u}` : `${lab}${tok}${u}`;
    });
    let mCell = mParts.join(r.file === l2f() ? '; ' : ', ');
    if (r.unit) mCell += ' ' + r.unit;
    if (r.file === 'verify/l2-summary.json' && r.m.length === 4) {
      mCell = `${mParts[0]} ${mParts[1].replace('of ', 'of ')}; ${mParts[2]} ${mParts[3]}`;
    }
    if (r.m.length === 2 && r.sign) mCell = mParts.join(' to ');
    if (r.x100) mCell = mParts.join(' to ');
    if (r.file === 'data/shadow.json') mCell = mParts.join(' to ');
    const tCell = r.t.length
      ? r.t.map(([k, dec]) => numTok(r.file, k, dec, false) + ((r.tUnit && r.tUnit[k]) || (r.unit ? '' : ''))).join(', ') + (r.unit && r.t.length === 1 ? ' ' + r.unit : '') + (r.tSuffix || '')
      : '-';
    // status, same rules as the check tool
    let status = 'reported';
    const pairs = [];
    for (const [k] of r.m) {
      const cands = [[`target_${k}`, null], [`target.${k}`, null], [`target_${k}_min`, 'ge'], [`target.${k}_min`, 'ge'], [`target_${k}_max`, 'le'], [`target.${k}_max`, 'le']];
      for (const [c, dir] of cands) {
        let tv;
        try { tv = getKey(d, c); } catch { continue; }
        if (typeof tv !== 'number') continue;
        const last = k.replace(/\[[^\]]*\]/g, '').split('.').pop().toLowerCase();
        const lower = ['mae', 'max', 'sep', 'err', 'rmse', 'diff'].some((s) => last.includes(s));
        const mv = getKey(d, k);
        pairs.push((dir || (lower ? 'le' : 'ge')) === 'le' ? mv <= tv : mv >= tv);
        break;
      }
    }
    if (pairs.length) status = pairs.every(Boolean) ? 'met' : 'not met';
    if (r.statusExtra) status += r.statusExtra(d);
    const src = '`' + r.file + '` ' + r.keys.map((k) => '`' + k + '`' + (r.x100 && /comm_fraction/.test(k) ? ' x100' : '')).join(' ');
    lines.push(`| ${r.check} | ${nCell} | ${mCell} | ${tCell} | ${status} | ${src} |`);
  }
  return lines.join('\n');
}
function l2f() { return 'verify/l2-summary.json'; }

function expand(tpl) {
  let out = tpl.replace(/\{\{table\}\}/g, () => buildTable());
  const iau = ((load('data/sites.json') || {}).sites || []).map((s) => s.iau_offset_km).filter((x) => typeof x === 'number');
  out = out.replace(/\{\{iau_min\}\}/g, () => Math.min(...iau).toFixed(1)).replace(/\{\{iau_max\}\}/g, () => Math.max(...iau).toFixed(1));
  out = out.replace(/\{\{v ([^#\s}]+)#([^|}\s]+)\|(\d+)\|([^|}]*)(\|x100)?\}\}/g, (_, file, key, dec, unit, x100) => {
    return `${numTok(file, key, Number(dec), !!x100)}${unit}<!--v:${file}#${key}${x100 ? ' x100' : ''}-->`;
  });
  out = out.replace(/\{\{e ([^#\s}]+)#([^|}\s]+)\|(\d+)\|([^|}]*)\}\}/g, (_, file, key, dec, unit) => {
    return `${numTok(file, key, Number(dec), false, 'e')}${unit}<!--v:${file}#${key}-->`;
  });
  out = out.replace(/\{\{w ([^#\s}]+)#([^}\s]+)\}\}/g, (_, file, key) => String(val(file, key)));
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error('unexpanded token ' + left[0]);
  return out;
}

const tpl = fs.readFileSync(path.join(root, 'tools', 'readme-template.md'), 'utf8');
const out = expand(tpl);
if (out.includes('\u2014')) throw new Error('em dash in README');
const target = path.join(root, 'README.md');
if (args.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) {
    console.error('README.md is stale: run node tools/gen-readme.mjs');
    process.exit(1);
  }
  console.log('README.md is current');
} else {
  fs.writeFileSync(target, out);
  console.log('Wrote README.md (' + out.length + ' bytes)');
}
