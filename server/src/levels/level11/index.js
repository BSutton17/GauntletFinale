// Level 11: the King's poker game. Heads-up Texas Hold'em, 25 chips each, play until one player has every coin.
// The winner goes on to the ending, where they choose whether to keep the coins or give them away.
//
// The King's extras (the user's rules):
//   - Hands 1 and 2: nobody may go all in ("The King wants to be entertained", see holdem.js).
//   - After every second hand, until the four questions run out, the King quizzes both players (questions in a
//     random order). The question shows first; the four answers appear QUIZ_READ_MS later. Whoever answers
//     right wins a power for the NEXT hand only; both right -> whoever answered first. Nobody right -> nothing.
//     Both players' answers, the right one and the reward are revealed only once both have answered.
//
// ⚠️ Each player's browser only ever gets their own two cards. The opponent's are sent only when both are shown
// at a showdown, or one of them to the winner of the "see a card" power. The deck never leaves the server, except
// the three flop cards to the winner of the "peek at the flop" power, before the flop. The quiz's right answer
// is only sent once both have answered.
import { newGame, startHand, act, options, blindsFor, BLIND_EVERY } from './holdem.js'
import { best } from './cards.js'

const NEXT_HAND_MS = 4500
const GAME_OVER_MS = 5000
export const QUIZ_EVERY = 2       // hands between questions
export const QUIZ_READ_MS = 3000  // the question on its own, before the answers appear
export const QUIZ_REVEAL_MS = 7000 // the results on screen before the next hand
const other = (p) => (p === 'A' ? 'B' : 'A')

// reward: 'cover' = the King pays the winner's blind, 'card' = see one of the opponent's cards,
//         'flop' = see the flop before it is dealt
export const QUESTIONS = [
  { q: 'What is King Bryson’s favorite color?', options: ['Red', 'Purple', 'Green', 'Blue'], answer: 'Red', reward: 'cover' },
  { q: 'What is King Bryson’s birthday?', options: ['August 22nd', 'August 23rd', 'August 21st', 'August 24th'], answer: 'August 22nd', reward: 'card' },
  { q: 'What was the first online game King Bryson ever made?', options: ['Surrounded', 'Insight', 'Hypothetical', 'Overlord'], answer: 'Overlord', reward: 'cover' },
  { q: 'Which one of these was NOT the name of King Bryson’s fish?', options: ['Luffy', 'Sanji', 'Frank', 'Violet'], answer: 'Violet', reward: 'flop' },
]

function nextHand(state, api) {
  const { g } = state
  const p = state.pendingPower
  state.pendingPower = null
  startHand(g, api.rng, { cover: p?.kind === 'cover' ? p.winner : null })
  state.power = p ? { ...p, handNo: g.handNo } : null
  state.version++
  api.update()
}

// Between hands: a question if one is due, otherwise the next deal.
function afterHand(state, api) {
  const { g } = state
  if (g.handNo % QUIZ_EVERY === 0 && state.asked < state.order.length) return askQuestion(state, api)
  nextHand(state, api)
}

function askQuestion(state, api) {
  const base = QUESTIONS[state.order[state.asked]]
  state.asked++
  state.quiz = {
    number: state.asked,
    q: base.q,
    options: api.rng.shuffle(base.options), // the answers in a random order too, so the right one isn't always first
    answer: base.answer,
    reward: base.reward,
    openAt: Date.now() + QUIZ_READ_MS,
    open: false,
    answers: { A: null, B: null }, // { choice, at }
    winner: null,
    revealed: false,
  }
  state.version++
  api.update()
  clearTimeout(state.timer)
  state.timer = setTimeout(() => { state.quiz.open = true; state.version++; api.update() }, QUIZ_READ_MS)
}

