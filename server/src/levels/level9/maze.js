// Level 9's maze: 50 x 50, split in two. Player 1 owns the top half (starts top-left), Player 2 the bottom half
// (starts bottom-right). The ONLY way between the halves is the meeting square in the middle.
//
// Each half is its own random maze (Kruskal: lots of branches, no huge single corridor). On each side:
//   3 gated areas, each holding one item (lantern, reins or saddle);
//   3 keys, chained: key 1 lies in the open, key 2 behind gate 1, key 3 behind gate 2.
// So a side is: key 1 -> gate 1 (item + key 2) -> gate 2 (item + key 3) -> gate 3 (item) -> the meeting square.
//
// The timer is a fixed 6:30. BOTS walk each player's actual route with human delays (see estimateSeconds) and
// any maze they can't finish in time is rejected.

export const W = 50
export const H = 50
export const HALF = 25
export const MID = { r: 24, c: 24 }    // the meeting square (bottom row of the top half)
export const ENTRY = { r: 25, c: 24 }  // the square below it, where Player 2 comes in
export const START = { A: { r: 0, c: 0 }, B: { r: 49, c: 49 } }
export const COLORS = ['red', 'blue', 'green']
export const ITEMS = ['lantern', 'reins', 'saddle']

const N = 1, E = 2, S = 4, Wb = 8
export const DIRS = {
  up: { dr: -1, dc: 0, bit: N, back: S },
  right: { dr: 0, dc: 1, bit: E, back: Wb },
  down: { dr: 1, dc: 0, bit: S, back: N },
  left: { dr: 0, dc: -1, bit: Wb, back: E },
}
export const idx = (r, c) => r * W + c
export const rc = (i) => ({ r: Math.floor(i / W), c: i % W })
export const halfOf = (r) => (r < HALF ? 'A' : 'B')
export const MID_I = idx(MID.r, MID.c)
export const ENTRY_I = idx(ENTRY.r, ENTRY.c)

// ── bots: how long would two real people take on this route? ─────────────
// Blind, being talked through it: slow steps, a pause at every turn while the partner says which way, a short
// one at every junction passed ("keep going straight"), and a moment for each pick-up and gate.
export const BOT = { stepSec: 1 / 3, turnSec: 1.3, junctionSec: 0.5, pickupSec: 1.5, gateSec: 1.0, overlap: 0.4, margin: 1.1 }

export function estimateSeconds(walls, pathA, pathB, eventsA, eventsB) {
  const one = (path, events) => {
    let t = (path.length - 1) * BOT.stepSec + events.pickups * BOT.pickupSec + events.gates * BOT.gateSec
    for (let k = 1; k < path.length - 1; k++) {
      const a = path[k - 1], b = path[k], c = path[k + 1]
      if (b - a !== c - b) t += BOT.turnSec
      else if (openCount(walls[b]) >= 3) t += BOT.junctionSec
    }
    return t
  }
  const ta = one(pathA, eventsA), tb = one(pathB, eventsB)
  // They play at the same time, but each is also guiding the other, so it doesn't fully overlap.
  return Math.max(ta, tb) + BOT.overlap * Math.min(ta, tb)
}

// The user set the clock: 6:30 for every maze. A maze the bots can't finish in that time (with their margin)
// is thrown away and another is made.
export const TIMER_SEC = 390
const fitsTimer = (seconds) => seconds * BOT.margin <= TIMER_SEC

// Knobs for laying out each half (exported so tests and tuning scripts can read them).
export const TUNE = {
  // How long each player's route should be, in squares. The bots turn this into time.
  ROUTE_TARGET: 120,
  SUB_MIN: 10, SUB_MAX: 60,     // size of each gated area
  NEAR_MAIN: 20,                // gated areas branch off within this many squares of the main path (9 bunched them up)
  ITEM_SPREAD: 22,              // the user asked twice for the items to be spread out: at least this far apart (squares, as the crow flies; was 14)
  KEY1_MIN_DEPTH: 10,
  KEY1_MAX_DEPTH: 30,
  MAIN_MAX: 70,                 // corner to middle, in squares (median for a random maze is ~83)
}

