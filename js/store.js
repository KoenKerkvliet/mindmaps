/* Opslag. Nu: localStorage in deze browser.
   Later te vervangen door Supabase: houd load() en save() in dezelfde vorm. */
(function () {
  'use strict';
  const KEY = 'mindmaps.v1';

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const N = (t, c, ch) => ({ id: uid(), t, c, ch: ch || [], col: false });

  function sample() {
    return {
      id: uid(),
      title: 'Waterkringloop',
      layout: 'radial',
      updated: Date.now(),
      root: N('Waterkringloop', 'purple', [
        N('Verdamping', 'blue', [N('De zon verwarmt het water', 'blue'), N('Waterdamp stijgt op', 'blue')]),
        N('Condensatie', 'teal', [N('Wolken ontstaan', 'teal')]),
        N('Neerslag', 'coral', [N('Regen', 'coral'), N('Sneeuw', 'coral'), N('Hagel', 'coral')]),
        N('Terug naar zee', 'amber', [N('Rivieren', 'amber'), N('Grondwater', 'amber')])
      ])
    };
  }

  const replacer = (k, v) => (k[0] === '_' ? undefined : v);
  let timer = null;

  const Store = {
    data: null,
    uid, N, sample,

    load() {
      let d = null;
      try { const r = localStorage.getItem(KEY); d = r ? JSON.parse(r) : null; } catch (e) { d = null; }
      if (!d || !Array.isArray(d.maps) || !d.maps.length) {
        const m = sample();
        d = { maps: [m], current: m.id, settings: { fontScale: 1 } };
      }
      if (!d.settings) d.settings = { fontScale: 1 };
      if (!d.maps.some(m => m.id === d.current)) d.current = d.maps[0].id;
      this.data = d;
      return d;
    },

    save() {
      clearTimeout(timer);
      timer = setTimeout(() => this.saveNow(), 250);
    },

    saveNow() {
      clearTimeout(timer);
      try { localStorage.setItem(KEY, JSON.stringify(this.data, replacer)); } catch (e) { console.warn('Opslaan mislukt', e); }
    },

    stringify(obj) { return JSON.stringify(obj, replacer); }
  };

  window.Store = Store;
})();
