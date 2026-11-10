// Level 1: the shifted letters.
//   Player A sees the scrambled letters and the answer box.
//   Player B sees, for each letter, how far to move it and which way (an arrow above the number).
// The arrow is the direction to move FROM the scrambled letter TO the real one, wrapping Z <-> A.
//
// The answer is fixed by the story ("Tile in the top right") but the shifts are rolled fresh every game,
// and only ever exist here: A's browser never receives the shifts, B's never receives the letters.

const PLAIN = 'TILEINTHETOPRIGHT'
const A = 'A'.charCodeAt(0)
const MAX_SHIFT = 6

const shiftLetter = (ch, by) => String.fromCharCode(((ch.charCodeAt(0) - A + by) % 26 + 26) % 26 + A)

export function encode(plain, shifts) {
  // Decoding moves the scrambled letter `n` places in `dir`, so encoding moves it the other way.
  return [...plain].map((ch, i) => shiftLetter(ch, shifts[i].dir === 'R' ? -shifts[i].n : shifts[i].n))
}

export function decode(cipher, shifts) {
  return cipher.map((ch, i) => shiftLetter(ch, shifts[i].dir === 'R' ? shifts[i].n : -shifts[i].n)).join('')
}

export const normalize = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '')

export default {
  create({ rng }) {
    const shifts = [...PLAIN].map(() => ({ n: rng.range(1, MAX_SHIFT), dir: rng.chance(0.5) ? 'L' : 'R' }))
    return { shifts, cipher: encode(PLAIN, shifts), wrong: 0, lastWrong: null }
  },

  view(state, role) {
    const common = { wrong: state.wrong, lastWrong: state.lastWrong }
    if (role === 'A') return { ...common, letters: state.cipher.map(c => c.toLowerCase()) }
    return { ...common, shifts: state.shifts }
  },

  action(state, role, msg, api) {
    if (role !== 'A' || msg?.type !== 'guess') return
    const guess = String(msg.text ?? '').slice(0, 80)
    if (normalize(guess) === PLAIN) return api.complete()
    state.wrong++
    state.lastWrong = guess
    api.update()
  },
}
