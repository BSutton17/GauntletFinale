import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { rank5, best, compare } from '../src/levels/level11/cards.js'
import { newGame, startHand, act, options, blindsFor, NO_ALL_IN_HANDS } from '../src/levels/level11/holdem.js'
import level11, { QUESTIONS, QUIZ_READ_MS, QUIZ_REVEAL_MS } from '../src/levels/level11/index.js'
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
  g.handNo = NO_ALL_IN_HANDS // past the no-all-in hands
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
  // play to a showdown: all in + call (pretend it's past the no-all-in hands)
  s.g.handNo = NO_ALL_IN_HANDS + 1
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

test('hands 1 and 2: nobody can go all in, by raising or by calling', () => {
  const g = newGame()
  const rng = seededRng(21)
  startHand(g, rng)
  const d = g.button, nd = d === 'A' ? 'B' : 'A'
  const o = options(g, d)
  assert.equal(o.noAllIn, true)
  assert.equal(o.maxTo, 24, 'one coin short of everything')
  act(g, d, { type: 'raise', to: 999 })
  assert.equal(g.stacks[d], 1, 'the raise is capped')
  assert.equal(options(g, nd).canRaise, false, 'no re-raise past the cap')
  act(g, nd, { type: 'call' })
  assert.equal(g.stacks[nd], 1, 'calling never puts anyone all in')
  // hand 2, uneven stacks: the bigger stack can't bet the smaller one all in
  g.stacks = { A: 40, B: 10 }; g.total = 50; g.hand.street = 'done'
  startHand(g, rng)
  const big = g.stacks.A > g.stacks.B ? 'A' : 'B'
  if (g.hand.toAct !== big) act(g, g.hand.toAct, { type: 'call' })
  const ob = options(g, big)
  const small = big === 'A' ? 'B' : 'A'
  assert.equal(ob.maxTo, g.hand.bets[small] + g.stacks[small] - 1)
  // hand 3: all in is allowed again
  g.hand.street = 'done'
  startHand(g, rng)
  const o3 = options(g, g.hand.toAct)
  assert.equal(o3.noAllIn, false)
  assert.equal(o3.maxTo, g.hand.bets[g.hand.toAct] + g.stacks[g.hand.toAct])
})

test('the King can cover a blind: those coins come from outside the game', () => {
  const g = newGame()
  startHand(g, seededRng(22), { cover: 'A' })
  const paid = g.hand.covered.amount
  assert.equal(g.hand.covered.who, 'A')
  assert.equal(g.stacks.A, 25, 'A paid nothing')
  assert.equal(g.total, 50 + paid)
  assert.equal(g.stacks.A + g.stacks.B + g.hand.bets.A + g.hand.bets.B, g.total)
})

// ── the King's questions ──
function quizGame(seed) {
  mock.timers.enable({ apis: ['setTimeout'] })
  const rng = seededRng(seed)
  const s = level11.create({ rng })
  const api = { rng, update() {}, complete() {} }
  const foldHand = () => {
    level11.action(s, s.g.hand.toAct, { type: 'act', action: 'fold' }, api)
    mock.timers.tick(5000)
  }
  const answer = (role, right) => {
    const z = s.quiz
    const choice = right ? z.answer : z.options.find(o => o !== z.answer)
    return level11.action(s, role, { type: 'answer', choice }, api)
  }
  return { s, api, foldHand, answer }
}

