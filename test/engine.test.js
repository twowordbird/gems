// Rules tests: node test/engine.test.js
const assert = require('assert');
const E = require('../engine.js');

function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

// Deck sanity: the catalog's shape.
{
  const byLv = [1, 2, 3].map(lv => E.CARDS.filter(c => c.lv === lv));
  assert.deepStrictEqual(byLv.map(x => x.length), [40, 30, 20]);
  for (const lv of byLv) for (let c = 0; c < 5; c++)
    assert.strictEqual(lv.filter(x => x.c === c).length, lv.length / 5, 'even colors per level');
  assert.strictEqual(E.NOBLES.length, 10);
}

// Gem-taking rules.
{
  const s = E.newGame(2, rng(1));
  assert.strictEqual(E.takeProblem(s, [0, 1, 2]), '');
  assert.strictEqual(E.takeProblem(s, [0, 0]), '');           // 4 in pile with 2 players
  assert.ok(E.takeProblem(s, [0, 1]));                       // must take 3 when 3+ colors exist
  assert.ok(E.takeProblem(s, [0, 0, 1]));
  assert.ok(E.takeProblem(s, [5]));
  const t = E.clone(s); t.bank = [0, 0, 0, 3, 3, 5];
  assert.strictEqual(E.takeProblem(t, [3, 4]), '');          // only two colors left
  assert.ok(E.takeProblem(t, [3, 3]));                       // only 3 in pile
}

// Buying with bonuses and gold; reserving gives gold; discard and nobles.
{
  let s = E.newGame(2, rng(7));
  s.turn = 0; s.first = 0;
  const id = s.board[0][0];
  const cost = E.CARDS[id].cost;
  s.players[0].tokens = [...cost, 0];
  s.bank = s.bank.map((x, c) => c < 5 ? x - cost[c] : x);
  s = E.apply(s, { t: 'buy', lv: 1, i: 0 });
  assert.deepStrictEqual(s.players[0].cards, [id]);
  assert.strictEqual(E.tokenCount(s.players[0]), 0);
  assert.notStrictEqual(s.board[0][0], id);
  assert.strictEqual(s.turn, 1);

  s = E.apply(s, { t: 'reserve', lv: 2, i: -1 });
  assert.strictEqual(s.players[1].reserved.length, 1);
  assert.strictEqual(s.players[1].reserved[0].blind, true);
  assert.strictEqual(s.players[1].tokens[5], 1);

  // Over ten tokens forces a discard before the turn passes.
  s.players[0].tokens = [2, 2, 2, 2, 2, 0];
  s.bank = [2, 2, 2, 2, 2, 4];
  s = E.apply(s, { t: 'take', g: [0, 1, 2] });
  assert.deepStrictEqual(s.pending, { k: 'discard', n: 3 });
  assert.throws(() => E.apply(s, { t: 'take', g: [3, 4, 0] }));
  assert.throws(() => E.apply(s, { t: 'discard', g: [1, 1, 0, 0, 0, 0] }));
  s = E.apply(s, { t: 'discard', g: [3, 0, 0, 0, 0, 0] });
  assert.strictEqual(s.pending, null);
  assert.strictEqual(s.turn, 1);
}

// Two qualifying patrons ask the player to choose.
{
  let s = E.newGame(2, rng(3));
  s.turn = 0; s.first = 0;
  s.nobles = [0, 4]; // emerald4+ruby4, ruby4+onyx4
  const pick = (c, n) => E.CARDS.filter(x => x.c === c && x.p === 0 && x.lv === 1).slice(0, n).map(x => x.id);
  s.players[0].cards = [...pick(2, 4), ...pick(3, 4), ...pick(4, 4)];
  s = E.apply(s, { t: 'take', g: [0, 1, 2] });
  assert.strictEqual(s.pending.k, 'noble');
  s = E.apply(s, { t: 'noble', id: 4 });
  assert.deepStrictEqual(s.players[0].nobles, [4]);
  assert.deepStrictEqual(s.nobles, [0]);
  assert.strictEqual(s.turn, 1);
}

