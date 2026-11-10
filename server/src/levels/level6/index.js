// Level 6: the Guards' Carol.
//   Player 1: six rows of (line, word) coordinates, unlabelled.   Player 2: six songs, and the answer box.
// Row N goes with song N. Each coordinate is a line of that song's lyrics ON GENIUS and a word in that line.
// None of this is explained to them; the only hint, on both screens, is "Only a Genius could get out of this
// situation".
//
// Counting the way the Genius page reads: lyric lines only, skipping [Verse]/[Chorus] headers and blank lines;
// words split on spaces. Every coordinate below was checked against genius.com on 2026-11-10, and every target
// line is a plain line (no bracketed ad-libs). The user OK'd an easier sentence than the original
// ("I will defend the glorious crown with my life and my honor"): most of those words aren't in these songs.
// If Genius ever edits one of these pages, re-check the coordinates.

export const SONGS = [
  { title: 'Like Him', artist: 'Tyler, The Creator', coords: [[1, 5], [1, 10]] },          // I swear
  { title: 'Jungle', artist: 'Drake', coords: [[27, 5], [37, 5]] },                        // to stand
  { title: 'Love Galore', artist: 'SZA', coords: [[10, 2], [13, 8]] },                     // with the
  { title: 'Blank Space', artist: 'Taylor Swift', coords: [[35, 3], [40, 4]] },            // king all
  { title: 'Alright', artist: 'Kendrick Lamar', coords: [[30, 6], [16, 2]] },              // day and
  { title: 'Something in the Orange', artist: 'Zach Bryan', coords: [[4, 10], [13, 11]] }, // all night
]
const ANSWER = 'i swear to stand with the king all day and all night'
export const HINT = 'Only a Genius could get out of this situation'

const normalize = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z]+/g, ' ').trim()

export default {
  create() {
    return { wrong: 0, lastWrong: null, done: false, timer: null }
  },

  view(state, role) {
    const common = { hint: HINT, wrong: state.wrong, lastWrong: state.lastWrong, done: state.done }
    if (role === 'A') return { ...common, rows: SONGS.map(s => s.coords) }
    return { ...common, songs: SONGS.map(s => ({ title: s.title, artist: s.artist })) }
  },

  action(state, role, msg, api) {
    if (role !== 'B' || msg?.type !== 'answer' || state.done) return {}
    const raw = String(msg.text ?? '').slice(0, 200)
    if (normalize(raw) === ANSWER) {
      state.done = true
      api.update()
      state.timer = setTimeout(() => api.complete(), 3000)
      return { correct: true }
    }
    state.wrong++
    state.lastWrong = raw
    api.update()
    return { correct: false }
  },

  dispose(state) {
    if (state.timer) clearTimeout(state.timer)
  },
}
