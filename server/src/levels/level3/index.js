// Level 3: the key jigsaw. 104 pieces: 4 already in the mold, 50 for each player. A piece only sticks when it's
// let go close to its own spot. You can't see your partner's pieces until they're in the mold.
//
// Helping each other (the user's rule, it's hard otherwise): while a player HOLDS a piece, their PARTNER's mold
// lights up where it goes, so they can talk each other through it. The holder doesn't see their own box.
//
// ⚠️ Anti-cheat: pieces have random ids and reach the browser only as pictures (see pieces.js). Where a piece
// belongs never leaves the server, except that one held piece's spot, sent to the partner only. (There is no
// dev-mode highlight any more: the partner glow is the help, in every mode.)
import { pieceCells, makeTabs, renderAll, MARGIN, COLS, ROWS } from './pieces.js'
import { silhouettePath } from './keyArt.js'

const PRESET = 4
const SNAP = 0.5            // must be let go within half a cell of the right spot
const WRONG_LIMIT = 6       // more wrong drops than this in WRONG_WINDOW_MS are ignored (stops scripted guessing)
const WRONG_WINDOW_MS = 3000
const FINISH_MS = 3500      // admire the finished key before the story goes on

const OUTLINE = silhouettePath(1)
const newId = (rng) => Array.from({ length: 10 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[rng.int(32)]).join('')

export default {
  create({ rng }) {
    const cells = pieceCells()
    const tabs = makeTabs(rng, cells)
    const shuffled = rng.shuffle(cells)

    // The 4 starters are spread out so they help in different parts of the key.
    const preset = []
    for (const cell of shuffled) {
      if (preset.length === PRESET) break
      if (preset.every(p => Math.abs(p.c - cell.c) + Math.abs(p.r - cell.r) >= 6)) preset.push(cell)
    }
    const rest = shuffled.filter(c => !preset.includes(c))
    const pieces = [
      ...preset.map(cell => ({ ...cell, owner: null, placed: true })),
      ...rest.map((cell, i) => ({ ...cell, owner: i % 2 === 0 ? 'A' : 'B', placed: false })),
    ].map(p => ({ ...p, id: newId(rng) }))

    const state = { pieces, done: false, finishTimer: null, wrong: { A: [], B: [] }, holding: { A: null, B: null }, images: null }
    const byCell = new Map(pieces.map(p => [`${p.c},${p.r}`, p.id]))
    state.images = renderAll(cells, tabs).then((m) => {
      const out = new Map()
      for (const [cell, url] of m) out.set(byCell.get(cell), url)
      return out
    })
    state.images.catch((e) => console.error(`[level3] rendering failed: ${e.message}`))
    return state
  },

  view(state, role) {
    const mine = state.pieces.filter(p => p.owner === role && !p.placed)
    const other = state.pieces.filter(p => p.owner && p.owner !== role && !p.placed)
    const v = {
      cols: COLS, rows: ROWS, margin: MARGIN, outline: OUTLINE,
      placed: state.pieces.filter(p => p.placed).map(p => ({ id: p.id, c: p.c, r: p.r })),
      tray: mine.map(p => p.id),
      partnerLeft: other.length,
      total: state.pieces.length,
      done: state.done,
    }
    const held = state.pieces.find(p => p.id === state.holding[role === 'A' ? 'B' : 'A'] && !p.placed)
    if (held) v.partnerTarget = [held.c, held.r]
    return v
  },

  // Pictures, on request: your own loose pieces and anything already in the mold.
  async query(state, role, msg) {
    if (msg?.type !== 'images' || !Array.isArray(msg.ids)) return {}
    const images = await state.images
    const ids = new Set(msg.ids.slice(0, 120).map(String))
    const out = {}
    for (const p of state.pieces) {
      if (ids.has(p.id) && (p.placed || p.owner === role)) out[p.id] = images.get(p.id)
    }
    return { images: out }
  },

  action(state, role, msg, api) {
    if (state.done) return { placed: false }

    // Picking a piece up / putting it back: tells the partner's screen where it goes.
    if (msg?.type === 'grab') {
      const piece = state.pieces.find(p => p.id === msg.id)
      if (!piece || piece.owner !== role || piece.placed || state.holding[role] === piece.id) return {}
      state.holding[role] = piece.id
      api.update()
      return {}
    }
    if (msg?.type === 'release') {
      if (state.holding[role]) { state.holding[role] = null; api.update() }
      return {}
    }

    if (msg?.type !== 'drop') return { placed: false }
    const piece = state.pieces.find(p => p.id === msg.id)
    if (!piece || piece.owner !== role || piece.placed) return { placed: false }
    // Letting go ends the hold either way.
    const wasHolding = state.holding[role] !== null
    state.holding[role] = null
    const x = Number(msg.x), y = Number(msg.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { placed: false }

    const now = Date.now()
    state.wrong[role] = state.wrong[role].filter(t => now - t < WRONG_WINDOW_MS)
    if (state.wrong[role].length >= WRONG_LIMIT) { if (wasHolding) api.update(); return { placed: false, cooldown: true } }

    if (Math.hypot(x - (piece.c + 0.5), y - (piece.r + 0.5)) > SNAP) {
      state.wrong[role].push(now)
      if (wasHolding) api.update()
      return { placed: false }
    }
    piece.placed = true
    if (state.pieces.every(p => p.placed)) {
      state.done = true
      state.finishTimer = setTimeout(() => api.complete(), FINISH_MS)
    }
    api.update()
    return { placed: true }
  },

  dispose(state) {
    if (state.finishTimer) clearTimeout(state.finishTimer)
  },
}
