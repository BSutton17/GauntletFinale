// Level 5: connect the dots (picking the lock).
//   Player 1 drags through the dots but can't see the numbers.  Player 2 sees the numbers and guides them.
//   Touching a wrong dot scatters everything: a brand-new layout and numbering. All 50 in order wins.
//
// ⚠️ Anti-cheat: Player 1's browser gets the dots under random ids, in a shuffled order. The order (the
// numbers) only ever goes to Player 2.
import { generateDots, W, H, HIT_R, COUNT } from './dots.js'

const newId = (rng) => Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[rng.int(32)]).join('')

function fresh(rng) {
  const dots = generateDots(rng).map(p => ({ ...p, id: newId(rng) }))
  return { dots, shuffled: rng.shuffle(dots.map(d => d.id)), visited: 0 }
}

export default {
  create({ rng }) {
    return { ...fresh(rng), version: 1, wrong: 0, done: false, timer: null }
  },

  view(state, role) {
    const common = { w: W, h: H, hitR: HIT_R, total: COUNT, version: state.version, wrong: state.wrong, done: state.done }
    if (role === 'A') {
      const byId = new Map(state.dots.map(d => [d.id, d]))
      return {
        ...common,
        dots: state.shuffled.map(id => ({ id, x: byId.get(id).x, y: byId.get(id).y })),
        visited: state.dots.slice(0, state.visited).map(d => d.id),
      }
    }
    return { ...common, dots: state.dots.map((d, i) => ({ n: i + 1, x: d.x, y: d.y })), visited: state.visited }
  },

  action(state, role, msg, api) {
    if (role !== 'A' || msg?.type !== 'touch' || state.done) return {}
    const i = state.dots.findIndex(d => d.id === msg.id)
    if (i < 0 || i < state.visited) return {} // a dot from an old layout, or one already joined
    if (i === state.visited) {
      state.visited++
      if (state.visited === COUNT) {
        state.done = true
        state.timer = setTimeout(() => api.complete(), 2500)
      }
      api.update()
      return { ok: true }
    }
    Object.assign(state, fresh(api.rng), { version: state.version + 1, wrong: state.wrong + 1 })
    api.update()
    return { ok: false }
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}
