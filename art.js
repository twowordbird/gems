/* Gems: procedural art. Every gem is a faceted SVG symbol with its own cut,
   so colors also read by shape: round diamond, pear sapphire, step-cut
   emerald, heart ruby, hexagon onyx, star gold. */
(function () {
  'use strict';
  const E = window.GemsEngine;

  const STYLE = [
    { h: 205, s: 38, l: 84, amp: 13, fire: true, stroke: 'hsl(210,32%,58%)', line: 'rgba(110,140,185,.35)' },
    { h: 223, s: 86, l: 47, amp: 18, stroke: 'hsl(226,80%,24%)', line: 'rgba(255,255,255,.2)' },
    { h: 153, s: 74, l: 38, amp: 16, stroke: 'hsl(156,78%,16%)', line: 'rgba(255,255,255,.2)' },
    { h: 348, s: 82, l: 48, amp: 16, stroke: 'hsl(350,80%,23%)', line: 'rgba(255,255,255,.2)' },
    { h: 270, s: 18, l: 21, amp: 13, stroke: 'hsl(270,28%,64%)', line: 'rgba(255,255,255,.13)' },
    { h: 43, s: 95, l: 55, amp: 17, stroke: 'hsl(34,85%,30%)', line: 'rgba(255,255,255,.28)' },
  ];
  const f = n => Math.round(n * 10) / 10;
  const pts = a => a.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
  const hsl = (h, s, l) => `hsl(${f(h)},${f(s)}%,${f(Math.max(3, Math.min(97, l)))}%)`;

  function ring(n, rFn, rot) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i * 2 * Math.PI / n, r = rFn(i);
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }
  // Scale a point set to fit a 6..94 box, centered.
  function fit(P, lo = 6, hi = 94) {
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = (hi - lo) / Math.max(x1 - x0, y1 - y0);
    const ox = 50 - (x0 + x1) / 2 * k, oy = 50 - (y0 + y1) / 2 * k;
    return P.map(([x, y]) => [x * k + ox, y * k + oy]);
  }
  function shape(c) {
    switch (c) {
      case 0: return fit(ring(8, () => 1, Math.PI / 8));
      case 1: { // pear, point up
        const P = [];
        for (let i = 0; i < 16; i++) {
          const t = i / 16 * 2 * Math.PI;
          P.push([Math.sin(t) * Math.sin(t / 2), -Math.cos(t)]);
        }
        return fit(P, 8, 92);
      }
      case 2: return [[33, 7], [67, 7], [82, 22], [82, 78], [67, 93], [33, 93], [18, 78], [18, 22]];
      case 3: { // heart
        const P = [];
        for (let i = 0; i < 18; i++) {
          const t = i / 18 * 2 * Math.PI;
          P.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
        }
        return fit(P, 6, 94);
      }
      case 4: return fit(ring(6, () => 1, -Math.PI / 2), 7, 93);
      case 5: return fit(ring(8, i => i % 2 ? 0.42 : 1, -Math.PI / 2), 4, 96);
    }
  }

  function gemSymbol(c) {
    const st = STYLE[c], P = shape(c), n = P.length;
    const C = [P.reduce((a, p) => a + p[0], 0) / n, P.reduce((a, p) => a + p[1], 0) / n];
    if (c === 3) C[1] -= 4;
    const k = c === 5 ? 0.34 : 0.54;
    const T = P.map(p => [C[0] + (p[0] - C[0]) * k, C[1] + (p[1] - C[1]) * k]);
    const light = -2.3;
    let facets = '';
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, M = [(T[i][0] + T[j][0]) / 2, (T[i][1] + T[j][1]) / 2];
      const tris = [[P[i], P[j], M, 0.3], [P[i], M, T[i], -0.24], [P[j], T[j], M, -0.02]];
      tris.forEach(([a, b, m, bias], t) => {
        const g = [(a[0] + b[0] + m[0]) / 3, (a[1] + b[1] + m[1]) / 3];
        const ang = Math.atan2(g[1] - C[1], g[0] - C[0]);
        const sh = Math.cos(ang - light) * 0.85 + bias + (i % 2 ? 0.12 : -0.12);
        let h = st.h, s = st.s;
        if (st.fire && (i * 3 + t) % 5 === 0) { h = [330, 48, 180, 275][(i + t) % 4]; s = 70; }
        facets += `<polygon points="${pts([a, b, m])}" fill="${hsl(h, s, st.l + sh * st.amp)}"/>`;
      });
    }
    facets += `<polygon points="${pts(T)}" fill="url(#tg-${c})"/>`;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const hx = C[0] - w * 0.13, hy = C[1] - h * 0.16;
    return `<symbol id="gem-${c}" viewBox="0 0 100 100">` +
      `<g stroke="${st.line}" stroke-width=".7" stroke-linejoin="round">${facets}</g>` +
      `<polygon points="${pts(P)}" fill="none" stroke="${st.stroke}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(w * .11)}" ry="${f(h * .035)}" transform="rotate(-36 ${f(hx)} ${f(hy)})" fill="#fff" opacity=".7"/>` +
      `</symbol>`;
  }

  function defs() {
    let g = '';
    STYLE.forEach((st, c) => {
      g += `<linearGradient id="tg-${c}" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${hsl(st.h, st.s, st.l + st.amp * 1.25)}"/>` +
        `<stop offset="1" stop-color="${hsl(st.h, st.s, st.l - st.amp * .25)}"/></linearGradient>`;
    });
    g += `<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f2c457"/>` +
      `<stop offset=".7" stop-color="#b9821f"/><stop offset="1" stop-color="#f6d47a"/></linearGradient>`;
    g += `<radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    return `<defs>${g}</defs>`;
  }

  const SPARK = 'M50 0 Q54 46 100 50 Q54 54 50 100 Q46 54 0 50 Q46 46 50 0Z';

  function sprite() {
    let s = defs();
    for (let c = 0; c < 6; c++) s += gemSymbol(c);
    s += `<symbol id="spark" viewBox="0 0 100 100"><path d="${SPARK}" fill="currentColor"/></symbol>`;
    // Tiara for patrons
    s += `<symbol id="tiara" viewBox="0 0 100 64">` +
      `<path d="M7 56 Q50 44 93 56 L91 45 L86 28 L78 39 L72 15 L62 34 L50 4 L38 34 L28 15 L22 39 L14 28 L9 45Z" fill="url(#metal)" stroke="#7a5512" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M9 52 Q50 41 91 52" fill="none" stroke="#fff4c9" stroke-width="1.2" opacity=".7"/>` +
      [[50, 4], [28, 15], [72, 15], [14, 28], [86, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#fdf6ec" stroke="#c7a76a" stroke-width=".8"/>`).join('') +
      `</symbol>`;
    // Ring band (level II) and pendant chain (level III)
    s += `<symbol id="band" viewBox="0 0 100 100">` +
      `<ellipse cx="50" cy="70" rx="25" ry="21" fill="none" stroke="#6d4a10" stroke-width="9"/>` +
      `<ellipse cx="50" cy="70" rx="25" ry="21" fill="none" stroke="url(#metal)" stroke-width="7"/>` +
      `<path d="M36 50 L42 38 L48 50Z M52 50 L58 38 L64 50Z" fill="url(#metal)" stroke="#7a5512" stroke-width="1"/>` +
      `</symbol>`;
    s += `<symbol id="chain" viewBox="0 0 100 100">` +
      `<path d="M2 2 Q50 62 98 2" fill="none" stroke="#6d4a10" stroke-width="3.6" stroke-dasharray="3.2 2.4" stroke-linecap="round"/>` +
      `<path d="M2 2 Q50 62 98 2" fill="none" stroke="url(#metal)" stroke-width="2.4" stroke-dasharray="3.2 2.4" stroke-linecap="round"/>` +
      `<circle cx="50" cy="35" r="5" fill="none" stroke="url(#metal)" stroke-width="2.6"/>` +
      `</symbol>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">${s}</svg>`;
  }

  const gem = (c, cls = '') => `<svg class="gem ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#gem-${c}"/></svg>`;
  const spark = (cls = '') => `<svg class="spark ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#spark"/></svg>`;

  function art(card) {
    const c = card.c;
    if (card.lv === 1) {
      return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true">` +
        `<ellipse cx="50" cy="86" rx="24" ry="5" fill="#000" opacity=".28"/>` +
        `<use href="#gem-${c}" x="21" y="16" width="58" height="58"/></svg>`;
    }
    if (card.lv === 2) {
      return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true">` +
        `<use href="#band" x="0" y="4" width="100" height="100"/>` +
        `<use href="#gem-${c}" x="27" y="4" width="46" height="46"/></svg>`;
    }
    return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true">` +
      `<circle cx="50" cy="66" r="34" fill="url(#glow)"/>` +
      `<use href="#chain" x="0" y="0" width="100" height="100"/>` +
      `<use href="#gem-${c}" x="21" y="38" width="58" height="58"/>` +
      `<use href="#spark" x="10" y="44" width="11" height="11" class="tw tw1"/>` +
      `<use href="#spark" x="80" y="58" width="9" height="9" class="tw tw2"/></svg>`;
  }

  function costHTML(cost) {
    let s = '', n = 0;
    for (let c = 0; c < 5; c++) if (cost[c]) { s += `<span class="pip c-${c}">${cost[c]}</span>`; n++; }
    return `<div class="cost n${n}">${s}</div>`;
  }

  const LEVEL_NAMES = ['', 'Loose stones', 'Rings', 'Pendants'];
  const ROMAN = ['', 'I', 'II', 'III'];

  function cardHTML(id, extra = '') {
    const card = E.CARDS[id];
    return `<div class="card c-${card.c} lv-${card.lv} ${extra}">` +
      `<div class="card-top"><span class="pts">${card.p || ''}</span>${gem(card.c, 'bonus')}</div>` +
      art(card) + costHTML(card.cost) +
      `</div>`;
  }
  function backHTML(lv, count, extra = '') {
    return `<div class="card back lv-${lv} ${extra}"><span class="roman">${ROMAN[lv]}</span>` +
      (count != null ? `<span class="left">${count}</span>` : '') + `</div>`;
  }
  function nobleHTML(id, extra = '') {
    const nb = E.NOBLES[id];
    const cols = nb.req.map((r, c) => r ? c : -1).filter(c => c >= 0);
    const xs = cols.length === 3 ? [26, 50, 74] : [38, 62];
    const jewels = cols.map((c, k) => `<use href="#gem-${c}" x="${xs[k] - 8}" y="38" width="16" height="16"/>`).join('');
    let req = '';
    for (const c of cols) req += `<span class="rq c-${c}">${nb.req[c]}</span>`;
    return `<div class="noble ${extra}"><span class="pts">3</span>` +
      `<svg class="tiara" viewBox="0 0 100 64" aria-hidden="true"><use href="#tiara"/>${jewels}</svg>` +
      `<div class="req">${req}</div></div>`;
  }

  function icon(size = 64) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${defs()}${gemSymbol(1)}` +
      `<rect width="100" height="100" rx="22" fill="#1d0f2a"/><use href="#gem-1" x="14" y="12" width="72" height="76"/></svg>`;
  }

  document.getElementById('sprite').innerHTML = sprite();
  window.GemsArt = { gem, spark, cardHTML, backHTML, nobleHTML, costHTML, LEVEL_NAMES, ROMAN, icon };
})();
