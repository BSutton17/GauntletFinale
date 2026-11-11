// Level 9: the split maze. Each player can't see their own half at all; they see their PARTNER, and a circle of
// the partner's half around them, plus the meeting square. So each one talks the other through.
// Both must collect their side's lantern, reins and saddle (keys open the gates to them) and then both stand on
// the meeting square before time runs out. Out of time: "You failed", then try again (a brand-new maze) or leave.
//
// ⚠️ Anti-cheat: a player's browser never receives their own half's layout or their own position (except on the
// meeting square, which both can always see). Only the partner's surroundings, within the circle.
// With a minute left, each player is shown where every key still lying on their PARTNER's side is (the side they can
// see). Those positions are only sent from that moment on.
import { generateMaze, W, H, HALF, MID, MID_I, ENTRY_I, START, DIRS, idx, rc, halfOf } from './maze.js'

const SIGHT = 5.5        // radius of the circle around your partner, in squares
const MIN_STEP_MS = 60   // fastest anyone can move (also stops scripted zipping)
export const REVEAL_SEC = 60 // with this long left, the partner's unfound keys are revealed (the user's call)
const other = (role) => (role === 'A' ? 'B' : 'A')

function fresh(rng) {
  const maze = generateMaze(rng)
  return {
    walls: maze.walls,
    things: maze.things,
    timerSec: maze.timerSec,
    botSeconds: maze.botSeconds,
    pos: { A: idx(START.A.r, START.A.c), B: idx(START.B.r, START.B.c) },
    inv: { A: { keys: [], items: [] }, B: { keys: [], items: [] } },
    lastStep: { A: 0, B: 0 },
    endsAt: 0,
    failed: false,
    done: false,
  }
}

function stopClocks(state) {
  clearTimeout(state.clock)
  clearTimeout(state.revealClock)
}

function startClock(state, api) {
  stopClocks(state)
  state.endsAt = Date.now() + state.timerSec * 1000
  state.clock = setTimeout(() => {
    if (state.done) return
    state.failed = true
    api.update()
  }, state.timerSec * 1000)
  // at one minute left, send everyone the revealed keys
  state.revealClock = setTimeout(() => { if (!state.done && !state.failed) api.update() }, Math.max(0, (state.timerSec - REVEAL_SEC) * 1000))
}

// Keys still lying on `side`'s half, once there's a minute or less left (a little slack for the timer firing early).
function revealedKeys(state, side) {
  if (state.done || state.failed || !state.endsAt || Date.now() < state.endsAt - REVEAL_SEC * 1000 - 250) return null
  const out = []
  for (const [i, t] of state.things) if (t.kind === 'key' && t.side === side) { const { r, c } = rc(i); out.push({ r, c, color: t.color }) }
  return out
}

function thingView(t) {
  if (!t) return null
  if (t.kind === 'gate') return { kind: 'gate', color: t.color, open: !!t.open }
  if (t.kind === 'key') return { kind: 'key', color: t.color }
  return { kind: 'item', item: t.item }
}

export default {
  create({ rng }) {
    return { ...fresh(rng), version: 1, clock: null, finishTimer: null }
  },

  start(state, api) {
    startClock(state, api)
  },

  view(state, role, { devMode } = {}) {
    const partner = other(role)
    const p = rc(state.pos[partner])
    const partnerHalf = partner // A's half is 'A', B's is 'B'
    const cells = []
    const add = (i) => {
      const { r, c } = rc(i)
      cells.push([r, c, state.walls[i], thingView(state.things.get(i))])
    }
    for (let r = Math.max(0, Math.floor(p.r - SIGHT)); r <= Math.min(H - 1, Math.ceil(p.r + SIGHT)); r++) {
      for (let c = Math.max(0, Math.floor(p.c - SIGHT)); c <= Math.min(W - 1, Math.ceil(p.c + SIGHT)); c++) {
        const i = idx(r, c)
        if (i === MID_I) continue
        if (halfOf(r) !== partnerHalf) continue          // never your own half
        if (Math.hypot(r - p.r, c - p.c) > SIGHT) continue
        add(i)
      }
    }
    add(MID_I) // the meeting square: always visible to both
    // DEV MODE ONLY: your own side and position, so one person can test both seats. Never sent otherwise.
    let dev
    if (devMode) {
      const mine = []
      const [lo, hi] = role === 'A' ? [0, HALF - 1] : [HALF, H - 1]
      for (let r = lo; r <= hi; r++) for (let c = 0; c < W; c++) {
        const i = idx(r, c)
        mine.push([r, c, state.walls[i], thingView(state.things.get(i))])
      }
      dev = { me: rc(state.pos[role]), cells: mine }
    }
    return {
      dev,
      w: W, h: H, half: HALF, mid: MID, sight: SIGHT,
      partner: p,
      onMid: { A: state.pos.A === MID_I, B: state.pos.B === MID_I },
      revealedKeys: revealedKeys(state, partner),
      cells,
      inv: state.inv,
      timerSec: state.timerSec,
      endsAt: state.endsAt,
      now: Date.now(),
      failed: state.failed,
      done: state.done,
      version: state.version,
    }
  },

  action(state, role, msg, api) {
    if (msg?.type === 'restart') {
      if (!state.failed) return {}
      stopClocks(state)
      Object.assign(state, fresh(api.rng), { version: state.version + 1 })
      startClock(state, api)
      api.update()
      return {}
    }
    if (msg?.type !== 'move' || state.failed || state.done) return {}
    const d = DIRS[msg.dir]
    if (!d) return {}
    const now = Date.now()
    if (now - state.lastStep[role] < MIN_STEP_MS) return { ok: false, why: 'slow' }
    state.lastStep[role] = now

    const from = state.pos[role]
    if (!(state.walls[from] & d.bit)) return { ok: false, why: 'wall' }
    const { r, c } = rc(from)
    const to = idx(r + d.dr, c + d.dc)
    // You stay on your own side; the meeting square is the only shared square.
    if (to !== MID_I && halfOf(rc(to).r) !== role) return { ok: false, why: 'wall' }
    // Player 1 can't go down through the middle into Player 2's side (that square is Player 2's only).
    if (role === 'A' && to === ENTRY_I) return { ok: false, why: 'wall' }

    const t = state.things.get(to)
    if (t?.kind === 'gate' && !t.open) {
      if (!state.inv[role].keys.includes(t.color)) return { ok: false, why: 'locked', color: t.color }
      t.open = true
    }
    state.pos[role] = to
    let picked = null
    if (t?.kind === 'key' && t.side === role) {
      state.inv[role].keys.push(t.color); state.things.delete(to); picked = { key: t.color }
    } else if (t?.kind === 'item' && t.side === role) {
      state.inv[role].items.push(t.item); state.things.delete(to); picked = { item: t.item }
    }

    if (state.pos.A === MID_I && state.pos.B === MID_I && state.inv.A.items.length === 3 && state.inv.B.items.length === 3) {
      state.done = true
      stopClocks(state)
      state.finishTimer = setTimeout(() => api.complete(), 3000)
    }
    api.update()
    return { ok: true, picked }
  },

  dispose(state) {
    stopClocks(state)
    clearTimeout(state.finishTimer)
  },
}
