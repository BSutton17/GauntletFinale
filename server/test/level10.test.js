import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roads, botRun, selfClear, WIDTH, ROAD_METRES, LIMIT_SEC } from '../src/levels/level10/roads.js'
import level10, { LANTERN, OFFER_EVERY } from '../src/levels/level10/index.js'
import { seededRng } from '../src/levels/rng.js'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
function fakeApi(rng) {
  const a = { rng, updates: 0, completed: 0, streams: { A: [], B: [] } }
  a.update = () => a.updates++
  a.complete = () => a.completed++
  a.emit = (role, event, data) => a.streams[role].push(data)
  return a
}

test('20 roads, each 1,525 m; a perfect bot finishes every one well inside 2:00; every kind of bend', () => {
  const R = roads()
  assert.equal(R.length, 20)
  for (const [i, pts] of R.entries()) {
    const run = botRun(pts)
    assert.ok(run.ok, `road ${i}: the perfect bot crashed`)
    assert.ok(Math.abs(pts.at(-1).s - ROAD_METRES) <= 12, `road ${i}: ${Math.round(pts.at(-1).s)} m`)
    assert.ok(run.sec < LIMIT_SEC, `road ${i}: ${run.sec.toFixed(1)}s`)
    assert.ok(selfClear(pts), `road ${i} runs into itself`)
    const radii = new Set(pts.filter(p => Number.isFinite(p.r)).map(p => p.r))
    assert.deepEqual([...radii].sort((a, b) => a - b), [17, 24, 55], `road ${i}: U-turns, hard and soft turns`)
    // never ends on a U-turn: the last bend isn't one, and there's a straight run-in to the finish
    let k = pts.length - 1
    while (k > 0 && !Number.isFinite(pts[k].r)) k--
    assert.notEqual(pts[k].r, 17, `road ${i} ends on a U-turn`)
    assert.ok(pts.at(-1).s - pts[k].s >= 50, `road ${i}: only ${Math.round(pts.at(-1).s - pts[k].s)} m of straight before the finish`)
  }
})

test("only Player 2 gets the map; Player 1's live updates carry just the lantern's bit of road", async () => {
  const rng = seededRng(1)
  const s = level10.create({ rng })
  assert.ok(level10.view(s, 'B').road.length > 500)
  assert.equal(level10.view(s, 'A').road, undefined)
  const ap = fakeApi(rng)
  level10.start(s, ap)
  await wait(120)
  level10.dispose(s)
  const last = ap.streams.A.at(-1)
  assert.ok(last.road.length > 0 && last.road.length < 20)
  for (const [x, y] of last.road) assert.ok(Math.hypot(x - last.x, y - last.y) <= LANTERN + WIDTH / 2 + 0.01)
  assert.equal(ap.streams.B.at(-1).road, undefined)
  assert.equal(typeof ap.streams.B.at(-1).dark, 'boolean')
})

test('leaving the road crashes; retry gives a different road; only Player 1 steers', async () => {
  const rng = seededRng(2)
  const s = level10.create({ rng })
  const ap = fakeApi(rng)
  const firstRoad = s.roadIdx
  s.goAt = Date.now() - 1
  level10.action(s, 'B', { type: 'input', up: true }, ap)
  assert.equal(s.input.up, false, "Player 2 can't ride")
  level10.start(s, ap)
  await wait(80)
  s.horse.x += WIDTH * 3 // shove it off the road
  await wait(80)
  assert.equal(s.status, 'crashed')
  level10.action(s, 'A', { type: 'retry' }, ap)
  assert.equal(s.status, 'countdown')
  assert.notEqual(s.roadIdx, firstRoad)
  level10.dispose(s)
})

test('running out of time is a crash too', async () => {
  const rng = seededRng(3)
  const s = level10.create({ rng })
  const ap = fakeApi(rng)
  s.goAt = Date.now() - 1
  s.endsAt = Date.now() + 60
  level10.start(s, ap)
  await wait(160)
  assert.equal(s.status, 'timeout')
  level10.dispose(s)
})

