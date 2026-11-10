// Level 10: the night ride.
//   Player 1 rides the horse (W/S/A/D or the on-screen arrows) but only sees a TINY circle of lantern light.
//   Player 2 has the map of the whole road (lantern-orange, turning with the horse) and talks them through it.
//   Every 5 seconds there's a 10% chance Player 2's lantern flickers out for 2.5 seconds.
// Leave the road -> "You Crashed", try again on a different road. Out of time (2:00) -> "You Crashed" too.
// Reaching the finish ALSO shows "You Crashed" (no retry button): that's the twist into the King's story.
// Past halfway, five red arrows (the guards on horseback) slowly rise from the bottom of both screens.
//
// ⚠️ The server runs the horse. Player 1's browser only ever gets the bit of road inside the lantern.
import { roads, locate, WIDTH, LIMIT_SEC, ROAD_COUNT, SAMPLE } from './roads.js'
import { newHorse, step, speedOf } from './physics.js'

export const LANTERN = 4.2      // metres of light around Player 1 (the user wanted it tiny)
const TICK_MS = 1000 / 30
const COUNTDOWN_MS = 3000
const FLICKER_EVERY_MS = 5000
const FLICKER_CHANCE = 0.1
const FLICKER_MS = 2500
const FINISH_HOLD_MS = 4000     // "You Crashed" on screen before the story takes over

setTimeout(() => roads(), 0)    // build the 20 roads in the background as soon as the server starts

function newRide(state, rng) {
  let pick
  do { pick = rng.int(ROAD_COUNT) } while (ROAD_COUNT > 1 && pick === state.roadIdx)
  const pts = roads()[pick]
  const now = Date.now()
  Object.assign(state, {
    roadIdx: pick,
    pts,
    horse: newHorse(pts[0].x, pts[0].y, pts[0].h),
    at: 0,
    input: { up: false, down: false, left: false, right: false },
    status: 'countdown',
    goAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + LIMIT_SEC * 1000,
    lightOutUntil: 0,
    nextFlicker: now + COUNTDOWN_MS + FLICKER_EVERY_MS,
    version: (state.version ?? 0) + 1,
  })
}

// The road near the horse, for Player 1: only what the lantern reaches.
function lanternRoad(state) {
  const { horse, pts, at } = state
  const out = []
  for (let i = Math.max(0, at - 14); i <= Math.min(pts.length - 1, at + 14); i++) {
    if (Math.hypot(pts[i].x - horse.x, pts[i].y - horse.y) <= LANTERN + WIDTH / 2) out.push([+pts[i].x.toFixed(2), +pts[i].y.toFixed(2)])
  }
  return out
}

// Past halfway: five guards on horseback, ON THE ROAD behind the horse (each in its own lane). They all appear
// TOGETHER at the halfway mark, just inside the bottom of the map, then gain on you slowly at first and faster
// near the end (the user's call). [x, y, heading] in road coordinates, the same for both players.
const LANES = [0, -1.4, 1.4, -2.4, 2.4] // metres across the 7 m road
const START_GAP = [25, 26.5, 26.5, 31, 31] // metres behind at halfway: a little formation
const END_GAP = [5, 7.5, 7.5, 12, 12]      // metres behind at the finish: right on your tail
const CLOSE_CURVE = 1.8                    // > 1 = slow to gain at first
function chasers(state) {
  const n = state.pts.length - 1
  const k = (state.at / n - 0.5) / 0.5 // 0 at halfway, 1 at the finish
  if (k < 0) return null
  const t = Math.min(1, k) ** CLOSE_CURVE
  return LANES.map((lane, i) => {
    const gap = START_GAP[i] + (END_GAP[i] - START_GAP[i]) * t
    const p = state.pts[Math.max(0, Math.round(state.at - gap / SAMPLE))]
    const nx = -Math.sin(p.h), ny = Math.cos(p.h)
    return [+(p.x + nx * lane).toFixed(2), +(p.y + ny * lane).toFixed(2), +p.h.toFixed(3)]
  })
}

