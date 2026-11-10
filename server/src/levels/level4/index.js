// Level 4: the distant lights (Morsematics).
//   Player 2: the lights, the cell number, the tower lamps, the candles, and the lantern to answer with.
//   Player 1: the manual (rules, letter values, Morse chart). It's static, so it lives in the client.
// The answer is worked out here and never sent. A wrong letter shows what was received (as in the manual),
// then the lights start a brand-new message, so letters can't simply be tried one by one.
import { MORSE, FROM_MORSE, classifyTaps } from '../../../../shared/morse.js'
import { generate, solve, matches } from './morsematics.js'

function fresh(rng) {
  const module = generate(rng)
  return { module, answer: solve(module).answer }
}

const okNumber = (n) => Number.isFinite(n) && n > 0 && n < 8000

export default {
  create({ rng }) {
    return { ...fresh(rng), version: 1, wrong: 0, lastReceived: null, unreadable: false, done: false, timer: null }
  },

  view(state, role) {
    const common = { version: state.version, wrong: state.wrong, lastReceived: state.lastReceived, unreadable: state.unreadable, done: state.done }
    if (role === 'A') return common
    const m = state.module
    return {
      ...common,
      cell: m.serial,
      lamps: m.lamps,
      candles: m.candles,
      signals: m.received.map(ch => MORSE[ch]), // the three lights' patterns, in turn
    }
  },

  action(state, role, msg, api) {
    if (role !== 'B' || msg?.type !== 'transmit' || state.done) return {}
    const holds = Array.isArray(msg.holds) ? msg.holds.map(Number) : []
    const gaps = Array.isArray(msg.gaps) ? msg.gaps.map(Number) : []
    if (holds.length < 1 || holds.length > 6 || gaps.length !== holds.length - 1) return {}
    if (!holds.every(okNumber) || !gaps.every(okNumber)) return {}

    const sent = FROM_MORSE[classifyTaps(holds)]
    if (!sent) {
      // Not a letter at all: almost certainly a slip of the finger, so it doesn't count against them.
      state.unreadable = true
      api.update()
      return { received: null }
    }
    state.unreadable = false
    if (matches(sent, state.answer)) {
      state.done = true
      state.lastReceived = sent
      api.update()
      state.timer = setTimeout(() => api.complete(), 2500)
      return { received: sent, correct: true }
    }
    // Wrong: show what they sent, then a new message from the tower.
    Object.assign(state, fresh(api.rng), { version: state.version + 1, wrong: state.wrong + 1, lastReceived: sent })
    api.update()
    return { received: sent, correct: false }
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}

