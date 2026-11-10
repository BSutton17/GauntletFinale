// Level 8: the Mystic Square.  Player 1: the sliding square and the clock.  Player 2: the rules.
// The server knows where the knight and skull are; Player 1's browser only learns what's under a space once
// that space has been uncovered.
import { generate, adjacent, isSolved } from './mysticSquare.js'

function fresh(rng) {
  const g = generate(rng)
  return { ...g, uncovered: new Set([g.layout.indexOf(0)]), knightFound: false }
}

export default {
  create({ rng }) {
    return { ...fresh(rng), strikes: 0, struck: false, done: false, timer: null, version: 1 }
  },

  view(state, role) {
    const common = { strikes: state.strikes, struck: state.struck, done: state.done, version: state.version }
    if (role !== 'A') return common
    return {
      ...common,
      layout: state.layout,
      time: state.time,
      knightFound: state.knightFound,
      // only what's under spaces that have been uncovered
      revealed: [...state.uncovered].map(pos => ({ pos, what: pos === state.knight ? 'knight' : 'nothing' })),
    }
  },

  action(state, role, msg, api) {
    if (role !== 'A' || msg?.type !== 'slide' || state.done) return {}
    const from = state.layout.indexOf(Number(msg.tile))
    const empty = state.layout.indexOf(0)
    if (from < 0 || Number(msg.tile) === 0 || !adjacent(from, empty)) return {}
    state.layout[empty] = state.layout[from]
    state.layout[from] = 0
    state.struck = false
    // `from` is now uncovered
    if (from === state.skull && !state.knightFound) {
      // Strike: the skull before the knight. A new square and a new time.
      Object.assign(state, fresh(api.rng), { strikes: state.strikes + 1, struck: true, version: state.version + 1 })
      api.update()
      return { strike: true }
    }
    state.uncovered.add(from)
    if (from === state.knight) state.knightFound = true
    if (isSolved(state.layout, state.target)) {
      state.done = true
      state.timer = setTimeout(() => api.complete(), 2500)
    }
    api.update()
    return {}
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}
