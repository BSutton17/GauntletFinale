// Level 10's roads. 20 of them, each built from straights, soft and hard turns and U-turns, ROAD_METRES long.
// A perfect bot (knows the whole road, reacts instantly) must be able to finish every one. The team gets 2:00.
// The road never ENDS on a U-turn: the last bend is something else, then a straight run-in to the finish.
//
// A road is its centre line sampled every SAMPLE metres: [{ x, y, h (direction), s (distance), r (turn radius) }].
import { P, newHorse, step, speedOf, turnRate } from './physics.js'
import { seededRng } from '../rng.js'

export const WIDTH = 7          // metres
export const SAMPLE = 1         // metres between centre-line points
// Every road is this long (the user's pick after playing it: 1,400 m, 1,500 m, then 1,525 m). For scale, a simulated
// rider going 80% of the safe speed and reacting 0.3 s late averages ~11 m/s with the stronger brakes. (The roads
// used to be sized by the PERFECT bot's time, 1:54 -> 1:45, which real riders never got near.)
export const ROAD_METRES = 1550
export const LIMIT_SEC = 120    // 2:00
export const ROAD_COUNT = 20

const SEGMENTS = {
  softL: { r: 55, a: Math.PI / 4 }, softR: { r: 55, a: -Math.PI / 4 },
  hardL: { r: 24, a: Math.PI / 2 }, hardR: { r: 24, a: -Math.PI / 2 },
  uL: { r: 17, a: Math.PI }, uR: { r: 17, a: -Math.PI },
}

// Builds the sample list from a segment plan; `stretch` scales every straight.
export function buildRoad(plan, stretch = 1) {
  const pts = []
  let x = 0, y = 0, h = Math.PI / 2, s = 0
  pts.push({ x, y, h, s, r: Infinity })
  for (const seg of plan) {
    if (seg.type === 'straight') {
      const n = Math.max(1, Math.round((seg.len * stretch) / SAMPLE))
      for (let i = 0; i < n; i++) {
        x += Math.cos(h) * SAMPLE; y += Math.sin(h) * SAMPLE; s += SAMPLE
        pts.push({ x, y, h, s, r: Infinity })
      }
    } else {
      const { r, a } = SEGMENTS[seg.type]
      const n = Math.max(1, Math.round((Math.abs(a) * r) / SAMPLE))
      const da = a / n
      for (let i = 0; i < n; i++) {
        h += da
        x += Math.cos(h) * SAMPLE; y += Math.sin(h) * SAMPLE; s += SAMPLE
        pts.push({ x, y, h, s, r })
      }
    }
  }
  return pts
}

// The road mustn't cross or run alongside itself (you'd be able to see/cut across).
export function selfClear(pts, gap = WIDTH * 3) {
  const cell = gap
  const grid = new Map()
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i]
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (i - j < (gap * 3.2) / SAMPLE) continue // neighbours along the road are fine
        if (Math.hypot(p.x - pts[j].x, p.y - pts[j].y) < gap) return false
      }
    }
    const k = key(p.x, p.y)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  }
  return true
}

