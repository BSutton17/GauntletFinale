import { test } from 'node:test'
import assert from 'node:assert/strict'
import level6, { SONGS, HINT } from '../src/levels/level6/index.js'
import level7 from '../src/levels/level7/index.js'
import { rasterShape, SIZE } from '../src/levels/level7/pictures.js'
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

test('L7: the hidden shapes are a rabbit and a cat, and fill a sensible share of the picture', () => {
  for (const name of ['rabbit', 'cat']) {
    const m = rasterShape(name)
    const filled = m.flat().filter(Boolean).length
    assert.ok(filled > SIZE * SIZE * 0.2 && filled < SIZE * SIZE * 0.5, `${name}: ${filled} pixels`)
  }
})

test('L7: each player gets only their own picture; both must name theirs', () => {
  const s = level7.create({ rng: seededRng(1) })
  const a = level7.view(s, 'A'), b = level7.view(s, 'B')
  assert.ok(a.image.startsWith('data:image/png;base64,') && b.image.startsWith('data:image/png;base64,'))
  assert.notEqual(a.image, b.image)
  // (the picture data itself is random base64 and may contain any letters, so check everything else)
  const rest = (v) => JSON.stringify({ ...v, image: undefined })
  assert.ok(!/rabbit|bunny|cat/i.test(rest(a) + rest(b)))
  const ap = api()
  assert.equal(level7.action(s, 'A', { type: 'answer', text: 'cat' }, ap).correct, false, "Player 1's is the rabbit")
  assert.equal(level7.action(s, 'A', { type: 'answer', text: "It's a Bunny!" }, ap).correct, true)
  assert.equal(level7.view(s, 'B').partnerSolved, true)
  assert.equal(s.done, false)
  assert.equal(level7.action(s, 'B', { type: 'answer', text: 'kitten' }, ap).correct, true)
  assert.equal(s.done, true)
  level7.dispose(s)
})

test('L7: new static every game', () => {
  const x = level7.create({ rng: seededRng(1) }), y = level7.create({ rng: seededRng(2) })
  assert.notEqual(x.image.A, y.image.A)
})