// Final round: reaching 15 lets the round finish, then ties go to fewer cards.
{
  let s = E.newGame(3, rng(9));
  s.first = 0; s.turn = 1;
  const big = E.CARDS.filter(c => c.p === 5).map(c => c.id);
  s.players[1].cards = big.slice(0, 3);   // 15 points, 3 cards
  const two = E.CARDS.find(c => c.p === 2).id;
  s.players[2].cards = [...big.slice(3, 5), two];   // 12 + a patron = 15 points, also 3 cards
  s.players[2].nobles = [9];
  s = E.apply(s, { t: 'take', g: [0, 1, 2] });
  assert.strictEqual(s.final, true);
  assert.strictEqual(s.over, false);
  s = E.apply(s, { t: 'take', g: [0, 1, 2] });
  assert.strictEqual(s.over, true);
  assert.deepStrictEqual(s.result.winners.sort(), [1, 2]);
}

// Random games: conservation laws hold and every game ends.
function legalActions(s) {
  const pi = s.turn, p = s.players[pi], out = [];
  if (s.pending) {
    if (s.pending.k === 'noble') return s.pending.opts.map(id => ({ t: 'noble', id }));
    const g = [0, 0, 0, 0, 0, 0]; let n = s.pending.n;
    for (let c = 0; c < 6 && n; c++) { const k = Math.min(n, p.tokens[c]); g[c] = k; n -= k; }
    return [{ t: 'discard', g }];
  }
  for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 4; i++) {
    const id = s.board[lv - 1][i];
    if (id != null && E.payment(p, id)) out.push({ t: 'buy', lv, i }, { t: 'buy', lv, i });
  }
  p.reserved.forEach((r, k) => { if (E.payment(p, r.id)) out.push({ t: 'buy', r: k }, { t: 'buy', r: k }); });
  const avail = [0, 1, 2, 3, 4].filter(c => s.bank[c] > 0);
  const n = Math.min(3, avail.length);
  if (n) { const g = E.shuffle(avail, Math.random).slice(0, n); out.push({ t: 'take', g }, { t: 'take', g }); }
  for (const c of avail) if (s.bank[c] >= 4) out.push({ t: 'take', g: [c, c] });
  for (let lv = 1; lv <= 3; lv++) for (let i = -1; i < 4; i++) if (E.canReserve(s, pi, lv, i)) out.push({ t: 'reserve', lv, i });
  if (!out.length) out.push({ t: 'pass' });
  return out;
}
let finished = 0, turns = 0;
for (let g = 0; g < 400; g++) {
  const n = 2 + (g % 3);
  let s = E.newGame(n);
  const totalTok = E.TOKENS_FOR[n] * 5 + 5;
  for (let step = 0; step < 3000 && !s.over; step++) {
    const acts = legalActions(s);
    const greedy = acts.find(a => a.t === 'buy');
    const a = greedy && Math.random() < 0.85 ? greedy : acts[Math.floor(Math.random() * acts.length)];
    s = E.apply(s, a);
    assert.ok(E.isValidState(s), 'state stays valid');
    const tok = s.bank.reduce((x, y) => x + y, 0) + s.players.reduce((x, p) => x + E.tokenCount(p), 0);
    assert.strictEqual(tok, totalTok, 'tokens are conserved');
    const cards = s.decks.flat().length + s.board.flat().filter(x => x != null).length +
      s.players.reduce((x, p) => x + p.cards.length + p.reserved.length, 0);
    assert.strictEqual(cards, 90, 'cards are conserved');
    for (const p of s.players) {
      assert.ok(p.tokens.every(x => x >= 0));
      if (!s.pending) assert.ok(E.tokenCount(p) <= 10);
    }
    turns++;
  }
  if (s.over) finished++;
}
assert.ok(finished > 380, `most random games finish (${finished}/400)`);
assert.ok(!E.isValidState({ players: [{}], bank: [] }));
console.log(`engine ok: ${finished}/400 random games finished, ${turns} actions checked`);