const openCount = (w) => (w & 1) + ((w >> 1) & 1) + ((w >> 2) & 1) + ((w >> 3) & 1)

// ── one half ─────────────────────────────────────────────────────────────
function carveHalf(rng, walls, rowLo, rowHi) {
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  const edges = []
  for (let r = rowLo; r <= rowHi; r++) for (let c = 0; c < W; c++) {
    parent.set(idx(r, c), idx(r, c))
    if (c + 1 < W) edges.push([idx(r, c), idx(r, c + 1), 'right'])
    if (r + 1 <= rowHi) edges.push([idx(r, c), idx(r + 1, c), 'down'])
  }
  for (const [a, b, dir] of rng.shuffle(edges)) {
    const ra = find(a), rb = find(b)
    if (ra === rb) continue
    parent.set(ra, rb)
    walls[a] |= DIRS[dir].bit
    walls[b] |= DIRS[dir].back
  }
}

function neighbours(walls, i) {
  const { r, c } = rc(i)
  const out = []
  for (const d of Object.values(DIRS)) {
    if (!(walls[i] & d.bit)) continue
    const j = idx(r + d.dr, c + d.dc)
    if (halfOf(rc(j).r) !== halfOf(r)) continue // the middle link isn't part of either half's tree
    out.push(j)
  }
  return out
}

// The half as a tree rooted at the start: parent, depth, and DFS in/out times (for "is x inside y's subtree").
function tree(walls, root) {
  const parent = new Map([[root, -1]]), depth = new Map([[root, 0]]), tin = new Map(), tout = new Map(), size = new Map()
  let t = 0
  const stack = [[root, 0]]
  const order = []
  while (stack.length) {
    const top = stack[stack.length - 1]
    const [v, k] = top
    if (k === 0) { tin.set(v, t++); order.push(v) }
    const kids = neighbours(walls, v).filter(u => u !== parent.get(v))
    if (k < kids.length) {
      top[1]++
      const u = kids[k]
      parent.set(u, v); depth.set(u, depth.get(v) + 1)
      stack.push([u, 0])
    } else {
      tout.set(v, t++)
      size.set(v, 1 + kids.reduce((n, u) => n + size.get(u), 0))
      stack.pop()
    }
  }
  return { parent, depth, tin, tout, size, order }
}

const inside = (T, x, root) => T.tin.get(root) <= T.tin.get(x) && T.tout.get(x) <= T.tout.get(root)

function pathBetween(T, a, b) {
  const up = [], down = []
  let x = a, y = b
  while (T.depth.get(x) > T.depth.get(y)) { up.push(x); x = T.parent.get(x) }
  while (T.depth.get(y) > T.depth.get(x)) { down.push(y); y = T.parent.get(y) }
  while (x !== y) { up.push(x); down.push(y); x = T.parent.get(x); y = T.parent.get(y) }
  return [...up, x, ...down.reverse()]
}