// ── where the horse is on the road ───────────────────────────────────────
// Nearest centre-line sample, searching around the last known one. Returns { i, off } (off = metres from centre).
export function locate(pts, x, y, near = 0, back = 6, ahead = 40) {
  let best = near, bestD = Infinity
  for (let i = Math.max(0, near - back); i <= Math.min(pts.length - 1, near + ahead); i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  // distance to the segment either side of the best sample
  let off = Math.sqrt(bestD)
  for (const j of [best - 1, best + 1]) {
    if (j < 0 || j >= pts.length) continue
    const a = pts[Math.min(best, j)], b = pts[Math.max(best, j)]
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    off = Math.min(off, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
  }
  return { i: best, off }
}

// ── the perfect bot ──────────────────────────────────────────────────────
// Steers at a point a little way ahead; brakes early enough for the tightest bend coming up.
function safeSpeed(r) {
  if (!Number.isFinite(r)) return P.vmax
  for (let v = P.vmax; v > 2; v -= 0.25) if (v / Math.max(0.05, turnRate(v)) <= 0.78 * r) return v
  return 2
}

export function botRun(pts, maxSec = 400) {
  const s = newHorse(pts[0].x, pts[0].y, pts[0].h)
  let at = 0
  const limit = maxSec / P.dt
  for (let t = 0; t < limit; t++) {
    const v = speedOf(s)
    const look = Math.min(pts.length - 1, at + Math.round(Math.max(5, v * 0.55) / SAMPLE))
    const target = pts[look]
    const want = Math.atan2(target.y - s.y, target.x - s.x)
    const err = Math.atan2(Math.sin(want - s.h), Math.cos(want - s.h))
    // tightest bend within braking distance (plus a margin)
    const horizon = Math.round((v * v / (2 * P.brake) + 14) / SAMPLE)
    let vAllowed = P.vmax
    for (let i = at; i < Math.min(pts.length, at + horizon); i++) {
      const dist = (i - at) * SAMPLE
      // what speed could we still brake down to by then?
      const reach = Math.sqrt(safeSpeed(pts[i].r) ** 2 + 2 * P.brake * dist)
      vAllowed = Math.min(vAllowed, reach)
    }
    const input = { left: err > 0.02, right: err < -0.02, up: v < vAllowed - 0.2, down: v > vAllowed + 0.2 }
    step(s, input)
    const where = locate(pts, s.x, s.y, at)
    at = where.i
    if (where.off > WIDTH / 2) return { ok: false, sec: t * P.dt, crashedAt: at }
    if (at >= pts.length - 2) return { ok: true, sec: (t + 1) * P.dt }
  }
  return { ok: false, sec: maxSec }
}

// ── making the 20 roads ──────────────────────────────────────────────────
function randomPlan(rng) {
  // every road has at least one of each kind of bend, in a random order
  const bends = rng.shuffle(['softL', 'softR', 'hardL', 'hardR', rng.pick(['uL', 'uR']),
    ...Array.from({ length: rng.range(5, 8) }, () => rng.pick(['softL', 'softR', 'softL', 'softR', 'hardL', 'hardR', 'uL', 'uR']))])
  // the last bend is never a U-turn (the user's rule): swap a U-turn at the end with the last other bend
  const isU = (b) => b === 'uL' || b === 'uR'
  if (isU(bends[bends.length - 1])) {
    const k = bends.map(isU).lastIndexOf(false)
    ;[bends[k], bends[bends.length - 1]] = [bends[bends.length - 1], bends[k]]
  }
  const plan = [{ type: 'straight', len: 40 }]
  bends.forEach((b, i) => {
    plan.push({ type: b })
    // ...and the finish comes after a proper straight run-in
    plan.push({ type: 'straight', len: i === bends.length - 1 ? rng.range(80, 120) : rng.range(25, 110) })
  })
  return plan
}

export function makeRoad(rng) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const plan = randomPlan(rng)
    // scale the straights so the whole road is ROAD_METRES long (the bends keep their shape)
    const bendLen = buildRoad(plan.filter(p => p.type !== 'straight')).at(-1).s
    const straightLen = plan.filter(p => p.type === 'straight').reduce((n, p) => n + p.len, 0)
    const stretch = (ROAD_METRES - bendLen) / straightLen
    if (stretch < 0.45 || stretch > 2) continue
    const pts = buildRoad(plan, stretch)
    if (Math.abs(pts.at(-1).s - ROAD_METRES) > 12 || !selfClear(pts)) continue
    if (!botRun(pts).ok) continue // a perfect rider must be able to finish it
    return pts
  }
  throw new Error('could not build a road')
}

let ROADS = null
// The same 20 roads every time the server starts (seeded), built on first use.
export function roads() {
  if (!ROADS) {
    ROADS = []
    for (let i = 0; ROADS.length < ROAD_COUNT; i++) ROADS.push(makeRoad(seededRng(9000 + i)))
  }
  return ROADS
}
