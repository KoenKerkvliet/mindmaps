(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const svg = $('#svg'), world = $('#world'), layerL = $('#layer-l'), layerN = $('#layer-n');
  const barEl = $('#bar');

  const COL = {
    blue:   { m: '#378ADD', d: '#185FA5', l: '#E6F1FB', t: '#0C447C' },
    teal:   { m: '#1D9E75', d: '#0F6E56', l: '#E1F5EE', t: '#085041' },
    coral:  { m: '#D85A30', d: '#993C1D', l: '#FAECE7', t: '#712B13' },
    amber:  { m: '#BA7517', d: '#854F0B', l: '#FAEEDA', t: '#633806' },
    pink:   { m: '#D4537E', d: '#993556', l: '#FBEAF0', t: '#72243E' },
    purple: { m: '#7F77DD', d: '#534AB7', l: '#EEEDFE', t: '#3C3489' },
    green:  { m: '#639922', d: '#3B6D11', l: '#EAF3DE', t: '#27500A' },
    gray:   { m: '#888780', d: '#5F5E5A', l: '#F1EFE8', t: '#444441' }
  };
  const ORDER = ['blue', 'teal', 'coral', 'amber', 'pink', 'purple', 'green'];

  let data = Store.load();
  let map = data.maps.find(m => m.id === data.current);
  let sel = null, present = false, bounds = null;
  let view = { x: 0, y: 0, k: 1 };
  let undoS = [], redoS = [];

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const scale = () => data.settings.fontScale || 1;

  /* ---------- boom-hulpfuncties ---------- */
  function find(id, n, p) {
    n = n || map.root;
    if (n.id === id) return { n, p: p || null };
    for (const c of n.ch) { const r = find(id, c, n); if (r) return r; }
    return null;
  }
  function walk(n, fn, d) { d = d || 0; fn(n, d); n.ch.forEach(c => walk(c, fn, d + 1)); }
  function count(n) { return n.ch.reduce((a, c) => a + 1 + count(c), 0); }
  function normalize(n) {
    return {
      id: Store.uid(),
      t: String(n && n.t != null ? n.t : '').slice(0, 300),
      c: COL[n && n.c] ? n.c : 'blue',
      col: !!(n && n.col),
      ch: Array.isArray(n && n.ch) ? n.ch.map(normalize) : []
    };
  }

  /* ---------- ongedaan maken ---------- */
  function snapshot() {
    undoS.push(Store.stringify({ title: map.title, layout: map.layout, root: map.root }));
    if (undoS.length > 80) undoS.shift();
    redoS = [];
    updateUndoButtons();
  }
  function restore(json) {
    const o = JSON.parse(json);
    map.title = o.title; map.layout = o.layout; map.root = o.root;
    if (sel && !find(sel)) sel = null;
    changed(); syncTop(); bar();
  }
  function undo() {
    if (!undoS.length) return;
    redoS.push(Store.stringify({ title: map.title, layout: map.layout, root: map.root }));
    restore(undoS.pop()); updateUndoButtons();
  }
  function redo() {
    if (!redoS.length) return;
    undoS.push(Store.stringify({ title: map.title, layout: map.layout, root: map.root }));
    restore(redoS.pop()); updateUndoButtons();
  }
  function updateUndoButtons() {
    $('#btn-undo').style.opacity = undoS.length ? 1 : .4;
    $('#btn-redo').style.opacity = redoS.length ? 1 : .4;
  }

  /* ---------- tekenen ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function anchor(n, tx, ty, rad) {
    if (rad && n._d >= 2) return [clamp(tx, n._cx - n._w / 2, n._cx + n._w / 2), n._cy + n._h / 2 - 3];
    return [n._cx, n._cy];
  }

  function taper(p, c) {
    const s = Math.min(scale(), 1.4);
    const [x0, y0] = anchor(p, c._cx, c._cy, true);
    const [x2, y2] = anchor(c, p._cx, p._cy, true);
    const dx = x2 - x0, dy = y2 - y0, len = Math.hypot(dx, dy) || 1;
    const cx = (x0 + x2) / 2 - dy * 0.16, cy = (y0 + y2) / 2 + dx * 0.16;
    const w0 = (c._d === 1 ? 16 : c._d === 2 ? 7 : 4) * s;
    const w1 = (c._d === 1 ? 6 : c._d === 2 ? 3 : 2.4) * s;
    const L = [], R = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x2;
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y2;
      const tx = 2 * mt * (cx - x0) + 2 * t * (x2 - cx), ty = 2 * mt * (cy - y0) + 2 * t * (y2 - cy);
      const tl = Math.hypot(tx, ty) || 1, hw = (w0 + (w1 - w0) * t) / 2;
      const nx = -ty / tl * hw, ny = tx / tl * hw;
      L.push((x + nx).toFixed(1) + ' ' + (y + ny).toFixed(1));
      R.push((x - nx).toFixed(1) + ' ' + (y - ny).toFixed(1));
    }
    return '<path d="M' + L.join('L') + 'L' + R.reverse().join('L') + 'Z" fill="' + COL[c.c].m + '"/>';
  }

  function textLines(n, fill, weight) {
    const y0 = n._cy - (n._lines.length - 1) * n._lh / 2;
    return '<text text-anchor="middle" dominant-baseline="central" font-size="' + n._fs.toFixed(1) + '" font-weight="' + weight + '" fill="' + fill + '">' +
      n._lines.map((l, i) => '<tspan x="' + n._cx.toFixed(1) + '" y="' + (y0 + i * n._lh).toFixed(1) + '">' + esc(l) + '</tspan>').join('') + '</text>';
  }

  function build(opts) {
    opts = opts || {};
    const rad = map.layout === 'radial';
    const L = [], Nn = [];
    const s = scale();

    (function draw(n, p) {
      const k = Layout.vis(n);
      k.forEach(c => {
        if (rad) L.push(taper(n, c));
        else {
          const x1 = n._cx + n._w / 2, y1 = n._cy, x2 = c._cx - c._w / 2, y2 = c._cy, m = (x1 + x2) / 2;
          L.push('<path d="M' + x1 + ' ' + y1 + 'C' + m + ' ' + y1 + ',' + m + ' ' + y2 + ',' + x2 + ' ' + y2 + '" fill="none" stroke="' + COL[c.c].m + '" stroke-width="' + (3 * Math.min(s, 1.4)) + '" stroke-linecap="round"/>');
        }
        draw(c, n);
      });

      const col = COL[n.c], d = n._d;
      const x = n._cx - n._w / 2, y = n._cy - n._h / 2;
      const isSel = !opts.noSel && !present && sel === n.id;
      let g = '<g data-id="' + n.id + '">';
      g += '<rect x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (n._w + 8) + '" height="' + (n._h + 8) + '" fill="transparent"/>';

      let shape = '';
      if (rad && d === 0) {
        shape = '<ellipse cx="' + n._cx + '" cy="' + n._cy + '" rx="' + n._w / 2 + '" ry="' + n._h / 2 + '" fill="' + col.d + '"/>' + textLines(n, '#fff', 500);
        if (isSel) g += '<ellipse cx="' + n._cx + '" cy="' + n._cy + '" rx="' + (n._w / 2 + 7) + '" ry="' + (n._h / 2 + 7) + '" fill="none" stroke="#378ADD" stroke-width="3" stroke-dasharray="7 5"/>';
      } else if (rad && d >= 2) {
        shape = textLines(n, col.t, 400) +
          '<line x1="' + x + '" y1="' + (y + n._h - 3) + '" x2="' + (x + n._w) + '" y2="' + (y + n._h - 3) + '" stroke="' + col.m + '" stroke-width="' + (3 * Math.min(s, 1.4)) + '" stroke-linecap="round"/>';
        if (isSel) g += '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="' + (n._w + 12) + '" height="' + (n._h + 12) + '" rx="12" fill="none" stroke="#378ADD" stroke-width="3" stroke-dasharray="7 5"/>';
      } else {
        const r = rad ? n._h / 2 : 14;
        if (d <= 1) shape = '<rect x="' + x + '" y="' + y + '" width="' + n._w + '" height="' + n._h + '" rx="' + r + '" fill="' + col.d + '"/>' + textLines(n, '#fff', 500);
        else shape = '<rect x="' + x + '" y="' + y + '" width="' + n._w + '" height="' + n._h + '" rx="12" fill="' + col.l + '" stroke="' + col.m + '" stroke-width="2"/>' + textLines(n, col.t, 400);
        if (isSel) g += '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="' + (n._w + 12) + '" height="' + (n._h + 12) + '" rx="' + (r + 6) + '" fill="none" stroke="#378ADD" stroke-width="3" stroke-dasharray="7 5"/>';
      }
      g += shape + '</g>';
      Nn.push(g);

      if (n.ch.length && !(rad && d === 0)) {
        let tx, ty;
        if (rad) {
          const off = Math.abs(Math.cos(n._ang)) * n._w / 2 + Math.abs(Math.sin(n._ang)) * n._h / 2 + 16;
          tx = n._cx + Math.cos(n._ang) * off; ty = n._cy + Math.sin(n._ang) * off;
        } else { tx = n._cx + n._w / 2; ty = n._cy; }
        const label = n.col ? count(n) : '−';
        Nn.push('<g data-id="' + n.id + '" data-tog="1"><circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="24" fill="transparent"/>' +
          '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="15" fill="#fff" stroke="' + col.m + '" stroke-width="2.5"/>' +
          '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="500" fill="' + col.t + '">' + label + '</text></g>');
      }
    })(map.root, null);

    return { l: L.join(''), n: Nn.join('') };
  }

  function relayout() {
    bounds = Layout.run(map.root, map.layout, scale());
    const o = build();
    layerL.innerHTML = o.l;
    layerN.innerHTML = o.n;
  }

  function changed() {
    map.updated = Date.now();
    Store.save();
    relayout();
  }

  /* ---------- zoomen en schuiven ---------- */
  function applyView() {
    world.setAttribute('transform', 'translate(' + view.x.toFixed(1) + ',' + view.y.toFixed(1) + ') scale(' + view.k.toFixed(4) + ')');
  }
  function fit() {
    const r = svg.getBoundingClientRect();
    if (!bounds || !r.width) return;
    const pad = 24;
    const k = Math.min((r.width - pad * 2) / bounds.w, (r.height - pad * 2) / bounds.h, 1.8);
    view.k = k;
    view.x = (r.width - bounds.w * k) / 2 - bounds.minX * k;
    view.y = (r.height - bounds.h * k) / 2 - bounds.minY * k;
    applyView();
  }
  function ensureInView() {
    const r = svg.getBoundingClientRect();
    if (!bounds) return;
    const x0 = view.x + bounds.minX * view.k, x1 = view.x + bounds.maxX * view.k;
    const y0 = view.y + bounds.minY * view.k, y1 = view.y + bounds.maxY * view.k;
    if (x0 < 0 || y0 < 0 || x1 > r.width || y1 > r.height) fit();
  }
  function zoomAt(cx, cy, f) {
    const k = clamp(view.k * f, 0.12, 4);
    f = k / view.k;
    view.x = cx - (cx - view.x) * f;
    view.y = cy - (cy - view.y) * f;
    view.k = k;
    applyView();
  }
  function reveal(n) {
    const r = svg.getBoundingClientRect();
    const sx = view.x + n._cx * view.k, sy = view.y + n._cy * view.k, m = 70;
    if (sx < m || sx > r.width - m || sy < m || sy > r.height - m) {
      view.x = r.width / 2 - n._cx * view.k;
      view.y = r.height / 2 - n._cy * view.k;
      applyView();
    }
  }

  const pts = new Map();
  let pan = null, pinch = null, moved = false;

  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      moved = false;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
      moved = true;
    }
  });

  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = clamp(pinch.k * d / pinch.d, 0.12, 4);
      const f = k / pinch.k;
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      const px = pinch.cx - r.left, py = pinch.cy - r.top;
      view.k = k;
      view.x = cx - (px - pinch.vx) * f;
      view.y = cy - (py - pinch.vy) * f;
      applyView();
    } else if (pan && pts.size === 1) {
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (!moved && Math.hypot(dx, dy) > 7) {
        moved = true;
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (moved) { view.x = pan.vx + dx; view.y = pan.vy + dy; applyView(); }
    }
  });

  function pointerEnd(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (pan && !moved && e.type === 'pointerup') tap(e);
      pan = null; pinch = null;
    } else if (pts.size === 1) {
      const p = [...pts.values()][0];
      pan = { sx: p.x, sy: p.y, vx: view.x, vy: view.y };
      pinch = null; moved = true;
    }
  }
  svg.addEventListener('pointerup', pointerEnd);
  svg.addEventListener('pointercancel', pointerEnd);

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function tap(e) {
    const g = e.target.closest && e.target.closest('[data-id]');
    if (!g) { if (!present && sel) { sel = null; relayout(); bar(); } return; }
    const r = find(g.dataset.id);
    if (!r) return;
    if (g.dataset.tog) { r.n.col = !r.n.col; changed(); ensureInView(); return; }
    if (present) { if (r.n.ch.length) { r.n.col = !r.n.col; changed(); ensureInView(); } return; }
    sel = r.n.id; relayout(); bar();
  }

  /* ---------- bewerken ---------- */
  function nextColor(p) {
    const used = p.ch.map(c => c.c);
    return ORDER.find(c => !used.includes(c)) || ORDER[p.ch.length % ORDER.length];
  }
  function newNode(c) { return { id: Store.uid(), t: 'Nieuw idee', c, ch: [], col: false }; }

  function addChild(id) {
    const r = find(id || sel); if (!r) return;
    snapshot();
    const n = newNode(r.p === null ? nextColor(r.n) : r.n.c);
    r.n.col = false; r.n.ch.push(n); sel = n.id;
    changed(); bar(); reveal(find(n.id).n); focusName();
  }
  function addSibling() {
    const r = find(sel); if (!r) return;
    if (!r.p) return addChild(sel);
    snapshot();
    const n = newNode(r.p === map.root ? nextColor(r.p) : r.n.c);
    const i = r.p.ch.indexOf(r.n);
    r.p.ch.splice(i + 1, 0, n); sel = n.id;
    changed(); bar(); reveal(find(n.id).n); focusName();
  }
  function removeSel() {
    const r = find(sel); if (!r || !r.p) return;
    if (r.n.ch.length > 2 && !confirm('Deze knoop heeft ' + count(r.n) + ' onderliggende knopen. Alles verwijderen?')) return;
    snapshot();
    r.p.ch = r.p.ch.filter(c => c !== r.n); sel = r.p.id;
    changed(); bar();
  }
  function setColor(c) {
    const r = find(sel); if (!r) return;
    snapshot();
    walk(r.n, n => { n.c = c; });
    changed(); bar();
  }
  function toggleSel() {
    const r = find(sel); if (!r || !r.n.ch.length) return;
    r.n.col = !r.n.col; changed(); bar();
  }
  function setAll(collapsed) {
    walk(map.root, n => { if (n.ch.length) n.col = collapsed; });
    changed(); fit();
  }
  function focusName() {
    const i = $('#name'); if (i) { i.focus(); i.select(); }
  }

  /* ---------- onderbalk ---------- */
  function bar() {
    if (present) return;
    if (!sel || !find(sel)) {
      barEl.innerHTML = '<span class="hint"><i class="ti ti-hand-finger" style="font-size:20px"></i>Tik op een knoop om te bewerken. Tik op het rondje naast een knoop om een tak in of uit te klappen. Sleep om te schuiven, knijp om te zoomen.</span>';
      return;
    }
    const r = find(sel), n = r.n;
    barEl.innerHTML =
      '<input id="name" type="text" maxlength="300" aria-label="Tekst van de knoop" value="' + esc(n.t) + '">' +
      '<button data-act="child"><i class="ti ti-plus"></i> Kindknoop</button>' +
      (r.p ? '<button data-act="sib"><i class="ti ti-arrow-down-right"></i> Zusje</button>' : '') +
      (n.ch.length ? '<button data-act="tog" title="Tak in- of uitklappen"><i class="ti ti-' + (n.col ? 'arrows-maximize' : 'arrows-minimize') + '"></i></button>' : '') +
      '<span class="sep"></span>' +
      Object.keys(COL).map(c => '<button class="sw' + (n.c === c ? ' on' : '') + '" data-act="col" data-c="' + c + '" style="background:' + COL[c].m + '" aria-label="Kleur ' + c + '"></button>').join('') +
      (r.p ? '<span class="sep"></span><button data-act="del" class="danger" title="Verwijderen"><i class="ti ti-trash"></i></button>' : '');
  }

  barEl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'child') addChild();
    else if (a === 'sib') addSibling();
    else if (a === 'tog') toggleSel();
    else if (a === 'col') setColor(b.dataset.c);
    else if (a === 'del') removeSel();
  });

  let typing = false;
  barEl.addEventListener('focusin', e => { if (e.target.id === 'name') typing = false; });
  barEl.addEventListener('input', e => {
    if (e.target.id !== 'name') return;
    const r = find(sel); if (!r) return;
    if (!typing) { snapshot(); typing = true; }
    r.n.t = e.target.value;
    changed();
  });
  barEl.addEventListener('keydown', e => {
    if (e.target.id !== 'name') return;
    if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
    else if (e.key === 'Tab') { e.preventDefault(); addChild(); }
    else if (e.key === 'Escape') { e.target.blur(); sel = null; relayout(); bar(); }
  });

  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && tag !== 'INPUT') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && tag !== 'INPUT') { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape' && present) { setPresent(false); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || $('#dlg-maps').open) return;
    if (present || !sel) return;
    if (e.key === 'Tab') { e.preventDefault(); addChild(); }
    else if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
    else if (e.key === 'F2') { e.preventDefault(); focusName(); }
    else if (e.key === 'Escape') { sel = null; relayout(); bar(); }
  });

  /* ---------- bovenbalk ---------- */
  function syncTop() {
    $('#title').value = map.title;
    document.title = (map.title ? map.title + ' - ' : '') + 'Mindmap';
    document.querySelectorAll('[data-layout]').forEach(b => b.classList.toggle('on', b.dataset.layout === map.layout));
    updateUndoButtons();
  }

  $('#title').addEventListener('input', e => { map.title = e.target.value; map.updated = Date.now(); Store.save(); document.title = (map.title ? map.title + ' - ' : '') + 'Mindmap'; });
  $('#title').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  document.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => {
    if (map.layout === b.dataset.layout) return;
    snapshot(); map.layout = b.dataset.layout;
    syncTop(); changed(); fit();
  }));

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-fit').addEventListener('click', fit);
  $('#f-fit').addEventListener('click', fit);
  $('#btn-colall').addEventListener('click', () => setAll(true));
  $('#f-col').addEventListener('click', () => setAll(true));
  $('#btn-expall').addEventListener('click', () => setAll(false));
  $('#f-exp').addEventListener('click', () => setAll(false));

  function fontStep(d) {
    const v = Math.round(clamp(scale() + d, 0.7, 2) * 100) / 100;
    data.settings.fontScale = v; Store.save(); relayout(); fit();
  }
  $('#btn-fsm').addEventListener('click', () => fontStep(-0.15));
  $('#btn-fsp').addEventListener('click', () => fontStep(0.15));

  function setPresent(on) {
    present = on;
    document.body.classList.toggle('present', on);
    if (on) sel = null;
    relayout(); if (!on) bar();
    setTimeout(fit, 30);
  }
  $('#btn-present').addEventListener('click', () => setPresent(true));
  $('#f-stop').addEventListener('click', () => setPresent(false));

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }
  $('#btn-full').addEventListener('click', toggleFull);
  $('#f-full').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 80));
  window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(fit, 120); });

  /* ---------- exporteren ---------- */
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const safeName = s => (s || 'mindmap').replace(/[\\/:*?"<>|]+/g, '').trim() || 'mindmap';

  function exportJSON() {
    download(safeName(map.title) + '.mindmap.json', new Blob([Store.stringify({ app: 'mindmap', version: 1, map })], { type: 'application/json' }));
  }
  function exportPNG() {
    const b = bounds, o = build({ noSel: true });
    const pad = 30, w = b.w + pad * 2, h = b.h + pad * 2;
    let k = 2; if (Math.max(w, h) * k > 6000) k = 6000 / Math.max(w, h);
    const src = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w * k) + '" height="' + Math.round(h * k) + '" viewBox="' + (b.minX - pad) + ' ' + (b.minY - pad) + ' ' + w + ' ' + h + '" font-family=\'' + Layout.FONT.replace(/'/g, '') + '\'>' +
      '<rect x="' + (b.minX - pad) + '" y="' + (b.minY - pad) + '" width="' + w + '" height="' + h + '" fill="#fbfaf7"/>' + o.l + o.n + '</svg>';
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(bl => bl && download(safeName(map.title) + '.png', bl), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  $('#btn-json').addEventListener('click', () => { exportJSON(); $('#menu-export').open = false; });
  $('#btn-png').addEventListener('click', () => { exportPNG(); $('#menu-export').open = false; });

  /* ---------- mindmaps beheren ---------- */
  const dlg = $('#dlg-maps');

  function openMap(id) {
    const m = data.maps.find(x => x.id === id); if (!m) return;
    map = m; data.current = id; sel = null; undoS = []; redoS = [];
    Store.save(); syncTop(); relayout(); bar(); fit();
  }

  function fmtDate(t) {
    try { return new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; }
  }

  function renderList() {
    const list = $('#map-list');
    const maps = data.maps.slice().sort((a, b) => b.updated - a.updated);
    list.innerHTML = maps.map(m =>
      '<li class="' + (m.id === map.id ? 'cur' : '') + '" data-id="' + m.id + '">' +
      '<button class="open" data-a="open"><b>' + esc(m.title || 'Zonder titel') + '</b><small>' + (count(m.root) + 1) + ' knopen, ' + fmtDate(m.updated) + '</small></button>' +
      '<button class="btn" data-a="dup" title="Kopie maken"><i class="ti ti-copy"></i></button>' +
      '<button class="btn danger" data-a="del" title="Verwijderen"><i class="ti ti-trash"></i></button></li>').join('');
  }

  $('#btn-maps').addEventListener('click', () => { Store.saveNow(); renderList(); dlg.showModal(); });
  $('#dlg-close').addEventListener('click', () => dlg.close());

  $('#map-list').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('li').dataset.id, a = b.dataset.a;
    const m = data.maps.find(x => x.id === id);
    if (a === 'open') { openMap(id); dlg.close(); }
    else if (a === 'dup') {
      const c = JSON.parse(Store.stringify(m)); c.id = Store.uid(); c.title = (m.title || 'Mindmap') + ' (kopie)'; c.root = normalize(c.root); c.updated = Date.now();
      data.maps.push(c); Store.saveNow(); renderList();
    } else if (a === 'del') {
      if (!confirm('"' + (m.title || 'Zonder titel') + '" verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
      data.maps = data.maps.filter(x => x.id !== id);
      if (!data.maps.length) data.maps.push(Store.sample());
      if (map.id === id) openMap(data.maps[0].id);
      Store.saveNow(); renderList();
    }
  });

  $('#btn-new').addEventListener('click', () => {
    const m = { id: Store.uid(), title: 'Nieuwe mindmap', layout: 'radial', updated: Date.now(), root: Store.N('Hoofdonderwerp', 'purple', []) };
    data.maps.push(m); Store.saveNow(); dlg.close(); openMap(m.id);
    sel = m.root.id; relayout(); bar(); focusName();
  });

  $('#file-import').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(rd.result);
        const list = o.maps ? o.maps : (o.map ? [o.map] : (o.root ? [o] : []));
        if (!list.length) throw new Error('leeg');
        let last = null;
        list.forEach(m => {
          if (!m || !m.root) return;
          last = { id: Store.uid(), title: String(m.title || 'Geimporteerd').slice(0, 120), layout: m.layout === 'lr' ? 'lr' : 'radial', updated: Date.now(), root: normalize(m.root) };
          data.maps.push(last);
        });
        if (!last) throw new Error('geen mindmap');
        Store.saveNow(); renderList();
        if (list.length === 1) { openMap(last.id); dlg.close(); }
      } catch (err) { alert('Dit bestand kon niet worden gelezen als mindmap.'); }
    };
    rd.readAsText(f);
  });

  $('#btn-backup').addEventListener('click', () => {
    const d = new Date().toISOString().slice(0, 10);
    download('mindmaps-backup-' + d + '.json', new Blob([Store.stringify({ app: 'mindmap', version: 1, maps: data.maps })], { type: 'application/json' }));
  });

  window.addEventListener('beforeunload', () => Store.saveNow());

  /* ---------- start ---------- */
  syncTop();
  relayout();
  bar();
  fit();
  requestAnimationFrame(fit);
})();