// Gates, keys and items for one half. Returns null if this layout can't be made to work.
function furnish(rng, walls, start, target) {
  const T = tree(walls, start)
  const main = new Set(pathBetween(T, start, target))
  const distToMain = (v) => { let n = 0; while (!main.has(v)) { v = T.parent.get(v); n++ } return n }
  const candidates = T.order.filter(v => !main.has(v) && T.size.get(v) >= TUNE.SUB_MIN && T.size.get(v) <= TUNE.SUB_MAX && distToMain(v) <= TUNE.NEAR_MAIN)
  if (candidates.length < 3) return null

  let best = null
  for (let tries = 0; tries < 150; tries++) {
    const gates = []
    for (const g of rng.shuffle(candidates)) {
      if (gates.every(h => !inside(T, g, h) && !inside(T, h, g))) gates.push(g)
      if (gates.length === 3) break
    }
    if (gates.length < 3) continue
    const cellsIn = (g) => T.order.filter(v => v !== g && inside(T, v, g))
    const deep = (g) => {
      const cs = cellsIn(g)
      const maxD = Math.max(...cs.map(v => T.depth.get(v)))
      const lo = T.depth.get(g) + 0.5 * (maxD - T.depth.get(g))
      return cs.filter(v => T.depth.get(v) >= lo)
    }
    const items = gates.map(g => rng.pick(deep(g)))
    const apart = (a, b) => { const x = rc(a), y = rc(b); return Math.abs(x.r - y.r) + Math.abs(x.c - y.c) }
    if (apart(items[0], items[1]) < TUNE.ITEM_SPREAD || apart(items[0], items[2]) < TUNE.ITEM_SPREAD || apart(items[1], items[2]) < TUNE.ITEM_SPREAD) continue
    const key2 = rng.pick(cellsIn(gates[0]).filter(v => v !== items[0]))
    const key3 = rng.pick(cellsIn(gates[1]).filter(v => v !== items[1]))
    const open = T.order.filter(v => v !== start && v !== target && !gates.some(g => inside(T, v, g)) && T.depth.get(v) >= TUNE.KEY1_MIN_DEPTH && T.depth.get(v) <= TUNE.KEY1_MAX_DEPTH)
    if (!open.length || key2 === undefined || key3 === undefined) continue
    const key1 = rng.pick(open)

    // The route: start -> key1 -> {item1, key2} -> {item2, key3} -> item3 -> target, best order inside each area.
    const leg = (a, b) => pathBetween(T, a, b)
    const join = (...stops) => stops.slice(1).reduce((p, s, i) => p.concat(leg(stops[i], s).slice(1)), [stops[0]])
    const routes = [
      join(start, key1, items[0], key2, items[1], key3, items[2], target),
      join(start, key1, key2, items[0], items[1], key3, items[2], target),
      join(start, key1, items[0], key2, key3, items[1], items[2], target),
      join(start, key1, key2, items[0], key3, items[1], items[2], target),
    ]
    const route = routes.reduce((a, b) => (b.length < a.length ? b : a))
    const score = Math.abs(route.length - TUNE.ROUTE_TARGET)
    if (!best || score < best.score) best = { score, gates, items, keys: [key1, key2, key3], route }
  }
  return best
}

// Squares from a start corner to the middle, within its half.
function walkLength(walls, from, to) {
  const d = new Map([[from, 0]])
  const q = [from]
  for (let h = 0; h < q.length; h++) {
    const v = q[h]
    if (v === to) return d.get(v)
    for (const u of neighbours(walls, v)) if (!d.has(u)) { d.set(u, d.get(v) + 1); q.push(u) }
  }
  return Infinity
}

export function generateMaze(rng) {
  for (let attempt = 0; attempt < 3000; attempt++) {
    const walls = new Uint8Array(W * H)
    carveHalf(rng, walls, 0, HALF - 1)
    carveHalf(rng, walls, HALF, H - 1)
    // Keep only mazes where both corner-to-middle walks are fairly direct (the bots' timer depends on it).
    if (walkLength(walls, idx(START.A.r, START.A.c), MID_I) > TUNE.MAIN_MAX) continue
    if (walkLength(walls, idx(START.B.r, START.B.c), ENTRY_I) > TUNE.MAIN_MAX) continue
    const a = furnish(rng, walls, idx(START.A.r, START.A.c), MID_I)
    const b = furnish(rng, walls, idx(START.B.r, START.B.c), ENTRY_I)
    if (!a || !b) continue
    // the one link between the halves
    walls[MID_I] |= S
    walls[ENTRY_I] |= N
    const routeB = [...b.route, MID_I]

    const things = new Map()
    for (const [side, f] of [['A', a], ['B', b]]) {
      const colors = rng.shuffle(COLORS)
      const items = rng.shuffle(ITEMS)
      f.gates.forEach((g, k) => things.set(g, { kind: 'gate', color: colors[k], side }))
      f.keys.forEach((kc, k) => things.set(kc, { kind: 'key', color: colors[k], side }))
      f.items.forEach((ic, k) => things.set(ic, { kind: 'item', item: items[k], side }))
    }
    const events = { pickups: 6, gates: 3 }
    const seconds = estimateSeconds(walls, a.route, routeB, events, events)
    if (!fitsTimer(seconds)) continue
    return { walls, things, routes: { A: a.route, B: routeB }, botSeconds: Math.round(seconds), timerSec: TIMER_SEC }
  }
  throw new Error('could not build the maze')
}
