// Level 7: the wanted posters. Each player has a 25 x 25 picture that looks like static.
//   Player 1's looks like dark static; brightening it reveals a rabbit's face.
//   Player 2's looks like colour static; making it black and white reveals a cat.
// There's no button to do it: they have to use their own tools (screenshot / save, then a photo editor).
// Both have to name their own picture. New static every game, so the pictures can't be looked up.
import { rasterShape, darkWithHiddenShape, colourWithHiddenLuma, toPngDataUrl } from './pictures.js'

const ACCEPT = {
  A: new Set(['rabbit', 'bunny', 'bunnyrabbit', 'hare', 'bunbun', 'bun', 'rabbits', 'bunnies', 'jackrabbit']),
  B: new Set(['cat', 'kitty', 'kitten', 'kittycat', 'kitteh', 'feline']),
}
// "It's a puppy!" -> "puppy": drop leading filler words, then everything that isn't a letter.
const FILLER = new Set(['a', 'an', 'the', 'its', 'it', 'is', 'thats', 'that', 'this', 'i', 'think', 'maybe'])
function clean(s) {
  const words = String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ')
  while (words.length > 1 && FILLER.has(words[0])) words.shift()
  return words.join('')
}

export default {
  create({ rng }) {
    const rabbit = darkWithHiddenShape(rng, rasterShape('rabbit', rng.chance(0.5)))
    const cat = colourWithHiddenLuma(rng, rasterShape('cat', rng.chance(0.5)))
    return {
      image: { A: toPngDataUrl(rabbit), B: toPngDataUrl(cat) },
      solved: { A: false, B: false },
      wrong: { A: 0, B: 0 },
      lastWrong: { A: null, B: null },
      done: false,
      timer: null,
    }
  },

  view(state, role) {
    const other = role === 'A' ? 'B' : 'A'
    return {
      image: state.image[role],
      solved: state.solved[role],
      partnerSolved: state.solved[other],
      wrong: state.wrong[role],
      lastWrong: state.lastWrong[role],
      done: state.done,
    }
  },

  action(state, role, msg, api) {
    if (msg?.type !== 'answer' || state.done || state.solved[role]) return {}
    const raw = String(msg.text ?? '').slice(0, 60)
    if (ACCEPT[role].has(clean(raw))) {
      state.solved[role] = true
      if (state.solved.A && state.solved.B) {
        state.done = true
        state.timer = setTimeout(() => api.complete(), 3000)
      }
    } else {
      state.wrong[role]++
      state.lastWrong[role] = raw
    }
    api.update()
    return { correct: state.solved[role] }
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}
