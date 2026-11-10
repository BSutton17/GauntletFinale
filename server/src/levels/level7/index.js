// Level 7: paint by numbers.
//   Player 1 has a 20 x 20 grid of numbers and a key: each number is a coloured circle (no colour names).
//   Player 2 has a blank 20 x 20 grid and a palette of the same colours (no numbers). They pick a colour and paint.
//   Player 1 reads the numbers out as colours; Player 2 paints; the picture is a cat. Player 2 says what it is.
// The answer only counts once the painting is (nearly) right, so guessing "cat" up front gets nowhere.
// Which number means which colour is shuffled every game.
//
// ⚠️ Player 2's browser never gets the numbers: only their own painting.

// The picture, by colour letter (20 x 20). Drawn as the left half (columns 0-9) and mirrored.
const LEFT = [
  '..........',
  '..K.......',
  '..KK......',
  '..KPK.....',
  '..KPPK....',
  '..KPOOKKKK',
  '.KOOOOOOOO',
  '.KOOOOOOOO',
  '.KOOKKKOOO',
  '.KOKGKGKOO',
  '.KOKGKGKOO',
  '.KOOKKKOOO',
  'KKOOOOOWWP',
  '.KOOOOWWWK',
  'KKOOOOWKKW',
  '.KOOOOOWWW',
  '..KOOOOOOO',
  '...KKOOOOO',
  '.....KKKKK',
  '..........',
]
export const SIZE = 20
// The colours, in a fixed order: Player 2 paints with these ids. The first is the background, and an unpainted
// square counts as background.
export const COLOURS = [
  { ch: '.', hex: '#a9cfe8' }, // light blue (background)
  { ch: 'K', hex: '#1b1b1b' }, // black
  { ch: 'O', hex: '#e8892b' }, // orange
  { ch: 'W', hex: '#f7f3ea' }, // white
  { ch: 'G', hex: '#4caf50' }, // green
  { ch: 'P', hex: '#f29bb2' }, // pink
]
const BLANK = -1
// The painting counts as finished once this share of the squares is right.
export const FINISHED_SHARE = 0.9

export const PICTURE = LEFT.map(l => l + [...l].reverse().join('')) // 20 strings of 20
const TARGET = PICTURE.join('').split('').map(ch => COLOURS.findIndex(c => c.ch === ch)) // colour id per square

const ACCEPT = new Set(['cat', 'kitty', 'kitten', 'kittycat', 'kitteh', 'feline', 'cats', 'pussycat', 'housecat', 'tabby', 'gingercat', 'orangecat'])
// "It's a cat!" -> "cat": drop leading filler words, then everything that isn't a letter.
const FILLER = new Set(['a', 'an', 'the', 'its', 'it', 'is', 'thats', 'that', 'this', 'i', 'think', 'maybe'])
export function clean(s) {
  const words = String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ')
  while (words.length > 1 && FILLER.has(words[0])) words.shift()
  return words.join('')
}

export function shareRight(painted) {
  let right = 0
  for (let i = 0; i < TARGET.length; i++) {
    const p = painted[i] === BLANK ? 0 : painted[i]
    if (p === TARGET[i]) right++
  }
  return right / TARGET.length
}

export default {
  create({ rng }) {
    // number shown to Player 1 for each colour id (1..6, shuffled)
    const numbers = rng.shuffle(COLOURS.map((_, i) => i + 1))
    return {
      numbers,
      painted: new Array(SIZE * SIZE).fill(BLANK),
      wrong: 0,
      lastWrong: null,
      notYet: 0,
      reply: null, // the guard's latest reply: 'notYet' or 'wrong'
      done: false,
      timer: null,
    }
  },

  view(state, role) {
    const common = { size: SIZE, done: state.done }
    if (role === 'A') {
      return {
        ...common,
        grid: TARGET.map(id => state.numbers[id]),
        key: COLOURS.map((c, id) => ({ n: state.numbers[id], hex: c.hex })).sort((x, y) => x.n - y.n),
      }
    }
    return {
      ...common,
      palette: COLOURS.map((c, id) => ({ id, hex: c.hex })),
      painted: state.painted,
      wrong: state.wrong,
      lastWrong: state.lastWrong,
      notYet: state.notYet,
      reply: state.reply,
    }
  },

  action(state, role, msg, api) {
    if (role !== 'B' || state.done) return {}
    if (msg?.type === 'paint') {
      const colour = Number(msg.colour)
      if (!(colour === BLANK || (Number.isInteger(colour) && colour >= 0 && colour < COLOURS.length))) return {}
      const cells = Array.isArray(msg.cells) ? msg.cells.slice(0, SIZE * SIZE) : []
      let changed = false
      for (const c of cells) {
        if (Number.isInteger(c) && c >= 0 && c < SIZE * SIZE && state.painted[c] !== colour) { state.painted[c] = colour; changed = true }
      }
      if (changed) api.update()
      return {}
    }
    if (msg?.type === 'answer') {
      const raw = String(msg.text ?? '').slice(0, 60)
      if (!raw.trim()) return {}
      if (shareRight(state.painted) < FINISHED_SHARE) {
        state.notYet++ // the same reply whatever they typed, so it gives nothing away
        state.reply = 'notYet'
        api.update()
        return { correct: false, notYet: true }
      }
      if (ACCEPT.has(clean(raw))) {
        state.done = true
        state.timer = setTimeout(() => api.complete(), 3000)
      } else {
        state.wrong++
        state.lastWrong = raw
        state.reply = 'wrong'
      }
      api.update()
      return { correct: state.done }
    }
    return {}
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}
