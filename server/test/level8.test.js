import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skullPosition, targetFor, isSolved, generate, adjacent, SOLVED } from '../src/levels/level8/mysticSquare.js'
import level8 from '../src/levels/level8/index.js'
import { seededRng } from '../src/levels/rng.js'

// 4 1 2
// 7 5 3
// _ 8 6        (empty bottom-left, 5 in the middle)
const L = [4, 1, 2, 7, 5, 3, 0, 8, 6]

test('skull, worked by hand: clock ends in 3 -> 3 is on the cross -> ROW 5', () => {
  // row 5 = 3 2 6 8 4 5 7 1, starting from the empty space (position 6):
  // 3,2,6 not next to it; 8 is (-> pos 7); 4 no; 5 is (-> pos 4); 7 is (-> pos 3); 1 no. Skull at position 3.
  assert.equal(skullPosition(L, 3), 3)
})

test('skull, worked by hand: clock ends in 9 -> not on the cross -> COLUMN 5', () => {
  // column 5 = 6 8 7 3 4 5 1 2: 8 (-> 7), 5 (-> 4), 1 (-> 1), 2 (-> 2). Skull at position 2.
  assert.equal(skullPosition(L, 9), 2)
})

test('skull: empty middle means under the 7', () => {
  assert.equal(skullPosition([1, 2, 3, 4, 0, 5, 6, 7, 8], 4), 7)
})

test('target constellation from the row/column sums (row 2 and column 2 largest)', () => {
  // rows 7,15,14 -> R2 ; columns 11,14,11 -> C2
  assert.equal(targetFor(L), '???3?2?4?')
  assert.ok(isSolved([9, 9, 9, 3, 0, 2, 9, 4, 9].map(v => (v === 9 ? 1 : v)), '???3?2?4?'))
  assert.ok(isSolved(SOLVED, '???3?2?4?'), '1-8 is always fine')
})

test('generated squares are solvable, start unsolved, and hide knight and skull apart from the space', () => {
  for (let s = 1; s <= 200; s++) {
    const g = generate(seededRng(s))
    assert.match(g.time, /^(8|9|10|11):[0-5]\d PM$/)
    assert.notEqual(g.skull, g.knight)
    assert.notEqual(g.layout[g.skull], 0)
    assert.notEqual(g.layout[g.knight], 0)
    assert.ok(!isSolved(g.layout, g.target))
    // solvable: permutation parity matches the solved square (8-puzzle rule)
    const tiles = g.layout.filter(v => v)
    let inv = 0
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (tiles[i] > tiles[j]) inv++
    assert.equal(inv % 2, 0)
  }
})

test('views: only Player 1 gets the square, and never sees where the knight or skull are', () => {
  const s = level8.create({ rng: seededRng(4) })
  const a = level8.view(s, 'A'), b = level8.view(s, 'B')
  assert.ok(a.layout && a.time)
  assert.equal(b.layout, undefined)
  assert.equal(a.revealed.length, 1, 'only the starting space')
  assert.ok(!JSON.stringify(a).includes('skull'))
  assert.equal(a.knight, undefined)
})

test('uncovering the skull before the knight is a strike and a new square; after the knight it is safe', () => {
  const rng = seededRng(9)
  const s = level8.create({ rng })
  const ap = { rng, update() {}, complete() {} }
  // force a known situation: skull next to the space, knight elsewhere
  const empty = s.layout.indexOf(0)
  const nb = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(p => adjacent(p, empty))
  s.skull = nb[0]; s.knight = nb[1] ?? [0, 1, 2, 3, 4, 5, 6, 7, 8].find(p => p !== empty && p !== nb[0])
  const before = s.version
  assert.deepEqual(level8.action(s, 'A', { type: 'slide', tile: s.layout[s.skull] }, ap), { strike: true })
  assert.equal(s.strikes, 1)
  assert.equal(s.version, before + 1)
  // knight first, then the skull is harmless
  const e2 = s.layout.indexOf(0)
  const nb2 = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(p => adjacent(p, e2))
  s.knight = nb2[0]; s.skull = nb2[1]
  level8.action(s, 'A', { type: 'slide', tile: s.layout[s.knight] }, ap)
  assert.equal(s.knightFound, true)
  assert.ok(level8.view(s, 'A').revealed.some(r => r.what === 'knight'))
  // slide back so the skull's space is next to the gap again, then uncover it: no strike
  level8.action(s, 'A', { type: 'slide', tile: s.layout[e2] }, ap)
  const r = level8.action(s, 'A', { type: 'slide', tile: s.layout[s.skull] }, ap)
  assert.notDeepEqual(r, { strike: true })
  assert.equal(s.strikes, 1)
  level8.dispose(s)
})

test('sliding a tile that is not next to the space does nothing; only Player 1 slides', () => {
  const rng = seededRng(2)
  const s = level8.create({ rng })
  const ap = { rng, update() {}, complete() {} }
  const empty = s.layout.indexOf(0)
  const far = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(p => p !== empty && !adjacent(p, empty))
  const snap = s.layout.join()
  level8.action(s, 'A', { type: 'slide', tile: s.layout[far] }, ap)
  level8.action(s, 'B', { type: 'slide', tile: s.layout[[0, 1, 2, 3, 4, 5, 6, 7, 8].find(p => adjacent(p, empty))] }, ap)
  assert.equal(s.layout.join(), snap)
})
