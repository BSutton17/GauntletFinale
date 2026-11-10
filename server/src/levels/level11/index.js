// Level 11: the King's poker game. Heads-up Texas Hold'em, 25 chips each, first to 50 wins. The winner goes on to
// the ending, where they choose whether to keep the coins or give them away.
//
// ⚠️ Each player's browser only ever gets their own two cards. The opponent's are sent only when both are shown
// at a showdown. The deck never leaves the server.
import { newGame, startHand, act, options, blindsFor, BLIND_EVERY } from './holdem.js'
import { best } from './cards.js'

const NEXT_HAND_MS = 4500
const GAME_OVER_MS = 5000
const other = (p) => (p === 'A' ? 'B' : 'A')

export default {
  create({ rng }) {
    const g = newGame()
    startHand(g, rng)
    return { g, timer: null, version: 1 }
  },

  view(state, role) {
    const { g } = state
    const h = g.hand
    const mine = h.hole[role]
    const handName = h.board.length >= 3 ? best([...mine, ...h.board]).name : null
    const upcoming = blindsFor(Math.ceil(g.handNo / BLIND_EVERY) * BLIND_EVERY + 1)
    // null once the blinds have hit their cap (nothing more to announce)
    const nextBlinds = upcoming[1] > h.blinds[1] ? upcoming : null
    return {
      handNo: g.handNo,
      stacks: g.stacks,
      button: g.button,
      blinds: h.blinds,
      blindsUpIn: BLIND_EVERY - ((g.handNo - 1) % BLIND_EVERY),
      nextBlinds,
      street: h.street,
      board: h.board,
      pot: h.pot,
      bets: h.bets,
      toAct: h.toAct,
      myCards: mine,
      theirCards: g.last?.showCards ? g.last.showCards[other(role)] : null,
      myHand: handName,
      options: options(g, role),
      last: g.last && { winner: g.last.winner, reason: g.last.reason, pot: g.last.pot, hands: g.last.hands },
      over: g.over,
      log: h.log.slice(-6),
      version: state.version,
    }
  },

  action(state, role, msg, api) {
    if (msg?.type !== 'act') return {}
    const { g } = state
    const err = act(g, role, { type: msg.action, to: msg.to })
    if (err) return { error: err }
    state.version++
    if (g.hand.street === 'done') {
      clearTimeout(state.timer)
      if (g.over) state.timer = setTimeout(() => api.complete({ winner: g.over }), GAME_OVER_MS)
      else state.timer = setTimeout(() => { startHand(g, api.rng); state.version++; api.update() }, NEXT_HAND_MS)
    }
    api.update()
    return {}
  },

  dispose(state) {
    clearTimeout(state.timer)
  },
}
