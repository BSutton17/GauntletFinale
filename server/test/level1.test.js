import { test } from 'node:test'
import assert from 'node:assert/strict'
import level1, { decode, normalize } from '../src/levels/level1.js'
import { seededRng } from '../src/levels/rng.js'

test('the shifts decode the letters back to the answer, for many seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = level1.create({ rng: seededRng(seed) })
    assert.equal(decode(s.cipher, s.shifts), 'TILEINTHETOPRIGHT')
    assert.ok(s.shifts.every(x => x.n >= 1 && x.n <= 6 && (x.dir === 'L' || x.dir === 'R')))
  }
})

test('each role only sees its half', () => {
  const s = level1.create({ rng: seededRng(7) })
  const a = JSON.stringify(level1.view(s, 'A'))
  const b = JSON.stringify(level1.view(s, 'B'))
  assert.ok(!a.includes('shifts') && !a.includes('TILE'))
  assert.ok(!b.includes('letters') && !b.includes('TILE'))
})

test('guessing', () => {
  const s = level1.create({ rng: seededRng(3) })
  let done = 0, updates = 0
  const api = { complete: () => done++, update: () => updates++ }
  level1.action(s, 'B', { type: 'guess', text: 'tile in the top right' }, api)
  assert.equal(done, 0, 'only Player A has the answer box')
  level1.action(s, 'A', { type: 'guess', text: 'tile in the top left' }, api)
  assert.equal(s.wrong, 1)
  level1.action(s, 'A', { type: 'guess', text: '  Tile in the TOP right!' }, api)
  assert.equal(done, 1)
  assert.equal(normalize('a-b c'), 'ABC')
})
