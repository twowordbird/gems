/* Gems: rules engine. Pure functions over a plain JSON state, shared by the
   browser and the node tests. Colors index 0-4 (diamond, sapphire, emerald,
   ruby, onyx); index 5 is gold. */
(function (root) {
  'use strict';

  const COLORS = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'];
  const NAMES = ['Diamond', 'Sapphire', 'Emerald', 'Ruby', 'Onyx', 'Gold'];
  const GOLD = 5;
  const WIN_POINTS = 15;
  const MAX_TOKENS = 10;
  const MAX_RESERVED = 3;

  // [level, bonus color, points, cost w/u/g/r/k]
  const RAW = [
    // Level I: onyx
    [1,4,0,[1,1,1,1,0]],[1,4,0,[1,2,1,1,0]],[1,4,0,[2,2,0,1,0]],[1,4,0,[0,0,1,3,1]],
    [1,4,0,[0,0,2,1,0]],[1,4,0,[2,0,2,0,0]],[1,4,0,[0,0,3,0,0]],[1,4,1,[0,4,0,0,0]],
    // sapphire
    [1,1,0,[1,0,1,1,1]],[1,1,0,[1,0,1,2,1]],[1,1,0,[1,0,2,2,0]],[1,1,0,[0,1,3,1,0]],
    [1,1,0,[1,0,0,0,2]],[1,1,0,[0,0,2,0,2]],[1,1,0,[0,0,0,0,3]],[1,1,1,[0,0,0,4,0]],
    // diamond
    [1,0,0,[0,1,1,1,1]],[1,0,0,[0,1,2,1,1]],[1,0,0,[0,2,2,0,1]],[1,0,0,[3,1,0,0,1]],
    [1,0,0,[0,0,0,2,1]],[1,0,0,[0,2,0,0,2]],[1,0,0,[0,3,0,0,0]],[1,0,1,[0,0,4,0,0]],
    // emerald
    [1,2,0,[1,1,0,1,1]],[1,2,0,[1,1,0,1,2]],[1,2,0,[0,1,0,2,2]],[1,2,0,[1,3,1,0,0]],
    [1,2,0,[2,1,0,0,0]],[1,2,0,[0,2,0,2,0]],[1,2,0,[0,0,0,3,0]],[1,2,1,[0,0,0,0,4]],
    // ruby
    [1,3,0,[1,1,1,0,1]],[1,3,0,[2,1,1,0,1]],[1,3,0,[2,0,1,0,2]],[1,3,0,[1,0,0,1,3]],
    [1,3,0,[0,2,1,0,0]],[1,3,0,[2,0,0,2,0]],[1,3,0,[3,0,0,0,0]],[1,3,1,[4,0,0,0,0]],
    // Level II
    [2,4,1,[3,2,2,0,0]],[2,4,1,[3,0,3,0,2]],[2,4,2,[0,1,4,2,0]],[2,4,2,[0,0,5,3,0]],[2,4,2,[5,0,0,0,0]],[2,4,3,[0,0,0,0,6]],
    [2,1,1,[0,2,2,3,0]],[2,1,1,[0,2,3,0,3]],[2,1,2,[5,3,0,0,0]],[2,1,2,[2,0,0,1,4]],[2,1,2,[0,5,0,0,0]],[2,1,3,[0,6,0,0,0]],
    [2,0,1,[0,0,3,2,2]],[2,0,1,[2,3,0,3,0]],[2,0,2,[0,0,1,4,2]],[2,0,2,[0,0,0,5,3]],[2,0,2,[0,0,0,5,0]],[2,0,3,[6,0,0,0,0]],
    [2,2,1,[3,0,2,3,0]],[2,2,1,[2,3,0,0,2]],[2,2,2,[4,2,0,0,1]],[2,2,2,[0,5,3,0,0]],[2,2,2,[0,0,5,0,0]],[2,2,3,[0,0,6,0,0]],
    [2,3,1,[2,0,0,2,3]],[2,3,1,[0,3,0,2,3]],[2,3,2,[1,4,2,0,0]],[2,3,2,[3,0,0,0,5]],[2,3,2,[0,0,0,0,5]],[2,3,3,[0,0,0,6,0]],
    // Level III
    [3,4,3,[3,3,5,3,0]],[3,4,4,[0,0,0,7,0]],[3,4,4,[0,0,3,6,3]],[3,4,5,[0,0,0,7,3]],
    [3,1,3,[3,0,3,3,5]],[3,1,4,[7,0,0,0,0]],[3,1,4,[6,3,0,0,3]],[3,1,5,[7,3,0,0,0]],
    [3,0,3,[0,3,3,5,3]],[3,0,4,[0,0,0,0,7]],[3,0,4,[3,0,0,3,6]],[3,0,5,[3,0,0,0,7]],
    [3,2,3,[5,3,0,3,3]],[3,2,4,[0,7,0,0,0]],[3,2,4,[3,6,3,0,0]],[3,2,5,[0,7,3,0,0]],
    [3,3,3,[3,5,3,0,3]],[3,3,4,[0,0,7,0,0]],[3,3,4,[0,3,6,3,0]],[3,3,5,[0,0,7,3,0]],
  ];
  const CARDS = RAW.map(([lv, c, p, cost], id) => ({ id, lv, c, p, cost }));

  const NOBLES = [
    { name: 'Duchess Glimmerwick', req: [0,0,4,4,0] },
    { name: 'Baron Facetworth',    req: [0,4,4,0,0] },
    { name: 'Countess Lumen',      req: [4,4,0,0,0] },
    { name: 'Lord Brilliance',      req: [4,0,0,0,4] },
    { name: 'Madame Shimmer',      req: [0,0,0,4,4] },
    { name: 'Sir Prism',           req: [3,3,0,0,3] },
    { name: 'Lady Twinkle',        req: [0,3,3,3,0] },
    { name: 'The Glitter Queen',   req: [3,3,3,0,0] },
    { name: 'Marquis Sparkhaven',  req: [0,0,3,3,3] },
    { name: 'Archduke Dazzle',     req: [3,0,0,3,3] },
  ].map((n, id) => ({ id, name: n.name, req: n.req, p: 3 }));

  const TOKENS_FOR = { 2: 4, 3: 5, 4: 7 };

  function shuffle(a, rnd) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  const sum = a => a.reduce((x, y) => x + y, 0);

  function newGame(n, rnd = Math.random) {
    if (n < 2 || n > 4) throw new Error('Gems needs 2 to 4 players');
    const t = TOKENS_FOR[n];
    const decks = [1, 2, 3].map(lv => shuffle(CARDS.filter(c => c.lv === lv).map(c => c.id), rnd));
    const board = decks.map(d => d.splice(0, 4));
    const first = Math.floor(rnd() * n);
    return {
      bank: [t, t, t, t, t, 5],
      decks, board,
      nobles: shuffle(NOBLES.map(x => x.id), rnd).slice(0, n + 1),
      players: Array.from({ length: n }, () => ({ tokens: [0,0,0,0,0,0], cards: [], reserved: [], nobles: [] })),
      first, turn: first, round: 1,
      pending: null, final: false, over: false, result: null,
      last: null, log: [], acts: 0,
    };
  }

  function bonuses(p) {
    const b = [0,0,0,0,0];
    for (const id of p.cards) b[CARDS[id].c]++;
    return b;
  }
  function points(p) {
    return p.cards.reduce((x, id) => x + CARDS[id].p, 0) + p.nobles.length * 3;
  }
  const tokenCount = p => sum(p.tokens);

  // What buying `cardId` would cost this player, or null if they can't.
  function payment(p, cardId) {
    const cost = CARDS[cardId].cost, b = bonuses(p);
    const pay = [0,0,0,0,0,0];
    let gold = 0;
    for (let c = 0; c < 5; c++) {
      const need = Math.max(0, cost[c] - b[c]);
      const use = Math.min(need, p.tokens[c]);
      pay[c] = use;
      gold += need - use;
    }
    if (gold > p.tokens[GOLD]) return null;
    pay[GOLD] = gold;
    return pay;
  }
  // Per color, how many more gems the player needs (after gold is spent).
  function shortfall(p, cardId) {
    const cost = CARDS[cardId].cost, b = bonuses(p);
    const short = [0,0,0,0,0];
    for (let c = 0; c < 5; c++) short[c] = Math.max(0, cost[c] - b[c] - p.tokens[c]);
    return { short, gold: p.tokens[GOLD] };
  }

  function availableColors(s) {
    let n = 0;
    for (let c = 0; c < 5; c++) if (s.bank[c] > 0) n++;
    return n;
  }

  // Validate a gem selection (array of color indexes). Returns '' if legal,
  // otherwise a short reason a player can read.
  function takeProblem(s, g) {
    if (!Array.isArray(g) || g.length === 0) return 'Pick some gems first';
    if (g.some(c => !(c >= 0 && c < 5))) return 'Gold only comes from reserving';
    if (g.length === 2 && g[0] === g[1]) {
      return s.bank[g[0]] >= 4 ? '' : 'Taking two of a kind needs 4 in the pile';
    }
    if (new Set(g).size !== g.length) return 'Two of a kind is only allowed on its own';
    if (g.length > 3) return 'Three gems at most';
    if (g.some(c => s.bank[c] <= 0)) return 'That pile is empty';
    const need = Math.min(3, availableColors(s));
    if (g.length < need) return need === 3 ? 'Pick three different colors' : `Pick ${need} different colors`;
    return '';
  }

  function cardAt(s, lv, i) { return s.board[lv - 1][i]; }

  function canReserve(s, pi, lv, i) {
    const p = s.players[pi];
    if (p.reserved.length >= MAX_RESERVED) return false;
    if (i === -1) return s.decks[lv - 1].length > 0;
    return cardAt(s, lv, i) != null;
  }

  function hasLegalMove(s) {
    const pi = s.turn, p = s.players[pi];
    if (availableColors(s) > 0) return true;
    for (let lv = 1; lv <= 3; lv++) {
      for (let i = -1; i < 4; i++) if (canReserve(s, pi, lv, i)) return true;
      for (const id of s.board[lv - 1]) if (id != null && payment(p, id)) return true;
    }
    return p.reserved.some(r => payment(p, r.id));
  }

  function refill(s, lv, i) {
    const d = s.decks[lv - 1];
    s.board[lv - 1][i] = d.length ? d.shift() : null;
  }

  function log(s, entry) {
    s.acts = (s.acts || 0) + 1;
    s.log.push(entry);
    if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
  }

  // Apply one action for the player whose turn it is. Returns a new state;
  // throws Error(reason) when the action is illegal.
  function apply(s0, a) {
    if (s0.over) throw new Error('The game is over');
    const s = clone(s0);
    const pi = s.turn, p = s.players[pi];

    if (s.pending) {
      if (a.t === 'discard' && s.pending.k === 'discard') {
        const g = a.g;
        if (!Array.isArray(g) || g.length !== 6 || g.some((x, c) => !(x >= 0 && x <= p.tokens[c]) || x !== Math.floor(x)))
          throw new Error('Pick gems you actually have');
        if (sum(g) !== s.pending.n) throw new Error(`Return exactly ${s.pending.n}`);
        for (let c = 0; c < 6; c++) { p.tokens[c] -= g[c]; s.bank[c] += g[c]; }
        log(s, { s: pi, t: 'discard', g });
        s.pending = null;
        return afterTokens(s);
      }
      if (a.t === 'noble' && s.pending.k === 'noble') {
        if (!s.pending.opts.includes(a.id)) throw new Error('That patron cannot visit you');
        return awardNoble(s, a.id);
      }
      throw new Error('Finish the current step first');
    }

    s.last = { s: pi, t: a.t };
    switch (a.t) {
      case 'take': {
        const g = a.g;
        const why = takeProblem(s, g);
        if (why) throw new Error(why);
        for (const c of g) { s.bank[c]--; p.tokens[c]++; }
        s.last.g = g.slice();
        log(s, { s: pi, t: 'take', g: g.slice() });
        break;
      }
      case 'reserve': {
        const { lv, i } = a;
        if (!(lv >= 1 && lv <= 3) || !(i >= -1 && i < 4)) throw new Error('No such card');
        if (p.reserved.length >= MAX_RESERVED) throw new Error('You can hold 3 reserved cards at most');
        let id;
        if (i === -1) {
          if (!s.decks[lv - 1].length) throw new Error('That deck is empty');
          id = s.decks[lv - 1].shift();
        } else {
          id = cardAt(s, lv, i);
          if (id == null) throw new Error('No card there');
          refill(s, lv, i);
        }
        p.reserved.push({ id, blind: i === -1 });
        const gotGold = s.bank[GOLD] > 0;
        if (gotGold) { s.bank[GOLD]--; p.tokens[GOLD]++; }
        Object.assign(s.last, { lv, i, id, gold: gotGold });
        log(s, { s: pi, t: 'reserve', id: i === -1 ? null : id, lv, i, gold: gotGold });
        break;
      }
      case 'buy': {
        let id;
        if (a.r != null) {
          const r = p.reserved[a.r];
          if (!r) throw new Error('No such reserved card');
          id = r.id;
        } else {
          if (!(a.lv >= 1 && a.lv <= 3) || !(a.i >= 0 && a.i < 4)) throw new Error('No such card');
          id = cardAt(s, a.lv, a.i);
          if (id == null) throw new Error('No card there');
        }
        const pay = payment(p, id);
        if (!pay) throw new Error('You cannot afford that yet');
        for (let c = 0; c < 6; c++) { p.tokens[c] -= pay[c]; s.bank[c] += pay[c]; }
        if (a.r != null) p.reserved.splice(a.r, 1);
        else refill(s, a.lv, a.i);
        p.cards.push(id);
        Object.assign(s.last, { id, lv: a.lv, i: a.i, r: a.r, pay });
        log(s, { s: pi, t: 'buy', id, pay, lv: a.r != null ? null : a.lv, i: a.r != null ? null : a.i, r: a.r != null ? a.r : null });
        break;
      }
      case 'pass': {
        if (hasLegalMove(s0)) throw new Error('You still have a move');
        log(s, { s: pi, t: 'pass' });
        break;
      }
      default: throw new Error('Unknown action');
    }
    return afterTokens(s);
  }

  function afterTokens(s) {
    const p = s.players[s.turn];
    const over = tokenCount(p) - MAX_TOKENS;
    if (over > 0) { s.pending = { k: 'discard', n: over }; return s; }
    const b = bonuses(p);
    const opts = s.nobles.filter(id => NOBLES[id].req.every((r, c) => b[c] >= r));
    if (opts.length === 1) return awardNoble(s, opts[0]);
    if (opts.length > 1) { s.pending = { k: 'noble', opts }; return s; }
    return endTurn(s);
  }

  function awardNoble(s, id) {
    const pi = s.turn;
    s.nobles = s.nobles.filter(x => x !== id);
    s.players[pi].nobles.push(id);
    s.pending = null;
    if (s.last) s.last.noble = id;
    log(s, { s: pi, t: 'noble', id });
    return endTurn(s);
  }

  function endTurn(s) {
    const n = s.players.length;
    if (!s.final && points(s.players[s.turn]) >= WIN_POINTS) {
      s.final = true;
      log(s, { s: s.turn, t: 'final' });
    }
    const next = (s.turn + 1) % n;
    if (next === s.first) {
      if (s.final) return finish(s);
      s.round++;
    }
    s.turn = next;
    return s;
  }

  function finish(s) {
    s.over = true;
    const rows = s.players.map((p, i) => ({ i, pts: points(p), cards: p.cards.length }));
    rows.sort((a, b) => b.pts - a.pts || a.cards - b.cards);
    const top = rows[0];
    s.result = {
      ranking: rows,
      winners: rows.filter(r => r.pts === top.pts && r.cards === top.cards).map(r => r.i),
    };
    log(s, { t: 'over', w: s.result.winners });
    return s;
  }

  // Structural check for states that arrive over the public relay: anything
  // that would index out of range or isn't the right shape is rejected.
  function isValidState(s) {
    try {
      const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
      const arr = (a, n) => Array.isArray(a) && (n == null || a.length === n);
      const cardId = x => int(x, 0, CARDS.length - 1);
      if (!arr(s.players) || s.players.length < 2 || s.players.length > 4) return false;
      if (!arr(s.bank, 6) || !s.bank.every(x => int(x, 0, 7))) return false;
      if (!arr(s.decks, 3) || !s.decks.every(d => arr(d) && d.every(cardId))) return false;
      if (!arr(s.board, 3) || !s.board.every(r => arr(r, 4) && r.every(x => x === null || cardId(x)))) return false;
      if (!arr(s.nobles) || !s.nobles.every(x => int(x, 0, NOBLES.length - 1))) return false;
      const n = s.players.length;
      if (!int(s.turn, 0, n - 1) || !int(s.first, 0, n - 1)) return false;
      for (const p of s.players) {
        if (!arr(p.tokens, 6) || !p.tokens.every(x => int(x, 0, 20))) return false;
        if (!arr(p.cards) || !p.cards.every(cardId)) return false;
        if (!arr(p.reserved) || p.reserved.length > 3 || !p.reserved.every(r => r && cardId(r.id))) return false;
        if (!arr(p.nobles) || !p.nobles.every(x => int(x, 0, NOBLES.length - 1))) return false;
      }
      if (s.pending) {
        if (s.pending.k === 'discard' && !int(s.pending.n, 1, 3)) return false;
        if (s.pending.k === 'noble' && !(arr(s.pending.opts) && s.pending.opts.every(x => int(x, 0, 9)))) return false;
        if (s.pending.k !== 'discard' && s.pending.k !== 'noble') return false;
      }
      if (!arr(s.log) || s.log.length > 40) return false;
      const okSeat = x => x === undefined || int(x, 0, n - 1);
      const okOpt = (x, lo, hi) => x === undefined || x === null || int(x, lo, hi);
      const okGems = g => g === undefined || (arr(g) && g.length <= 6 && g.every(x => int(x, 0, 10)));
      const KINDS = ['take', 'reserve', 'buy', 'discard', 'noble', 'pass', 'final', 'over'];
      for (const e of s.log) {
        if (!e || typeof e !== 'object' || !KINDS.includes(e.t) || !okSeat(e.s)) return false;
        if (!okGems(e.g) || !okGems(e.pay)) return false;
        if (e.t === 'noble' ? !int(e.id, 0, NOBLES.length - 1) : !okOpt(e.id, 0, CARDS.length - 1)) return false;
        if (!okOpt(e.lv, 1, 3) || !okOpt(e.i, -1, 3) || !okOpt(e.r, 0, 2)) return false;
        if (e.w !== undefined && !(arr(e.w) && e.w.every(x => int(x, 0, n - 1)))) return false;
      }
      if (!int(s.acts || 0, 0, 1e6) || !int(s.round || 1, 1, 1e4)) return false;
      if (s.over) {
        const r = s.result;
        if (!r || !arr(r.winners) || !r.winners.every(x => int(x, 0, n - 1))) return false;
        if (!arr(r.ranking, n) || !r.ranking.every(x => x && int(x.i, 0, n - 1) && int(x.pts, 0, 200) && int(x.cards, 0, 90))) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  const api = {
    COLORS, NAMES, GOLD, CARDS, NOBLES, WIN_POINTS, MAX_TOKENS, MAX_RESERVED, TOKENS_FOR,
    newGame, apply, payment, shortfall, bonuses, points, tokenCount, takeProblem,
    canReserve, hasLegalMove, availableColors, isValidState, shuffle, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GemsEngine = api;
})(typeof self !== 'undefined' ? self : this);
