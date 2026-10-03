/* Gems: screens, taps, and the table every phone shares. */
(function () {
  'use strict';
  const E = window.GemsEngine, A = window.GemsArt, FX = window.GemsFX, NET = window.GemsNet;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gems.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem('gems.' + k); else localStorage.setItem('gems.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  function rid(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  }
  const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  function newCode() {
    const a = new Uint8Array(4);
    crypto.getRandomValues(a);
    return Array.from(a, b => CODE_ABC[b % CODE_ABC.length]).join('');
  }
  const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const SEAT_COLORS = ['#ff8cc6', '#7fe0ff', '#ffd36e', '#b8a2ff'];
  const LEVEL = ['', 'Level I', 'Level II', 'Level III'];

  const app = {
    device: store.get('device') || (() => { const d = rid(12); store.set('device', d); return d; })(),
    name: store.get('name', ''),
    mode: 'home',          // home | setup | room
    online: false,
    room: null,
    table: null,
    relay: null,
    net: { up: 0, total: 0 },
    sel: [],
    undo: [],
    sheet: null,
    discard: [0, 0, 0, 0, 0, 0],
    prefill: '',
    joinTimer: null,
    kicked: false,
    waitSince: 0,
  };

  // ---------- table helpers ----------
  const G = () => app.table && app.table.game;
  const seats = () => (app.table ? app.table.seats : []);
  const mine = i => !!(seats()[i] && seats()[i].device === app.device);
  const mySeats = () => seats().map((s, i) => (s.device === app.device ? i : -1)).filter(i => i >= 0);
  const amSeated = () => mySeats().length > 0;
  const canAct = () => { const g = G(); return !!(g && !g.over && mine(g.turn)); };
  const seatName = i => (seats()[i] ? seats()[i].name : 'Someone');
  function viewSeat() {
    const g = G();
    if (mine(g.turn)) return g.turn;
    const m = mySeats();
    return m.length ? m[0] : g.turn;
  }
  const soloPhone = () => !app.online || seats().every(s => s.device === app.device);
  function youOrName(i) {
    if (mine(i) && app.online && mySeats().length === 1) return 'You';
    return seatName(i);
  }

  function validTable(t) {
    if (!t || typeof t !== 'object' || t.v !== 1) return false;
    if (typeof t.room !== 'string' || !/^([A-Z]{4}|LOCAL)$/.test(t.room)) return false;
    if (!Number.isFinite(t.epoch) || !Number.isInteger(t.seq) || t.seq < 0) return false;
    if (typeof t.nonce !== 'string' || t.nonce.length > 16 || typeof t.host !== 'string') return false;
    if (t.phase !== 'lobby' && t.phase !== 'play') return false;
    if (!Array.isArray(t.seats) || t.seats.length < 1 || t.seats.length > 4) return false;
    if (!t.seats.every(s => s && typeof s.device === 'string' && s.device.length <= 40 && typeof s.name === 'string' && s.name.length <= 24)) return false;
    if (!Number.isInteger(t.gameNo)) return false;
    if (t.phase === 'play' && !(E.isValidState(t.game) && t.game.players.length === t.seats.length)) return false;
    return true;
  }

  // ---------- state changes ----------
  function setTable(t) {
    const prev = app.table;
    const before = snapshot();
    FX.wake();
    const wasSeated = prev && amSeated();
    app.table = t;
    if (!app.online) store.set('local', t);
    const g = t.game, pg = prev && prev.game;
    if (!g || !pg || prev.gameNo !== t.gameNo || pg.turn !== g.turn || !canAct() || g.pending) app.sel = [];
    const lastUndo = app.undo[app.undo.length - 1];
    if (lastUndo && (!g || t.gameNo !== lastUndo.gameNo || (g.acts || 0) !== lastUndo.after)) app.undo = [];
    if (!g || !pg || pg.acts !== g.acts || prev.gameNo !== t.gameNo) {
      if (app.sheet && ['card', 'deck', 'res'].includes(app.sheet.k)) app.sheet = null;
    }
    if (!(g && g.pending && g.pending.k === 'discard')) app.discard = [0, 0, 0, 0, 0, 0];
    if (app.online && wasSeated && !amSeated() && t.phase === 'lobby') app.kicked = true;
    render();
    animate(prev, t, before);
    maybeJoin();
  }

  function commit(t) {
    const next = { ...t, seq: t.seq + 1, nonce: rid(8), updated: Date.now() };
    setTable(next);
    if (app.online && app.relay) app.relay.publishTable(next);
  }

  function act(a) {
    const g = G();
    if (!canAct()) return false;
    let ng;
    try { ng = E.apply(g, a); } catch (err) { toast(esc(err.message), 'warn'); FX.play('warn'); return false; }
    app.sel = [];
    app.undo.push({ gameNo: app.table.gameNo, before: g, after: ng.acts || 0 });
    if (app.undo.length > 6) app.undo.shift();
    commit({ ...app.table, game: ng });
    return true;
  }

  // Undo: take back your own moves, as long as nobody has played since.
  function canUndo() {
    const g = G(), u = app.undo[app.undo.length - 1];
    return !!(u && g && !g.over && app.table.gameNo === u.gameNo && (g.acts || 0) === u.after);
  }
  function undo() {
    if (!canUndo()) return;
    const u = app.undo.pop();
    app.sheet = null;
    commit({ ...app.table, game: u.before });
    toast('Move taken back');
  }

  // ---------- online ----------
  const handlers = {
    table(msg, link) {
      if (!validTable(msg) || msg.room !== app.room) return;
      if (!NET.newer(msg, app.table)) {
        if (app.table && NET.newer(app.table, msg)) app.relay.heal(link, app.table);
        return;
      }
      setTable(msg);
    },
    join(msg) { handleJoin(msg); },
    hello(msg, link) {
      if (!app.table || !amSeated() || !msg || msg.device === app.device) return;
      setTimeout(() => app.relay && app.table && app.relay.heal(link, app.table), 250 + Math.random() * 900);
    },
    status(up, total) {
      app.net = { up, total };
      if (up) app.everUp = true;
      const el = $('#net');
      if (el) el.outerHTML = netHTML();
    },
    linkUp(link) {
      if (app.relay) app.relay.send('hello', { device: app.device });
      setTimeout(() => {
        if (!app.relay || !app.table) return;
        if (!link.seen || NET.newer(app.table, link.seen)) app.relay.publishTable(app.table, link);
      }, 1500);
    },
  };

  function enterRoom(code, initial) {
    leaveRoom();
    app.online = true;
    app.room = code;
    app.table = null;
    app.mode = 'room';
    app.kicked = false;
    app.sheet = null;
    app.waitSince = Date.now();
    app.everUp = false;
    store.set('room', code);
    history.replaceState(null, '', location.pathname + location.search + '#' + code);
    app.relay = new NET.Relay(code, handlers);
    if (initial) setTable(initial);
    else render();
    setTimeout(() => { if (app.mode === 'room' && !app.table) render(); }, 8000);
    setTimeout(() => { if (app.relay) handlers.status(app.relay.up, app.relay.links.length); }, 6500);
  }

  function leaveRoom() {
    clearInterval(app.joinTimer);
    app.joinTimer = null;
    if (app.relay) app.relay.close();
    app.relay = null;
  }

  function goHome(forget) {
    leaveRoom();
    if (forget && app.online) store.set('room', null);
    app.online = false;
    app.table = null;
    app.room = null;
    app.mode = 'home';
    app.sheet = null;
    app.sel = [];
    history.replaceState(null, '', location.pathname + location.search);
    render();
  }

  function maybeJoin() {
    clearInterval(app.joinTimer);
    app.joinTimer = null;
    const t = app.table;
    if (!app.online || !t || t.phase !== 'lobby' || amSeated() || app.kicked || t.seats.length >= 4) return;
    let tries = 0;
    const send = () => app.relay && app.relay.send('join', { device: app.device, name: app.name, tries: tries++ });
    send();
    app.joinTimer = setInterval(send, 2500);
  }

  function handleJoin(m) {
    const t = app.table;
    if (!t || t.phase !== 'lobby' || !amSeated()) return;
    if (!m || typeof m.device !== 'string' || !m.device || m.device.length > 40) return;
    const name = cleanName(m.name);
    if (!name || t.seats.some(s => s.device === m.device) || t.seats.length >= 4) return;
    const handler = t.seats.some(s => s.device === t.host) ? t.host : t.seats[0].device;
    if (app.device !== handler && !(m.tries >= 3)) return;
    commit({ ...t, seats: [...t.seats, { device: m.device, name }] });
  }

  function readName() {
    const el = $('#name');
    const name = cleanName(el ? el.value : app.name);
    if (!name) {
      toast('Type your name first', 'warn');
      if (el) { el.focus(); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); }
      return '';
    }
    app.name = name;
    store.set('name', name);
    return name;
  }

  function createTable() {
    const name = readName();
    if (!name) return;
    const code = newCode();
    enterRoom(code, {
      v: 1, room: code, epoch: Date.now(), seq: 1, nonce: rid(8), host: app.device,
      phase: 'lobby', seats: [{ device: app.device, name }], game: null, gameNo: 0,
    });
  }

  function joinTable(raw) {
    const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) { toast('Table codes are 4 letters', 'warn'); return; }
    if (!readName()) return;
    enterRoom(code, null);
  }

  function startGame() {
    const t = app.table;
    if (!t || t.seats.length < 2) return;
    commit({ ...t, phase: 'play', game: E.newGame(t.seats.length), gameNo: t.gameNo + 1 });
  }

  // ---------- pass & play ----------
  function startLocal(names) {
    app.online = false;
    app.room = 'LOCAL';
    app.mode = 'room';
    app.sheet = null;
    history.replaceState(null, '', location.pathname + location.search);
    const t = {
      v: 1, room: 'LOCAL', epoch: Date.now(), seq: 1, nonce: rid(8), host: app.device, phase: 'play',
      seats: names.map(name => ({ device: app.device, name })), game: E.newGame(names.length), gameNo: 1,
    };
    app.table = null;
    setTable(t);
  }

  // ---------- rendering ----------
  function preserveInputs(fn) {
    const vals = {};
    $$('input[id]').forEach(i => { vals[i.id] = i.value; });
    const focus = document.activeElement && document.activeElement.id;
    fn();
    for (const [id, v] of Object.entries(vals)) { const i = document.getElementById(id); if (i && v) i.value = v; }
    if (focus) { const i = document.getElementById(focus); if (i) i.focus(); }
  }

  function render() {
    preserveInputs(() => {
      let html;
      if (app.mode === 'home') html = homeHTML();
      else if (app.mode === 'setup') html = setupHTML();
      else if (!app.table) html = waitingHTML();
      else if (app.table.phase === 'lobby') html = lobbyHTML();
      else html = gameHTML();
      $('#app').innerHTML = html;
      document.documentElement.classList.toggle('in-game', app.mode === 'room' && !!app.table && app.table.phase === 'play');
      renderSheet();
    });
    if (app.mode === 'room' && app.table && app.table.phase === 'lobby') drawQR();
    updateTitle();
  }

  const sparkles = n => Array.from({ length: n }, (_, k) => A.spark(`gl gl${k}`)).join('');

  function homeHTML() {
    const local = store.get('local');
    const resumeLocal = local && validTable(local) && local.game && !local.game.over;
    const lastRoom = store.get('room');
    return `<div class="home">
      <div class="hero">
        <div class="crest" aria-hidden="true">${[0, 3, 1, 2, 4].map((c, k) => `<span class="cg cg${k}">${A.gem(c)}</span>`).join('')}</div>
        <h1 class="wordmark"><span>Gems</span>${sparkles(4)}</h1>
        <p class="tag">Collect gems, buy treasures, and win over the patrons. The first to 15 points ends the game. For 2 to 4 players.</p>
      </div>
      <div class="home-form">
        <label class="field" for="name"><span>Your name</span>
          <input id="name" maxlength="16" autocomplete="nickname" enterkeyhint="done" value="${esc(app.name)}" placeholder="Aunt Jo"></label>
        <button class="btn gold big" data-act="create">Start a table</button>
        <form class="join" data-form="join">
          <label class="sr" for="code">Table code</label>
          <input id="code" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(app.prefill)}">
          <button class="btn" type="submit">Join table</button>
        </form>
        <button class="btn" data-act="setup">Pass &amp; play on one phone</button>
        ${resumeLocal ? `<button class="btn ghost" data-act="resume-local">Resume the pass &amp; play game</button>` : ''}
        ${lastRoom && !app.prefill ? `<button class="btn ghost" data-act="rejoin" data-code="${esc(lastRoom)}">Rejoin table ${esc(lastRoom)}</button>` : ''}
        <button class="btn ghost" data-act="rules">How to play</button>
        <div class="home-look"><span>Look</span>${lookSeg()}</div>
      </div>
    </div>`;
  }

  function setupHTML() {
    const names = store.get('localNames', [app.name, '', '', '']);
    return `<div class="setup">
      <header class="mini-top"><button class="back-btn" data-act="home" aria-label="Back">‹</button><span class="wm">Gems</span></header>
      <h2>Who's playing?</h2>
      <p class="note">Everyone shares this phone and passes it around. Fill in 2 to 4 names.</p>
      <form data-form="setup" class="setup-form">
        ${[0, 1, 2, 3].map(i => `<label class="field seat-field" style="--pc:${SEAT_COLORS[i]}" for="p${i}"><i class="dot"></i>
          <input id="p${i}" maxlength="16" autocomplete="off" placeholder="Player ${i + 1}${i > 1 ? ' (optional)' : ''}" value="${esc(names[i] || '')}"></label>`).join('')}
        <button class="btn gold big" type="submit">Deal the cards</button>
      </form>
    </div>`;
  }

  function netHTML() {
    if (!app.online) return '<span id="net" hidden></span>';
    const { up, total } = app.net;
    const cls = up ? 'up' : (app.everUp || Date.now() - app.waitSince > 6000 ? 'down' : 'wait');
    const text = up ? (up === total ? 'Live' : 'Live (backup relay down)') : (total === 0 ? 'Relay unavailable' : cls === 'down' ? 'Reconnecting…' : 'Connecting…');
    return `<span id="net" class="net ${cls}" title="${esc(text)}"><i></i><span>${esc(text)}</span></span>`;
  }

  function waitingHTML() {
    const late = Date.now() - app.waitSince > 7500;
    return `<div class="waiting">
      <header class="mini-top"><button class="back-btn" data-act="home" aria-label="Back">‹</button><span class="wm">Gems</span>${netHTML()}</header>
      <div class="finding">${A.gem(1, 'spin')}
        <h2>Looking for table ${esc(app.room)}</h2>
        <p class="note">${late
          ? `Nothing has turned up yet. Check the code with whoever started the table. Their phone needs to stay on the game for the table to appear.`
          : 'This takes a second or two.'}</p>
      </div>
      <button class="btn ghost" data-act="leave">Back</button>
    </div>`;
  }

  function shareURL() {
    return location.origin + location.pathname + location.search + '#' + app.room;
  }

  function lobbyHTML() {
    const t = app.table, seated = amSeated();
    const n = t.seats.length;
    return `<div class="lobby">
      <header class="mini-top"><button class="back-btn" data-act="leave" aria-label="Leave table">‹</button><span class="wm">Gems</span>${netHTML()}</header>
      <p class="eyebrow">Table code</p>
      <div class="code" aria-label="Table code ${esc(t.room)}">${[...t.room].map(ch => `<span>${esc(ch)}</span>`).join('')}</div>
      <div class="qr-wrap"><div class="qr" id="qr" aria-label="QR code for the table link"></div></div>
      <p class="note center">Everyone scans this, or opens the link and types the code.</p>
      <div class="share-row"><code class="url">${esc(shareURL())}</code><button class="btn small" data-act="share">Share</button></div>
      <h3 class="seats-title">At the table <small>${n} of 4</small></h3>
      <ul class="seats">${t.seats.map((s, i) => `<li style="--pc:${SEAT_COLORS[i]}"><i class="dot"></i><span class="nm">${esc(s.name)}</span>
        ${s.device === app.device ? '<em>this phone</em>' : ''}
        ${seated ? `<button class="x" data-act="kick" data-s="${i}" aria-label="Remove ${esc(s.name)}">×</button>` : ''}</li>`).join('')}
        ${Array.from({ length: 4 - n }, () => '<li class="open"><i class="dot"></i><span class="nm">Open seat</span></li>').join('')}
      </ul>
      ${app.kicked ? `<div class="notice">You were taken off this table. <button class="btn small" data-act="rejoin-seat">Sit back down</button></div>` : ''}
      ${!seated && !app.kicked ? `<p class="note center">${n >= 4 ? 'This table is full.' : `Taking a seat as ${esc(app.name)}…`}</p>` : ''}
      ${seated && n < 4 ? `<form class="add" data-form="add"><label class="sr" for="add-name">Add a player on this phone</label>
        <input id="add-name" maxlength="16" autocomplete="off" placeholder="Add someone without a phone"><button class="btn small" type="submit">Add</button></form>` : ''}
      ${seated ? `<button class="btn gold big" data-act="start" ${n < 2 ? 'disabled' : ''}>${n < 2 ? 'Waiting for players…' : `Deal the cards for ${n}`}</button>` : ''}
    </div>`;
  }

  function drawQR() {
    const box = $('#qr');
    if (!box || !window.qrcode) return;
    const qr = window.qrcode(0, 'M');
    qr.addData(shareURL());
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    box.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#1c0f29"/></svg>`;
  }

  // ----- game -----
  function gameHTML() {
    const g = G();
    const vs = viewSeat();
    return `<div class="game ${canAct() ? 'my-turn' : ''}">
      ${topbarHTML()}
      <div class="side">
        ${playersHTML()}
        ${statusHTML()}
      </div>
      <section class="patrons" aria-label="Patrons">${g.nobles.map(id => `<button class="nb" data-act="noble" data-id="${id}" data-fx="noble-${id}" aria-label="${esc(E.NOBLES[id].name)}">${A.nobleHTML(id)}</button>`).join('')}</section>
      <section class="board" aria-label="Cards">${[3, 2, 1].map(rowHTML).join('')}</section>
      ${bankHTML()}
      ${hoardHTML(vs)}
      ${g.over ? resultsHTML() : ''}
    </div>`;
  }

  function topbarHTML() {
    return `<header class="topbar">
      <span class="wm">Gems</span>
      <span class="room">${app.online ? `<b>${esc(app.room)}</b>${netHTML()}` : 'Pass &amp; play'}</span>
      <button class="menu-btn" data-act="menu" aria-label="Menu"><i></i><i></i><i></i></button>
    </header>`;
  }

  function playersHTML() {
    const g = G();
    return `<div class="players">${g.players.map((p, i) => {
      const b = E.bonuses(p);
      return `<button class="chip ${g.turn === i && !g.over ? 'turn' : ''} ${mine(i) && !soloPhone() ? 'me' : ''}" style="--pc:${SEAT_COLORS[i]}" data-act="player" data-s="${i}" data-fx="chip-${i}">
        <span class="top"><span class="nm">${esc(seatName(i))}</span><span class="pt">${E.points(p)}</span></span>
        <span class="bns">${b.map((x, c) => `<i class="c-${c} ${x ? '' : 'zero'}">${x}</i>`).join('')}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function statusHTML() {
    const g = G();
    let msg, cls = '';
    if (g.over) msg = 'Game over';
    else if (canAct()) {
      const who = soloPhone() ? `${esc(seatName(g.turn))}'s turn` : (mySeats().length > 1 ? `${esc(seatName(g.turn))}'s turn` : 'Your turn');
      msg = g.pending ? (g.pending.k === 'discard' ? `${who}: return ${g.pending.n} gem${g.pending.n > 1 ? 's' : ''}` : `${who}: choose a patron`)
        : `${who}. Take gems, reserve, or buy.`;
      cls = 'mine';
    } else {
      msg = `${esc(seatName(g.turn))} is choosing<span class="dots"><i>.</i><i>.</i><i>.</i></span>`;
      if (app.online && !amSeated()) msg += ' <span class="watch">You are watching. Open the menu to play for someone.</span>';
    }
    if (canAct() && !g.pending && app.sel.length) {
      const why = E.takeProblem(g, app.sel);
      const after = E.tokenCount(g.players[g.turn]) + app.sel.length;
      return `<div class="status mine tray" style="--pc:${SEAT_COLORS[g.turn]}">
        <span class="msg why">${why ? esc(why) : after > 10 ? `You'll hand back ${after - 10} after` : 'Ready to take'}</span>
        <button class="btn ghost small" data-act="clear">Clear</button>
        <button class="btn gold small" data-act="take" ${why ? 'disabled' : ''}>Take ${app.sel.length}</button>
      </div>`;
    }
    return `<div class="status ${cls}" style="--pc:${SEAT_COLORS[g.turn]}">
      <span class="msg">${msg}</span>${g.final && !g.over ? '<span class="final">Final round</span>' : ''}${canUndo() ? '<button class="undo" data-act="undo">Undo</button>' : ''}
    </div>`;
  }

  function cardLabel(id) {
    const c = E.CARDS[id];
    const cost = c.cost.map((x, k) => (x ? `${x} ${E.NAMES[k]}` : '')).filter(Boolean).join(', ');
    return `${LEVEL[c.lv]} ${E.NAMES[c.c]} card, ${c.p} points, costs ${cost}`;
  }

  function rowHTML(lv) {
    const g = G(), left = g.decks[lv - 1].length;
    const active = canAct() && !g.pending;
    let h = left
      ? `<button class="slot deck" data-act="deck" data-lv="${lv}" data-fx="deck-${lv}" aria-label="${LEVEL[lv]} deck, ${left} left">${A.backHTML(lv, left)}</button>`
      : `<div class="slot deck" data-fx="deck-${lv}"><div class="card empty"><span>${A.ROMAN[lv]}</span></div></div>`;
    for (let i = 0; i < 4; i++) {
      const id = g.board[lv - 1][i];
      if (id == null) { h += `<div class="slot" data-fx="slot-${lv}-${i}"><div class="card empty"></div></div>`; continue; }
      const afford = active && E.payment(g.players[g.turn], id);
      h += `<button class="slot ${afford ? 'afford' : ''}" data-act="card" data-lv="${lv}" data-i="${i}" data-fx="slot-${lv}-${i}" aria-label="${esc(cardLabel(id))}">${A.cardHTML(id)}</button>`;
    }
    return `<div class="row">${h}</div>`;
  }

  function bankHTML() {
    const g = G(), active = canAct() && !g.pending;
    const picked = [0, 0, 0, 0, 0, 0];
    app.sel.forEach(c => picked[c]++);
    let toks = '';
    for (let c = 0; c < 6; c++) {
      toks += `<button class="tok c-${c} ${picked[c] ? 'picked' : ''} ${g.bank[c] - picked[c] <= 0 ? 'empty' : ''}" data-act="bank" data-c="${c}" data-fx="bank-${c}" ${active ? '' : 'aria-disabled="true"'} aria-label="${E.NAMES[c]}, ${g.bank[c]} in the bank">
        ${A.gem(c)}<span class="n">${g.bank[c] - picked[c]}</span>${picked[c] ? `<span class="pick">+${picked[c]}</span>` : ''}</button>`;
    }
    const hint = active && !app.sel.length ? `<p class="hint">Tap the bank to pick 3 different gems, or 2 of a kind from a pile of 4 or more.</p>` : '';
    return `<section class="bank" aria-label="Bank"><div class="toks">${toks}</div>${hint}</section>`;
  }

  function hoardHTML(i) {
    const g = G(), p = g.players[i], b = E.bonuses(p), tc = E.tokenCount(p);
    const own = mine(i);
    let hold = '';
    for (let c = 0; c < 6; c++) {
      hold += `<div class="hc c-${c} ${p.tokens[c] || (c < 5 && b[c]) ? '' : 'none'}">
        <span class="hg" data-fx="hold-${c}">${A.gem(c)}<b>${p.tokens[c]}</b></span>
        ${c < 5 ? `<span class="bn" data-fx="bonus-${c}" title="${E.NAMES[c]} cards">${b[c]}</span>` : '<span class="bn gold-note">wild</span>'}
      </div>`;
    }
    const res = p.reserved.map((r, k) => {
      const face = own || !r.blind || soloPhone();
      return face
        ? `<button class="mini" data-act="res" data-s="${i}" data-r="${k}" data-fx="res-${k}" aria-label="Reserved: ${esc(cardLabel(r.id))}">${A.cardHTML(r.id)}</button>`
        : `<div class="mini" data-fx="res-${k}">${A.backHTML(E.CARDS[r.id].lv)}</div>`;
    }).join('');
    const nobles = p.nobles.map(id => `<div class="mini-noble">${A.nobleHTML(id)}</div>`).join('');
    const label = youOrName(i);
    return `<section class="hoard ${g.turn === i && !g.over ? 'active' : ''}" data-fx="hoard" style="--pc:${SEAT_COLORS[i]}">
      <header>
        <span class="who"><i class="dot"></i>${esc(label)}</span>
        <span class="count ${tc > 10 ? 'over' : ''}">${tc}/10 gems</span>
        <span class="score" aria-label="${E.points(p)} points">${E.points(p)}<small>pts</small></span>
      </header>
      <div class="hold">${hold}</div>
      <div class="legend"><span>gems in hand</span><span class="lb">cards owned (permanent discount)</span></div>
      <div class="extras" data-fx="resrow">
        ${res || nobles ? res + nobles : '<span class="empty-note">Reserved cards and patrons land here.</span>'}
      </div>
    </section>`;
  }

  function resultsHTML() {
    const g = G(), r = g.result;
    const names = r.winners.map(i => esc(seatName(i)));
    const title = names.length === 1 ? `${names[0]} wins!` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} share the win!`;
    return `<div class="results" role="dialog" aria-label="Game over">
      <div class="res-card">
        <svg class="res-tiara" viewBox="0 0 100 64" aria-hidden="true"><use href="#tiara"/></svg>
        <p class="eyebrow">Game over</p>
        <h2>${title}</h2>
        <ol class="ranking">${r.ranking.map((x, k) => `<li style="--pc:${SEAT_COLORS[x.i]}" class="${r.winners.includes(x.i) ? 'win' : ''}">
          <span class="place">${k + 1}</span><span class="nm">${esc(seatName(x.i))}</span>
          <span class="pt">${x.pts} pts</span><span class="cd">${x.cards} cards</span></li>`).join('')}</ol>
        <p class="note">Ties go to whoever bought fewer cards.</p>
        ${amSeated() || !app.online ? '<button class="btn gold big" data-act="again">Play again</button>' : ''}
        <button class="btn ghost" data-act="${app.online ? 'leave' : 'home'}">Back to start</button>
      </div>
    </div>`;
  }

  // ----- sheets -----
  function renderSheet() {
    const root = $('#sheet-root');
    const g = G();
    let spec = app.sheet, forced = false;
    if (g && !g.over && canAct() && g.pending) { spec = { k: g.pending.k === 'noble' ? 'choose' : 'discard' }; forced = true; }
    const shut = () => { root.innerHTML = ''; root.dataset.k = ''; document.documentElement.classList.remove('sheet-open'); };
    if (!spec || (!g && !['rules', 'menu'].includes(spec.k))) return shut();
    const body = sheetBody(spec);
    if (!body) { app.sheet = null; return shut(); }
    const key = JSON.stringify(spec);
    const fresh = root.dataset.k !== key;
    if (fresh) shownAt = performance.now();
    root.dataset.k = key;
    document.documentElement.classList.add('sheet-open');
    root.innerHTML = `<div class="backdrop ${fresh ? 'in' : ''}" ${forced ? '' : 'data-act="close"'}></div>
      <div class="sheet ${fresh ? 'in' : ''}" role="dialog" aria-modal="true">
        ${forced ? '' : '<button class="close" data-act="close" aria-label="Close">×</button>'}
        ${body}
      </div>`;
  }

  function sheetBody(s) {
    switch (s.k) {
      case 'card': return cardSheet(G().board[s.lv - 1][s.i], { lv: s.lv, i: s.i });
      case 'res': {
        const p = G().players[s.s];
        const r = p && p.reserved[s.r];
        return r ? cardSheet(r.id, { r: s.r, s: s.s }) : '';
      }
      case 'deck': return deckSheet(s.lv);
      case 'noble': return nobleSheet(s.id);
      case 'player': return playerSheet(s.s);
      case 'discard': return discardSheet();
      case 'choose': return nobleChoiceBody();
      case 'menu': return menuSheet();
      case 'rules': return rulesSheet();
    }
    return '';
  }

  function costRows(p, id) {
    const card = E.CARDS[id], b = E.bonuses(p);
    let rows = '';
    for (let c = 0; c < 5; c++) {
      if (!card.cost[c]) continue;
      const have = b[c] + p.tokens[c];
      rows += `<li class="c-${c}">${A.gem(c)}<span>${E.NAMES[c]}</span><b>${card.cost[c]}</b>
        <span class="have ${have >= card.cost[c] ? 'ok' : ''}">${b[c]} card${b[c] === 1 ? '' : 's'} + ${p.tokens[c]} gem${p.tokens[c] === 1 ? '' : 's'}</span></li>`;
    }
    return `<ul class="costs">${rows}</ul>`;
  }
  function gemsLine(arr) {
    const parts = [];
    arr.forEach((n, c) => { if (n) parts.push(`<span class="gl c-${c}">${n}${A.gem(c)}</span>`); });
    return parts.join('') || 'nothing';
  }

  function cardSheet(id, src) {
    if (id == null) return '';
    const g = G(), card = E.CARDS[id];
    const owner = src.s != null ? src.s : null;
    const buyer = canAct() ? g.turn : viewSeat();
    const p = g.players[owner != null ? owner : buyer];
    const pay = E.payment(p, id);
    const mayAct = canAct() && !g.pending && (owner == null || owner === g.turn);
    let buttons = '';
    if (mayAct) {
      // Side by side, Reserve on the left and Buy on the right: if the sheet
      // jumps vertically under a thumb, it can't turn a Buy into a Reserve.
      if (owner == null) {
        const full = p.reserved.length >= E.MAX_RESERVED;
        buttons += `<button class="btn act-reserve" data-act="reserve" ${full ? 'disabled' : ''}><b>Reserve</b><small>${full ? 'already holding 3' : g.bank[5] ? '+1 gold' : 'no gold left'}</small></button>`;
      }
      if (pay) buttons += `<button class="btn gold act-buy" data-act="buy"><b>Buy</b><small class="pay">pay ${gemsLine(pay)}</small></button>`;
      else {
        const sf = E.shortfall(p, id);
        const missing = sf.short.reduce((a, x) => a + x, 0) - sf.gold;
        buttons += `<button class="btn act-buy" disabled><b>Can't buy yet</b><small>need ${missing} more gem${missing === 1 ? '' : 's'}</small></button>`;
      }
    } else if (!g.over) {
      buttons = `<p class="note">${owner != null && !mine(owner) ? `${esc(seatName(owner))} reserved this card.` : 'You can buy or reserve this on your turn.'}</p>`;
    }
    return `<div class="card-sheet">
      <div class="big-card">${A.cardHTML(id)}</div>
      <div class="info">
        <p class="eyebrow">${LEVEL[card.lv]} · ${A.LEVEL_NAMES[card.lv]}</p>
        <h3>${E.NAMES[card.c]} ${card.lv === 1 ? 'stone' : card.lv === 2 ? 'ring' : 'pendant'}</h3>
        <p class="sub">${card.p ? `Worth <b>${card.p}</b> point${card.p > 1 ? 's' : ''}. ` : ''}Gives a permanent ${E.NAMES[card.c]} discount.</p>
        ${costRows(p, id)}
      </div>
    </div>
    <div class="sheet-actions ${mayAct ? 'pair' : ''}">${buttons}</div>`;
  }

  function deckSheet(lv) {
    const g = G(), left = g.decks[lv - 1].length;
    const p = g.players[g.turn];
    const mayAct = canAct() && !g.pending;
    const full = p.reserved.length >= E.MAX_RESERVED;
    return `<div class="card-sheet">
      <div class="big-card">${A.backHTML(lv, left)}</div>
      <div class="info">
        <p class="eyebrow">${LEVEL[lv]} deck · ${left} left</p>
        <h3>Reserve a mystery card</h3>
        <p class="sub">Take the top card without anyone else seeing it, plus 1 gold if any is left. You can hold 3 reserved cards.</p>
      </div>
    </div>
    <div class="sheet-actions">${mayAct
      ? `<button class="btn gold big" data-act="reserve-blind" ${full || !left ? 'disabled' : ''}>${full ? 'You already hold 3 reserved' : 'Reserve the top card'}</button>`
      : '<p class="note">You can do this on your turn.</p>'}</div>`;
  }

  function nobleSheet(id) {
    const nb = E.NOBLES[id];
    const g = G();
    const p = g.players[viewSeat()];
    const b = E.bonuses(p);
    const reqs = nb.req.map((r, c) => r ? `<li class="c-${c}">${A.gem(c)}<span>${r} ${E.NAMES[c]} cards</span><span class="have ${b[c] >= r ? 'ok' : ''}">${youOrName(viewSeat()) === 'You' ? 'you have' : 'has'} ${b[c]}</span></li>` : '').join('');
    return `<div class="card-sheet">
      <div class="big-noble">${A.nobleHTML(id)}</div>
      <div class="info">
        <p class="eyebrow">Patron · 3 points</p>
        <h3>${esc(nb.name)}</h3>
        <p class="sub">Visits the first player who owns these cards, at the end of their turn. Gems in hand don't count.</p>
        <ul class="costs">${reqs}</ul>
      </div>
    </div>`;
  }

  function playerSheet(i) {
    const g = G(), p = g.players[i];
    if (!p) return '';
    const b = E.bonuses(p);
    const res = p.reserved.map(r => (mine(i) || !r.blind || soloPhone())
      ? `<div class="mini">${A.cardHTML(r.id)}</div>` : `<div class="mini">${A.backHTML(E.CARDS[r.id].lv)}</div>`).join('');
    return `<div class="player-sheet" style="--pc:${SEAT_COLORS[i]}">
      <h3><i class="dot"></i>${esc(seatName(i))} <span class="pts">${E.points(p)} pts</span></h3>
      <p class="sub">${p.cards.length} card${p.cards.length === 1 ? '' : 's'} bought · ${E.tokenCount(p)} gems in hand</p>
      <div class="ps-grid">
        <div><p class="eyebrow">Gems in hand</p><div class="gem-line">${gemsLine(p.tokens)}</div></div>
        <div><p class="eyebrow">Card discounts</p><div class="gem-line">${gemsLine(b.concat(0))}</div></div>
      </div>
      <p class="eyebrow">Reserved</p>
      <div class="extras">${res || '<span class="empty-note">None</span>'}</div>
      <p class="eyebrow">Patrons</p>
      <div class="extras">${p.nobles.map(id => `<div class="mini-noble">${A.nobleHTML(id)}</div>`).join('') || '<span class="empty-note">None yet</span>'}</div>
    </div>`;
  }

  function discardSheet() {
    const g = G(), p = g.players[g.turn], n = g.pending.n;
    const chosen = app.discard.reduce((a, x) => a + x, 0);
    let opts = '';
    for (let c = 0; c < 6; c++) {
      const left = p.tokens[c] - app.discard[c];
      opts += `<button class="tok c-${c} ${left <= 0 ? 'empty' : ''}" data-act="dpick" data-c="${c}" ${left <= 0 ? 'disabled' : ''} aria-label="Return a ${E.NAMES[c]}">${A.gem(c)}<span class="n">${left}</span></button>`;
    }
    const back = app.discard.flatMap((x, c) => Array(x).fill(c)).map((c, k) => `<button class="pg" data-act="dunpick" data-c="${c}" aria-label="Keep ${E.NAMES[c]}">${A.gem(c)}</button>`).join('');
    return `<div class="discard">
      <p class="eyebrow">${esc(seatName(g.turn))} has ${E.tokenCount(p)} gems</p>
      <h3>Hand back ${n} gem${n > 1 ? 's' : ''}</h3>
      <p class="sub">You can hold 10. Tap the ones to return to the bank.</p>
      <div class="toks">${opts}</div>
      <div class="returning">${back || '<span class="empty-note">Nothing picked yet</span>'}</div>
      <div class="sheet-actions"><button class="btn gold big" data-act="discard" ${chosen === n ? '' : 'disabled'}>Return ${chosen} of ${n}</button></div>
    </div>`;
  }

  function nobleChoiceBody() {
    const g = G();
    return `<div class="noble-choice">
      <p class="eyebrow">Two patrons want to visit</p>
      <h3>Pick one for ${esc(seatName(g.turn))}</h3>
      <p class="sub">The other stays on the table.</p>
      <div class="nc-row">${g.pending.opts.map(id => `<button class="nc" data-act="pick-noble" data-id="${id}">${A.nobleHTML(id)}<span>${esc(E.NOBLES[id].name)}</span></button>`).join('')}</div>
    </div>`;
  }

  function menuSheet() {
    const lv = FX.level, t = app.table, g = G();
    const others = t && app.online && t.phase === 'play' ? t.seats.map((s, i) => (s.device === app.device ? '' :
      `<li><span class="nm" style="--pc:${SEAT_COLORS[i]}"><i class="dot"></i>${esc(s.name)}</span><button class="btn small" data-act="claim" data-s="${i}">Play for ${esc(s.name)}</button></li>`)).join('') : '';
    const log = g ? g.log.slice(-12).reverse().map(e => `<li>${describe(e)}</li>`).join('') : '';
    return `<div class="menu">
      <p class="eyebrow">Look</p>
      ${lookSeg()}
      ${FX.plain ? '' : `<p class="eyebrow">Sparkles</p>
      <div class="seg" role="group" aria-label="Sparkle level">
        ${['Subtle', 'Sparkly', 'Maximum'].map((name, k) => `<button class="${lv === k ? 'on' : ''}" data-act="sparkle" data-l="${k}" aria-pressed="${lv === k}">${name}${k === 2 ? A.spark('inline') : ''}</button>`).join('')}
      </div>`}
      <p class="eyebrow">Screen</p>
      <div class="seg" role="group" aria-label="Screen">
        <button class="${store.get('awake', false) ? '' : 'on'}" data-act="awake" data-on="0" aria-pressed="${!store.get('awake', false)}">Sleeps as usual</button>
        <button class="${store.get('awake', false) ? 'on' : ''}" data-act="awake" data-on="1" aria-pressed="${store.get('awake', false)}">Stays on</button>
      </div>
      <p class="eyebrow">Sound</p>
      <div class="seg" role="group" aria-label="Sound">
        <button class="${FX.sound ? 'on' : ''}" data-act="sound" data-on="1" aria-pressed="${FX.sound}">Chimes on</button>
        <button class="${FX.sound ? '' : 'on'}" data-act="sound" data-on="0" aria-pressed="${!FX.sound}">Quiet</button>
      </div>
      ${app.online && t ? `<p class="eyebrow">Table ${esc(app.room)}</p>
        <div class="share-row"><code class="url">${esc(shareURL())}</code><button class="btn small" data-act="share">Share</button></div>` : ''}
      ${others ? `<p class="eyebrow">Someone's phone died?</p><ul class="claims">${others}</ul>` : ''}
      ${log ? `<p class="eyebrow">Recent moves</p><ul class="log">${log}</ul>` : ''}
      <div class="sheet-actions">
        <button class="btn" data-act="rules">How to play</button>
        ${app.online ? '<button class="btn ghost" data-act="leave">Leave table</button>' : '<button class="btn ghost" data-act="home">Back to start (game is saved)</button>'}
      </div>
    </div>`;
  }

  function lookSeg() {
    return `<div class="seg" role="group" aria-label="Look">
        <button class="${FX.plain ? '' : 'on'}" data-act="look" data-plain="0" aria-pressed="${!FX.plain}">Jewel box</button>
        <button class="${FX.plain ? 'on' : ''}" data-act="look" data-plain="1" aria-pressed="${FX.plain}">Plain</button>
      </div>`;
  }

  // The plain look: grayscale, square corners, Times New Roman, no effects.
  // It's per phone, so one person can go plain while others keep the sparkles.
  function setPlain(on) {
    FX.setPlain(on);
    document.documentElement.classList.toggle('plain', on);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = on ? '#ffffff' : '#170c22';
    store.set('plain', on);
  }

  function rulesSheet() {
    return `<div class="rules">
      <h3>How to play Gems</h3>
      <p>Gather gems, use them to buy cards, and collect points. Each card you own gives a permanent one-gem discount in its color, so buying gets cheaper as you go.</p>
      <p class="eyebrow">On your turn, do one thing</p>
      <ol>
        <li><b>Take 3 gems</b> of different colors.</li>
        <li><b>Take 2 gems</b> of the same color, if that pile has at least 4.</li>
        <li><b>Reserve a card</b> from the table or the top of a deck and take 1 gold. Gold is wild. You can hold 3 reserved cards.</li>
        <li><b>Buy a card</b> from the table or from your reserved cards. Your card discounts apply first, then gems, then gold.</li>
      </ol>
      <p class="eyebrow">Also</p>
      <ul>
        <li>You can hold at most 10 gems. Hand back any extras at the end of your turn.</li>
        <li><b>Patrons</b> visit automatically at the end of your turn once you own the cards they ask for. Each is worth 3 points, one per turn.</li>
        <li>When someone reaches <b>15 points</b>, finish the round so everyone has had the same number of turns. Most points wins. Ties go to whoever bought fewer cards.</li>
      </ul>
      <p class="eyebrow">Reading a card</p>
      <p class="rd">${A.cardHTML(41, 'demo')}<span>Top left: points. Top right: the discount it gives. Bubbles: what it costs.</span></p>
    </div>`;
  }

  // ---------- describing moves ----------
  const tinyGem = c => A.gem(Math.max(0, Math.min(5, c | 0)), 'tiny');
  function describe(e) {
    const who = e.s != null ? `<b>${esc(seatName(e.s))}</b>` : '';
    switch (e.t) {
      case 'take': return `${who} took ${e.g.map(tinyGem).join('')}`;
      case 'reserve': return `${who} reserved ${e.id != null ? `a ${E.NAMES[E.CARDS[e.id].c]} card ${tinyGem(E.CARDS[e.id].c)}` : `a mystery ${LEVEL[e.lv]} card`}${e.gold ? ` and took ${tinyGem(5)}` : ''}`;
      case 'buy': { const c = E.CARDS[e.id]; return `${who} bought a ${E.NAMES[c.c]} card ${tinyGem(c.c)}${c.p ? ` worth ${c.p}` : ''}`; }
      case 'discard': return `${who} handed back ${(e.g || []).flatMap((x, c) => Array(x).fill(c)).map(tinyGem).join('')}`;
      case 'noble': return `<b>${esc(E.NOBLES[e.id].name)}</b> visits ${who}! +3`;
      case 'pass': return `${who} had no moves and passed`;
      case 'final': return `${who} reached 15! Final round`;
      case 'over': return 'Game over';
    }
    return '';
  }

  // ---------- animation ----------
  function snapshot() {
    const m = {};
    $$('[data-fx]').forEach(el => { m[el.dataset.fx] = el.getBoundingClientRect(); });
    return m;
  }
  function rectOf(key) {
    const el = $(`[data-fx="${key}"]`);
    return el ? el.getBoundingClientRect() : null;
  }
  const GEM_COLORS = [['#ffffff', '#dce9ff'], ['#7ea6ff', '#c9d8ff'], ['#5ff0b3', '#c8ffe8'], ['#ff6d8c', '#ffc8d4'], ['#d7c5f2', '#ffffff'], ['#ffd66e', '#fff2c4']];

  function animate(prev, t, before) {
    const pg = prev && prev.game, ng = t.game;
    if (!ng) return;
    if (!pg || prev.gameNo !== t.gameNo) { dealIn(); return; }
    const fresh = (ng.acts || 0) - (pg.acts || 0);
    if (fresh < 0 && !mine(ng.turn)) toast(`${esc(seatName(ng.turn))} took back a move`);
    if (fresh <= 0) return;
    const entries = ng.log.slice(-Math.min(fresh, ng.log.length));
    const vs = viewSeat();
    let delay = 0;
    for (const e of entries) delay = animEntry(e, vs, before, delay, pg);
    if (!ng.over && ng.turn !== pg.turn) {
      setTimeout(() => announceTurn(ng.turn), Math.min(delay, 900));
    }
    if (ng.over && !pg.over) setTimeout(celebrate, delay + 300);
  }

  function seatTarget(s, vs, key) {
    if (s === vs) return rectOf(key) || rectOf('hoard');
    return rectOf('chip-' + s);
  }

  function animEntry(e, vs, before, delay, pg) {
    const remote = e.s != null && !mine(e.s);
    switch (e.t) {
      case 'take': {
        e.g.forEach((c, k) => {
          const from = rectOf('bank-' + c);
          const to = seatTarget(e.s, vs, 'hold-' + c);
          FX.fly(from, to, A.gem(c), { delay: delay + k * 120, w: from ? from.width * .7 : 40, h: from ? from.width * .7 : 40, colors: GEM_COLORS[c], spin: true });
        });
        FX.play(e.g.length === 2 && e.g[0] === e.g[1] ? 'two' : 'take');
        if (remote) toast(describe(e));
        return delay + 120 * e.g.length + 300;
      }
      case 'reserve': {
        const from = e.i === -1 ? before['deck-' + e.lv] : before['slot-' + e.lv + '-' + e.i];
        const to = seatTarget(e.s, vs, 'resrow');
        const face = e.id != null && (mine(e.s) || soloPhone() || e.i !== -1) ? A.cardHTML(e.id) : A.backHTML(e.lv);
        FX.fly(from, to, face, { delay, s1: .6 });
        if (e.gold) FX.fly(rectOf('bank-5'), seatTarget(e.s, vs, 'hold-5'), A.gem(5), { delay: delay + 200, w: 36, h: 36, colors: GEM_COLORS[5], spin: true });
        markDealt(e.lv, e.i, delay);
        FX.play('reserve');
        if (remote) toast(describe(e));
        return delay + 500;
      }
      case 'buy': {
        const c = E.CARDS[e.id].c;
        const from = e.r != null ? (e.s === vs ? before['res-' + e.r] : before['chip-' + e.s]) : before['slot-' + e.lv + '-' + e.i];
        const to = seatTarget(e.s, vs, 'bonus-' + c);
        FX.fly(from, to, A.cardHTML(e.id), { delay, s1: .4, colors: GEM_COLORS[c], endN: 22 });
        (e.pay || []).forEach((n, k) => {
          if (!n) return;
          FX.fly(seatTarget(e.s, vs, 'hold-' + k), rectOf('bank-' + k), A.gem(k), { delay: delay + 250 + k * 60, w: 30, h: 30, colors: GEM_COLORS[k] });
        });
        if (e.r == null) markDealt(e.lv, e.i, delay + 200);
        FX.play('buy');
        if (remote || E.CARDS[e.id].p >= 3) toast(describe(e), E.CARDS[e.id].p >= 3 ? 'big' : '');
        return delay + 650;
      }
      case 'discard': {
        (e.g || []).forEach((n, c) => {
          if (!n) return;
          FX.fly(seatTarget(e.s, vs, 'hold-' + c), rectOf('bank-' + c), A.gem(c), { delay: delay + c * 60, w: 30, h: 30 });
        });
        if (remote) toast(describe(e));
        return delay + 300;
      }
      case 'noble': {
        const from = before['noble-' + e.id];
        const to = seatTarget(e.s, vs, 'resrow');
        FX.fly(from, to, A.nobleHTML(e.id), { delay: delay + 200, dur: 900, mid: 1.6, s1: .5, endN: 40, colors: ['#ffd66e', '#fff2c4', '#ffffff', '#ff8cc6'] });
        setTimeout(() => { FX.play('noble'); if (from) FX.burst(from.left + from.width / 2, from.top + from.height / 2, { n: 40, sp: 260 }); }, delay + 200);
        toast(describe(e), 'big');
        return delay + 1100;
      }
      case 'final':
        setTimeout(() => toast(describe(e), 'big'), delay);
        return delay + 200;
    }
    return delay;
  }

  function markDealt(lv, i, delay) {
    if (i == null || i < 0) return;
    const el = $(`[data-fx="slot-${lv}-${i}"]`);
    if (!el) return;
    el.style.setProperty('--d', (delay + 250) + 'ms');
    el.classList.add('dealt');
  }

  function dealIn() {
    $$('.board .slot').forEach((el, k) => { el.style.setProperty('--d', (k * 45) + 'ms'); el.classList.add('dealt'); });
    $$('.patrons .nb').forEach((el, k) => { el.style.setProperty('--d', (600 + k * 80) + 'ms'); el.classList.add('dealt'); });
    FX.play('buy');
    setTimeout(() => FX.burstAt($('.board'), { n: 30, sp: 260 }), 300);
    const g = G();
    if (g) setTimeout(() => announceTurn(g.turn, true), 900);
  }

  function announceTurn(s, first) {
    const g = G();
    if (!g || g.over || g.turn !== s) return;
    if (mine(s)) {
      const who = soloPhone() || mySeats().length > 1 ? `${esc(seatName(s))}'s turn` : 'Your turn';
      toast(`${A.spark('inline')} ${who}${first ? ' first' : ''}`, 'turn');
      FX.play('turn');
      FX.burstAt($('.hoard'), { n: 18, sp: 150 });
      if (!soloPhone() && navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch (e) { /* not supported */ } }
    } else if (first) {
      toast(`${esc(seatName(s))} goes first`);
    }
    updateTitle();
  }

  function celebrate() {
    FX.play('win');
    FX.rain(5);
    FX.burstAt($('.res-card'), { n: 60, sp: 320 });
  }

  function updateTitle() {
    document.title = canAct() && document.hidden ? 'Your turn · Gems' : 'Gems';
  }

  // ---------- toasts ----------
  function toast(html, kind = '') {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(() => el.classList.add('out'), kind === 'big' || kind === 'turn' ? 3200 : 2600);
    setTimeout(() => el.remove(), kind === 'big' || kind === 'turn' ? 3700 : 3100);
  }

  // ---------- input ----------
  function pickGem(c, el) {
    const g = G();
    if (!g || g.over) return;
    if (!canAct()) { toast(app.online && !amSeated() ? 'You are watching this game' : `It's ${esc(seatName(g.turn))}'s turn`); return; }
    if (g.pending) return;
    if (c === 5) { toast('Gold only comes from reserving a card'); return; }
    const sel = app.sel;
    if (sel.length === 1 && sel[0] === c) {
      if (g.bank[c] >= 4) app.sel = [c, c];
      else { toast('Two of a kind needs 4 or more in the pile'); app.sel = []; }
    } else if (sel.length === 2 && sel[0] === sel[1]) {
      app.sel = sel[0] === c ? [c] : [sel[0], c];
    } else if (sel.includes(c)) {
      app.sel = sel.filter(x => x !== c);
    } else if (sel.length < 3) {
      if (g.bank[c] <= 0) { toast('That pile is empty'); return; }
      app.sel = [...sel, c];
    } else { toast('Three gems at most'); return; }
    FX.play('tick');
    FX.burstAt(el, { n: 8, sp: 90, colors: GEM_COLORS[c] });
    render();
  }

  function openSheet(spec) { app.sheet = spec; renderSheet(); }
  function closeSheet() { app.sheet = null; renderSheet(); }

  async function share() {
    const url = shareURL();
    try {
      if (navigator.share) { await navigator.share({ title: 'Gems', text: `Join my Gems table: ${app.room}`, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch (e) { toast(`Table code: <b>${esc(app.room)}</b>`); }
  }

  // Ignore game-changing taps that land right after a sheet appeared or the
  // page moved (scrolling, the browser toolbar showing or hiding): the button
  // under the finger may not be the one the player was aiming for.
  let shownAt = 0, movedAt = 0;
  const moved = () => { movedAt = performance.now(); };
  addEventListener('scroll', moved, { passive: true });
  if (window.visualViewport) visualViewport.addEventListener('resize', moved);
  const GUARDED = new Set(['buy', 'reserve', 'reserve-blind', 'take', 'discard', 'pick-noble']);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (GUARDED.has(d.act) && performance.now() - Math.max(shownAt, movedAt) < 450) return;
    const g = G();
    switch (d.act) {
      case 'create': createTable(); break;
      case 'setup': if (readName()) { app.mode = 'setup'; render(); } break;
      case 'resume-local': {
        const t = store.get('local');
        if (validTable(t)) { app.online = false; app.room = 'LOCAL'; app.mode = 'room'; app.table = null; setTable(t); }
        break;
      }
      case 'rejoin': if (readName()) enterRoom(d.code); break;
      case 'rejoin-seat': app.kicked = false; maybeJoin(); render(); break;
      case 'home': goHome(false); break;
      case 'leave': {
        const t = app.table;
        if (t && app.online && t.phase === 'lobby' && amSeated()) {
          const left = t.seats.filter(s => s.device !== app.device);
          if (left.length) commit({ ...t, seats: left, host: t.host === app.device ? left[0].device : t.host });
        }
        goHome(true);
        break;
      }
      case 'rules': openSheet({ k: 'rules' }); break;
      case 'menu': openSheet({ k: 'menu' }); break;
      case 'close': closeSheet(); break;
      case 'share': share(); break;
      case 'kick': {
        const t = app.table, i = +d.s;
        if (t && t.phase === 'lobby' && t.seats[i]) {
          const left = t.seats.filter((_, k) => k !== i);
          if (!left.length) { goHome(true); break; }
          commit({ ...t, seats: left, host: left.some(s => s.device === t.host) ? t.host : left[0].device });
        }
        break;
      }
      case 'start': startGame(); break;
      case 'again': {
        const t = app.table;
        if (t) commit({ ...t, phase: 'play', game: E.newGame(t.seats.length), gameNo: t.gameNo + 1 });
        break;
      }
      case 'bank': pickGem(+d.c, el); break;
      case 'clear': app.sel = []; render(); break;
      case 'take': act({ t: 'take', g: app.sel.slice() }); break;
      case 'card': openSheet({ k: 'card', lv: +d.lv, i: +d.i }); break;
      case 'deck': openSheet({ k: 'deck', lv: +d.lv }); break;
      case 'res': openSheet({ k: 'res', s: +d.s, r: +d.r }); break;
      case 'noble': openSheet({ k: 'noble', id: +d.id }); break;
      case 'player': openSheet({ k: 'player', s: +d.s }); break;
      case 'buy': {
        const s = app.sheet;
        if (!s) break;
        app.sheet = null;
        if (s.k === 'card') act({ t: 'buy', lv: s.lv, i: s.i });
        else if (s.k === 'res') act({ t: 'buy', r: s.r });
        renderSheet();
        break;
      }
      case 'reserve': {
        const s = app.sheet;
        if (!s || s.k !== 'card') break;
        app.sheet = null;
        act({ t: 'reserve', lv: s.lv, i: s.i });
        renderSheet();
        break;
      }
      case 'reserve-blind': {
        const s = app.sheet;
        if (!s || s.k !== 'deck') break;
        app.sheet = null;
        act({ t: 'reserve', lv: s.lv, i: -1 });
        renderSheet();
        break;
      }
      case 'dpick': {
        if (!g || !g.pending) break;
        const c = +d.c, p = g.players[g.turn];
        const sum = app.discard.reduce((a, x) => a + x, 0);
        if (sum >= g.pending.n) { toast(`Only ${g.pending.n} to hand back`); break; }
        if (app.discard[c] < p.tokens[c]) { app.discard[c]++; FX.play('tick'); }
        renderSheet();
        break;
      }
      case 'dunpick': { const c = +d.c; if (app.discard[c] > 0) app.discard[c]--; renderSheet(); break; }
      case 'discard': { const gs = app.discard.slice(); app.discard = [0, 0, 0, 0, 0, 0]; act({ t: 'discard', g: gs }); break; }
      case 'pick-noble': act({ t: 'noble', id: +d.id }); break;
      case 'undo': undo(); break;
      case 'look': setPlain(d.plain === '1'); render(); break;
      case 'awake': store.set('awake', d.on === '1'); if (d.on === '1') keepAwake(); else if (wake) { wake.release().catch(() => {}); wake = null; } renderSheet(); break;
      case 'sparkle': FX.setLevel(+d.l); store.set('sparkle', +d.l); FX.burstAt(el, { n: 30, sp: 200 }); renderSheet(); break;
      case 'sound': FX.setSound(d.on === '1'); store.set('sound', d.on === '1'); if (d.on === '1') FX.play('turn'); renderSheet(); break;
      case 'claim': {
        const t = app.table, i = +d.s;
        if (t && t.seats[i]) {
          const s2 = t.seats.map((s, k) => (k === i ? { ...s, device: app.device } : s));
          app.sheet = null;
          commit({ ...t, seats: s2 });
          toast(`You are now playing for ${esc(t.seats[i].name)}`);
        }
        break;
      }
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'join') joinTable($('#code').value);
    else if (f === 'setup') {
      const names = [0, 1, 2, 3].map(i => cleanName($('#p' + i).value));
      store.set('localNames', names);
      const list = names.filter(Boolean);
      if (list.length < 2) { toast('Add at least 2 players', 'warn'); return; }
      startLocal(list);
    } else if (f === 'add') {
      const input = $('#add-name');
      const name = cleanName(input.value);
      const t = app.table;
      if (!name || !t || t.seats.length >= 4) return;
      input.value = '';
      commit({ ...t, seats: [...t.seats, { device: app.device, name }] });
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'code') {
      const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (v !== e.target.value) e.target.value = v;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && app.sheet) closeSheet();
  });

  // Keep the screen awake while a game is on, and catch up after the phone sleeps.
  let wake = null;
  async function keepAwake() {
    if (wake || !store.get('awake', false) || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || !app.table) return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { /* denied */ }
  }
  document.addEventListener('pointerdown', keepAwake, { passive: true });
  document.addEventListener('visibilitychange', () => {
    updateTitle();
    if (document.visibilityState === 'visible') {
      if (app.relay) { app.relay.reconnect(); app.relay.send('hello', { device: app.device }); }
      keepAwake();
    }
  });

  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#([A-Za-z]{4})$/);
    if (m && m[1].toUpperCase() !== app.room) {
      if (app.name) enterRoom(m[1].toUpperCase());
      else { app.prefill = m[1].toUpperCase(); goHome(false); }
    }
  });

  // ---------- boot ----------
  FX.setLevel(store.get('sparkle', 1));
  setPlain(!!store.get('plain', false));
  FX.setSound(store.get('sound', true));
  const m = location.hash.match(/^#([A-Za-z]{4})$/);
  if (m && app.name) enterRoom(m[1].toUpperCase());
  else {
    if (m) app.prefill = m[1].toUpperCase();
    render();
    if (m) { const n = $('#name'); if (n) n.focus(); }
  }
  window.GemsApp = app; // handy for debugging from the console
  if (/[?&]debug\b/.test(location.search)) window.GemsDebug = { act, commit, setTable };
})();
