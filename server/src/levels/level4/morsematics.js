// Level 4: Morsematics (from Keep Talking and Nobody Explodes), told as lights seen from the cell window.
//   KTANE                      here
//   three received letters  -> three distant lights flashing Morse, taking turns
//   serial number           -> the cell number (its 4th and 5th characters are the starting pair)
//   indicators (lit/unlit)  -> lamps on the far tower with three-letter plates, lit or dark
//   batteries               -> candles burning in the window
//   transmit button         -> Player 2's lantern
// The maths is the module's, unchanged.

export const LAMP_LABELS = ['SND', 'CLR', 'CAR', 'IND', 'FRQ', 'SIG', 'NSA', 'MSA', 'TRN', 'BOB', 'FRK']
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SERIAL_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXZ' // no O (looks like 0) or Y, like the game
const DIGITS = '0123456789'

export const val = (ch) => ch.charCodeAt(0) - 64
export const letter = (v) => String.fromCharCode(64 + v)
export const wrap = (v) => ((((v - 1) % 26) + 26) % 26) + 1
const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23])
const SQUARES = new Set([1, 4, 9, 16, 25, 36, 49])

export function generate(rng) {
  const pick = (s) => s[rng.int(s.length)]
  const serial = pick(SERIAL_LETTERS + DIGITS) + pick(SERIAL_LETTERS + DIGITS) + pick(DIGITS) + pick(SERIAL_LETTERS) + pick(SERIAL_LETTERS) + pick(DIGITS)
  const received = rng.shuffle([...LETTERS]).slice(0, 3)
  const lamps = rng.shuffle(LAMP_LABELS).slice(0, rng.range(1, 3)).map(label => ({ label, lit: rng.chance(0.5) }))
  const candles = rng.range(0, 4)
  return { serial, received, lamps, candles }
}

// The module's steps, in order. Returns the letter to send and the working (for tests and the admin).
export function solve({ serial, received, lamps, candles }) {
  let a = val(serial[3])
  let b = val(serial[4])
  const rec = received.map(val)
  const steps = [[a, b]]

  // 1. Each lamp whose plate shares a letter with the received letters: +1 to the first if lit, else the second.
  for (const lamp of lamps) {
    if ([...lamp.label].some(ch => received.includes(ch))) lamp.lit ? a++ : b++
  }
  a = wrap(a); b = wrap(b); steps.push([a, b])

  // 2. Square sum: +4 to the first; otherwise -4 from the second.
  if (SQUARES.has(a + b)) a += 4
  else b -= 4
  a = wrap(a); b = wrap(b); steps.push([a, b])

  // 3. Add the largest received letter to the first.
  a = wrap(a + Math.max(...rec)); steps.push([a, b])

  // 4. Subtract every prime received letter from the first.
  for (const r of rec) if (PRIMES.has(r)) a -= r
  a = wrap(a); steps.push([a, b])

  // 5. Subtract every square received letter from the second.
  for (const r of rec) if (SQUARES.has(r)) b -= r
  b = wrap(b); steps.push([a, b])

  // 6. Candles burning: subtract every received letter divisible by the candle count from both.
  if (candles > 0) for (const r of rec) if (r % candles === 0) { a -= r; b -= r }
  a = wrap(a); b = wrap(b); steps.push([a, b])

  const answer = a === b ? a : a > b ? a - b : wrap(a + b)
  return { answer: letter(answer), steps }
}

// E and T count as the same letter (as in the original module, where they couldn't be told apart).
export function matches(sent, answer) {
  if (sent === answer) return true
  return (sent === 'E' || sent === 'T') && (answer === 'E' || answer === 'T')
}