function pose(state) {
  const h = state.horse
  return { x: +h.x.toFixed(2), y: +h.y.toFixed(2), h: +h.h.toFixed(3), v: +speedOf(h).toFixed(2) }
}

function tick(state, api) {
  const now = Date.now()
  let changed = false
  if (state.status === 'countdown' && now >= state.goAt) { state.status = 'riding'; changed = true }
  if (state.status === 'riding') {
    step(state.horse, state.input)
    const where = locate(state.pts, state.horse.x, state.horse.y, state.at)
    state.at = where.i
    if (where.off > WIDTH / 2) { state.status = 'crashed'; changed = true }
    else if (state.at >= state.pts.length - 2) {
      state.status = 'finished'; changed = true
      state.finishTimer = setTimeout(() => api.complete(), FINISH_HOLD_MS)
    } else if (now >= state.endsAt) { state.status = 'timeout'; changed = true }
    if (now >= state.nextFlicker) {
      state.nextFlicker += FLICKER_EVERY_MS
      if (api.rng.chance(FLICKER_CHANCE)) { state.lightOutUntil = now + FLICKER_MS }
    }
  }
  if (changed) api.update()
  // live positions: Player 1 gets the lantern's bit of road, Player 2 gets whether their light is out
  if (state.status === 'riding' || state.status === 'countdown' || changed) {
    const end = state.pts[state.pts.length - 1]
    const finishNear = Math.hypot(end.x - state.horse.x, end.y - state.horse.y) <= LANTERN + WIDTH
    // how far along (0..1): past halfway the chasing guards' red arrows creep up on both screens
    const progress = +(state.at / (state.pts.length - 1)).toFixed(3)
    const guards = state.status === 'riding' ? chasers(state) : null
    api.emit('A', 'ride', { ...pose(state), road: lanternRoad(state), end: finishNear ? [end.x, end.y, end.h] : null, progress, guards, t: now })
    api.emit('B', 'ride', { ...pose(state), dark: now < state.lightOutUntil, progress, guards, t: now })
  }
}

export default {
  create({ rng }) {
    const state = { roadIdx: -1, ticker: null, finishTimer: null }
    newRide(state, rng)
    return state
  },

  start(state, api) {
    clearInterval(state.ticker)
    state.ticker = setInterval(() => tick(state, api), TICK_MS)
  },

  view(state, role) {
    const common = {
      status: state.status, version: state.version, goAt: state.goAt, endsAt: state.endsAt, now: Date.now(),
      limitSec: LIMIT_SEC, width: WIDTH, start: pose(state),
    }
    if (role === 'A') return { ...common, lantern: LANTERN }
    // Player 2's map: the whole road (every 2 m is plenty to draw it)
    return { ...common, road: state.pts.filter((_, i) => i % 2 === 0 || i === state.pts.length - 1).map(p => [+p.x.toFixed(1), +p.y.toFixed(1)]) }
  },

  action(state, role, msg, api) {
    if (msg?.type === 'input' && role === 'A') {
      state.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right }
      return {}
    }
    // DEV MODE ONLY: jump the horse partway along the road (to test the second half, the arrows, the finish).
    if (msg?.type === 'devJump' && api.devMode && state.status === 'riding') {
      const at = Math.max(0, Math.min(state.pts.length - 3, Math.round((state.pts.length - 1) * Number(msg.fraction || 0))))
      const p = state.pts[at]
      Object.assign(state.horse, { x: p.x, y: p.y, h: p.h, vx: 0, vy: 0 })
      state.at = at
      return {}
    }
    if (msg?.type === 'retry' && (state.status === 'crashed' || state.status === 'timeout')) {
      newRide(state, api.rng)
      api.update()
      return {}
    }
    return {}
  },

  dispose(state) {
    clearInterval(state.ticker)
    clearTimeout(state.finishTimer)
  },
}
