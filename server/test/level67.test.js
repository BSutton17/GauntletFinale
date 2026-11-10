import { test } from 'node:test'
import assert from 'node:assert/strict'
import level6, { SONGS, HINT } from '../src/levels/level6/index.js'
import level7, { PICTURE, COLOURS, shareRight, clean } from '../src/levels/level7/index.js'
import { seededRng } from '../src/levels/rng.js'

const api = () => ({ updates: 0, completed: 0, update() { this.updates++ }, complete() { this.completed++ } })

test('L6: Player 1 gets only coordinates, Player 2 only songs; nobody gets the answer', () => {
  const s = level6.create()
  const a = level6.view(s, 'A'), b = level6.view(s, 'B')
  assert.equal(a.rows.length, 6)
  assert.ok(a.rows.every(r => r.length === 2))
  assert.equal(a.songs, undefined)
  assert.equal(b.rows, undefined)
  assert.deepEqual(b.songs.map(x => x.title), SONGS.map(x => x.title))
  assert.equal(a.hint, HINT); assert.equal(b.hint, HINT)
  for (const v of [a, b]) assert.ok(!/swear|night/i.test(JSON.stringify(v)))
})

test('L6: the sentence is accepted however it is typed; only Player 2 answers', () => {
  const s = level6.create(); const ap = api()
  assert.deepEqual(level6.action(s, 'A', { type: 'answer', text: 'I swear to stand with the king, all day and all night' }, ap), {})
  assert.deepEqual(level6.action(s, 'B', { type: 'answer', text: 'I swear to stand by the king' }, ap), { correct: false })
  assert.equal(s.wrong, 1)
  assert.deepEqual(level6.action(s, 'B', { type: 'answer', text: '  I swear, to stand with the King — all day & all night!' }, ap), { correct: false }, '& is not "and"')
  assert.deepEqual(level6.action(s, 'B', { type: 'answer', text: 'I SWEAR to stand with the king... all day and all night.' }, ap), { correct: true })
  level6.dispose(s)
})

test('L7: the picture is a 25 x 25 cat in six colours, symmetrical, with a light background', () => {
  assert.equal(PICTURE.length, 25)
  assert.ok(PICTURE.every(r => r.length === 25 && r === [...r].reverse().join('')))
  const used = new Set(PICTURE.join(''))
  assert.deepEqual([...used].sort(), COLOURS.map(c => c.ch).sort())
})

test("L7: Player 1 gets the numbers and a colour key; Player 2 gets a blank grid and colours, never the numbers", () => {
  const s = level7.create({ rng: seededRng(1) })
  const a = level7.view(s, 'A'), b = level7.view(s, 'B')
  assert.equal(a.grid.length, 625)
  assert.ok(a.grid.every(n => n >= 1 && n <= 6))
  assert.deepEqual(a.key.map(k => k.n), [1, 2, 3, 4, 5, 6])
  assert.ok(a.key.every(k => /^#[0-9a-f]{6}$/.test(k.hex)), 'colours, not colour names')
  assert.equal(b.grid, undefined)
  assert.equal(b.key, undefined)
  assert.ok(b.painted.every(x => x === -1), 'blank to start')
  assert.ok(b.palette.every(p => p.n === undefined), 'no numbers on the palette')
  assert.ok(!/cat|kitty/i.test(JSON.stringify(a) + JSON.stringify(b)))
  // which number is which colour changes from game to game
  const other = level7.view(level7.create({ rng: seededRng(2) }), 'A')
  assert.notDeepEqual(other.key, a.key)
})

test('L7: only Player 2 paints; "cat" and "a cat" only count once the painting is right', () => {
  const s = level7.create({ rng: seededRng(3) })
  const ap = api()
  const target = PICTURE.join('').split('').map(ch => COLOURS.findIndex(c => c.ch === ch))
  assert.deepEqual(level7.action(s, 'A', { type: 'paint', colour: 2, cells: [0] }, ap), {})
  assert.equal(s.painted[0], -1, "Player 1 can't paint")
  // guessing straight away gets "finish it first", whatever is typed
  assert.deepEqual(level7.action(s, 'B', { type: 'answer', text: 'cat' }, ap), { correct: false, notYet: true })
  assert.deepEqual(level7.action(s, 'B', { type: 'answer', text: 'dog' }, ap), { correct: false, notYet: true })
  assert.equal(s.wrong, 0)
  // bad paint is ignored
  level7.action(s, 'B', { type: 'paint', colour: 99, cells: [0] }, ap)
  level7.action(s, 'B', { type: 'paint', colour: 1, cells: [-1, 625, 'x'] }, ap)
  assert.ok(s.painted.every(x => x === -1))
  // paint everything that isn't background (blank squares count as background)
  for (let id = 1; id < COLOURS.length; id++) {
    level7.action(s, 'B', { type: 'paint', colour: id, cells: target.flatMap((t, i) => (t === id ? [i] : [])) }, ap)
  }
  assert.equal(shareRight(s.painted), 1)
  assert.deepEqual(level7.action(s, 'B', { type: 'answer', text: 'dog' }, ap), { correct: false })
  assert.equal(s.wrong, 1)
  assert.deepEqual(level7.action(s, 'B', { type: 'answer', text: 'a cat' }, ap), { correct: true })
  assert.equal(s.done, true)
  level7.dispose(s)
  for (const t of ['cat', 'A Cat!', "It's a cat", 'kitty']) assert.equal(clean(t).length > 0 && ['cat', 'kitty'].includes(clean(t)), true, t)
})
