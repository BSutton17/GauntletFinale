// Level 2: the made-up language.
//   Player A: the translation sheet.   Player B: the message, and the answer box.
// The message says "The answer to this problem, is the word that", so the answer is literally "that".
// A wrong answer rewrites the whole language: new rules, new message.
import { generateLanguage, phrase, SHEET_NOTES } from './language.js'

const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
const ACCEPT = new Set(['that', 'thewordthat'])
// They translated it, but typed the translation instead of answering it. Not a wrong answer, so the
// language stays put; just nudge them.
const TRANSLATION = 'theanswertothisproblemisthewordthat'

function fresh(rng) {
  const lang = generateLanguage(rng)
  return {
    tokens: lang.tokens,
    commaAt: lang.commaAt,
    sheet: lang.rules.map((r) => phrase(r, rng, lang.rules)),
    rules: lang.rules,
  }
}

export default {
  create({ rng }) {
    return { ...fresh(rng), version: 1, wrong: 0, lastWrong: null, nudge: false }
  },

  view(state, role) {
    const common = { version: state.version, wrong: state.wrong, lastWrong: state.lastWrong }
    if (role === 'A') return { ...common, notes: SHEET_NOTES, sheet: state.sheet }
    return {
      ...common,
      nudge: state.nudge,
      message: state.tokens.map((t, i) => (i === state.commaAt ? `${t},` : t)),
    }
  },

  action(state, role, msg, api) {
    if (role !== 'B' || msg?.type !== 'answer') return
    const raw = String(msg.text ?? '').slice(0, 120)
    const guess = normalize(raw)
    if (!guess) return
    if (ACCEPT.has(guess)) return api.complete()
    if (guess === TRANSLATION) { state.nudge = true; return api.update() }
    Object.assign(state, fresh(api.rng), { version: state.version + 1, wrong: state.wrong + 1, lastWrong: raw, nudge: false })
    api.update()
  },
}
