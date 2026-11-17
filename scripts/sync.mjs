#!/usr/bin/env node
// Normalize raw Coffee Watch records into the public dataset under data/.
//
//   node scripts/sync.mjs [raw-dir]      (default: ./raw)
//
// raw-dir is a local copy of Dropbox /Apps/CoffeeWatch (brew-*.json and
// brew-*-trace.csv). It is never committed. Only curated public fields are
// written: the brew date and its order that day (no clock time), no device
// id, no Dropbox paths and no free-form analysis notes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.resolve(process.argv[2] || path.join(ROOT, 'raw'));
const DATA = path.join(ROOT, 'data');
const beans = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/beans.json'), 'utf8'));
const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/brews.json'), 'utf8')).brews;
const brewers = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog/brewers.json'), 'utf8'));

if (!fs.existsSync(RAW)) {
  console.error(`Raw directory not found: ${RAW}\nCopy Dropbox /Apps/CoffeeWatch there first, or pass its path.`);
  process.exit(1);
}

const TZ_MS = 8 * 3600e3; // days are Asia/Shanghai
const shortId = (id) => {
  if (id.startsWith('manual-')) return id;
  const [, rnd, seq] = id.split('-');
  return `${rnd}-${Number(seq)}`;
};
const isoDay = (ms) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
const hhmm = (ms) => new Date(ms + TZ_MS).toISOString().slice(11, 16);
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

function matchBean(text) {
  if (typeof text !== 'string') return null;
  // more specific entries (blends) first
  const order = Object.keys(beans).sort((a, b) => (beans[b].source === 'Blend' || beans[b].process === 'Blend') - (beans[a].source === 'Blend' || beans[a].process === 'Blend'));
  for (const id of order) if ((beans[id].match || []).some((m) => text.includes(m))) return id;
  return null;
}
function grinderOf(notes) {
  const g = typeof notes.grinder === 'string' ? notes.grinder : '';
  if (/C40|Comandante/.test(g)) return 'C40';
  if (/幻刺|MAVO|Phantox/i.test(g)) return 'MAVO';
  return null;
}
function grindOf(notes) {
  for (const k of ['grind_setting', 'grind_clicks']) {
    const v = notes[k];
    if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))) return String(v);
  }
  return null;
}
function medianFilter(vals, half) {
  const out = new Array(vals.length);
  for (let i = 0; i < vals.length; i++) {
    const win = [];
    for (let j = Math.max(0, i - half); j <= Math.min(vals.length - 1, i + half); j++) if (vals[j] != null) win.push(vals[j]);
    if (!win.length) { out[i] = null; continue; }
    win.sort((a, b) => a - b);
    const m = win.length >> 1;
    out[i] = win.length % 2 ? win[m] : (win[m - 1] + win[m]) / 2;
  }
  return out;
}
function parseTrace(file, elapsedMs) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = lines[0].split(',');
  const ix = (n) => cols.indexOf(n);
  const num = (s) => (s === undefined || s === '' || s === 'nan' ? null : Number(s));
  const rows = lines.slice(1).map((l) => l.split(','));
  const t = rows.map((r) => Number(r[ix('t_ms')]));
  const w = rows.map((r) => num(r[ix('weight_g')]));
  const p = rows.map((r) => num(r[ix('probe_c')]));
  const o = ix('out_g') >= 0 ? rows.map((r) => num(r[ix('out_g')])) : null;
  const keep = t.map((v) => v >= 0 && v <= elapsedMs);
  // full-resolution public CSV (raw values, brew window only)
  const csv = ['t_s,weight_g,probe_c' + (o ? ',out_g' : '')];
  t.forEach((v, i) => { if (keep[i]) csv.push([(v / 1000).toFixed(1), w[i] ?? '', p[i] ?? '', ...(o ? [o[i] ?? ''] : [])].join(',')); });
  // chart series: 2 s median removes valve-press spikes, sampled every 0.5 s
  const wf = medianFilter(w, 10), pf = medianFilter(p, 5), of = o ? medianFilter(o, 10) : null;
  const chart = { t: [], w: [], p: [], o: o ? [] : null };
  let next = 0;
  t.forEach((v, i) => {
    if (!keep[i] || v < next) return;
    chart.t.push(r1(v / 1000)); chart.w.push(r1(Math.max(wf[i] ?? 0, 0))); chart.p.push(r1(pf[i]));
    if (of) chart.o.push(r1(Math.max(of[i] ?? 0, 0)));
    next = v - (v % 500) + 500;
  });
  const thumb = { t: [], w: [], p: [], o: o ? [] : null };
  chart.t.forEach((v, i) => {
    if (i % 4 && i !== chart.t.length - 1) return; // every 2 s
    thumb.t.push(v); thumb.w.push(chart.w[i]); thumb.p.push(chart.p[i]); if (o) thumb.o.push(chart.o[i]);
  });
  const peak = chart.p.filter((v) => v != null).reduce((a, b) => Math.max(a, b), -Infinity);
  return { csv: csv.join('\n') + '\n', chart, thumb, peak: Number.isFinite(peak) ? peak : null };
}

