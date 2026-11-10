import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rank5, best, compare } from '../src/levels/level11/cards.js'
import { newGame, startHand, act, options, blindsFor } from '../src/levels/level11/holdem.js'
import level11 from '../src/levels/level11/index.js'
import { seededRng } from '../src/levels/rng.js'

const C = (str) => str.split(' ').map(t => ({ r: { T: 10, J: 11, Q: 12, K: 13, A: 14 }[t[0]] ?? Number(t[0]), s: t[1] }))

test('hand ranking', () => {
  const order = [
    'Ah Kh Qh Jh Th', // royal flush
    '9c 8c 7c 6c 5c', // straight flush
    '5s 5h 5d 5c 2h', // quads
    'Ks Kh Kd 2c 2h', // full house
    'As Js 8s 4s 2s', // flush
    '9h 8d 7c 6s 5h', // straight
    '5h 4d 3c 2s Ah', // wheel (5-high straight)
    'Qs Qh Qd 7c 2h', // trips
    'Js Jh 4d 4c 9h', // two pair
    'Ts Th 8d 4c 2h', // pair
    'Ah Qd 9c 6s 3h', // high card
  ].map(s => rank5(C(s)))
  for (let i = 0; i + 1 < order.length; i++) assert.equal(compare(order[i], order[i + 1]), 1, `hand ${i} beats hand ${i + 1}`)
  assert.equal(best(C('Ah Kh 2c 3d 4s 5h 9c')).name, 'a straight, five high')
  assert.equal(compare(rank5(C('Ah Ad Kc 9s 4h')), rank5(C('As Ac Kd 9h 3c'))), 1, 'kicker decides')
  assert.equal(compare(rank5(C('Ah Ad Kc 9s 4h')), rank5(C('As Ac Kd 9h 4c'))), 0, 'exact tie')
})

test('heads-up order: the dealer posts the small blind and acts first before the flop, last after it', () => {
  const g = newGame()
  startHand(g, seededRng(1))
  const d = g.button, nd = d === 'A' ? 'B' : 'A'
  assert.deepEqual([g.hand.bets[d], g.hand.bets[nd]], [1, 2])
  assert.equal(g.hand.toAct, d)
  act(g, d, { type: 'call' })
  assert.equal(g.hand.toAct, nd, 'big blind gets the option')
  act(g, nd, { type: 'check' })
  assert.equal(g.hand.street, 'flop')
  assert.equal(g.hand.board.length, 3)
  assert.equal(g.hand.toAct, nd, 'after the flop the non-dealer goes first')
})

test('a fold gives the pot to the other player', () => {
  const g = newGame()
  startHand(g, seededRng(2))
  const d = g.button, nd = d === 'A' ? 'B' : 'A'
  act(g, d, { type: 'fold' })
  assert.equal(g.stacks[nd], 26)
  assert.equal(g.stacks[d], 24)
  assert.equal(g.last.showCards, null, 'no cards shown on a fold')
})

test('all in and called: the board runs out and there is a showdown', () => {
  const g = newGame()
  startHand(g, seededRng(3))
  const d = g.button, nd = d === 'A' ? 'B' : 'A'
  act(g, d, { type: 'raise', to: 999 })
  assert.equal(g.stacks[d], 0)
  act(g, nd, { type: 'call' })
  assert.equal(g.hand.street, 'done')
  assert.equal(g.last.reason, 'showdown')
  assert.equal(g.last.board.length, 5)
  assert.ok(g.over === null ? g.stacks.A + g.stacks.B === 50 : true)
})

test('fuzz: 300 full games of random legal play never lose or invent a chip, and always end', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = seededRng(seed)
    const g = newGame()
    let hands = 0
    while (!g.over && hands < 400) {
      startHand(g, rng)
      hands++
      for (let guard = 0; g.hand.street !== 'done' && guard < 60; guard++) {
        const who = g.hand.toAct
        const o = options(g, who)
        assert.ok(o, `seed ${seed}: nobody can act`)
        const choices = ['fold', o.canCheck ? 'check' : 'call', o.canRaise ? 'raise' : (o.canCheck ? 'check' : 'call'), o.canCheck ? 'check' : 'call']
        const pick = rng.pick(choices)
        const err = act(g, who, { type: pick, to: o.minTo + rng.int(Math.max(1, o.maxTo - o.minTo + 1)) })
        assert.equal(err, null, `seed ${seed}: ${pick} -> ${err}`)
        assert.ok(g.stacks.A >= 0 && g.stacks.B >= 0)
        const inPlay = g.stacks.A + g.stacks.B + g.hand.pot + g.hand.bets.A + g.hand.bets.B
        assert.equal(inPlay, 50, `seed ${seed}: chips`)
      }
      assert.equal(g.hand.street, 'done', `seed ${seed}: hand never finished`)
      assert.equal(g.stacks.A + g.stacks.B, 50)
    }
    assert.ok(g.over === 'A' || g.over === 'B', `seed ${seed}: game never ended`)
  }
})

test("views: your own cards only; theirs only at a showdown", () => {
  const rng = seededRng(5)
  const s = level11.create({ rng })
  const a = level11.view(s, 'A'), b = level11.view(s, 'B')
  assert.deepEqual(a.myCards, s.g.hand.hole.A)
  assert.equal(a.theirCards, null)
  assert.ok(!JSON.stringify(a).includes(JSON.stringify(s.g.hand.hole.B)))
  assert.ok(!JSON.stringify(b).includes(JSON.stringify(s.g.hand.hole.A)))
  assert.ok(!JSON.stringify(a).includes('deck'))
  // play to a showdown: all in + call
  const ap = { rng, update() {}, complete() {} }
  const d = s.g.button, nd = d === 'A' ? 'B' : 'A'
  level11.action(s, d, { type: 'act', action: 'raise', to: 999 }, ap)
  level11.action(s, nd, { type: 'act', action: 'call' }, ap)
  const after = level11.view(s, 'A')
  assert.deepEqual(after.theirCards, s.g.last.showCards.B)
  level11.dispose(s)
})

test('only the player whose turn it is can act', () => {
  const rng = seededRng(6)
  const s = level11.create({ rng })
  const ap = { rng, update() {}, complete() {} }
  const wrong = s.g.button === 'A' ? 'B' : 'A'
  assert.deepEqual(level11.action(s, wrong, { type: 'act', action: 'call' }, ap), { error: 'not your turn' })
  level11.dispose(s)
})

test('blinds: the big blind goes up by 2 every 2 hands (small blind is half), capped at 4/8', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 99].map(blindsFor), [[1, 2], [1, 2], [2, 4], [2, 4], [3, 6], [3, 6], [4, 8], [4, 8], [4, 8], [4, 8], [4, 8]])
  const g = newGame()
  const rng = seededRng(11)
  startHand(g, rng); act(g, g.hand.toAct, { type: 'fold' })
  startHand(g, rng); act(g, g.hand.toAct, { type: 'fold' })
  startHand(g, rng)
  assert.deepEqual(g.hand.blinds, [2, 4], 'hand 3 is at 2/4')
})
