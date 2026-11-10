import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solve, matches, generate, wrap } from '../src/levels/level4/morsematics.js'
import level4 from '../src/levels/level4/index.js'
import { classifyTaps, MORSE, DASH_MS } from '../../shared/morse.js'
import { seededRng } from '../src/levels/rng.js'

test('worked by hand from the manual', () => {
  // Pair: 4th/5th of AB3CD7 = C(3), D(4). Received A(1) R(18) Z(26). Lamps: CAR lit, BOB dark. 2 candles.
  // 1. CAR shares A and R, lit -> first+1 = 4. BOB shares nothing.         (4, 4)
  // 2. 4+4 = 8 not square -> second-4 = 0 -> wraps to 26.                   (4, 26)
  // 3. largest received 26 -> first 30 -> 4.                                (4, 26)
  // 4. no primes among 1, 18, 26.                                           (4, 26)
  // 5. 1 is square -> second 25.                                            (4, 25)
  // 6. 18 and 26 divisible by 2 -> both -44: first -40 -> 12, second -19 -> 7.
  // First larger -> 12 - 7 = 5 = E
  const r = solve({ serial: 'AB3CD7', received: ['A', 'R', 'Z'], lamps: [{ label: 'CAR', lit: true }, { label: 'BOB', lit: false }], candles: 2 })
  assert.deepEqual(r.steps.at(-1), [12, 7])
  assert.equal(r.answer, 'E')
  assert.ok(matches('T', 'E') && matches('E', 'T') && !matches('A', 'E'))
})

test('wrap keeps everything in 1-26', () => {
  assert.deepEqual([0, 27, -40, 26, 1, 52].map(wrap), [26, 1, 12, 26, 1, 26])
})

test('reading taps: a quick tap is a dot, a hold (250ms+) is a dash, whatever the gaps', () => {
  assert.equal(DASH_MS, 250)
  assert.equal(classifyTaps([100, 400, 110]), '.-.')   // R
  assert.equal(classifyTaps([300]), '-')               // a lone hold is T now
  assert.equal(classifyTaps([120]), '.')               // a lone tap is E
  assert.equal(classifyTaps([260, 260]), '--')         // M: short holds still count
  assert.equal(classifyTaps([249, 250]), '.-')         // the line is exactly 250ms
})

test('generated modules are well-formed and answers vary', () => {
  const answers = new Set()
  for (let s = 1; s <= 400; s++) {
    const m = generate(seededRng(s))
    assert.match(m.serial, /^[A-Z0-9]{2}[0-9][A-Z]{2}[0-9]$/)
    assert.equal(new Set(m.received).size, 3)
    answers.add(solve(m).answer)
  }
  assert.ok(answers.size >= 20, `only ${answers.size} different answers`)
})

const tap = (pattern, unit = 120) => ({
  type: 'transmit',
  holds: [...pattern].map(c => (c === '-' ? unit * 3 : unit)),
  gaps: Array.from({ length: pattern.length - 1 }, () => unit),
})

test('only Player 2 sees the module; nobody gets the answer', () => {
  const s = level4.create({ rng: seededRng(3) })
  const a = level4.view(s, 'A'), b = level4.view(s, 'B')
  assert.equal(a.signals, undefined)
  assert.equal(a.cell, undefined)
  assert.equal(b.signals.length, 3)
  for (const v of [a, b]) assert.ok(!JSON.stringify(v).includes('answer'))
})

test('right letter finishes; wrong letter shows it and starts a new message; junk is forgiven', () => {
  const rng = seededRng(4)
  const s = level4.create({ rng })
  const ap = { rng, updates: 0, completed: 0, update() { this.updates++ }, complete() { this.completed++ } }
  const wrongLetter = 'ABCDFGHIJKLMNOPQRSUVWXYZ'.split('').find(l => l !== s.answer)
  const before = JSON.stringify(s.module)
  assert.deepEqual(level4.action(s, 'B', tap('......'), ap), { received: null })
  assert.equal(s.wrong, 0)
  const r = level4.action(s, 'B', tap(MORSE[wrongLetter]), ap)
  assert.deepEqual(r, { received: wrongLetter, correct: false })
  assert.equal(s.lastReceived, wrongLetter)
  assert.notEqual(JSON.stringify(s.module), before, 'a new message')
  assert.equal(level4.action(s, 'A', tap(MORSE[s.answer]), ap).correct, undefined, 'only Player 2 has the lantern')
  assert.equal(level4.action(s, 'B', tap(MORSE[s.answer]), ap).correct, true)
  assert.equal(s.done, true)
  level4.dispose(s)
})
