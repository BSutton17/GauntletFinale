import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDots, segDist, W, H, JUMP_DOTS, LIMITS } from '../src/levels/level5/dots.js'
import level5 from '../src/levels/level5/index.js'
import { seededRng } from '../src/levels/rng.js'

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

test('layouts: 50 dots, close neighbours, three long jumps, clear lines between neighbours', () => {
  for (let s = 1; s <= 150; s++) {
    const d = generateDots(seededRng(s))
    assert.equal(d.length, 50)
    for (const p of d) assert.ok(p.x >= 5 && p.x <= W - 5 && p.y >= 5 && p.y <= H - 5)
    for (let i = 0; i < 50; i++) for (let j = i + 1; j < 50; j++) assert.ok(dist(d[i], d[j]) >= LIMITS.MIN_SPACING - 0.2, `seed ${s}: dots ${i + 1} and ${j + 1} crowd`)
    for (let n = 2; n <= 50; n++) {
      const step = dist(d[n - 2], d[n - 1])
      if (JUMP_DOTS.has(n)) assert.ok(step >= LIMITS.JUMP_MIN - 0.2, `seed ${s}: ${n - 1}->${n} should be far (${step.toFixed(1)})`)
      else assert.ok(step <= LIMITS.STEP[1] + 0.2, `seed ${s}: ${n - 1}->${n} too far (${step.toFixed(1)})`)
      // the straight line from n-1 to n stays clear of every other dot
      for (let k = 0; k < 50; k++) {
        if (k === n - 2 || k === n - 1) continue
        assert.ok(segDist(d[k], d[n - 2], d[n - 1]) >= LIMITS.CLEARANCE - 0.2, `seed ${s}: line ${n - 1}->${n} brushes dot ${k + 1}`)
      }
    }
  }
})

test('Player 1 never gets the order; Player 2 does', () => {
  const s = level5.create({ rng: seededRng(2) })
  const a = level5.view(s, 'A'), b = level5.view(s, 'B')
  assert.equal(a.dots.length, 50)
  assert.ok(a.dots.every(d => d.n === undefined && typeof d.id === 'string'))
  const order = s.dots.map(d => d.id)
  assert.notDeepEqual(a.dots.map(d => d.id), order, 'shuffled')
  assert.ok(b.dots.every((d, i) => d.n === i + 1 && d.id === undefined))
})

test('right dots advance, a wrong dot scatters everything, old ids are ignored, all 50 wins', () => {
  const rng = seededRng(3)
  const s = level5.create({ rng })
  const ap = { rng, completed: 0, update() {}, complete() { this.completed++ } }
  level5.action(s, 'A', { type: 'touch', id: s.dots[0].id }, ap)
  level5.action(s, 'A', { type: 'touch', id: s.dots[1].id }, ap)
  level5.action(s, 'A', { type: 'touch', id: s.dots[0].id }, ap) // already joined: ignored
  assert.equal(s.visited, 2)
  assert.deepEqual(level5.view(s, 'A').visited, [s.dots[0].id, s.dots[1].id])
  const old = s.dots.map(d => d.id)
  assert.deepEqual(level5.action(s, 'A', { type: 'touch', id: s.dots[10].id }, ap), { ok: false })
  assert.equal(s.visited, 0)
  assert.equal(s.wrong, 1)
  assert.equal(s.version, 2)
  assert.deepEqual(level5.action(s, 'A', { type: 'touch', id: old[0] }, ap), {}, 'a dot from the old layout')
  assert.equal(level5.action(s, 'B', { type: 'touch', id: s.dots[0].id }, ap).ok, undefined, 'only Player 1 draws')
  for (const d of s.dots) level5.action(s, 'A', { type: 'touch', id: d.id }, ap)
  assert.equal(s.done, true)
  level5.dispose(s)
})
