// International Morse code, A-Z. Public knowledge, so it's fine in shared/ (the manual and the lantern preview
// both use it). Answers never come from here.
export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
}

export const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))

// How a tapped signal is read (the user's rule): a quick tap is a dot, a HOLD is a dash. Anything held for
// DASH_MS or longer counts as a hold. The client preview and the server both use this, so what the player sees
// before sending is exactly what gets read. (The original module compared holds to the gaps; players found
// that it needed holds that felt far too long.)
export const DASH_MS = 250

export function classifyTaps(holds) {
  return holds.map(h => (h >= DASH_MS ? '-' : '.')).join('')
}
