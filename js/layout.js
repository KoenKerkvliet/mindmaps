/* Indeling van de mindmap: "rondom" (radiaal) en "links naar rechts".
   Zet op elke zichtbare knoop: _cx, _cy (midden), _w, _h, _d (diepte), _ang, _lines, _fs, _lh */
(function () {
  'use strict';
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const ctx = document.createElement('canvas').getContext('2d');

  // lettergrootte, gewicht, max. breedte voor afbreken, padding
  const SIZES = [
    { fs: 24, fw: 500, wrap: 240, px: 28, py: 16 },
    { fs: 20, fw: 500, wrap: 210, px: 20, py: 11 },
    { fs: 17, fw: 400, wrap: 200, px: 10, py: 7 }
  ];

  let IMGS = {};
  const vis = n => (n.col ? [] : n.ch);
  // De indeling telt altijd alle knopen mee, ook ingeklapte takken. Zo blijft elke knoop op
  // zijn plek als je een tak in- of uitklapt. Alleen het tekenen slaat verborgen knopen over.
  const leaves = n => (n.ch.length ? n.ch.reduce((a, c) => a + leaves(c), 0) : 1);

  function wrapText(text, maxW, font) {
    ctx.font = font;
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (!cur || ctx.measureText(t).width <= maxW) cur = t;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
    return lines;
  }

  function measure(n, d, s) {
    const z = SIZES[Math.min(d, 2)];
    const fs = z.fs * s;
    const font = z.fw + ' ' + fs + 'px ' + FONT;
    const lines = wrapText(n.t || ' ', z.wrap * s, font);
    ctx.font = font;
    let mw = 0;
    for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
    n._lines = lines;
    n._fs = fs;
    n._lh = fs * 1.25;
    n._d = d;
    const th = lines.length * n._lh;
    // afbeelding boven de tekst
    const im = n.img && IMGS[n.img];
    let iw = 0, ih = 0, gap = 0;
    if (im && im.w && im.h) {
      const k = Math.min(150 * s / im.w, 120 * s / im.h);
      iw = Math.round(im.w * k); ih = Math.round(im.h * k); gap = 6 * s;
    }
    const ch = ih + gap + th;
    n._iw = iw; n._ih = ih;
    n._ioff = iw ? -ch / 2 : 0;
    n._toff = iw ? (-ch / 2 + ih + gap + th / 2) : 0;
    n._w = Math.ceil(Math.max(mw + 2 * z.px * s, iw ? iw + 16 * s : 0));
    n._h = Math.ceil(ch + 2 * z.py * s);
  }

  function lr(root, s) {
    const gapX = 72 * s, gapY = 14 * s;
    let y = 0;
    (function place(n, d, x) {
      measure(n, d, s);
      n._cx = x + n._w / 2;
      const k = n.ch;
      if (!k.length) { n._cy = y + n._h / 2; y += n._h + gapY; }
      else {
        k.forEach(c => place(c, d + 1, x + n._w + gapX));
        n._cy = (k[0]._cy + k[k.length - 1]._cy) / 2;
      }
    })(root, 0, 0);
  }

  function radial(root, s) {
    const levels = [];
    (function m(n, d) {
      measure(n, d, s);
      (levels[d] = levels[d] || []).push(n);
      n.ch.forEach(c => m(c, d + 1));
    })(root, 0);
    root._w = Math.ceil(root._w * 1.35);
    root._h = Math.ceil(root._h * 1.55);

    // hoeken: elke tak krijgt een stuk van de cirkel, naar aantal knopen onderin
    (function p(n, d, a0, a1) {
      n._ang = (a0 + a1) / 2;
      const k = n.ch;
      if (!k.length) return;
      const tot = k.reduce((q, c) => q + leaves(c), 0);
      let st = d === 0 ? -Math.PI / 2 : a0;
      const span = d === 0 ? Math.PI * 2 : a1 - a0;
      k.forEach(c => {
        const sp = span * leaves(c) / tot;
        p(c, d + 1, st, st + sp);
        st += sp;
      });
    })(root, 0, 0, 0);

    // afstanden: per niveau een ring, net zo ruim als nodig zodat niets overlapt
    const maxW = a => Math.max.apply(null, a.map(n => n._w));
    const maxH = a => Math.max.apply(null, a.map(n => n._h));
    const m = 10 * s;
    const hit = (a, b) => Math.abs(a._cx - b._cx) < (a._w + b._w) / 2 + m && Math.abs(a._cy - b._cy) < (a._h + b._h) / 2 + m;
    root._cx = 0; root._cy = 0;
    const placed = [root];
    let prx = 0, pry = 0, pw = root._w, ph = root._h;
    for (let d = 1; d < levels.length; d++) {
      const L = levels[d];
      const w = maxW(L), h = maxH(L);
      const foot = h + 14 * s + w * 0.18;
      const y0 = Math.max(pry + ph / 2 + h / 2 + 30 * s, L.length * foot / 8);
      const x0 = Math.max(prx + pw / 2 + w / 2 + 50 * s, y0 * 1.5);
      let f = 1;
      for (; f < 4; f += 0.05) {
        L.forEach(n => { n._cx = x0 * f * Math.cos(n._ang); n._cy = y0 * f * Math.sin(n._ang); });
        let bad = false;
        for (let i = 0; i < L.length && !bad; i++) {
          for (let j = 0; j < placed.length && !bad; j++) if (hit(L[i], placed[j])) bad = true;
          for (let j = 0; j < i && !bad; j++) if (hit(L[i], L[j])) bad = true;
        }
        if (!bad) break;
      }
      prx = x0 * f; pry = y0 * f; pw = w; ph = h;
      placed.push.apply(placed, L);
    }
  }

  function run(root, mode, scale, imgs) {
    IMGS = imgs || {};
    if (mode === 'lr') lr(root, scale); else radial(root, scale);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    (function b(n) {
      minX = Math.min(minX, n._cx - n._w / 2 - 30);
      maxX = Math.max(maxX, n._cx + n._w / 2 + 30);
      minY = Math.min(minY, n._cy - n._h / 2 - 30);
      maxY = Math.max(maxY, n._cy + n._h / 2 + 30);
      n.ch.forEach(b);
    })(root);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  window.Layout = { run, vis, FONT };
})();