const files = fs.readdirSync(RAW).filter((f) => /^brew-.*\.json$/.test(f));
const brews = [], warnings = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  if (r.status !== 'complete') continue;
  const sid = shortId(r.id);
  const cur = curated[sid] || {};
  const notes = r.notes && typeof r.notes === 'object' ? r.notes : {};
  const sca = notes.sca && typeof notes.sca === 'object' ? notes.sca : {};
  let day, order;
  if (r.created_at) { const ms = Date.parse(r.created_at); day = isoDay(ms); order = hhmm(ms); }
  else { const d = r.id.split('-')[1]; day = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; order = cur.order || '23:59'; }
  const bean = cur.bean ?? sca.bean ?? matchBean(notes.bean);
  const roastDate = cur.roastDate ?? sca.roastDate ?? (bean && beans[bean].roastDate) ?? (/^\d{4}-\d{2}-\d{2}$/.test(notes.roast_date || '') ? notes.roast_date : null);
  const slug = day.replace(/-/g, '') + '-' + crypto.createHash('sha1').update(sid).digest('hex').slice(0, 6);
  const tracePath = path.join(RAW, `brew-${r.id}-trace.csv`);
  const elapsed = r.elapsed_ms ? Math.round(r.elapsed_ms / 1000) : null;
  let trace = null;
  if (r.probe_trace && fs.existsSync(tracePath)) trace = parseTrace(tracePath, r.elapsed_ms);
  let valve = r.drain_start_ms && r.drain_start_ms >= 20000 ? r1(r.drain_start_ms / 1000) : null;
  if (cur.valve != null) valve = cur.valve;
  const brew = {
    slug, date: day, _order: order,
    brewer: r.brewer, scales: r.scales || 1, manual: r.id.startsWith('manual-'),
    bean, batch: cur.batch ?? sca.batch ?? null, roastDate, rest: roastDate ? dayDiff(roastDate, day) : null,
    grinder: cur.grinder ?? grinderOf(notes), grind: cur.grind ?? grindOf(notes),
    dose: r.dose_g, water: r.water_ml, beverage: cur.beverage === null || sid === 'manual-20261109-darkrider' ? null : r.beverage_g,
    ratio: r.brew_ratio, tds: r.tds_percent, ey: r.extraction_percent,
    formula: r.extraction_formula || (['Hoop', 'V60'].includes(r.brewer) ? 'beverage' : 'immersion'),
    time: elapsed, valve, peak: trace ? trace.peak : null,
    rating: cur.rating ?? sca.rating ?? null,
    flavor: cur.flavor ?? sca.flavor ?? [], tastes: cur.tastes ?? sca.tastes ?? [], mouthfeel: cur.mouthfeel ?? sca.mouthfeel ?? [],
    note: cur.note ?? sca.note ?? (typeof notes.tasting === 'string' ? notes.tasting : null),
    method: cur.method ?? sca.method ?? null, correction: cur.correction ?? null,
    hasTrace: !!trace, thumb: trace ? trace.thumb : null,
  };
  brews.push({ brew, trace });
  if (!brewers[r.brewer]) warnings.push(`${day} ${slug}: brewer "${r.brewer}" is missing from catalog/brewers.json`);
  if (bean && !beans[bean]) warnings.push(`${day} ${slug}: bean "${bean}" is missing from catalog/beans.json`);
  if (!curated[sid] && !notes.sca) warnings.push(`${day} ${slug}: not curated yet (bean ${bean || 'unknown'}); add it to catalog/brews.json`);
}
brews.sort((a, b) => (a.brew.date + a.brew._order).localeCompare(b.brew.date + b.brew._order));
const seq = {};
for (const { brew } of brews) { seq[brew.date] = (seq[brew.date] || 0) + 1; brew.cup = seq[brew.date]; delete brew._order; }

// write outputs (replace generated dirs so removed brews disappear)
for (const d of ['traces', 'csv', 'brews']) { fs.rmSync(path.join(DATA, d), { recursive: true, force: true }); fs.mkdirSync(path.join(DATA, d), { recursive: true }); }
const publicBeans = Object.fromEntries(Object.entries(beans).map(([k, v]) => { const { match, ...rest } = v; return [k, rest]; }));
for (const { brew, trace } of brews) {
  const { thumb, ...rec } = brew;
  fs.writeFileSync(path.join(DATA, 'brews', `${brew.slug}.json`), JSON.stringify({ ...rec, bean: brew.bean ? { id: brew.bean, ...publicBeans[brew.bean] } : null }, null, 2) + '\n');
  if (trace) {
    fs.writeFileSync(path.join(DATA, 'traces', `${brew.slug}.json`), JSON.stringify(trace.chart) + '\n');
    fs.writeFileSync(path.join(DATA, 'csv', `${brew.slug}.csv`), trace.csv);
  }
}
const list = brews.map((x) => x.brew);
fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify({ beans: publicBeans, brewers, brews: list }) + '\n');
fs.writeFileSync(path.join(DATA, 'beans.json'), JSON.stringify(publicBeans, null, 2) + '\n');
fs.writeFileSync(path.join(DATA, 'brewers.json'), JSON.stringify(brewers, null, 2) + '\n');
const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const head = ['slug', 'date', 'cup', 'bean', 'brewer', 'grinder', 'grind', 'dose_g', 'water_g', 'beverage_g', 'ratio', 'tds_percent', 'extraction_percent', 'formula', 'time_s', 'valve_s', 'probe_peak_c', 'rest_days', 'rating', 'flavor', 'note'];
const rows = list.map((b) => [b.slug, b.date, b.cup, b.bean ? beans[b.bean].name : '', b.brewer, b.grinder, b.grind, b.dose, b.water, b.beverage, b.ratio, b.tds, b.ey, b.formula, b.time, b.valve, b.peak, b.rest, b.rating, b.flavor.join('; '), b.note].map(esc).join(','));
fs.writeFileSync(path.join(DATA, 'brews.csv'), [head.join(','), ...rows].join('\n') + '\n');

console.log(`${list.length} brews over ${new Set(list.map((b) => b.date)).size} days, ${list.filter((b) => b.hasTrace).length} with curves -> data/`);
for (const w of warnings) console.log('  note: ' + w);