function answer(state, role, choice, api) {
  const z = state.quiz
  if (!z || !z.open || z.revealed || z.answers[role]) return {}
  if (!z.options.includes(choice)) return { error: 'bad answer' }
  z.answers[role] = { choice, at: Date.now(), seq: (z.answers[other(role)] ? 2 : 1) }
  if (z.answers.A && z.answers.B) {
    const right = ['A', 'B'].filter(r => z.answers[r].choice === z.answer)
    z.winner = right.length === 2 ? (z.answers.A.seq < z.answers.B.seq ? 'A' : 'B') : right[0] ?? null
    z.revealed = true
    state.pendingPower = z.winner ? { kind: z.reward, winner: z.winner } : null
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { state.quiz = null; nextHand(state, api) }, QUIZ_REVEAL_MS)
  }
  state.version++
  api.update()
  return {}
}

function quizView(z, role) {
  if (!z) return null
  const v = {
    number: z.number,
    of: QUESTIONS.length,
    q: z.q,
    options: z.open ? z.options : null,
    openAt: z.openAt,
    mine: z.answers[role]?.choice ?? null,
    theyAnswered: !!z.answers[other(role)],
  }
  if (z.revealed) {
    v.reveal = { answer: z.answer, answers: { A: z.answers.A.choice, B: z.answers.B.choice }, winner: z.winner, reward: z.reward }
  }
  return v
}

export default {
  create({ rng }) {
    const g = newGame()
    startHand(g, rng)
    const order = rng.shuffle(QUESTIONS.map((_, i) => i))
    return { g, timer: null, version: 1, order, asked: 0, quiz: null, pendingPower: null, power: null }
  },

  view(state, role) {
    const { g } = state
    const h = g.hand
    const mine = h.hole[role]
    const handName = h.board.length >= 3 ? best([...mine, ...h.board]).name : null
    const upcoming = blindsFor(Math.ceil(g.handNo / BLIND_EVERY) * BLIND_EVERY + 1)
    // null once the blinds have hit their cap (nothing more to announce)
    const nextBlinds = upcoming[1] > h.blinds[1] ? upcoming : null
    // this hand's power from the last quiz (the next hand only)
    const p = state.power?.handNo === g.handNo ? state.power : null
    let power = null
    if (p) {
      power = { kind: p.kind, winner: p.winner }
      if (p.kind === 'cover') power.amount = h.covered?.amount ?? 0
      if (p.kind === 'card' && p.winner === role) power.card = h.hole[other(role)][0]
      if (p.kind === 'flop' && p.winner === role && h.street === 'preflop' && !g.last) power.flop = [h.deck.at(-1), h.deck.at(-2), h.deck.at(-3)]
    }
    return {
      handNo: g.handNo,
      stacks: g.stacks,
      total: g.total,
      button: g.button,
      blinds: h.blinds,
      blindsUpIn: BLIND_EVERY - ((g.handNo - 1) % BLIND_EVERY),
      nextBlinds,
      street: h.street,
      board: h.board,
      pot: h.pot,
      bets: h.bets,
      toAct: state.quiz ? null : h.toAct,
      myCards: mine,
      theirCards: g.last?.showCards ? g.last.showCards[other(role)] : null,
      myHand: handName,
      options: state.quiz ? null : options(g, role),
      last: g.last && { winner: g.last.winner, reason: g.last.reason, pot: g.last.pot, hands: g.last.hands },
      over: g.over,
      log: h.log.slice(-6),
      quiz: quizView(state.quiz, role),
      power,
      version: state.version,
    }
  },

  action(state, role, msg, api) {
    if (msg?.type === 'answer') return answer(state, role, String(msg.choice ?? ''), api)
    if (msg?.type !== 'act' || state.quiz) return {}
    const { g } = state
    const err = act(g, role, { type: msg.action, to: msg.to })
    if (err) return { error: err }
    state.version++
    if (g.hand.street === 'done') {
      clearTimeout(state.timer)
      if (g.over) state.timer = setTimeout(() => api.complete({ winner: g.over }), GAME_OVER_MS)
      else state.timer = setTimeout(() => afterHand(state, api), NEXT_HAND_MS)
    }
    api.update()
    return {}
  },

  dispose(state) {
    clearTimeout(state.timer)
  },
}