test('a question after every second hand, the answers 3 s after it, all four in a random order, then no more', (t) => {
  t.after(() => mock.timers.reset())
  const { s, foldHand, answer } = quizGame(31)
  assert.equal(new Set(s.order).size, QUESTIONS.length)
  foldHand()
  assert.equal(s.quiz, null, 'no question after hand 1')
  assert.equal(s.g.handNo, 2)
  const asked = []
  for (let n = 1; n <= QUESTIONS.length; n++) {
    foldHand()
    assert.ok(s.quiz, `question ${n} after hand ${s.g.handNo}`)
    asked.push(s.quiz.q)
    // the question alone first: no answers shown, and none accepted
    const early = level11.view(s, 'A').quiz
    assert.equal(early.options, null)
    assert.equal(level11.view(s, 'A').options, null, 'no betting during a question')
    answer('A', true)
    assert.equal(s.quiz.answers.A, null, 'too early to answer')
    mock.timers.tick(QUIZ_READ_MS)
    const v = level11.view(s, 'A').quiz
    assert.equal(v.options.length, 4)
    assert.equal(v.reveal, undefined)
    assert.ok(!('answer' in v), 'the right answer is not sent before the reveal')
    answer('A', false)
    assert.equal(level11.view(s, 'B').quiz.theyAnswered, true)
    assert.equal(level11.view(s, 'A').quiz.reveal, undefined, 'nothing revealed until both have answered')
    answer('B', false)
    assert.equal(level11.view(s, 'A').quiz.reveal.winner, null, 'nobody right, no winner')
    mock.timers.tick(QUIZ_REVEAL_MS)
    assert.equal(s.quiz, null)
    assert.equal(s.power, null, 'no reward')
    foldHand()
  }
  assert.equal(new Set(asked).size, QUESTIONS.length, 'every question once')
  for (let i = 0; i < 4; i++) { foldHand(); assert.equal(s.quiz, null, 'no more questions') }
})

function toQuestion(g, reward) {
  const { s, foldHand } = g
  s.order = [QUESTIONS.findIndex(q => q.reward === reward)]
  foldHand(); foldHand()
  mock.timers.tick(QUIZ_READ_MS)
  assert.equal(s.quiz.reward, reward)
}

test('both right: whoever answered first wins; the reward is for the next hand only', (t) => {
  t.after(() => mock.timers.reset())
  const g = quizGame(32)
  toQuestion(g, 'cover')
  g.answer('B', true)
  g.answer('A', true)
  const r = level11.view(g.s, 'A').quiz.reveal
  assert.equal(r.winner, 'B')
  assert.equal(r.reward, 'cover')
  mock.timers.tick(QUIZ_REVEAL_MS)
  const { g: game } = g.s
  assert.equal(game.handNo, 3)
  assert.equal(game.hand.covered.who, 'B')
  assert.equal(level11.view(g.s, 'A').power.kind, 'cover')
  assert.equal(game.stacks.A + game.stacks.B + game.hand.bets.A + game.hand.bets.B, game.total)
  g.foldHand()
  assert.equal(level11.view(g.s, 'A').power, null, 'gone the hand after')
  assert.equal(game.hand.covered, undefined)
})

test('one right: the "see a card" power shows the winner one of the other player\'s cards, and only them', (t) => {
  t.after(() => mock.timers.reset())
  const g = quizGame(33)
  toQuestion(g, 'card')
  g.answer('A', true)
  g.answer('B', false)
  mock.timers.tick(QUIZ_REVEAL_MS)
  const a = level11.view(g.s, 'A'), b = level11.view(g.s, 'B')
  assert.deepEqual(a.power.card, g.s.g.hand.hole.B[0])
  assert.equal(b.power.card, undefined)
  assert.ok(!JSON.stringify(b).includes(JSON.stringify(g.s.g.hand.hole.A)))
})

test('the "peek at the flop" power shows the winner the real flop before it is dealt', (t) => {
  t.after(() => mock.timers.reset())
  const g = quizGame(34)
  toQuestion(g, 'flop')
  g.answer('B', true)
  g.answer('A', false)
  mock.timers.tick(QUIZ_REVEAL_MS)
  const s = g.s
  const peek = level11.view(s, 'B').power.flop
  assert.equal(peek.length, 3)
  assert.equal(level11.view(s, 'A').power.flop, undefined)
  const first = s.g.hand.toAct
  level11.action(s, first, { type: 'act', action: 'call' }, g.api)
  level11.action(s, s.g.hand.toAct, { type: 'act', action: 'check' }, g.api)
  assert.equal(s.g.hand.street, 'flop')
  assert.deepEqual(s.g.hand.board, peek)
  assert.equal(level11.view(s, 'B').power.flop, undefined, 'only before the flop')
})
