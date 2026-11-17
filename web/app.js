(function () {
  'use strict';

  // ---------- constants ----------
  var BREWER = { Switch: 'Hario Switch', Hoop: 'Ceado Hoop', V60: 'V60' };
  var GRINDER = { C40: 'Comandante C40', MAVO: 'MAVO Phantox Pro' };
  var GRINDER_SHORT = { C40: 'C40', MAVO: 'Phantox Pro' };
  var RATING = { liked: ['Liked', '✓'], ok: ['OK', '~'], disliked: ['Disliked', '✕'] };
  var WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // SCA Coffee Taster's Flavor Wheel: descriptor -> top-level category
  var WHEEL = {};
  [['Floral', 'Floral Black Tea Chamomile Rose Jasmine'],
   ['Fruity', 'Fruity Berry Blackberry Raspberry Blueberry Strawberry Dried_Fruit Raisin Prune Other_Fruit Coconut Cherry Pomegranate Pineapple Grape Apple Peach Pear Citrus_Fruit Grapefruit Orange Lemon Lime'],
   ['Sour/Fermented', 'Sour/Fermented Sour Sour_Aromatics Acetic_Acid Butyric_Acid Isovaleric_Acid Citric_Acid Malic_Acid Alcohol/Fermented Winey Whiskey Fermented Overripe'],
   ['Green/Vegetative', 'Green/Vegetative Olive_Oil Raw Under-ripe Peapod Fresh Dark_Green Vegetative Hay-like Herb-like Beany'],
   ['Roasted', 'Roasted Pipe_Tobacco Tobacco Burnt Acrid Ashy Smoky Brown_Roast Cereal Grain Malt'],
   ['Spices', 'Spices Pungent Pepper Brown_Spice Anise Nutmeg Cinnamon Clove'],
   ['Nutty/Cocoa', 'Nutty/Cocoa Nutty Peanuts Hazelnut Almond Cocoa Chocolate Dark_Chocolate'],
   ['Sweet', 'Sweet Brown_Sugar Molasses Maple_Syrup Caramelized Honey Vanilla Vanillin Overall_Sweet Sweet_Aromatics'],
   ['Other', 'Papery/Musty Stale Cardboard Papery Woody Moldy/Damp Musty/Dusty Musty/Earthy Animalic Meaty_Brothy Phenolic Chemical Bitter Salty Medicinal Petroleum Skunky Rubber']
  ].forEach(function (c) { c[1].split(' ').forEach(function (t) { WHEEL[t.replace(/_/g, ' ')] = c[0]; }); });
  var WHEEL_CATS = ['Floral', 'Fruity', 'Sour/Fermented', 'Green/Vegetative', 'Roasted', 'Spices', 'Nutty/Cocoa', 'Sweet', 'Other'];
  var X_MAX = 300, W_DOM = [0, 300], T_DOM = [60, 100];
  var EY_DOM = [12, 24], TDS_DOM = [0.8, 1.7];
  var SCA = { ey: [18, 22], tds: [1.15, 1.35] };
  var MAX_SEL = 4, DAYS_PER_PAGE = 10;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var V = window.DATA_VERSION && window.DATA_VERSION.indexOf('__') !== 0 ? window.DATA_VERSION : String(Date.now());

  var BEANS, BREWERS, GEAR, BREWS, BY_SLUG = {}, LAST_DAY, DAYS;

  // ---------- utils ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function fmtTime(sec) {
    if (sec == null) return '-';
    var neg = sec < 0; sec = Math.abs(Math.round(sec));
    return (neg ? '-' : '') + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function fmtRatio(r) { return r == null ? '-' : '1:' + (+r).toFixed(1); }
  function fmt(v, d) { return v == null ? '-' : (+v).toFixed(d); }
  function ymd(day) { return [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)]; }
  function dayLabel(day, withWeek) {
    var p = ymd(day);
    var wd = WEEK[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return (withWeek ? wd + ', ' : '') + MONTH[p[1] - 1] + ' ' + p[2];
  }
  function shortDay(day) { var p = ymd(day); return MONTH[p[1] - 1] + ' ' + p[2]; }
  function beanName(b) { return b.bean && BEANS[b.bean] ? BEANS[b.bean].name : 'Unrecorded bean'; }
  function brewShort(b) { return shortDay(b.date) + ' #' + b.cup; }
  function median(a) { if (!a.length) return null; var x = a.slice().sort(function (p, q) { return p - q; }); var m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; }
  function slotVar(slot) { return 'var(--s' + slot + ')'; }
  function uid(p) { uid.n = (uid.n || 0) + 1; return p + uid.n; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function grindLabel(b) {
    if (!b.grinder) return null;
    return GRINDER_SHORT[b.grinder] + (b.grind ? ' · ' + b.grind + (b.grinder === 'C40' ? ' clicks' : '') : '');
  }

  // ---------- data loading ----------
  var traceCache = {};
  function loadTrace(b) {
    if (!b.hasTrace) return Promise.resolve(null);
    if (!traceCache[b.slug]) traceCache[b.slug] = fetch('data/traces/' + b.slug + '.json?v=' + V).then(function (r) {
      if (!r.ok) throw new Error('trace ' + r.status); return r.json();
    });
    return traceCache[b.slug];
  }

  // ---------- tooltip ----------
  var TT = document.getElementById('tooltip');
  function showTip(ev, head, rows) {
    TT.replaceChildren();
    if (head) TT.appendChild(h('div', { class: 'tt-h', text: head }));
    rows.forEach(function (r) {
      var row = h('div', { class: 'tt-row' });
      if (r.color) row.appendChild(h('span', { class: 'sw-line', style: 'background:' + r.color }));
      row.appendChild(h('strong', { text: r.value }));
      if (r.name) row.appendChild(h('span', { class: 'n', text: r.name }));
      TT.appendChild(row);
    });
    TT.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    var w = TT.offsetWidth, hh = TT.offsetHeight;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + hh > innerHeight - 8) y = ev.clientY - hh - 14;
    TT.style.left = Math.max(8, x) + 'px'; TT.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { TT.hidden = true; }
  function flash(msg) {
    var t = h('div', { class: 'tooltip', style: 'left:50%;top:16px;transform:translateX(-50%)', text: msg });
    document.getElementById('root').appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  // ---------- selection (compare) ----------
  var sel = [];
  function loadSel() {
    try { sel = JSON.parse(localStorage.getItem('coffee-sel') || '[]').filter(function (x) { return BY_SLUG[x.slug]; }); } catch (e) { sel = []; }
  }
  function saveSel() { localStorage.setItem('coffee-sel', JSON.stringify(sel)); }
  function selSlot(slug) { var f = sel.find(function (x) { return x.slug === slug; }); return f ? f.slot : 0; }
  function toggleSel(slug) {
    var i = sel.findIndex(function (x) { return x.slug === slug; });
    if (i >= 0) sel.splice(i, 1);
    else {
      if (sel.length >= MAX_SEL) { flash('Compare up to ' + MAX_SEL + ' brews at a time'); return false; }
      var used = sel.map(function (x) { return x.slot; });
      var slot = [1, 2, 3, 4].find(function (n) { return used.indexOf(n) < 0; });
      sel.push({ slug: slug, slot: slot });
    }
    saveSel(); renderTray(); return true;
  }
  function compareHref(list) {
    return '#/compare?ids=' + list.slice().sort(function (a, b) { return a.slot - b.slot; }).map(function (x) { return x.slug + ':' + x.slot; }).join(',');
  }
  function renderTray() {
    var tray = document.getElementById('tray');
    if (!sel.length || parseRoute().name === 'compare') { tray.hidden = true; return; }
    tray.hidden = false; tray.replaceChildren();
    tray.appendChild(h('span', { class: 'label', text: sel.length + '/' + MAX_SEL + ' selected' }));
    var chips = h('div', { class: 'chips' });
    sel.slice().sort(function (a, b) { return a.slot - b.slot; }).forEach(function (x) {
      var b = BY_SLUG[x.slug];
      chips.appendChild(h('span', { class: 'chip' }, [
        h('span', { class: 'sw-line', style: 'background:' + slotVar(x.slot) }),
        brewShort(b) + ' ' + beanName(b),
        h('button', { type: 'button', 'aria-label': 'Remove', text: '×', onclick: function () { toggleSel(x.slug); rerender(); } })
      ]));
    });
    tray.appendChild(chips);
    tray.appendChild(h('button', { class: 'clear', type: 'button', text: 'Clear', onclick: function () { sel = []; saveSel(); rerender(); } }));
    tray.appendChild(h('a', { class: 'go', href: compareHref(sel), 'aria-disabled': sel.length < 2 ? 'true' : null, text: sel.length < 2 ? 'Pick one more' : 'Compare ' + sel.length + ' →' }));
  }

  // ---------- routing ----------
  function parseRoute() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var qi = hash.indexOf('?');
    var path = qi >= 0 ? hash.slice(0, qi) : hash;
    var q = new URLSearchParams(qi >= 0 ? hash.slice(qi + 1) : '');
    var m = path.match(/^\/b\/([\w-]+)/);
    if (m) return { name: 'brew', slug: m[1], q: q };
    if (path.indexOf('/compare') === 0) return { name: 'compare', q: q };
    if (path.indexOf('/gear') === 0) return { name: 'gear', q: q };
    var c = path.match(/^\/(beans|brewers)(?:\/([\w-]+))?/);
    if (c) return { name: c[2] ? c[1].slice(0, -1) : c[1], id: c[2], q: q };
    return { name: 'home', q: q };
  }

  // ---------- filters ----------
  var F;
  var MULTI = ['bean', 'brewer', 'grinder', 'rating', 'flavor'];
  function defaultFilters() { return { d: 'all', bean: [], brewer: [], grinder: [], rating: [], flavor: [], trace: false, q: '', ey: ['', ''], tds: ['', ''] }; }
  function filtersFromQuery(q) {
    var f = defaultFilters();
    MULTI.forEach(function (k) { if (q.get(k)) f[k] = q.get(k).split(','); });
    if (q.get('d')) f.d = q.get('d');
    if (q.get('trace') === '1') f.trace = true;
    if (q.get('q')) f.q = q.get('q');
    ['ey', 'tds'].forEach(function (k) { if (q.get(k)) f[k] = q.get(k).split('~').concat(['', '']).slice(0, 2); });
    return f;
  }
  function filtersToQuery(f) {
    var q = new URLSearchParams();
    if (f.d !== 'all') q.set('d', f.d);
    MULTI.forEach(function (k) { if (f[k].length) q.set(k, f[k].join(',')); });
    if (f.trace) q.set('trace', '1');
    if (f.q) q.set('q', f.q);
    ['ey', 'tds'].forEach(function (k) { if (f[k][0] !== '' || f[k][1] !== '') q.set(k, f[k].join('~')); });
    var str = q.toString();
    return '#/' + (str ? '?' + str : '');
  }
  function activeCount(f) {
    var n = f.d !== 'all' ? 1 : 0;
    MULTI.forEach(function (k) { if (f[k].length) n++; });
    if (f.trace) n++; if (f.q) n++;
    ['ey', 'tds'].forEach(function (k) { if (f[k][0] !== '' || f[k][1] !== '') n++; });
    return n;
  }
  function dayDiff(a, b) { return (Date.parse(b) - Date.parse(a)) / 864e5; }
  function flavorKeys(b) {
    var keys = {};
    b.flavor.forEach(function (t) { keys['cat:' + (WHEEL[t] || 'Other')] = 1; });
    b.tastes.forEach(function (t) { keys['mt:' + t[0]] = 1; });
    b.mouthfeel.forEach(function (t) { keys['mf:' + t] = 1; });
    return Object.keys(keys);
  }
  function keysOf(b, k) {
    if (k === 'bean') return [b.bean || '__none'];
    if (k === 'brewer') return [b.brewer];
    if (k === 'grinder') return [b.grinder || '__none'];
    if (k === 'rating') return [b.rating || '__none'];
    if (k === 'flavor') return flavorKeys(b);
  }
  function matches(b, f, skip) {
    if (f.d !== 'all' && dayDiff(b.date, LAST_DAY) >= +f.d) return false;
    for (var i = 0; i < MULTI.length; i++) {
      var k = MULTI[i];
      if (k === skip || !f[k].length) continue;
      var ks = keysOf(b, k);
      if (k === 'flavor') { if (!f[k].every(function (v) { return ks.indexOf(v) >= 0; })) return false; }
      else if (!ks.some(function (v) { return f[k].indexOf(v) >= 0; })) return false;
    }
    if (f.trace && !b.hasTrace) return false;
    function inRange(v, r) {
      if (r[0] !== '' && (v == null || v < +r[0])) return false;
      if (r[1] !== '' && (v == null || v > +r[1])) return false;
      return true;
    }
    if (!inRange(b.ey, f.ey) || !inRange(b.tds, f.tds)) return false;
    if (f.q) {
      var bean = b.bean && BEANS[b.bean];
      var hay = [beanName(b), bean ? bean.full + ' ' + bean.origin + ' ' + bean.process : '', b.note, b.method, b.batch, BREWER[b.brewer],
        b.grinder ? GRINDER[b.grinder] : '', b.flavor.join(' '), b.mouthfeel.join(' '), b.tastes.map(function (t) { return t[0]; }).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  // ---------- charts ----------
  function pathLine(g, ts, vs, x, y, color, width) {
    var d = '', pen = false;
    for (var i = 0; i < ts.length; i++) {
      var v = vs[i];
      if (v == null) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(ts[i]).toFixed(1) + ' ' + y(v).toFixed(1);
      pen = true;
    }
    return s('path', { d: d, fill: 'none', stroke: color, 'stroke-width': width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  }
  function nearestIdx(ts, t) {
    var lo = 0, hi = ts.length - 1;
    if (t <= ts[0]) return 0; if (t >= ts[hi]) return hi;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
    return t - ts[lo] < ts[hi] - t ? lo : hi;
  }
  // Small fixed-axis brew card used in the list.
  function thumb(b) {
    var W = 272, H = 104, L = 2, R = 270;
    var tr = b.thumb;
    var svg = s('svg', { class: 'thumb', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': tr ? 'Pour, output and slurry temperature curves' : 'No curve recorded' });
    var xmax = tr ? Math.max(X_MAX, Math.ceil(b.time / 60) * 60) : X_MAX;
    var x = lin(0, xmax, L, R);
    var wTop = 4, wBot = 58, tTop = 64, tBot = 88;
    var yW = lin(W_DOM[0], W_DOM[1], wBot, wTop), yT = lin(T_DOM[0], T_DOM[1], tBot, tTop);
    for (var m = 0; m <= xmax; m += 60) s('line', { x1: x(m), x2: x(m), y1: wTop, y2: tBot, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
    s('line', { x1: L, x2: R, y1: wBot + .5, y2: wBot + .5, stroke: 'var(--axis)', 'stroke-width': 1 }, svg);
    s('line', { x1: L, x2: R, y1: tBot + .5, y2: tBot + .5, stroke: 'var(--axis)', 'stroke-width': 1 }, svg);
    s('text', { x: L, y: 100, text: '0:00' }, svg);
    s('text', { x: R, y: 100, 'text-anchor': 'end', text: fmtTime(xmax) }, svg);
    if (tr) {
      var cid = uid('tc');
      var cp = s('clipPath', { id: cid }, s('defs', {}, svg));
      s('rect', { x: L, y: wTop - 2, width: R - L, height: tBot - wTop + 3 }, cp);
      var g = s('g', { 'clip-path': 'url(#' + cid + ')' }, svg);
      if (b.valve) s('line', { x1: x(b.valve), x2: x(b.valve), y1: wTop, y2: tBot, stroke: 'var(--text-muted)', 'stroke-width': 1 }, g);
      pathLine(g, tr.t, tr.w, x, yW, 'var(--s1)', 1.75);
      if (tr.o) pathLine(g, tr.t, tr.o, x, yW, 'var(--s2)', 1.75);
      pathLine(g, tr.t, tr.p.map(function (v) { return v == null ? null : Math.max(v, T_DOM[0] - 2); }), x, yT, 'var(--s3)', 1.75);
      if (b.valve) s('text', { x: x(b.valve) + 3, y: wTop + 9, text: 'valve' }, svg);
    } else {
      s('text', { x: (L + R) / 2, y: 34, 'text-anchor': 'middle', class: 'no-trace', style: 'font-size:11px', text: 'No curve recorded' }, svg);
      if (b.time) {
        var ex = Math.min(x(b.time), R);
        s('rect', { x: L, y: tBot - 9, width: Math.max(ex - L, 4), height: 6, rx: 3, fill: 'var(--deemph)' }, svg);
        s('text', { x: Math.min(ex, R - 2), y: tBot - 13, 'text-anchor': 'end', text: 'time ' + fmtTime(b.time) + (b.time > xmax ? ' →' : '') }, svg);
      }
    }
    return svg;
  }

  // Multi-panel time chart with a shared x axis (no dual y axes).
  function timeChart(container, opt) {
    var width = Math.max(320, container.clientWidth || 640);
    var M = { l: 44, r: opt.endLabels === false ? 16 : 116, t: 8 };
    var panelGap = 30, titleH = 26, axisH = 30;
    var totalH = M.t + opt.panels.length * titleH + opt.panels.reduce(function (a, p) { return a + p.height; }, 0) + (opt.panels.length - 1) * panelGap + axisH;
    var svg = s('svg', { width: width, height: totalH, viewBox: '0 0 ' + width + ' ' + totalH, role: 'img', 'aria-label': opt.label || 'Brew curves' });
    var x0 = M.l, x1 = width - M.r;
    var x = lin(opt.xDom[0], opt.xDom[1], x0, x1);
    var layout = [], yCur = M.t;
    var defs = s('defs', {}, svg);
    var tickStyle = 'fill:var(--text-muted);font-size:11px;font-variant-numeric:tabular-nums';
    opt.panels.forEach(function (p, pi) {
      var top = yCur + titleH, bot = top + p.height;
      var y = lin(p.dom[0], p.dom[1], bot, top);
      var pt = s('text', { x: x0 - 40, y: yCur + 9, class: 'panel-title' }, svg);
      s('tspan', { text: p.title }, pt);
      if (p.subtitle) s('tspan', { class: 'axis-title', dx: 6, text: p.subtitle }, pt);
      p.ticks.forEach(function (tv) {
        s('line', { x1: x0, x2: x1, y1: Math.round(y(tv)) + .5, y2: Math.round(y(tv)) + .5, stroke: tv === p.dom[0] ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, svg);
        s('text', { x: x0 - 8, y: y(tv) + 4, 'text-anchor': 'end', style: tickStyle, text: String(tv) }, svg);
      });
      for (var t = Math.ceil(opt.xDom[0] / 60) * 60; t <= opt.xDom[1]; t += 60) {
        s('line', { x1: Math.round(x(t)) + .5, x2: Math.round(x(t)) + .5, y1: top, y2: bot, stroke: 'var(--grid)', 'stroke-width': 1 }, svg);
      }
      var cid = uid('cp');
      s('rect', { x: x0, y: top - 1, width: x1 - x0, height: p.height + 2 }, s('clipPath', { id: cid }, defs));
      var g = s('g', { 'clip-path': 'url(#' + cid + ')' }, svg);
      (opt.markers || []).forEach(function (mk) {
        if (mk.t == null || mk.t < opt.xDom[0] || mk.t > opt.xDom[1]) return;
        s('line', { x1: x(mk.t), x2: x(mk.t), y1: top, y2: bot, stroke: 'var(--text-muted)', 'stroke-width': 1 }, g);
        if (pi === 0 && mk.label) s('text', { x: x(mk.t) + 4, y: top + 11, class: 'marker-label', text: mk.label }, svg);
      });
      p.series.forEach(function (se) {
        pathLine(g, se.ts, se.vs.map(function (v) { return v == null ? null : Math.min(Math.max(v, p.dom[0] - 3), p.dom[1] + 3); }), x, y, se.color, se.width || 2);
      });
      if (opt.endLabels !== false) {
        var labels = p.series.filter(function (se) { return !se.noLabel; }).map(function (se) {
          var i = se.vs.length - 1; while (i > 0 && se.vs[i] == null) i--;
          if (i < 0 || se.vs[i] == null) return null;
          return { se: se, ex: x(se.ts[i]), ey: y(Math.min(Math.max(se.vs[i], p.dom[0]), p.dom[1])), v: se.vs[i] };
        }).filter(Boolean).sort(function (a, b) { return a.ey - b.ey; });
        labels.forEach(function (lb, i) { lb.ly = lb.ey; if (i > 0 && lb.ly - labels[i - 1].ly < 14) lb.ly = labels[i - 1].ly + 14; });
        var over = labels.length ? labels[labels.length - 1].ly - (bot + 6) : 0;
        if (over > 0) labels.forEach(function (lb) { lb.ly -= over; });
        labels.forEach(function (lb) {
          var lx = x1 + 10;
          s('path', { d: 'M' + (lb.ex + 3) + ' ' + lb.ey + 'L' + (x1 + 4) + ' ' + lb.ey + 'L' + (lx - 2) + ' ' + lb.ly, fill: 'none', stroke: 'var(--axis)', 'stroke-width': 1 }, svg);
          s('circle', { cx: lb.ex, cy: lb.ey, r: 3.5, fill: lb.se.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
          var tx = s('text', { x: lx, y: lb.ly + 4, class: 'end-label' }, svg);
          s('tspan', { text: (p.fmt ? p.fmt(lb.v) : Math.round(lb.v)) + ' ' + p.unit + ' ' }, tx);
          s('tspan', { class: 'n', text: lb.se.endName || '' }, tx);
        });
      }
      layout.push({ p: p, top: top, bot: bot, y: y });
      yCur = bot + panelGap;
    });
    var axY = layout[layout.length - 1].bot;
    for (var t2 = Math.ceil(opt.xDom[0] / 30) * 30; t2 <= opt.xDom[1]; t2 += 30) {
      var major = t2 % 60 === 0;
      s('line', { x1: x(t2), x2: x(t2), y1: axY, y2: axY + (major ? 5 : 3), stroke: 'var(--axis)', 'stroke-width': 1 }, svg);
      if (major) s('text', { x: x(t2), y: axY + 18, 'text-anchor': 'middle', style: tickStyle, text: opt.xZeroLabel && t2 === 0 ? opt.xZeroLabel : fmtTime(t2) }, svg);
    }
    var cross = s('line', { y1: layout[0].top, y2: axY, stroke: 'var(--text-secondary)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    var dots = s('g', { visibility: 'hidden' }, svg);
    var hit = s('rect', { x: x0, y: layout[0].top - titleH, width: x1 - x0 + 8, height: axY - layout[0].top + titleH, fill: 'transparent' }, svg);
    function at(ev, tVal) {
      cross.setAttribute('x1', x(tVal)); cross.setAttribute('x2', x(tVal)); cross.setAttribute('visibility', 'visible');
      dots.replaceChildren(); dots.setAttribute('visibility', 'visible');
      var rows = [];
      layout.forEach(function (Lp) {
        Lp.p.series.forEach(function (se) {
          if (se.noTip) return;
          if (!se.ts.length || tVal < se.ts[0] - 1 || tVal > se.ts[se.ts.length - 1] + 1) return;
          var i = nearestIdx(se.ts, tVal), v = se.vs[i];
          if (v == null) return;
          s('circle', { cx: x(se.ts[i]), cy: Lp.y(Math.min(Math.max(v, Lp.p.dom[0]), Lp.p.dom[1])), r: 4, fill: se.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }, dots);
          rows.push({ color: se.color, value: (Lp.p.fmt ? Lp.p.fmt(v) : Math.round(v)) + ' ' + Lp.p.unit, name: se.name });
        });
      });
      showTip(ev, opt.xZeroLabel ? fmtTime(Math.abs(tVal)) + (tVal >= 0 ? ' after valve' : ' before valve') : fmtTime(tVal), rows);
    }
    hit.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (width / r.width);
      var tVal = opt.xDom[0] + (px - x0) / (x1 - x0) * (opt.xDom[1] - opt.xDom[0]);
      at(ev, Math.max(opt.xDom[0], Math.min(opt.xDom[1], tVal)));
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); dots.setAttribute('visibility', 'hidden'); hideTip(); });
    container.replaceChildren(svg);
  }
  function legendKeys(items) {
    return h('div', { class: 'legend' }, items.map(function (it) {
      return h('span', { class: 'key' }, [h('span', { class: 'line-key', style: 'background:' + it.color }), it.name]);
    }));
  }

  // Brewing control chart (TDS vs extraction yield).
  function goldCup(container, opt) {
    var width = Math.max(260, container.clientWidth || 320), height = opt.height || 270;
    var M = { l: 38, r: 10, t: 10, b: 36 };
    var svg = s('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': 'TDS versus extraction yield' });
    var x = lin(EY_DOM[0], EY_DOM[1], M.l, width - M.r), y = lin(TDS_DOM[0], TDS_DOM[1], height - M.b, M.t);
    var tickStyle = 'fill:var(--text-muted);font-size:11px;font-variant-numeric:tabular-nums';
    for (var e = EY_DOM[0]; e <= EY_DOM[1]; e += 2) {
      s('line', { x1: Math.round(x(e)) + .5, x2: Math.round(x(e)) + .5, y1: M.t, y2: height - M.b, stroke: e === EY_DOM[0] ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, svg);
      s('text', { x: x(e), y: height - M.b + 16, 'text-anchor': 'middle', style: tickStyle, text: String(e) }, svg);
    }
    for (var t = TDS_DOM[0]; t <= TDS_DOM[1] + 1e-9; t += 0.2) {
      var ty = Math.round(y(t)) + .5;
      s('line', { x1: M.l, x2: width - M.r, y1: ty, y2: ty, stroke: Math.abs(t - TDS_DOM[0]) < 1e-9 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, svg);
      s('text', { x: M.l - 6, y: y(t) + 4, 'text-anchor': 'end', style: tickStyle, text: t.toFixed(1) }, svg);
    }
    s('text', { x: width - M.r, y: height - 4, 'text-anchor': 'end', class: 'axis-title', text: 'Extraction yield %' }, svg);
    var zx = x(SCA.ey[0]), zy = y(SCA.tds[1]);
    s('rect', { x: zx, y: zy, width: x(SCA.ey[1]) - zx, height: y(SCA.tds[0]) - zy, fill: 'var(--zone)', stroke: 'var(--axis)', 'stroke-width': 1, rx: 2 }, svg);
    var pts = BREWS.filter(function (b) { return b.ey != null && b.tds != null; }).map(function (b) {
      return { b: b, px: x(Math.min(Math.max(b.ey, EY_DOM[0]), EY_DOM[1])), py: y(Math.min(Math.max(b.tds, TDS_DOM[0]), TDS_DOM[1])), st: opt.style(b) };
    });
    pts.sort(function (a, b) { return (a.st.on ? 1 : 0) - (b.st.on ? 1 : 0); });
    var g = s('g', {}, svg);
    pts.forEach(function (p) { shape(g, p.b.brewer, p.px, p.py, p.st.on ? 4.5 : 3.75, p.st.color, p.st.on ? 1 : 0.9); });
    if (opt.labels) {
      var lab = pts.filter(function (p) { return p.st.label; }).sort(function (a, b) { return a.py - b.py; });
      lab.forEach(function (p, i) { p.ly = p.py; if (i > 0 && p.ly - lab[i - 1].ly < 13) p.ly = lab[i - 1].ly + 13; });
      lab.forEach(function (p) {
        var right = p.px < width - 70, lx = right ? p.px + 9 : p.px - 9;
        if (Math.abs(p.ly - p.py) > 2) s('line', { x1: p.px, y1: p.py, x2: lx, y2: p.ly - 3, stroke: 'var(--axis)', 'stroke-width': 1 }, g);
        s('text', { x: lx, y: p.ly + 1, 'text-anchor': right ? 'start' : 'end', style: 'fill:var(--text-primary);font-size:11px;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--surface-1);stroke-width:3px', text: p.st.label }, g);
      });
    }
    var ring = s('circle', { r: 9, fill: 'none', stroke: 'var(--text-primary)', 'stroke-width': 1.5, visibility: 'hidden' }, svg);
    function hover(p, ev) {
      if (!p) { ring.setAttribute('visibility', 'hidden'); hideTip(); if (opt.onHover) opt.onHover(null); return; }
      ring.setAttribute('cx', p.px); ring.setAttribute('cy', p.py); ring.setAttribute('visibility', 'visible');
      showTip(ev, dayLabel(p.b.date) + ' · cup ' + p.b.cup + ' · ' + BREWER[p.b.brewer], [
        { value: beanName(p.b) }, { value: 'TDS ' + fmt(p.b.tds, 2) + '%   EY ' + fmt(p.b.ey, 1) + '%' }
      ]);
      if (opt.onHover) opt.onHover(p.b);
    }
    var hitR = s('rect', { x: 0, y: 0, width: width, height: height, fill: 'transparent' }, svg);
    var cur = null;
    hitR.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect();
      var mx = (ev.clientX - r.left) * (width / r.width), my = (ev.clientY - r.top) * (height / r.height);
      var best = null, bd = 24 * 24;
      pts.forEach(function (p) { var d = (p.px - mx) * (p.px - mx) + (p.py - my) * (p.py - my); if (d < bd) { bd = d; best = p; } });
      cur = best; hover(best, ev); hitR.style.cursor = best ? 'pointer' : 'default';
    });
    hitR.addEventListener('pointerleave', function () { cur = null; hover(null); });
    hitR.addEventListener('click', function () { if (cur && opt.onClick) opt.onClick(cur.b); });
    container.replaceChildren(svg);
    return {
      mark: function (b) {
        var p = b && pts.find(function (q) { return q.b === b; });
        if (!p) { ring.setAttribute('visibility', 'hidden'); return; }
        ring.setAttribute('cx', p.px); ring.setAttribute('cy', p.py); ring.setAttribute('visibility', 'visible');
      }
    };
  }
  function shape(g, brewer, cx, cy, r, color, op) {
    var a = { fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2, opacity: op };
    if (brewer === 'Hoop') { a.x = cx - r; a.y = cy - r; a.width = 2 * r; a.height = 2 * r; a.rx = 1.5; return s('rect', a, g); }
    if (brewer === 'V60') { var k = r * 1.25; a.d = 'M' + cx + ' ' + (cy - k) + 'L' + (cx + k) + ' ' + (cy + k * .8) + 'L' + (cx - k) + ' ' + (cy + k * .8) + 'Z'; a['stroke-linejoin'] = 'round'; return s('path', a, g); }
    a.cx = cx; a.cy = cy; a.r = r; return s('circle', a, g);
  }
  function shapeLegend(noZone) {
    function k(br, label) {
      var sv = s('svg', { width: 12, height: 12, viewBox: '0 0 12 12' });
      shape(sv, br, 6, 6.3, 4, 'var(--text-secondary)', 1);
      return h('span', { class: 'key' }, [sv, label]);
    }
    return h('div', { class: 'legend' }, [k('Switch', 'Switch'), k('Hoop', 'Hoop'), k('V60', 'V60'),
      noZone ? null : h('span', { class: 'key' }, [h('span', { class: 'zone-key' }), 'SCA ideal zone: 18 to 22% EY, 1.15 to 1.35% TDS'])]);
  }
  function goldCupCard(title, note) {
    var box = h('div', {});
    var card = h('section', { class: 'card' }, [
      h('div', { class: 'card-h' }, [h('h2', { text: title }), h('span', { class: 'muted', style: 'font-size:12px', text: 'TDS %' })]),
      h('div', { class: 'card-b' }, [box, shapeLegend(), note ? h('p', { class: 'card-note', text: note }) : null])
    ]);
    return { card: card, box: box };
  }

  // ---------- small pieces ----------
  function ratingEl(r) {
    if (!r) return h('span', { class: 'rating none' }, [h('span', { class: 'ic' }), 'Unrated']);
    return h('span', { class: 'rating ' + r }, [h('span', { class: 'ic', 'aria-hidden': 'true', text: RATING[r][1] }), RATING[r][0]]);
  }
  function stat(label, value, unit) {
    return h('span', { class: 'stat' }, [h('span', { class: 'l', text: label }), h('span', { class: 'v' }, [value, unit ? h('small', { text: unit }) : null])]);
  }
  function metaTags(b) {
    var t = [BREWER[b.brewer]];
    var gl = grindLabel(b); if (gl) t.push(gl);
    if (b.bean && BEANS[b.bean]) t.push(BEANS[b.bean].source + (b.batch ? ' · ' + b.batch : ''));
    if (b.rest != null) t.push(b.rest === 0 ? 'Roast day' : plural(b.rest, 'day') + ' off roast');
    if (b.scales === 2) t.push('Two scales');
    if (b.manual) t.push('Entered by hand');
    return h('div', { class: 'meta' }, t.map(function (x) { return h('span', { class: 'tag', text: x }); }));
  }
  function descriptorChips(b, compact) {
    var chips = [];
    b.flavor.forEach(function (f) { chips.push(h('span', { class: 'chip-d', title: 'Flavor wheel: ' + (WHEEL[f] || 'Other') }, [compact ? null : h('span', { class: 'cat', text: WHEEL[f] || 'Other' }), f])); });
    b.tastes.forEach(function (t) { chips.push(h('span', { class: 'chip-d', title: 'Main taste' }, [t[0] + (t[1] ? ' · ' + t[1] : '')])); });
    b.mouthfeel.forEach(function (m) { chips.push(h('span', { class: 'chip-d', title: 'Mouthfeel' }, [m])); });
    return chips;
  }

  // ---------- HOME ----------
  var gc = null, openDD = null, shownDays = DAYS_PER_PAGE, io = null;
  function renderHome(route) {
    F = filtersFromQuery(route.q);
    shownDays = DAYS_PER_PAGE;
    var app = document.getElementById('app');
    app.replaceChildren();
    app.appendChild(h('div', { class: 'filters', id: 'filters' }));
    app.appendChild(h('div', { class: 'summary', id: 'summary' }));
    var layout = h('div', { class: 'layout' });
    var wide = innerWidth > 720;
    function fold(title, aside, kids) {
      return h('details', { class: 'card fold', open: wide ? true : null }, [
        h('summary', { class: 'card-h' }, [h('h2', { text: title }), aside || null]),
        h('div', { class: 'card-b' }, kids)
      ]);
    }
    var gcCard = fold('Brewing control chart', h('span', { class: 'muted', style: 'font-size:12px', text: 'TDS %' }), [h('div', { id: 'goldcup' }), shapeLegend(),
      h('p', { class: 'card-note', text: 'Blue marks the brews that match the filters. Switch brews use the immersion formula for extraction yield; Hoop and V60 use the beverage formula. Click a point to open the brew.' })]);
    gcCard.addEventListener('toggle', function () { if (gcCard.open) updateHome(); });
    var legendCard = fold('Reading a brew card', null, [
      legendKeys([{ color: 'var(--s1)', name: 'Water poured' }, { color: 'var(--s2)', name: 'Beverage out (two scales)' }, { color: 'var(--s3)', name: 'Slurry temperature' }]),
      h('p', { class: 'card-note', text: 'Every brew uses the same axes: 0:00 to 5:00, 0 to 300 g, 60 to 100 °C. The vertical line is the valve opening. Brews before Nov 10 only have final numbers, no curves.' }),
      h('p', { class: 'card-note', text: 'Tasting descriptors follow the SCA Coffee Taster’s Flavor Wheel and the SCA Cupping Value Assessment (main tastes, mouthfeel).' })
    ]);
    layout.appendChild(h('div', { id: 'list' }));
    layout.appendChild(h('aside', { class: 'side' }, [gcCard, legendCard]));
    app.appendChild(layout);
    buildFilterBar();
    updateHome();
  }
  function setF(mut) { mut(F); history.replaceState(null, '', filtersToQuery(F)); shownDays = DAYS_PER_PAGE; updateHome(); buildFilterBar(); }
  function optCounts(k) {
    var c = {};
    BREWS.forEach(function (b) { if (matches(b, F, k)) keysOf(b, k).forEach(function (v) { c[v] = (c[v] || 0) + 1; }); });
    return c;
  }
  function buildFilterBar() {
    var bar = document.getElementById('filters'); if (!bar) return;
    var keepOpen = openDD;
    bar.replaceChildren();
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' });
    [['all', 'All'], ['7', '7 days'], ['14', '14 days']].forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': F.d === o[0] ? 'true' : 'false', text: o[1], onclick: function () { setF(function (f) { f.d = o[0]; }); } }));
    });
    bar.appendChild(seg);
    var beanOpts = [];
    [['Home roast', 'Home roast'], ['Commercial', 'Commercial'], ['Other', null]].forEach(function (grp) {
      var ids = Object.keys(BEANS).filter(function (id) { return grp[1] ? BEANS[id].source === grp[1] : (BEANS[id].source !== 'Home roast' && BEANS[id].source !== 'Commercial'); });
      if (!grp[1]) ids.push('__none');
      beanOpts.push({ group: grp[0] });
      ids.forEach(function (id) { beanOpts.push({ v: id, label: id === '__none' ? 'Unrecorded bean' : BEANS[id].name }); });
    });
    bar.appendChild(dropdown('bean', 'Bean', beanOpts));
    bar.appendChild(dropdown('brewer', 'Brewer', Object.keys(BREWER).map(function (k) { return { v: k, label: BREWER[k] }; })));
    bar.appendChild(dropdown('grinder', 'Grinder', [{ v: 'C40', label: 'Comandante C40' }, { v: 'MAVO', label: 'MAVO Phantox Pro' }, { v: '__none', label: 'Not recorded' }]));
    bar.appendChild(dropdown('rating', 'Rating', [{ v: 'liked', label: '✓ Liked' }, { v: 'ok', label: '~ OK' }, { v: 'disliked', label: '✕ Disliked' }, { v: '__none', label: 'Unrated' }]));
    var flavorOpts = [{ group: 'Flavor wheel' }].concat(WHEEL_CATS.map(function (c) { return { v: 'cat:' + c, label: c }; }))
      .concat([{ group: 'Main tastes' }, { v: 'mt:Sweet', label: 'Sweet' }, { v: 'mt:Sour', label: 'Sour' }, { v: 'mt:Bitter', label: 'Bitter' }])
      .concat([{ group: 'Mouthfeel' }, { v: 'mf:Mouth-Drying', label: 'Mouth-Drying' }, { v: 'mf:Smooth', label: 'Smooth' }, { v: 'mf:Light body', label: 'Light body' }, { v: 'mf:Full body', label: 'Full body' }]);
    bar.appendChild(dropdown('flavor', 'Flavor', flavorOpts, true));
    bar.appendChild(rangeDropdown());
    bar.appendChild(h('label', { class: 'toggle' }, [h('input', { type: 'checkbox', checked: F.trace, onchange: function (e) { setF(function (f) { f.trace = e.target.checked; }); } }), 'With curve']));
    var search = h('input', { class: 'search', type: 'search', placeholder: 'Search notes, method, bean…', value: F.q, 'aria-label': 'Search' });
    search.addEventListener('input', function (e) { F.q = e.target.value.trim(); history.replaceState(null, '', filtersToQuery(F)); shownDays = DAYS_PER_PAGE; updateHome(); });
    search.addEventListener('change', function () { buildFilterBar(); });
    bar.appendChild(search);
    var n = activeCount(F);
    if (n) bar.appendChild(h('button', { class: 'clear-btn', type: 'button', text: 'Clear filters (' + n + ')', onclick: function () { openDD = null; setF(function (f) { Object.assign(f, defaultFilters()); }); } }));
    if (keepOpen) { var b = bar.querySelector('[data-dd="' + keepOpen + '"]'); if (b) b.click(); }
  }
  function dropdown(k, label, opts, allMode) {
    var wrap = h('div', { class: 'dd' });
    var cur = F[k];
    var first = cur.length === 1 ? (opts.find(function (o) { return o.v === cur[0]; }) || {}).label : null;
    var btn = h('button', { type: 'button', class: cur.length ? 'active' : '', 'data-dd': k, 'aria-expanded': 'false', 'aria-haspopup': 'listbox',
      text: label + (cur.length ? ': ' + (first || cur.length) : '') });
    wrap.appendChild(btn);
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var existing = wrap.querySelector('.dd-panel');
      closeDD();
      if (existing && ev.isTrusted) { openDD = null; return; }
      openDD = k; btn.setAttribute('aria-expanded', 'true');
      var counts = optCounts(k);
      var panel = h('div', { class: 'dd-panel', role: 'listbox', 'aria-multiselectable': 'true', onclick: function (e) { e.stopPropagation(); } });
      if (allMode) panel.appendChild(h('div', { class: 'dd-group', style: 'text-transform:none', text: 'Brews must match every selected descriptor' }));
      opts.forEach(function (o) {
        if (o.group) { panel.appendChild(h('div', { class: 'dd-group', text: o.group })); return; }
        var on = F[k].indexOf(o.v) >= 0, c = counts[o.v] || 0;
        if (!c && !on && (k === 'bean' || k === 'flavor')) return;
        panel.appendChild(h('button', { type: 'button', class: 'dd-opt', role: 'option', 'aria-selected': on ? 'true' : 'false', onclick: function () {
          setF(function (f) { var i = f[k].indexOf(o.v); if (i >= 0) f[k].splice(i, 1); else f[k].push(o.v); });
        } }, [h('span', { class: 'check', text: on ? '✓' : '' }), o.label, h('span', { class: 'count', text: String(c) })]));
      });
      wrap.appendChild(panel);
    });
    return wrap;
  }
  function rangeDropdown() {
    var wrap = h('div', { class: 'dd' });
    var on = ['ey', 'tds'].some(function (k) { return F[k][0] !== '' || F[k][1] !== ''; });
    var btn = h('button', { type: 'button', class: on ? 'active' : '', 'data-dd': 'range', text: 'TDS & yield' });
    wrap.appendChild(btn);
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var existing = wrap.querySelector('.dd-panel'); closeDD();
      if (existing && ev.isTrusted) { openDD = null; return; }
      openDD = 'range';
      var panel = h('div', { class: 'dd-panel', style: 'min-width:290px', onclick: function (e) { e.stopPropagation(); } });
      [['ey', 'Yield %'], ['tds', 'TDS %']].forEach(function (r) {
        var a = h('input', { type: 'number', step: 'any', placeholder: 'min', value: F[r[0]][0], 'aria-label': r[1] + ' minimum' });
        var b2 = h('input', { type: 'number', step: 'any', placeholder: 'max', value: F[r[0]][1], 'aria-label': r[1] + ' maximum' });
        function apply() { F[r[0]] = [a.value, b2.value]; history.replaceState(null, '', filtersToQuery(F)); updateHome(); }
        a.addEventListener('input', apply); b2.addEventListener('input', apply);
        panel.appendChild(h('div', { class: 'range-row' }, [h('span', { class: 'secondary', text: r[1] }), a, h('span', { class: 'muted', text: 'to' }), b2]));
      });
      panel.appendChild(h('div', { style: 'display:flex;gap:8px;padding:6px 10px 8px' }, [
        h('button', { type: 'button', class: 'ghost-btn', text: 'SCA ideal zone only', onclick: function () { setF(function (f) { f.ey = ['18', '22']; f.tds = ['1.15', '1.35']; }); } }),
        h('button', { type: 'button', class: 'ghost-btn', text: 'Reset', onclick: function () { setF(function (f) { f.ey = ['', '']; f.tds = ['', '']; }); } })
      ]));
      wrap.appendChild(panel);
    });
    return wrap;
  }
  function closeDD() {
    document.querySelectorAll('.dd-panel').forEach(function (p) { p.remove(); });
    document.querySelectorAll('.dd > button').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', function () { if (openDD) { openDD = null; closeDD(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openDD) { openDD = null; closeDD(); } });

  function updateHome() {
    var list = document.getElementById('list'); if (!list) return;
    var hits = BREWS.filter(function (b) { return matches(b, F); });
    var hitSet = new Set(hits);
    var sum = document.getElementById('summary'); sum.replaceChildren();
    var days = new Set(hits.map(function (b) { return b.date; }));
    sum.appendChild(h('span', {}, [h('strong', { text: plural(hits.length, 'brew') }), hits.length === BREWS.length ? ' · ' + plural(days.size, 'day') : ' of ' + BREWS.length + ' · ' + plural(days.size, 'day')]));
    if (hits.length) {
      var eys = hits.map(function (b) { return b.ey; }).filter(function (v) { return v != null; });
      var tdss = hits.map(function (b) { return b.tds; }).filter(function (v) { return v != null; });
      sum.appendChild(h('span', { text: 'Median yield ' + fmt(median(eys), 1) + '%' }));
      sum.appendChild(h('span', { text: 'Median TDS ' + fmt(median(tdss), 2) + '%' }));
      var liked = hits.filter(function (b) { return b.rating === 'liked'; }).length, rated = hits.filter(function (b) { return b.rating; }).length;
      if (rated) sum.appendChild(h('span', { text: 'Liked ' + liked + ' of ' + rated + ' rated' }));
    }
    list.replaceChildren();
    if (io) { io.disconnect(); io = null; }
    if (!hits.length) list.appendChild(h('div', { class: 'card empty', text: 'No brews match these filters.' }));
    var byDay = {};
    hits.forEach(function (b) { (byDay[b.date] = byDay[b.date] || []).push(b); });
    var dayKeys = Object.keys(byDay).sort().reverse();
    function renderDays(from, to) {
      dayKeys.slice(from, to).forEach(function (day) {
        var items = byDay[day];
        var total = BREWS.filter(function (b) { return b.date === day; }).length;
        var sec = h('section', { class: 'day' }, [
          h('div', { class: 'day-h' }, [h('h2', { text: dayLabel(day, true) }), h('span', { class: 'muted', text: items.length === total ? plural(total, 'brew') : items.length + ' of ' + plural(total, 'brew') })])
        ]);
        var wrap = h('div', { class: 'brews' });
        items.forEach(function (b) { wrap.appendChild(brewRow(b)); });
        sec.appendChild(wrap);
        list.insertBefore(sec, list.querySelector('.more'));
      });
    }
    renderDays(0, shownDays);
    if (dayKeys.length > shownDays) {
      var more = h('button', { type: 'button', class: 'ghost-btn more', style: 'display:block;margin:4px auto 24px', text: 'Show older days' });
      more.addEventListener('click', loadMore);
      list.appendChild(more);
      function loadMore() {
        var from = shownDays; shownDays += DAYS_PER_PAGE; renderDays(from, shownDays);
        if (shownDays >= dayKeys.length) { more.remove(); if (io) io.disconnect(); }
      }
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) loadMore(); }, { rootMargin: '600px' });
        io.observe(more);
      }
    }
    var gcEl = document.getElementById('goldcup');
    if (gcEl && gcEl.offsetParent !== null) {
      gc = goldCup(gcEl, {
        style: function (b) { return hitSet.has(b) ? { color: 'var(--s1)', on: true } : { color: 'var(--deemph)', on: false }; },
        onHover: function (b) {
          document.querySelectorAll('.brew.hl').forEach(function (e) { e.classList.remove('hl'); });
          if (b) { var row = document.querySelector('.brew[data-slug="' + b.slug + '"]'); if (row) row.classList.add('hl'); }
        },
        onClick: function (b) { location.hash = '#/b/' + b.slug; }
      });
    }
    renderTray();
  }
  function brewRow(b) {
    var slot = selSlot(b.slug);
    var row = h('article', { class: 'card brew' + (slot ? ' selected' : ''), 'data-slug': b.slug, tabindex: 0, style: slot ? '--sel:' + slotVar(slot) : null,
      'aria-label': dayLabel(b.date) + ', cup ' + b.cup + ', ' + beanName(b) });
    var cb = h('input', { type: 'checkbox', checked: !!slot, 'aria-label': 'Select for comparison' });
    row.appendChild(h('label', { class: 'pick', title: 'Select for comparison', onclick: function (e) { e.stopPropagation(); } }, [cb]));
    cb.addEventListener('change', function () {
      if (!toggleSel(b.slug)) { cb.checked = false; return; }
      var sl = selSlot(b.slug);
      row.classList.toggle('selected', !!sl);
      row.style.setProperty('--sel', sl ? slotVar(sl) : '');
    });
    var chips = descriptorChips(b, true);
    row.appendChild(h('div', { class: 'brew-main' }, [
      h('div', { class: 'brew-title' }, [h('span', { class: 'seq', text: 'Cup ' + b.cup }), h('span', { class: 'bean' + (b.bean ? '' : ' none'), text: beanName(b) })]),
      metaTags(b),
      h('div', { class: 'stats' }, [stat('Ratio', fmtRatio(b.ratio)), stat('TDS', fmt(b.tds, 2), '%'), stat('Yield', fmt(b.ey, 1), '%'), stat('Time', fmtTime(b.time))]),
      h('div', { class: 'taste' }, [ratingEl(b.rating), b.note ? h('span', { class: 'q', text: b.note }) : (b.method ? h('span', { class: 'q muted', text: b.method }) : null)]),
      chips.length ? h('div', { class: 'chips-d' }, chips) : null
    ]));
    row.appendChild(h('div', { class: 'thumb-wrap' }, [thumb(b)]));
    row.addEventListener('click', function () { location.hash = '#/b/' + b.slug; });
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.hash = '#/b/' + b.slug; });
    row.addEventListener('pointerenter', function () { if (gc) gc.mark(b); });
    row.addEventListener('pointerleave', function () { if (gc) gc.mark(null); });
    return row;
  }

  // ---------- DETAIL ----------
  function brewChart(container, b, tr) {
    if (!tr) {
      container.replaceChildren(h('div', { class: 'empty', style: 'padding:36px 16px' }, [
        h('div', { text: 'No curve for this brew' }),
        h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: b.manual ? 'The watch failed to upload this brew, so it was entered by hand from a photo of the screen.' : 'Firmware before Nov 10 only saved the final numbers.' })
      ]));
      return;
    }
    var ws = [{ ts: tr.t, vs: tr.w, color: 'var(--s1)', name: 'Water poured', endName: 'poured' }];
    if (tr.o) ws.push({ ts: tr.t, vs: tr.o, color: 'var(--s2)', name: 'Beverage out', endName: 'out' });
    timeChart(container, {
      xDom: [0, Math.max(X_MAX, Math.ceil(b.time / 60) * 60)],
      markers: b.valve ? [{ t: b.valve, label: 'Valve ' + fmtTime(b.valve) }] : [],
      panels: [
        { title: 'Weight', subtitle: 'g', unit: 'g', dom: W_DOM, ticks: [0, 100, 200, 300], height: 190, series: ws },
        { title: 'Slurry temperature', subtitle: '°C', unit: '°C', dom: T_DOM, ticks: [60, 70, 80, 90, 100], height: 120, fmt: function (v) { return (+v).toFixed(1); },
          series: [{ ts: tr.t, vs: tr.p, color: 'var(--s3)', name: 'Slurry', endName: 'slurry' }] }
      ]
    });
  }
  function traceTable(b, tr) {
    var tb = h('tbody');
    for (var t = 0; t <= b.time; t += 10) {
      var i = nearestIdx(tr.t, t);
      tb.appendChild(h('tr', {}, [h('td', { text: fmtTime(t) }), h('td', { text: fmt(tr.w[i], 1) }), h('td', { text: tr.o ? fmt(tr.o[i], 1) : '-' }), h('td', { text: fmt(tr.p[i], 1) })]));
    }
    return h('div', { class: 'table-scroll' }, [h('table', { class: 'data' }, [h('thead', {}, [h('tr', {}, [h('th', { text: 'Time' }), h('th', { text: 'Poured g' }), h('th', { text: 'Out g' }), h('th', { text: 'Slurry °C' })])]), tb])]);
  }
  function renderBrew(route) {
    var b = BY_SLUG[route.slug];
    var app = document.getElementById('app'); app.replaceChildren();
    if (!b) { app.appendChild(h('div', { class: 'card empty', text: 'Brew not found.' })); return; }
    document.title = beanName(b) + ' · ' + dayLabel(b.date) + ' · Daily Brew Log';
    var prev = BREWS[b.idx - 1], next = BREWS[b.idx + 1];
    app.appendChild(h('div', { class: 'crumbs' }, [
      h('a', { href: '#/', text: '← All brews' }),
      h('div', { class: 'nav' }, [
        prev ? h('a', { class: 'ghost-btn', href: '#/b/' + prev.slug, text: '← Previous' }) : null,
        next ? h('a', { class: 'ghost-btn', href: '#/b/' + next.slug, text: 'Next →' }) : null
      ])
    ]));
    var slot = selSlot(b.slug);
    app.appendChild(h('div', { class: 'detail-head' }, [
      h('div', {}, [h('div', { class: 'when', text: dayLabel(b.date, true) + ' · cup ' + b.cup }), h('h1', { text: beanName(b) }), metaTags(b)]),
      h('button', { type: 'button', class: 'primary-btn' + (slot ? ' on' : ''), text: slot ? 'Selected for comparison ✓' : 'Add to comparison', onclick: function () { if (toggleSel(b.slug)) renderBrew(route); } })
    ]));
    function tile(l, v, u, sub) { return h('div', { class: 'card tile' }, [h('div', { class: 'l', text: l }), h('div', { class: 'v' }, [v, u ? h('small', { text: u }) : null]), sub ? h('div', { class: 's', text: sub }) : null]); }
    app.appendChild(h('div', { class: 'tiles' }, [
      tile('TDS', fmt(b.tds, 2), '%'),
      tile('Extraction yield', fmt(b.ey, 1), '%', b.formula === 'immersion' ? 'Immersion formula' : 'Beverage formula'),
      tile('Brew ratio', fmtRatio(b.ratio), '', fmt(b.dose, 1) + ' g coffee · ' + fmt(b.water, 0) + ' g water'),
      tile('Brew time', fmtTime(b.time), '', b.valve ? 'Valve at ' + fmtTime(b.valve) : null),
      tile('Beverage', fmt(b.beverage, 0), b.beverage != null ? 'g' : ''),
      tile('Peak slurry', fmt(b.peak, 1), b.peak != null ? '°C' : '', b.peak != null ? 'Probe reading' : 'No probe curve')
    ]));
    var grid = h('div', { class: 'detail-grid' });
    var chartBox = h('div', { style: 'min-height:200px' });
    var tabs = h('div', { class: 'tabs-mini' });
    var viewMode = 'chart', tr = null;
    grid.appendChild(h('section', { class: 'card' }, [
      h('div', { class: 'card-h' }, [h('h2', { text: 'Brew curve' }), b.hasTrace ? tabs : null]),
      h('div', { class: 'card-b' }, [b.hasTrace ? legendKeys([{ color: 'var(--s1)', name: 'Water poured' }].concat(b.thumb && b.thumb.o ? [{ color: 'var(--s2)', name: 'Beverage out' }] : []).concat([{ color: 'var(--s3)', name: 'Slurry temperature' }])) : null, chartBox])
    ]));
    function drawView() {
      tabs.replaceChildren(
        h('button', { type: 'button', 'aria-pressed': viewMode === 'chart' ? 'true' : 'false', text: 'Chart', onclick: function () { viewMode = 'chart'; drawView(); } }),
        h('button', { type: 'button', 'aria-pressed': viewMode === 'table' ? 'true' : 'false', text: 'Table', onclick: function () { viewMode = 'table'; drawView(); } })
      );
      if (b.hasTrace && !tr) return;
      if (viewMode === 'table' && tr) chartBox.replaceChildren(traceTable(b, tr)); else brewChart(chartBox, b, tr);
    }
    var gcc = goldCupCard('Brewing control chart', 'Blue is this brew; gray is every other brew.');
    grid.appendChild(gcc.card);
    app.appendChild(grid);
    drawView();
    if (b.hasTrace) loadTrace(b).then(function (t) { tr = t; if (BY_SLUG[parseRoute().slug] === b) drawView(); }).catch(function () { chartBox.replaceChildren(h('div', { class: 'empty', text: 'Could not load the curve.' })); });
    goldCup(gcc.box, { height: 250, style: function (x) { return x === b ? { color: 'var(--s1)', on: true } : { color: 'var(--deemph)', on: false }; }, onClick: function (x) { location.hash = '#/b/' + x.slug; } });

    var bean = b.bean ? BEANS[b.bean] : null;
    function kv(pairs) { var dl = h('dl', { class: 'kv' }); pairs.forEach(function (p) { if (p[1] == null || p[1] === '') return; dl.appendChild(h('dt', { text: p[0] })); dl.appendChild(h('dd', { text: String(p[1]) })); }); return dl; }
    function group(title, items) { return items.length ? h('div', { class: 'desc-group' }, [h('div', { class: 'desc-h', text: title }), h('div', { class: 'chips-d' }, items)]) : null; }
    var flavorChips = b.flavor.map(function (f) { return h('span', { class: 'chip-d' }, [h('span', { class: 'cat', text: WHEEL[f] || 'Other' }), f]); });
    var tasteChips = b.tastes.map(function (t) { return h('span', { class: 'chip-d' }, [t[0] + (t[1] ? ' · ' + t[1] : '')]); });
    var mfChips = b.mouthfeel.map(function (m) { return h('span', { class: 'chip-d' }, [m]); });
    var csvHref = 'data/csv/' + b.slug + '.csv';
    app.appendChild(h('div', { class: 'info' }, [
      h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h3', { text: 'Tasting' }), ratingEl(b.rating)]), h('div', { class: 'card-b' }, [
        h('p', { class: 'taste-big' + (b.note ? '' : ' muted'), text: b.note || 'No tasting notes yet.' }),
        group('Flavor wheel', flavorChips), group('Main tastes', tasteChips), group('Mouthfeel', mfChips)
      ])]),
      h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h3', { text: 'Method' }), BREWERS[b.brewer] ? h('a', { class: 'inline-link', href: '#/brewers/' + b.brewer, text: 'Brewer page →' }) : null]), h('div', { class: 'card-b' }, [
        kv([['Brewer', BREWER[b.brewer] + (b.scales === 2 ? ' (two scales)' : '')], ['Grinder', b.grinder ? GRINDER[b.grinder] : 'Not recorded'], ['Setting', b.grind ? b.grind + (b.grinder === 'C40' ? ' clicks' : '') : null],
          ['Dose', fmt(b.dose, 1) + ' g'], ['Water', fmt(b.water, 1) + ' g'], ['Notes', b.method]]),
        b.correction ? h('div', { class: 'callout', text: 'Data correction: ' + b.correction }) : null,
        b.manual ? h('div', { class: 'callout', text: 'Entered by hand from a photo of the watch screen; the watch failed to upload this brew.' }) : null
      ])]),
      h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h3', { text: 'Bean and roast' }), bean ? h('a', { class: 'inline-link', href: '#/beans/' + b.bean, text: 'Bean page →' }) : null]), h('div', { class: 'card-b' }, [
        bean ? kv([['Coffee', bean.full], ['Origin', bean.origin], ['Process', bean.process], ['Source', bean.source + (bean.roaster ? ', ' + bean.roaster : '')], ['Batch', b.batch], ['Roasted', b.roastDate ? dayLabel(b.roastDate) : null], ['Rest', b.rest != null ? plural(b.rest, 'day') : null]])
          : h('p', { class: 'muted', text: 'The bean for this brew was not recorded.' })
      ])]),
      h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h3', { text: 'Data' })]), h('div', { class: 'card-b' }, [
        h('p', { class: 'secondary', style: 'margin-top:6px', text: 'The normalized record and the full 10 Hz curve are plain files in the repository.' }),
        h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' }, [
          h('a', { class: 'ghost-btn', href: 'data/brews/' + b.slug + '.json', download: b.slug + '.json', text: 'Record JSON' }),
          b.hasTrace ? h('a', { class: 'ghost-btn', href: csvHref, download: b.slug + '.csv', text: '10 Hz curve CSV' }) : null
        ])
      ])])
    ]));
    renderTray();
  }

  // ---------- COMPARE ----------
  var cmpState = { align: 'start', view: 'overlay' };
  function renderCompare(route) {
    var app = document.getElementById('app'); app.replaceChildren();
    document.title = 'Compare · Daily Brew Log';
    var items = (route.q.get('ids') || '').split(',').filter(Boolean).map(function (tok, i) {
      var parts = tok.split(':'), b = BY_SLUG[parts[0]];
      return b ? { b: b, slot: +parts[1] || i + 1 } : null;
    }).filter(Boolean).slice(0, MAX_SEL);
    app.appendChild(h('div', { class: 'crumbs' }, [h('a', { href: '#/', text: '← All brews' }), h('span')]));
    if (items.length < 2) { app.appendChild(h('div', { class: 'card empty', text: 'Pick at least two brews in the list to compare them.' })); return; }
    sel = items.map(function (it) { return { slug: it.b.slug, slot: it.slot }; }); saveSel();
    var controls = h('div', { class: 'cmp-controls' });
    app.appendChild(h('div', { class: 'cmp-head' }, [h('h1', { text: 'Comparing ' + items.length + ' brews' }), controls]));
    var keys = h('div', { class: 'cmp-keys' });
    items.forEach(function (it) {
      keys.appendChild(h('span', { class: 'cmp-key' }, [
        h('span', { class: 'sw-line', style: 'background:' + slotVar(it.slot) }),
        h('a', { href: '#/b/' + it.b.slug }, [h('strong', { text: brewShort(it.b) }), ' ' + beanName(it.b)]),
        h('span', { class: 'muted', text: it.b.brewer }),
        h('button', { type: 'button', 'aria-label': 'Remove', text: '×', onclick: function () {
          sel = items.filter(function (x) { return x !== it; }).map(function (x) { return { slug: x.b.slug, slot: x.slot }; }); saveSel();
          location.hash = sel.length ? compareHref(sel) : '#/';
        } })
      ]));
    });
    if (items.length < MAX_SEL) keys.appendChild(h('a', { class: 'ghost-btn', href: '#/', text: '+ Add a brew' }));
    app.appendChild(keys);
    var body = h('div', {});
    app.appendChild(body);
    Promise.all(items.map(function (it) { return loadTrace(it.b).then(function (t) { it.tr = t; }, function () { it.tr = null; }); })).then(draw);
    function segCtl(label, k, opts) {
      return h('label', {}, [label, h('span', { class: 'seg' }, opts.map(function (o) {
        return h('button', { type: 'button', 'aria-pressed': cmpState[k] === o[0] ? 'true' : 'false', text: o[1], onclick: function () { cmpState[k] = o[0]; draw(); } });
      }))]);
    }
    function draw() {
      if (parseRoute().name !== 'compare') return;
      controls.replaceChildren(segCtl('View', 'view', [['overlay', 'Overlay'], ['sbs', 'Side by side']]), cmpState.view === 'overlay' ? segCtl('Align', 'align', [['start', 'Pour start'], ['valve', 'Valve open']]) : null);
      body.replaceChildren();
      var grid = h('div', { class: 'cmp-grid' }), left = h('div', {});
      var gcc = goldCupCard('Brewing control chart', null);
      grid.appendChild(left); grid.appendChild(gcc.card); body.appendChild(grid);
      var withTrace = items.filter(function (it) { return it.tr; }), noTrace = items.filter(function (it) { return !it.tr; });
      var names = function (arr) { return arr.map(function (it) { return brewShort(it.b); }).join(', '); };
      if (cmpState.view === 'overlay') {
        var chartBox = h('div', {}), notes = [], use = withTrace;
        if (cmpState.align === 'valve') {
          var nv = use.filter(function (it) { return !it.b.valve; });
          use = use.filter(function (it) { return it.b.valve; });
          if (nv.length) notes.push(names(nv) + ' has no recorded valve time, so it is left out when aligning on the valve.');
        }
        if (noTrace.length) notes.push(names(noTrace) + ' has no curve and only appears in the table below.');
        var cb = h('div', { class: 'card-b' }, [legendKeys(items.map(function (it) { return { color: slotVar(it.slot), name: brewShort(it.b) + ' ' + beanName(it.b) }; })), chartBox]);
        notes.forEach(function (n) { cb.appendChild(h('p', { class: 'card-note', text: n })); });
        left.appendChild(h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h2', { text: 'Brew curves' }), h('span', { class: 'muted', style: 'font-size:12px', text: cmpState.align === 'valve' ? 'Time from valve opening' : 'Time from pour start' })]), cb]));
        if (use.length) {
          var shift = function (it) { return cmpState.align === 'valve' ? it.b.valve : 0; };
          var lo = 0, hi;
          if (cmpState.align === 'valve') {
            lo = Math.floor(Math.min.apply(null, use.map(function (it) { return -it.b.valve; })) / 30) * 30;
            hi = Math.ceil(Math.max.apply(null, use.map(function (it) { return it.b.time - it.b.valve; })) / 30) * 30;
          } else hi = Math.max(X_MAX, Math.ceil(Math.max.apply(null, use.map(function (it) { return it.b.time; })) / 60) * 60);
          var ser = function (field) {
            return use.filter(function (it) { return it.tr[field]; }).map(function (it) {
              var sh = shift(it);
              return { ts: it.tr.t.map(function (t) { return t - sh; }), vs: it.tr[field], color: slotVar(it.slot), name: brewShort(it.b) + ' ' + beanName(it.b), endName: brewShort(it.b) };
            });
          };
          var panels = [
            { title: 'Water poured', subtitle: 'g', unit: 'g', dom: W_DOM, ticks: [0, 100, 200, 300], height: 150, series: ser('w') },
            { title: 'Slurry temperature', subtitle: '°C', unit: '°C', dom: T_DOM, ticks: [60, 70, 80, 90, 100], height: 130, fmt: function (v) { return (+v).toFixed(1); }, series: ser('p') }
          ];
          var outs = ser('o');
          if (outs.length) panels.push({ title: 'Beverage out', subtitle: 'g, two-scale brews', unit: 'g', dom: W_DOM, ticks: [0, 100, 200, 300], height: 130, series: outs });
          timeChart(chartBox, { xDom: [lo, hi], xZeroLabel: cmpState.align === 'valve' ? 'valve' : null, panels: panels, markers: cmpState.align === 'valve' ? [{ t: 0 }] : [] });
        }
      } else {
        left.appendChild(h('div', { style: 'margin-bottom:10px' }, [legendKeys([{ color: 'var(--s1)', name: 'Water poured' }, { color: 'var(--s2)', name: 'Beverage out' }, { color: 'var(--s3)', name: 'Slurry temperature' }]),
          h('p', { class: 'card-note', text: 'Every panel uses identical axes. Line colors show the measurement here; the bar before each title is the brew’s comparison color.' })]));
        var sbs = h('div', { class: 'side-by-side', style: 'grid-template-columns:repeat(' + Math.min(items.length, 2) + ',minmax(0,1fr))' });
        left.appendChild(sbs);
        var xmax = Math.max(X_MAX, Math.ceil(Math.max.apply(null, items.map(function (q) { return q.b.time || 0; })) / 60) * 60);
        items.forEach(function (it) {
          var box = h('div', {});
          sbs.appendChild(h('section', { class: 'card sbs-col' }, [
            h('div', { class: 'card-h' }, [h('h3', {}, [h('span', { class: 'sw-line', style: 'background:' + slotVar(it.slot) + ';margin-right:8px;vertical-align:middle' }), brewShort(it.b) + ' ' + beanName(it.b)]), ratingEl(it.b.rating)]),
            h('div', { class: 'card-b' }, [h('div', { class: 'stats', style: 'margin-bottom:6px' }, [stat('Ratio', fmtRatio(it.b.ratio)), stat('TDS', fmt(it.b.tds, 2), '%'), stat('Yield', fmt(it.b.ey, 1), '%'), stat('Time', fmtTime(it.b.time))]), box])
          ]));
          requestAnimationFrame(function () {
            if (!it.tr) { brewChart(box, it.b, null); return; }
            var ws = [{ ts: it.tr.t, vs: it.tr.w, color: 'var(--s1)', name: 'Water poured' }];
            if (it.tr.o) ws.push({ ts: it.tr.t, vs: it.tr.o, color: 'var(--s2)', name: 'Beverage out' });
            timeChart(box, { xDom: [0, xmax], endLabels: false, markers: it.b.valve ? [{ t: it.b.valve, label: 'valve' }] : [], panels: [
              { title: 'Weight', subtitle: 'g', unit: 'g', dom: W_DOM, ticks: [0, 100, 200, 300], height: 120, series: ws },
              { title: 'Slurry', subtitle: '°C', unit: '°C', dom: T_DOM, ticks: [60, 80, 100], height: 70, fmt: function (v) { return (+v).toFixed(1); }, series: [{ ts: it.tr.t, vs: it.tr.p, color: 'var(--s3)', name: 'Slurry' }] }
            ] });
          });
        });
      }
      left.appendChild(compareTable(items));
      var bySet = new Map(items.map(function (it) { return [it.b, it.slot]; }));
      var colorOk = items.length <= 3; // all-pairs scatter: color identity only up to 3 marks
      requestAnimationFrame(function () {
        goldCup(gcc.box, { height: 250, labels: true, style: function (b) {
          return bySet.has(b) ? { color: colorOk ? slotVar(bySet.get(b)) : 'var(--text-primary)', on: true, label: brewShort(b) } : { color: 'var(--deemph)', on: false };
        }, onClick: function (b) { location.hash = '#/b/' + b.slug; } });
      });
    }
  }
  function compareTable(items) {
    // [label, getter, decimals, unit, formatter, isText, markExtremes]
    var rows = [
      ['Date', function (b) { return dayLabel(b.date, true) + ', cup ' + b.cup; }],
      ['Bean', function (b) { return beanName(b); }],
      ['Batch', function (b) { return b.batch || '-'; }],
      ['Rest', function (b) { return b.rest; }, 0, ' d'],
      ['Brewer', function (b) { return BREWER[b.brewer] + (b.scales === 2 ? ' (two scales)' : ''); }],
      ['Grind', function (b) { return grindLabel(b) || '-'; }],
      ['Dose', function (b) { return b.dose; }, 1, ' g'],
      ['Water', function (b) { return b.water; }, 1, ' g'],
      ['Beverage', function (b) { return b.beverage; }, 1, ' g'],
      ['Ratio', function (b) { return b.ratio; }, 1, '', fmtRatio],
      ['TDS', function (b) { return b.tds; }, 2, '%', null, false, true],
      ['Extraction yield', function (b) { return b.ey; }, 2, '%', null, false, true],
      ['Brew time', function (b) { return b.time; }, 0, '', fmtTime, false, true],
      ['Valve', function (b) { return b.valve; }, 0, '', fmtTime],
      ['Peak slurry', function (b) { return b.peak; }, 1, ' °C', null, false, true],
      ['Rating', function (b) { return b.rating ? RATING[b.rating][0] : 'Unrated'; }],
      ['Flavor', function (b) { return b.flavor.join(', ') || '-'; }, null, null, null, true],
      ['Main tastes', function (b) { return b.tastes.map(function (t) { return t[0] + (t[1] ? ' (' + t[1] + ')' : ''); }).join(', ') || '-'; }, null, null, null, true],
      ['Mouthfeel', function (b) { return b.mouthfeel.join(', ') || '-'; }, null, null, null, true],
      ['Notes', function (b) { return b.note || '-'; }, null, null, null, true]
    ];
    var thead = h('thead', {}, [h('tr', {}, [h('th', { text: '' })].concat(items.map(function (it) {
      return h('th', { class: 'col' }, [h('span', { class: 'sw-line', style: 'background:' + slotVar(it.slot) + ';margin-right:6px;vertical-align:middle' }), brewShort(it.b)]);
    })))]);
    var tb = h('tbody');
    rows.forEach(function (r) {
      var vals = items.map(function (it) { return r[1](it.b); });
      var numeric = r[2] != null && vals.some(function (v) { return typeof v === 'number'; });
      var show = function (v) { return r[4] ? r[4](v) : (+v).toFixed(r[2]); };
      var nums = vals.filter(function (v) { return typeof v === 'number'; });
      var distinct = new Set(nums.map(show)).size > 1;
      var mx = r[6] && distinct ? Math.max.apply(null, nums) : null, mn = r[6] && distinct ? Math.min.apply(null, nums) : null;
      var tr = h('tr', {}, [h('td', { class: 'muted', text: r[0] })]);
      vals.forEach(function (v) {
        var txt = v == null ? '-' : (numeric ? show(v) + (r[4] ? '' : (r[3] || '')) : String(v));
        var td = h('td', { class: r[5] || !numeric ? 'text' : '' }, [txt]);
        if (mx != null && typeof v === 'number') {
          if (v === mx) td.appendChild(h('span', { class: 'mk', text: 'highest' }));
          if (v === mn) td.appendChild(h('span', { class: 'mk', text: 'lowest' }));
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    return h('section', { class: 'card', style: 'margin-top:16px' }, [
      h('div', { class: 'card-h' }, [h('h2', { text: 'Side-by-side numbers' })]),
      h('div', { class: 'card-b', style: 'overflow-x:auto' }, [h('table', { class: 'data cmp-table' }, [thead, tb])])
    ]);
  }

  // ---------- CATALOG HELPERS ----------
  function brewStats(list) {
    var num = function (k) { return list.map(function (b) { return b[k]; }).filter(function (v) { return v != null; }); };
    var rated = list.filter(function (b) { return b.rating; });
    return {
      n: list.length, liked: list.filter(function (b) { return b.rating === 'liked'; }).length, rated: rated.length,
      ey: median(num('ey')), tds: median(num('tds')), time: median(num('time')), peak: median(num('peak')),
      first: list.length ? list[0].date : null, last: list.length ? list[list.length - 1].date : null,
      days: new Set(list.map(function (b) { return b.date; })).size
    };
  }
  function tile(l, v, u, sub) {
    return h('div', { class: 'card tile' }, [h('div', { class: 'l', text: l }), h('div', { class: 'v' }, [v, u ? h('small', { text: u }) : null]), sub ? h('div', { class: 's', text: sub }) : null]);
  }
  function kv(pairs) {
    var dl = h('dl', { class: 'kv' });
    pairs.forEach(function (p) { if (p[1] == null || p[1] === '') return; dl.appendChild(h('dt', { text: p[0] })); dl.appendChild(h('dd', { text: String(p[1]) })); });
    return dl;
  }
  function card(title, kids, aside) {
    return h('section', { class: 'card' }, [h('div', { class: 'card-h' }, [h('h2', { text: title }), aside || null]), h('div', { class: 'card-b' }, kids)]);
  }
  function brewTable(list, col) {
    var tb = h('tbody');
    list.slice().reverse().forEach(function (b) {
      var tr = h('tr', { class: 'link', tabindex: 0 }, [
        h('td', { class: 'num', style: 'white-space:nowrap', text: dayLabel(b.date) + ' #' + b.cup }),
        col === 'bean' ? h('td', { style: 'white-space:nowrap' }, [h('span', { class: b.bean ? '' : 'muted', text: beanName(b) })]) : h('td', { style: 'white-space:nowrap', text: BREWER[b.brewer] }),
        h('td', { class: 'n', text: fmtRatio(b.ratio) }), h('td', { class: 'n', text: fmt(b.tds, 2) }), h('td', { class: 'n', text: fmt(b.ey, 1) }),
        h('td', { class: 'n', text: fmtTime(b.time) }), h('td', {}, [ratingEl(b.rating)]), h('td', { class: 'note', text: b.note || '' })
      ]);
      tr.addEventListener('click', function () { location.hash = '#/b/' + b.slug; });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.hash = '#/b/' + b.slug; });
      tb.appendChild(tr);
    });
    return h('div', { class: 'scroll-x' }, [h('table', { class: 'list-table' }, [
      h('thead', {}, [h('tr', {}, [h('th', { text: 'Date' }), h('th', { text: col === 'bean' ? 'Bean' : 'Brewer' }), h('th', { class: 'n', text: 'Ratio' }), h('th', { class: 'n', text: 'TDS %' }),
        h('th', { class: 'n', text: 'Yield %' }), h('th', { class: 'n', text: 'Time' }), h('th', { text: 'Rating' }), h('th', { text: 'Tasting' })])]), tb])]);
  }
  // Median of a thumbnail series across brews on a 2 s grid, kept where at least half the brews still have data.
  function medianCurve(list, field) {
    var withT = list.filter(function (b) { return b.thumb && b.thumb[field]; });
    if (!withT.length) return null;
    var maxT = Math.max.apply(null, withT.map(function (b) { return b.thumb.t[b.thumb.t.length - 1]; }));
    var need = Math.max(1, Math.ceil(withT.length / 2));
    var ts = [], vs = [];
    for (var t = 0; t <= maxT; t += 2) {
      var vals = [];
      withT.forEach(function (b) {
        var tt = b.thumb.t; if (t > tt[tt.length - 1]) return;
        var i = nearestIdx(tt, t); if (Math.abs(tt[i] - t) <= 1.5 && b.thumb[field][i] != null) vals.push(b.thumb[field][i]);
      });
      if (vals.length >= need) { ts.push(t); vs.push(median(vals)); }
    }
    return { ts: ts, vs: vs, n: withT.length };
  }
  // Every brew in gray, the median in the accent color (emphasis, not categorical).
  function overlayChart(container, list) {
    var withT = list.filter(function (b) { return b.thumb; });
    if (!withT.length) { container.replaceChildren(h('div', { class: 'empty', style: 'padding:28px 16px', text: 'No curves recorded with this brewer yet.' })); return; }
    var xmax = Math.max(X_MAX, Math.ceil(Math.max.apply(null, withT.map(function (b) { return b.time || 0; })) / 60) * 60);
    function panel(field, title, sub, dom, ticks, height, f) {
      var series = withT.filter(function (b) { return b.thumb[field]; }).map(function (b) {
        return { ts: b.thumb.t, vs: b.thumb[field], color: 'var(--deemph)', width: 1.25, noTip: true, noLabel: true };
      });
      var m = medianCurve(withT, field);
      if (m && m.ts.length) series.push({ ts: m.ts, vs: m.vs, color: 'var(--s1)', name: 'Median of ' + plural(m.n, 'brew'), endName: 'median' });
      return { title: title, subtitle: sub, unit: field === 'p' ? '°C' : 'g', dom: dom, ticks: ticks, height: height, fmt: f, series: series };
    }
    var panels = [panel('w', 'Water poured', 'g', W_DOM, [0, 100, 200, 300], 150),
      panel('p', 'Slurry temperature', '°C', T_DOM, [60, 70, 80, 90, 100], 130, function (v) { return (+v).toFixed(1); })];
    if (withT.some(function (b) { return b.thumb.o; })) panels.push(panel('o', 'Beverage out', 'g, two-scale brews', W_DOM, [0, 100, 200, 300], 120));
    timeChart(container, { xDom: [0, xmax], panels: panels });
  }
  function restScatter(container, list) {
    var width = Math.max(260, container.clientWidth || 320), height = 220, M = { l: 38, r: 12, t: 10, b: 36 };
    var xMax = Math.max(5, Math.ceil((Math.max.apply(null, list.map(function (b) { return b.rest; })) + 1) / 5) * 5);
    var x = lin(0, xMax, M.l, width - M.r), y = lin(EY_DOM[0], EY_DOM[1], height - M.b, M.t);
    var svg = s('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': 'Extraction yield by days off roast' });
    var tickStyle = 'fill:var(--text-muted);font-size:11px;font-variant-numeric:tabular-nums';
    s('rect', { x: M.l, y: y(SCA.ey[1]), width: width - M.r - M.l, height: y(SCA.ey[0]) - y(SCA.ey[1]), fill: 'var(--zone)' }, svg);
    var step = xMax > 20 ? 5 : xMax > 10 ? 2 : 1;
    for (var d = 0; d <= xMax; d += step) {
      s('line', { x1: Math.round(x(d)) + .5, x2: Math.round(x(d)) + .5, y1: M.t, y2: height - M.b, stroke: d === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, svg);
      s('text', { x: x(d), y: height - M.b + 16, 'text-anchor': 'middle', style: tickStyle, text: String(d) }, svg);
    }
    for (var e = EY_DOM[0]; e <= EY_DOM[1]; e += 2) {
      s('line', { x1: M.l, x2: width - M.r, y1: Math.round(y(e)) + .5, y2: Math.round(y(e)) + .5, stroke: e === EY_DOM[0] ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }, svg);
      s('text', { x: M.l - 6, y: y(e) + 4, 'text-anchor': 'end', style: tickStyle, text: String(e) }, svg);
    }
    s('text', { x: width - M.r, y: height - 4, 'text-anchor': 'end', class: 'axis-title', text: 'Days off roast' }, svg);
    s('text', { x: M.l + 4, y: M.t + 11, class: 'axis-title', text: 'Yield %' }, svg);
    var P = list.map(function (b) { return { b: b, px: x(b.rest), py: y(Math.min(Math.max(b.ey, EY_DOM[0]), EY_DOM[1])) }; });
    P.forEach(function (p) { shape(svg, p.b.brewer, p.px, p.py, 4.5, 'var(--s1)', 1); });
    var ring = s('circle', { r: 9, fill: 'none', stroke: 'var(--text-primary)', 'stroke-width': 1.5, visibility: 'hidden' }, svg);
    var hit = s('rect', { x: 0, y: 0, width: width, height: height, fill: 'transparent' }, svg), cur = null;
    hit.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * (width / r.width), my = (ev.clientY - r.top) * (height / r.height);
      var best = null, bd = 24 * 24;
      P.forEach(function (p) { var dd = (p.px - mx) * (p.px - mx) + (p.py - my) * (p.py - my); if (dd < bd) { bd = dd; best = p; } });
      cur = best; hit.style.cursor = best ? 'pointer' : 'default';
      if (!best) { ring.setAttribute('visibility', 'hidden'); hideTip(); return; }
      ring.setAttribute('cx', best.px); ring.setAttribute('cy', best.py); ring.setAttribute('visibility', 'visible');
      showTip(ev, dayLabel(best.b.date) + ' · cup ' + best.b.cup + ' · ' + BREWER[best.b.brewer], [{ value: 'Yield ' + fmt(best.b.ey, 1) + '% after ' + plural(best.b.rest, 'day') }, { value: best.b.rating ? RATING[best.b.rating][0] : 'Unrated' }]);
    });
    hit.addEventListener('pointerleave', function () { cur = null; ring.setAttribute('visibility', 'hidden'); hideTip(); });
    hit.addEventListener('click', function () { if (cur) location.hash = '#/b/' + cur.b.slug; });
    container.replaceChildren(svg);
  }
  function descriptorCounts(list) {
    var c = {};
    list.forEach(function (b) {
      b.flavor.forEach(function (f) { c[f] = (c[f] || 0) + 1; });
      b.tastes.forEach(function (t) { var k = t[0] + (t[1] ? ' · ' + t[1] : ''); c[k] = (c[k] || 0) + 1; });
      b.mouthfeel.forEach(function (m) { c[m] = (c[m] || 0) + 1; });
    });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); }).map(function (k) {
      return h('span', { class: 'chip-d' }, [WHEEL[k] ? h('span', { class: 'cat', text: WHEEL[k] }) : null, k + (c[k] > 1 ? ' ×' + c[k] : '')]);
    });
  }
  function beanBrews(id) { return BREWS.filter(function (b) { return (b.bean || '__none') === id; }); }
  function brewerBrews(code) { return BREWS.filter(function (b) { return b.brewer === code; }); }

  // ---------- BEANS ----------
  function renderBeans() {
    var app = document.getElementById('app'); app.replaceChildren();
    document.title = 'Beans · Daily Brew Log';
    var ids = Object.keys(BEANS);
    var home = ids.filter(function (id) { return BEANS[id].source === 'Home roast'; }).length;
    app.appendChild(h('div', { class: 'page-head' }, [h('h1', { text: 'Beans' }), h('p', { text: plural(ids.length, 'coffee') + ' · ' + home + ' home roasted · newest brew first' })]));
    [['Home roast', 'Home roast'], ['Commercial', 'Commercial'], ['Blends', 'Blend']].forEach(function (grp) {
      var list = ids.filter(function (id) { return BEANS[id].source === grp[1]; }).map(function (id) { return { id: id, st: brewStats(beanBrews(id)) }; })
        .sort(function (a, b) { return (b.st.last || '').localeCompare(a.st.last || ''); });
      if (!list.length) return;
      app.appendChild(h('div', { class: 'section-h', text: grp[0] }));
      app.appendChild(h('div', { class: 'cat-grid' }, list.map(function (it) {
        var bn = BEANS[it.id], st = it.st;
        var sub = [bn.origin, bn.process, bn.roaster || bn.source].filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join(' · ');
        return h('a', { class: 'card cat-card', href: '#/beans/' + it.id }, [
          h('div', { class: 'cat-top' }, [h('h3', { text: bn.name }), h('span', { class: 'muted', style: 'font-size:12px', text: plural(st.n, 'brew') })]),
          h('div', { class: 'cat-sub', text: sub }),
          h('div', { class: 'stats' }, [stat('Median yield', fmt(st.ey, 1), '%'), stat('Median TDS', fmt(st.tds, 2), '%'), stat('Liked', st.rated ? st.liked + '/' + st.rated : '-'), stat('Last brewed', st.last ? shortDay(st.last) : '-')]),
          bn.bagNotes ? h('div', { class: 'chips-d' }, bn.bagNotes.map(function (n) { return h('span', { class: 'chip-d', text: n }); })) : null
        ]);
      })));
    });
    var none = beanBrews('__none');
    if (none.length) app.appendChild(h('p', { class: 'card-note', style: 'margin-top:18px' }, [plural(none.length, 'brew') + ' have no recorded bean. ', h('a', { class: 'inline-link', href: '#/?bean=__none', text: 'Show them' })]));
  }
  function renderBean(id) {
    var app = document.getElementById('app'); app.replaceChildren();
    var bn = BEANS[id];
    app.appendChild(h('div', { class: 'crumbs' }, [h('a', { href: '#/beans', text: '← Beans' }), h('span')]));
    if (!bn) { app.appendChild(h('div', { class: 'card empty', text: 'Bean not found.' })); return; }
    document.title = bn.name + ' · Daily Brew Log';
    var list = beanBrews(id), st = brewStats(list);
    var tags = [bn.origin, bn.process, bn.roastLevel ? bn.roastLevel + ' roast' : null, bn.source, bn.roaster].filter(Boolean);
    app.appendChild(h('div', { class: 'detail-head' }, [
      h('div', {}, [h('div', { class: 'when', text: 'Bean' }), h('h1', { text: bn.name }), h('div', { class: 'meta' }, tags.map(function (t) { return h('span', { class: 'tag', text: t }); }))]),
      list.length ? h('a', { class: 'ghost-btn', href: '#/?bean=' + id, text: 'Show in brew list' }) : null
    ]));
    app.appendChild(h('div', { class: 'tiles' }, [
      tile('Brews', String(st.n), '', st.n ? plural(st.days, 'day') : null),
      tile('Liked', st.rated ? String(st.liked) : '-', '', st.rated ? 'of ' + st.rated + ' rated' : 'No ratings yet'),
      tile('Median yield', fmt(st.ey, 1), st.ey != null ? '%' : ''),
      tile('Median TDS', fmt(st.tds, 2), st.tds != null ? '%' : ''),
      tile('First brewed', st.first ? shortDay(st.first) : '-'),
      tile('Last brewed', st.last ? shortDay(st.last) : '-')
    ]));
    var about = card('About', [kv([['Coffee', bn.full], ['Origin', bn.origin], ['Region', bn.region], ['Farm', bn.farm], ['Producer', bn.producer], ['Altitude', bn.altitude],
      ['Variety', bn.variety], ['Grade', bn.grade], ['Process', bn.process + (bn.processNote && bn.processNote !== bn.process ? ' (' + bn.processNote + ')' : '')], ['Harvest', bn.harvest],
      ['Roast', bn.roastLevel], ['Roaster', bn.roaster], ['Roasted', bn.roastDate ? dayLabel(bn.roastDate) + ', ' + bn.roastDate.slice(0, 4) : bn.roastNote],
      ['Bag notes', bn.bagNotes ? bn.bagNotes.join(', ') : null]]), bn.note ? h('p', { class: 'card-note', text: bn.note }) : null]);
    var left = h('div', { class: 'stack' }, [about]);
    if (bn.roasts && bn.roasts.length) {
      var tb = h('tbody');
      bn.roasts.forEach(function (r) {
        var rs = brewStats(list.filter(function (b) { return b.batch === r.batch; }));
        var loss = r.lossPct != null ? r.lossPct : (r.green && r.roasted ? (1 - r.roasted / r.green) * 100 : null);
        tb.appendChild(h('tr', {}, [
          h('td', {}, [h('strong', { text: r.batch }), r.note || r.color ? h('div', { class: 'muted', style: 'font-size:12px', text: [r.color, r.note].filter(Boolean).join('. ') }) : null]),
          h('td', { class: 'n', text: (r.green != null ? r.green + ' g' : '-') + (r.roasted != null ? ' → ' + r.roasted + ' g' : '') }),
          h('td', { class: 'n', text: loss != null ? loss.toFixed(1) + '%' : '-' }),
          h('td', { class: 'n', text: r.fc ? r.fc + (r.fcTemp ? ' · ' + r.fcTemp + ' °C' : '') : '-' }),
          h('td', { class: 'n', text: r.drop ? r.drop + (r.dropTemp ? ' · ' + r.dropTemp + ' °C' : '') : '-' }),
          h('td', { class: 'n', text: r.dev ? r.dev + (r.devPct != null ? ' (' + r.devPct + '%)' : '') : '-' }),
          h('td', { class: 'n', text: rs.n ? rs.n + ' · ' + fmt(rs.ey, 1) + '%' : '-' }),
          h('td', { class: 'n', text: rs.rated ? rs.liked + '/' + rs.rated : '-' })
        ]));
      });
      left.appendChild(card('Roast log', [h('div', { class: 'scroll-x' }, [h('table', { class: 'list-table' }, [h('thead', {}, [h('tr', {}, [
        h('th', { text: 'Batch' }), h('th', { class: 'n', text: 'Green → roasted' }), h('th', { class: 'n', text: 'Loss' }), h('th', { class: 'n', text: 'First crack' }),
        h('th', { class: 'n', text: 'Drop' }), h('th', { class: 'n', text: 'Development' }), h('th', { class: 'n', text: 'Brews · median yield' }), h('th', { class: 'n', text: 'Liked' })])]), tb])])]));
    }
    var chips = descriptorCounts(list);
    left.appendChild(card('Tasting across brews', [chips.length ? h('div', { class: 'chips-d' }, chips) : h('p', { class: 'muted', text: 'No SCA descriptors recorded for this bean yet.' }),
      h('p', { class: 'card-note', text: 'How often each SCA flavor wheel term, main taste and mouthfeel term appears across the brews of this bean.' })]));
    var gcc = goldCupCard('Brewing control chart', 'Blue marks brews of this bean.');
    var restBox = h('div', {});
    var right = h('div', { class: 'stack' }, [gcc.card]);
    var withRest = list.filter(function (b) { return b.rest != null && b.ey != null; });
    if (withRest.length >= 2) right.appendChild(card('Yield by days off roast', [restBox, shapeLegend(true), h('p', { class: 'card-note', text: 'The shaded band is the SCA 18 to 22% yield range.' })]));
    app.appendChild(h('div', { class: 'two-col' }, [left, right]));
    app.appendChild(h('div', { style: 'margin-top:16px' }, [card('Brews', [list.length ? brewTable(list, 'brewer') : h('p', { class: 'muted', text: 'No brews yet.' })])]));
    goldCup(gcc.box, { height: 250, style: function (b) { return b.bean === id ? { color: 'var(--s1)', on: true } : { color: 'var(--deemph)', on: false }; }, onClick: function (b) { location.hash = '#/b/' + b.slug; } });
    if (withRest.length >= 2) restScatter(restBox, withRest);
  }

  // ---------- BREWERS ----------
  function renderBrewers() {
    var app = document.getElementById('app'); app.replaceChildren();
    document.title = 'Brewers · Daily Brew Log';
    var codes = Object.keys(BREWERS).map(function (c) { return { c: c, st: brewStats(brewerBrews(c)) }; }).sort(function (a, b) { return b.st.n - a.st.n; });
    app.appendChild(h('div', { class: 'page-head' }, [h('h1', { text: 'Brewers' }), h('p', { text: plural(codes.length, 'brewer') + ' · ' + plural(BREWS.length, 'brew') })]));
    app.appendChild(h('div', { class: 'cat-grid' }, codes.map(function (it) {
      var br = BREWERS[it.c], st = it.st;
      return h('a', { class: 'card cat-card', href: '#/brewers/' + it.c }, [
        br.image ? h('div', { class: 'gear-img small' }, [h('img', { src: br.image, alt: br.name, loading: 'lazy' })]) : null,
        h('div', { class: 'cat-top' }, [h('h3', { text: br.name }), h('span', { class: 'muted', style: 'font-size:12px', text: plural(st.n, 'brew') })]),
        h('div', { class: 'cat-sub', text: [br.type, br.material].filter(Boolean).join(' · ') }),
        h('div', { class: 'stats' }, [stat('Median yield', fmt(st.ey, 1), '%'), stat('Median TDS', fmt(st.tds, 2), '%'), stat('Median time', fmtTime(st.time)), stat('Peak slurry', fmt(st.peak, 1), st.peak != null ? '°C' : '')]),
        h('div', { class: 'cat-sub muted', text: br.formula === 'immersion' ? 'Immersion formula for extraction yield' : 'Beverage formula for extraction yield' })
      ]);
    })));
    var withCurves = codes.filter(function (it) { return brewerBrews(it.c).some(function (b) { return b.thumb; }); });
    if (withCurves.length) {
      var box = h('div', {});
      app.appendChild(h('div', { style: 'margin-top:16px' }, [card('Median slurry temperature by brewer', [
        legendKeys(withCurves.map(function (it, i) { return { color: slotVar(i + 1), name: BREWERS[it.c].name + ' (' + plural(brewerBrews(it.c).filter(function (b) { return b.thumb; }).length, 'curve') + ')' }; })), box,
        h('p', { class: 'card-note', text: 'Median probe reading across every brew with a curve, from the first pour. Brewers without curves are not shown.' })])]));
      var series = withCurves.map(function (it, i) {
        var m = medianCurve(brewerBrews(it.c), 'p');
        return { ts: m.ts, vs: m.vs, color: slotVar(i + 1), name: BREWERS[it.c].name, endName: it.c };
      });
      timeChart(box, { xDom: [0, X_MAX], panels: [{ title: 'Slurry temperature', subtitle: '°C', unit: '°C', dom: T_DOM, ticks: [60, 70, 80, 90, 100], height: 200, fmt: function (v) { return (+v).toFixed(1); }, series: series }] });
    }
  }
  function renderBrewer(code) {
    var app = document.getElementById('app'); app.replaceChildren();
    var br = BREWERS[code];
    app.appendChild(h('div', { class: 'crumbs' }, [h('a', { href: '#/brewers', text: '← Brewers' }), h('span')]));
    if (!br) { app.appendChild(h('div', { class: 'card empty', text: 'Brewer not found.' })); return; }
    document.title = br.name + ' · Daily Brew Log';
    var list = brewerBrews(code), st = brewStats(list);
    app.appendChild(h('div', { class: 'detail-head' }, [
      br.image ? h('figure', { class: 'head-img' }, [h('img', { src: br.image, alt: br.name }), br.imageCredit ? h('figcaption', {}, [h('a', { href: br.imageSource, target: '_blank', rel: 'noopener', text: 'Photo: ' + br.imageCredit })]) : null]) : null,
      h('div', { style: 'flex:1;min-width:0' }, [h('div', { class: 'when', text: 'Brewer' }), h('h1', { text: br.name }), h('div', { class: 'meta' }, [br.maker, br.material, br.formula === 'immersion' ? 'Immersion formula' : 'Beverage formula'].filter(Boolean).map(function (t) { return h('span', { class: 'tag', text: t }); }))]),
      list.length ? h('a', { class: 'ghost-btn', href: '#/?brewer=' + code, text: 'Show in brew list' }) : null
    ]));
    app.appendChild(h('div', { class: 'tiles' }, [
      tile('Brews', String(st.n), '', st.n ? plural(st.days, 'day') : null),
      tile('Liked', st.rated ? String(st.liked) : '-', '', st.rated ? 'of ' + st.rated + ' rated' : 'No ratings yet'),
      tile('Median yield', fmt(st.ey, 1), st.ey != null ? '%' : ''),
      tile('Median TDS', fmt(st.tds, 2), st.tds != null ? '%' : ''),
      tile('Median time', fmtTime(st.time)),
      tile('Peak slurry', fmt(st.peak, 1), st.peak != null ? '°C' : '', st.peak != null ? 'Median of probe peaks' : 'No probe curves')
    ]));
    var chartBox = h('div', {});
    var withT = list.filter(function (b) { return b.thumb; }).length;
    var left = h('div', { class: 'stack' }, [
      card('Every brew, overlaid', [withT ? legendKeys([{ color: 'var(--deemph)', name: 'Each brew' }, { color: 'var(--s1)', name: 'Median' }]) : null, chartBox,
        withT ? h('p', { class: 'card-note', text: plural(withT, 'brew') + ' with curves, on the same axes as every brew card.' }) : null]),
      card('About', [kv([['Maker', br.maker], ['Type', br.type], ['Material', br.material], ['Method', br.method],
        ['Yield', br.formula === 'immersion' ? 'Immersion formula: TDS / (1 - TDS) × water / dose' : 'Beverage formula: TDS × beverage / dose'], ['Notes', br.notes]])])
    ]);
    var gcc = goldCupCard('Brewing control chart', 'Blue marks brews made with this brewer.');
    var counts = {};
    list.forEach(function (b) { var k = b.bean || '__none'; counts[k] = (counts[k] || 0) + 1; });
    var beanList = h('div', { class: 'chips-d' }, Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) {
      return k === '__none' ? h('span', { class: 'chip-d', text: 'Unrecorded ×' + counts[k] }) : h('a', { class: 'chip-d', style: 'text-decoration:none', href: '#/beans/' + k, text: BEANS[k].name + ' ×' + counts[k] });
    }));
    app.appendChild(h('div', { class: 'two-col' }, [left, h('div', { class: 'stack' }, [gcc.card, card('Beans brewed', [beanList])])]));
    app.appendChild(h('div', { style: 'margin-top:16px' }, [card('Brews', [list.length ? brewTable(list, 'bean') : h('p', { class: 'muted', text: 'No brews yet.' })])]));
    overlayChart(chartBox, list);
    goldCup(gcc.box, { height: 250, style: function (b) { return b.brewer === code ? { color: 'var(--s1)', on: true } : { color: 'var(--deemph)', on: false }; }, onClick: function (b) { location.hash = '#/b/' + b.slug; } });
  }

  // ---------- GEAR ----------
  function gearUsage(it) {
    var list = null, label = null;
    if (it.grinder) { list = BREWS.filter(function (b) { return b.grinder === it.grinder; }); label = 'brews'; }
    else if (it.twoScale) { list = BREWS.filter(function (b) { return b.scales === 2; }); label = 'two-scale brews'; }
    else if (it.tds) { list = BREWS.filter(function (b) { return b.tds != null; }); label = 'TDS readings'; }
    else if (it.curves) { list = BREWS.filter(function (b) { return b.hasTrace; }); label = 'brew curves'; }
    if (!list) return null;
    return { n: list.length, label: label, first: list.length ? list[0].date : null, last: list.length ? list[list.length - 1].date : null };
  }
  function gearImage(it) {
    if (!it || !it.image) return h('div', { class: 'gear-img empty', 'aria-hidden': 'true' }, [h('span', { text: 'No photo yet' })]);
    return h('figure', { class: 'gear-img' }, [
      h('img', { src: it.image, alt: it.name, loading: 'lazy' }),
      it.imageCredit ? h('figcaption', {}, [it.imageSource ? h('a', { href: it.imageSource, target: '_blank', rel: 'noopener', text: 'Photo: ' + it.imageCredit }) : 'Photo: ' + it.imageCredit]) : null
    ]);
  }
  function gearCard(name, maker, role, specs, usage, actions, imgItem) {
    return h('section', { class: 'card cat-card gear-card' }, [
      gearImage(Object.assign({ name: name }, imgItem || {})),
      h('div', { class: 'cat-top' }, [h('h3', { text: name }), usage ? h('span', { class: 'muted', style: 'font-size:12px', text: usage.n + ' ' + usage.label }) : null]),
      maker ? h('div', { class: 'cat-sub', text: maker }) : null,
      role ? h('p', { class: 'gear-role', text: role }) : null,
      specs && specs.length ? kv(specs) : null,
      usage && usage.first ? h('div', { class: 'cat-sub muted', text: usage.first === usage.last ? 'Used on ' + shortDay(usage.first) : 'Used ' + shortDay(usage.first) + ' to ' + shortDay(usage.last) }) : null,
      actions && actions.length ? h('div', { class: 'gear-actions' }, actions) : null
    ]);
  }
  function setupFlow() {
    function node(title, sub) { return h('div', { class: 'flow-node' }, [h('strong', { text: title }), sub ? h('span', { class: 'muted', text: sub }) : null]); }
    function arrow() { return h('div', { class: 'flow-arrow', 'aria-hidden': 'true', text: '→' }); }
    var inputs = h('div', { class: 'flow-col' }, [
      node('Bookoo Themis Ultra', 'water poured'), node('Lefu CK811BLE', 'beverage out'), node('Bed probe', 'slurry temperature'), node('DiFluid RS Extract', 'TDS')
    ]);
    return h('div', { class: 'flow', role: 'img', 'aria-label': 'Scales, bed probe and refractometer feed Coffee Watch, which uploads to Dropbox; records are synced by hand to this site.' }, [
      inputs, arrow(), node('Coffee Watch', 'M5Stack StopWatch'), arrow(), node('Dropbox', 'one record per brew'), arrow(), node('This site', 'synced by hand')
    ]);
  }
  function renderGear() {
    var app = document.getElementById('app'); app.replaceChildren();
    document.title = 'Gear · Daily Brew Log';
    var cats = (GEAR.categories || []).slice();
    var items = GEAR.items || {};
    app.appendChild(h('div', { class: 'page-head' }, [h('h1', { text: 'Gear' }), h('p', { text: 'Everything used to brew, measure and log these coffees' })]));
    app.appendChild(card('How a brew is logged', [setupFlow()]));
    cats.forEach(function (cat) {
      var cards = [];
      if (cat === 'Brewers') {
        Object.keys(BREWERS).forEach(function (code) {
          var br = BREWERS[code], list = brewerBrews(code);
          var usage = { n: list.length, label: list.length === 1 ? 'brew' : 'brews', first: list.length ? list[0].date : null, last: list.length ? list[list.length - 1].date : null };
          cards.push(gearCard(br.name, [br.maker, br.material].filter(Boolean).join(' · '), br.type, [], usage, [h('a', { class: 'ghost-btn', href: '#/brewers/' + code, text: 'Brewer page' })], br));
        });
      } else {
        Object.keys(items).filter(function (id) { return items[id].category === cat; }).forEach(function (id) {
          var it = items[id], usage = gearUsage(it), actions = [];
          if (it.grinder) actions.push(h('a', { class: 'ghost-btn', href: '#/?grinder=' + encodeURIComponent(it.grinder), text: 'Show brews' }));
          if (it.link) actions.push(h('a', { class: 'ghost-btn', href: it.link, target: '_blank', rel: 'noopener', text: it.linkLabel || 'Link' }));
          var specs = (it.specs || []).slice();
          if (it.since && !usage) specs.push(['Since', dayLabel(it.since) + ', ' + it.since.slice(0, 4)]);
          cards.push(gearCard(it.name, it.maker, it.role, specs, usage, actions, it));
        });
      }
      if (!cards.length) return;
      app.appendChild(h('div', { class: 'section-h', text: cat }));
      app.appendChild(h('div', { class: 'cat-grid' }, cards));
    });
  }

  // ---------- boot ----------
  function rerender() {
    var r = parseRoute();
    hideTip(); closeDD(); openDD = null;
    if (r.name === 'home' || r.name === 'compare') document.title = 'Daily Brew Log';
    if (r.name === 'brew') renderBrew(r);
    else if (r.name === 'compare') renderCompare(r);
    else if (r.name === 'beans') renderBeans();
    else if (r.name === 'bean') renderBean(r.id);
    else if (r.name === 'brewers') renderBrewers();
    else if (r.name === 'brewer') renderBrewer(r.id);
    else if (r.name === 'gear') renderGear();
    else renderHome(r);
    var navKey = { home: 'home', brew: 'home', compare: 'home', beans: 'beans', bean: 'beans', brewers: 'brewers', brewer: 'brewers', gear: 'gear' }[r.name];
    document.querySelectorAll('.tabs a').forEach(function (a) { if (a.getAttribute('data-nav') === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderTray();
  }
  var lastRoute = '';
  window.addEventListener('hashchange', function () {
    var r = parseRoute();
    if (r.name === 'home' && lastRoute === 'home' && document.getElementById('list')) { F = filtersFromQuery(r.q); updateHome(); buildFilterBar(); return; }
    lastRoute = r.name; rerender(); window.scrollTo(0, 0);
  });
  var rt, lastW = innerWidth;
  window.addEventListener('resize', function () {
    if (Math.abs(innerWidth - lastW) < 40) return;
    lastW = innerWidth; clearTimeout(rt); rt = setTimeout(rerender, 180);
  });
  var themeBtn = document.getElementById('theme-btn');
  function themeLabel() { var t = document.documentElement.getAttribute('data-theme'); themeBtn.textContent = 'Theme: ' + (t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Auto'); }
  themeBtn.addEventListener('click', function () {
    var t = document.documentElement.getAttribute('data-theme');
    var nextT = t === 'light' ? 'dark' : t === 'dark' ? null : 'light';
    if (nextT) { document.documentElement.setAttribute('data-theme', nextT); localStorage.setItem('coffee-theme', nextT); }
    else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('coffee-theme'); }
    themeLabel(); if (BREWS) rerender();
  });
  themeLabel();

  fetch('data/index.json?v=' + V).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    BEANS = d.beans; BREWERS = d.brewers || {}; GEAR = d.gear || { categories: [], items: {} };
    Object.keys(BREWERS).forEach(function (k) { BREWER[k] = BREWERS[k].name; });
    BREWS = d.brews.slice().sort(function (a, b) { return a.date === b.date ? a.cup - b.cup : (a.date < b.date ? -1 : 1); });
    BREWS.forEach(function (b, i) { b.idx = i; BY_SLUG[b.slug] = b; });
    LAST_DAY = BREWS[BREWS.length - 1].date;
    DAYS = Array.from(new Set(BREWS.map(function (b) { return b.date; })));
    document.getElementById('brand-sub').textContent = plural(BREWS.length, 'brew') + ' · ' + plural(DAYS.length, 'day') + ' · ' + shortDay(DAYS[0]) + ' to ' + shortDay(LAST_DAY) + ', ' + LAST_DAY.slice(0, 4);
    loadSel();
    lastRoute = parseRoute().name;
    rerender();
  }).catch(function () {
    document.getElementById('app').replaceChildren(h('div', { class: 'card empty', text: 'Could not load the brew data.' }));
  });
})();
