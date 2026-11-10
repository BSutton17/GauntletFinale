import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateMaze, W, HALF, MID_I, ENTRY_I, DIRS, idx, rc } from '../src/levels/level9/maze.js'
import level9 from '../src/levels/level9/index.js'
import { seededRng } from '../src/levels/rng.js'

const dirTo = (from, to) => {
  const a = rc(from), b = rc(to)
  return Object.entries(DIRS).find(([, d]) => a.r + d.dr === b.r && a.c + d.dc === b.c)[0]
}
const api = (rng) => ({ rng, updates: 0, completed: 0, update() { this.updates++ }, complete() { this.completed++ } })
const step = (s, role, dir, ap) => { s.lastStep[role] = 0; return level9.action(s, role, { type: 'move', dir }, ap) }

test('the halves only connect through the meeting square', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = generateMaze(seededRng(seed))
    for (let c = 0; c < W; c++) {
      const top = idx(HALF - 1, c), bottom = idx(HALF, c)
      const open = (m.walls[top] & DIRS.down.bit) !== 0
      assert.equal(open, top === MID_I && bottom === ENTRY_I, `seed ${seed}: column ${c}`)
    }
  }
})

test('every maze is completable: bots walk both planned routes through the real rules', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = seededRng(seed)
    const s = level9.create({ rng })
    const ap = api(rng)
    const m = { routes: null }
    // the planned routes aren't kept in the state (they're only for the timer), so rebuild them from the same seed
    m.routes = generateMaze(seededRng(seed)).routes
    for (const role of ['A', 'B']) {
      const route = m.routes[role]
      assert.equal(route[0], s.pos[role])
      for (let k = 1; k < route.length; k++) {
        const r = step(s, role, dirTo(route[k - 1], route[k]), ap)
        assert.equal(r.ok, true, `seed ${seed}: ${role} blocked at step ${k} (${r.why})`)
      }
      assert.equal(s.inv[role].items.length, 3, `seed ${seed}: ${role} has all three items`)
      assert.equal(s.inv[role].keys.length, 3)
    }
    assert.equal(s.done, true, `seed ${seed}: both on the middle square with everything`)
    level9.dispose(s)
  }
})

test('timers come from the bots, on 15-second steps, in a sensible range', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const m = generateMaze(seededRng(seed))
    assert.equal(m.timerSec % 15, 0)
    assert.ok(m.timerSec >= 120 && m.timerSec <= 480, `${m.timerSec}`)
    assert.ok(m.timerSec >= m.botSeconds, 'the timer gives at least the bots\' time')
  }
})

test("a player never sees their own half or their own position (except on the meeting square)", () => {
  const s = level9.create({ rng: seededRng(3) })
  for (const role of ['A', 'B']) {
    const v = level9.view(s, role)
    for (const [r, c] of v.cells) {
      const i = idx(r, c)
      assert.ok(i === MID_I || (role === 'A' ? r >= HALF : r < HALF), `${role} sees own square ${r},${c}`)
    }
    const other = role === 'A' ? 'B' : 'A'
    assert.deepEqual(v.partner, rc(s.pos[other]))
    assert.equal(v.pos, undefined)
    assert.equal(v.dev, undefined, 'the dev peek is never sent outside dev mode')
    assert.ok(!JSON.stringify(v).includes('route'))
    assert.ok(level9.view(s, role, { devMode: true }).dev.cells.length === 1250)
  }
  level9.dispose(s)
})

test('walls block, gates need their key, you cannot cross into the other side', () => {
  const rng = seededRng(5)
  const s = level9.create({ rng })
  const ap = api(rng)
  const from = s.pos.A
  const blocked = Object.keys(DIRS).find(d => !(s.walls[from] & DIRS[d].bit))
  assert.equal(step(s, 'A', blocked, ap).ok, false)
  // put Player 1 next to one of their gates without the key
  const [gateCell, gate] = [...s.things].find(([, t]) => t.kind === 'gate' && t.side === 'A')
  const g = rc(gateCell)
  const near = Object.entries(DIRS).map(([name, d]) => ({ name, d, i: idx(g.r - d.dr, g.c - d.dc) }))
    .find(({ d, i }) => s.walls[i] & d.bit)
  s.pos.A = near.i
  const r = step(s, 'A', near.name, ap)
  assert.deepEqual(r, { ok: false, why: 'locked', color: gate.color })
  s.inv.A.keys.push(gate.color)
  assert.equal(step(s, 'A', near.name, ap).ok, true)
  assert.equal(s.things.get(gateCell).open, true)
  // Player 2 on the meeting square can't walk on into Player 1's side
  s.pos.B = MID_I
  for (const d of ['up', 'left', 'right']) if (s.walls[MID_I] & DIRS[d].bit) assert.equal(step(s, 'B', d, ap).ok, false)
  level9.dispose(s)
})

test('running out of time fails the maze; trying again builds a brand-new one', async () => {
  const rng = seededRng(6)
  const s = level9.create({ rng })
  const ap = api(rng)
  s.timerSec = 0.05
  level9.start(s, ap)
  await new Promise(r => setTimeout(r, 120))
  assert.equal(s.failed, true)
  assert.equal(step(s, 'A', 'right', ap).ok, undefined, 'no moving after failing')
  const before = Buffer.from(s.walls).toString('base64')
  level9.action(s, 'B', { type: 'restart' }, ap)
  assert.equal(s.failed, false)
  assert.equal(s.version, 2)
  assert.notEqual(Buffer.from(s.walls).toString('base64'), before)
  assert.ok(s.endsAt > Date.now() + 60_000)
  level9.dispose(s)
})
