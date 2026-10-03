/* Gems: sparkles, flying pieces and chimes. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bg = document.getElementById('bg-fx'), fg = document.getElementById('fg-fx');
  const bctx = bg.getContext('2d'), fctx = fg.getContext('2d');
  const TINTS = ['#ffffff', '#ffffff', '#fff3c4', '#ffd66e', '#cfe0ff', '#ffc2dc', '#b9ffe2', '#e3d2ff'];
  const GEM_TINTS = ['#eef5ff', '#7ea6ff', '#5ff0b3', '#ff6d8c', '#d7c5f2', '#ffd66e'];
  let level = 1; // 0 subtle, 1 sparkly, 2 maximum
  let W = 0, H = 0, dpr = 1, ambient = [], parts = [], running = false, lastT = 0, lastBg = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    for (const c of [bg, fg]) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }
  function seed() {
    const n = reduce ? 0 : [10, 28, 70][level];
    ambient = Array.from({ length: n }, () => ({
      x: rand(0, W), y: rand(0, H), r: rand(1.5, level === 2 ? 6 : 4.2),
      ph: rand(0, 6.3), sp: rand(.5, 1.6), vy: -rand(3, 12), col: pick(TINTS),
    }));
    kick();
  }

  function star(ctx, x, y, r, a, col, rot) {
    if (a <= 0.01 || r <= 0.2) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, a) * .3;
    ctx.beginPath(); ctx.arc(0, 0, r * .5, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(.05, (t - (lastT || t)) / 1000);
    lastT = t;
    if (document.hidden) { running = false; return; }
    // Ambient twinkles on the back canvas at ~30fps.
    if (t - lastBg > 32) {
      lastBg = t;
      bctx.clearRect(0, 0, W, H);
      for (const s of ambient) {
        s.y += s.vy * dt * 2;
        if (s.y < -10) { s.y = H + 10; s.x = rand(0, W); }
        const tw = Math.max(0, Math.sin(s.ph + t / 1000 * s.sp * 2.2));
        star(bctx, s.x, s.y, s.r * (.4 + tw), tw ** 3 * .85, s.col, 0);
      }
    }
    fctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vx *= (1 - 1.8 * dt); p.vy = p.vy * (1 - 1.8 * dt) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = p.life / p.max;
      const tw = .65 + .35 * Math.sin(p.life * 22 + p.ph);
      star(fctx, p.x, p.y, p.r * (k < .2 ? k / .2 : 1 - (k - .2) * .7), (1 - k) * tw, p.col, p.rot);
    }
    if (parts.length || ambient.length) requestAnimationFrame(frame);
    else { running = false; bctx.clearRect(0, 0, W, H); }
  }
  function kick() {
    if (!running && !document.hidden) { running = true; lastT = 0; requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', kick);
  addEventListener('resize', resize);

  function burst(x, y, o = {}) {
    const mult = [0.45, 1, 2.3][level] * (reduce ? .25 : 1);
    const n = Math.max(1, Math.round((o.n || 16) * mult));
    const cols = o.colors || TINTS;
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), sp = rand(.25, 1) * (o.sp || 170);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 40),
        r: rand(2.5, o.r || 7), life: 0, max: rand(.45, 1.1) * (o.life || 1),
        col: pick(cols), rot: rand(0, 1), vr: rand(-3, 3), g: o.g == null ? 160 : o.g, ph: rand(0, 6),
      });
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
    kick();
  }
  function centerOf(r) { return [r.left + r.width / 2, r.top + r.height / 2]; }
  function burstAt(el, o) {
    if (!el) return;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : el;
    const [x, y] = centerOf(r);
    burst(x, y, o);
  }

  function rain(seconds = 4, colors) {
    if (reduce) return;
    const end = performance.now() + seconds * 1000;
    const per = [3, 6, 12][level];
    const iv = setInterval(() => {
      if (performance.now() > end) return clearInterval(iv);
      for (let i = 0; i < per; i++) {
        parts.push({
          x: rand(0, W), y: -10, vx: rand(-30, 30), vy: rand(60, 160), r: rand(3, 9),
          life: 0, max: rand(2.2, 3.6), col: pick(colors || GEM_TINTS.concat(TINTS)),
          rot: rand(0, 3), vr: rand(-4, 4), g: 40, ph: rand(0, 6),
        });
      }
      kick();
    }, 60);
  }

  function fly(from, to, html, o = {}) {
    return new Promise(res => {
      if (!from || !to) return res();
      const layer = document.getElementById('fly-layer');
      const el = document.createElement('div');
      el.className = 'flyer ' + (o.cls || '');
      el.innerHTML = html;
      const w = o.w || from.width, h = o.h || from.height;
      const [fx, fy] = centerOf(from), [tx, ty] = centerOf(to);
      Object.assign(el.style, { width: w + 'px', height: h + 'px', left: (fx - w / 2) + 'px', top: (fy - h / 2) + 'px' });
      layer.appendChild(el);
      if (reduce) { el.remove(); burst(tx, ty, { n: 4 }); return res(); }
      const dx = tx - fx, dy = ty - fy;
      const s1 = o.s1 || Math.max(.35, Math.min(1, Math.min(to.width / w, to.height / h)));
      const dur = o.dur || 620;
      const lift = Math.min(70, 20 + Math.abs(dx) * .15);
      const anim = el.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: o.fade0 == null ? 1 : o.fade0 },
        { transform: `translate(${dx * .45}px,${dy * .45 - lift}px) scale(${o.mid || 1.18}) rotate(${o.spin ? 160 : 0}deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px,${dy}px) scale(${s1}) rotate(${o.spin ? 360 : 0}deg)`, opacity: .95 },
      ], { duration: dur, delay: o.delay || 0, easing: 'cubic-bezier(.4,.05,.3,1)', fill: 'both' });
      const t0 = performance.now() + (o.delay || 0);
      const iv = setInterval(() => {
        if (performance.now() < t0) return;
        const r = el.getBoundingClientRect();
        const [x, y] = centerOf(r);
        burst(x, y, { n: level === 2 ? 3 : 1.4, sp: 35, g: 30, r: 4.5, up: 0, life: .7, colors: o.colors });
      }, 40);
      anim.onfinish = () => {
        clearInterval(iv);
        burst(tx, ty, { n: o.endN || 10, sp: 120, colors: o.colors });
        el.remove();
        res();
      };
    });
  }

  // Taps leave a little glitter.
  addEventListener('pointerdown', e => {
    unlock();
    if (level === 2) burst(e.clientX, e.clientY, { n: 4, sp: 110, g: 60 });
    else if (level === 1) burst(e.clientX, e.clientY, { n: 3, sp: 70, g: 40, r: 5 });
  }, { passive: true });

  // Chimes: small synthesized bells on a pentatonic scale.
  let ac = null, soundOn = true;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ac = new C(); } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function unlock() { if (soundOn) audio(); }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  function note(i, when, vol) {
    const a = audio();
    if (!a) return;
    const f0 = 880 * Math.pow(2, SCALE[Math.min(i, SCALE.length - 1)] / 12);
    const t = a.currentTime + when;
    for (const [m, g, len] of [[1, 1, 1.1], [2.76, .3, .45], [5.4, .1, .25]]) {
      const o = a.createOscillator(), gn = a.createGain();
      o.type = 'sine'; o.frequency.value = f0 * m;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol * g, t + .006);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(gn); gn.connect(a.destination);
      o.start(t); o.stop(t + len + .05);
    }
  }
  const TUNES = {
    take: [2, 4, 6], two: [4, 4], buy: [0, 2, 4, 7], reserve: [5, 3], noble: [0, 2, 3, 4, 6, 7, 9, 11],
    turn: [5, 8], win: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12], warn: [1, 0], tick: [7],
  };
  function play(kind) {
    if (!soundOn) return;
    const seq = TUNES[kind] || [4];
    const gap = kind === 'win' ? .09 : .075;
    seq.forEach((n, k) => note(n, k * gap, kind === 'tick' ? .03 : .06));
  }

  resize();
  window.GemsFX = {
    burst, burstAt, rain, fly, play, reduce,
    get level() { return level; },
    setLevel(l) { level = l; seed(); },
    get sound() { return soundOn; },
    setSound(on) { soundOn = on; },
  };
})();