test('reaching the finish shows the crash screen and then moves on to the story (no retry)', async () => {
  const rng = seededRng(4)
  const s = level10.create({ rng })
  const ap = fakeApi(rng)
  s.goAt = Date.now() - 1
  const end = s.pts[s.pts.length - 1]
  s.horse.x = end.x; s.horse.y = end.y
  s.at = s.pts.length - 3
  level10.start(s, ap)
  await wait(80)
  assert.equal(s.status, 'finished')
  level10.action(s, 'A', { type: 'retry' }, ap)
  assert.equal(s.status, 'finished', 'no retry after the finish')
  assert.ok(s.finishTimer)
  level10.dispose(s)
})

test('past halfway the five guards ride ON THE ROAD behind the horse, closing in', async () => {
  const { locate } = await import('../src/levels/level10/roads.js')
  const rng = seededRng(7)
  const s = level10.create({ rng })
  const ap = fakeApi(rng)
  s.goAt = Date.now() - 1
  level10.start(s, ap)
  const sample = async (fraction) => {
    const at = Math.round((s.pts.length - 1) * fraction)
    const p = s.pts[at]
    Object.assign(s.horse, { x: p.x, y: p.y, h: p.h, vx: 0, vy: 0 }); s.at = at
    await wait(70)
    return ap.streams.B.at(-1)
  }
  assert.equal((await sample(0.3)).guards, null, 'nobody chasing before halfway')
  const start = await sample(0.51), mid = await sample(0.75), late = await sample(0.97)
  assert.equal(start.guards.length, 5, 'all five appear together at halfway')
  assert.equal(late.guards.length, 5)
  for (const [x, y] of late.guards) {
    const where = locate(s.pts, x, y, 0, 0, s.pts.length)
    assert.ok(where.off <= WIDTH / 2, `guard ${where.off.toFixed(2)} m from the centre line: off the road`)
    assert.ok(where.i < s.at, 'guards are behind the horse')
  }
  const gapOf = (snap) => Math.hypot(snap.guards[0][0] - snap.x, snap.guards[0][1] - snap.y)
  assert.ok(gapOf(late) < gapOf(mid) && gapOf(mid) < gapOf(start), 'they get closer')
  // slow to gain at first: less ground made up in the first half of the chase than in the second
  assert.ok(gapOf(start) - gapOf(mid) < gapOf(mid) - gapOf(late), 'they gain slowly, then faster')
  assert.deepEqual(ap.streams.A.at(-1).guards, late.guards, 'both players see the same guards')
  level10.dispose(s)
})

test('every 20th failure in a row offers to switch sides; both must agree; a no waits for the next 20', async () => {
  const rng = seededRng(5)
  const s = level10.create({ rng })
  const ap = fakeApi(rng)
  ap.switches = 0
  ap.switchSides = () => ap.switches++
  level10.start(s, ap)
  const crash = async () => {
    s.goAt = Date.now() - 1
    await wait(50)
    s.horse.x += WIDTH * 3
    await wait(50)
    assert.equal(s.status, 'crashed')
  }
  const retry = () => level10.action(s, 'A', { type: 'retry' }, ap)

  for (let i = 1; i < OFFER_EVERY; i++) { await crash(); assert.equal(level10.view(s, 'A').offer, undefined); retry() }
  await crash() // the 20th
  assert.deepEqual(level10.view(s, 'A').offer, { mine: null, theirs: null })
  retry()
  assert.equal(s.status, 'crashed', 'no new ride until the offer is answered')
  level10.action(s, 'A', { type: 'switchVote', yes: true }, ap)
  assert.deepEqual(level10.view(s, 'B').offer, { mine: null, theirs: true })
  assert.equal(ap.switches, 0, 'one yes is not enough')
  level10.action(s, 'B', { type: 'switchVote', yes: true }, ap)
  assert.equal(ap.switches, 1)
  assert.equal(level10.view(s, 'A').offer, undefined)
  retry()
  assert.equal(s.status, 'countdown')

  for (let i = 1; i < OFFER_EVERY; i++) { await crash(); assert.equal(level10.view(s, 'B').offer, undefined); retry() }
  await crash() // the 40th
  assert.ok(level10.view(s, 'B').offer, 'asked again after the next 20')
  level10.action(s, 'B', { type: 'switchVote', yes: false }, ap)
  assert.equal(level10.view(s, 'A').offer, undefined, 'a no closes it')
  assert.equal(ap.switches, 1)
  retry()
  assert.equal(s.status, 'countdown')
  level10.dispose(s)
})
