// Level 8: the Mystic Square (from Keep Talking and Nobody Explodes), with the clock in place of the serial number.
// Positions 0..8 read left to right, top to bottom; 0 in a layout is the empty space.
//   - The knight and the skull are hidden under two positions. Uncovering the skull (sliding the tile off it)
//     before the knight has been uncovered is a strike. Once the knight's been found there are no more strikes.
//   - Where the skull is: the manual's procedure (skullPosition). The knight is anywhere else.
//   - Solved when the tiles match the target constellation for this layout, or 1-2-3 / 4-5-6 / 7-8-blank.

// The manual's table: rows when the clock's last digit sits on the cross, columns otherwise; picked by the
// number in the middle.
export const TABLE = [
  [1, 3, 5, 4, 6, 7, 2, 8],
  [2, 5, 7, 3, 8, 1, 4, 6],
  [6, 4, 8, 1, 7, 3, 5, 2],
  [8, 1, 2, 5, 3, 4, 6, 7],
  [3, 2, 6, 8, 4, 5, 7, 1],
  [7, 6, 1, 2, 5, 8, 3, 4],
  [4, 7, 3, 6, 1, 2, 8, 5],
  [5, 8, 4, 7, 2, 6, 1, 3],
]
export const CROSS = new Set([1, 3, 4, 5, 7])
export const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0]

// Target constellations ('?' = anything), by [row group][column group]:
// group 0/1/2 = that row (column) has the strictly largest sum; 3 = none does.
const P = (s) => s.replace(/\s/g, '')
export const TARGETS = [
  [P('1?2 ??? 4?3'), P('1?2 ??? 3?4'), P('1?3 ??? 7?5'), P('1?3 ??? 5?7')],
  [P('?1? 4?2 ?3?'), P('??? 3?2 ?4?'), P('1?3 ??? 7?5'), P('1?3 ??? 5?7')],
  [P('1?? ?2? ??3'), P('??3 ?2? 1??'), P('3?? ?2? ??1'), P('??1 ?2? 3??')],
  [P('123 ?4? ???'), P('1?? 24? 3??'), P('??? ?4? 123'), P('??1 ?42 ??3')],
]

export const adjacent = (a, b) => (Math.abs(a - b) === 3) || (Math.abs(a - b) === 1 && Math.floor(a / 3) === Math.floor(b / 3))

export function skullPosition(layout, lastDigit) {
  if (layout[4] === 0) return layout.indexOf(7)
  const middle = layout[4]
  const digitPos = layout.indexOf(lastDigit) // -1 for 0 and 9: never on the cross
  const useRows = digitPos >= 0 && CROSS.has(digitPos)
  const seq = useRows ? TABLE[middle - 1] : TABLE.map(row => row[middle - 1])
  let cur = layout.indexOf(0)
  for (const n of seq) {
    const p = layout.indexOf(n)
    if (adjacent(cur, p)) cur = p
  }
  return cur
}

function group(sums) {
  for (let i = 0; i < 3; i++) if (sums.every((s, j) => j === i || sums[i] > s)) return i
  return 3
}

export function targetFor(layout) {
  const R = [0, 1, 2].map(r => layout[r * 3] + layout[r * 3 + 1] + layout[r * 3 + 2])
  const C = [0, 1, 2].map(c => layout[c] + layout[c + 3] + layout[c + 6])
  return TARGETS[group(R)][group(C)]
}

export function isSolved(layout, target) {
  if (layout.every((v, i) => v === SOLVED[i])) return true
  return [...target].every((ch, i) => ch === '?' || Number(ch) === layout[i])
}

// A random start that's reachable from the solved square (so it can always be solved), with a clock time from
// 8:00 PM to 11:59 PM.
export function generate(rng) {
  for (;;) {
    let layout = [...SOLVED]
    let prev = -1
    for (let k = 0; k < 160; k++) {
      const e = layout.indexOf(0)
      const options = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(p => adjacent(p, e) && p !== prev)
      const p = rng.pick(options)
      ;[layout[e], layout[p]] = [layout[p], layout[e]]
      prev = e
    }
    const hour = rng.range(8, 11), minute = rng.int(60)
    const target = targetFor(layout)
    if (isSolved(layout, target)) continue
    const lastDigit = minute % 10
    const skull = skullPosition(layout, lastDigit)
    const empty = layout.indexOf(0)
    const knight = rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8].filter(p => p !== skull && p !== empty))
    return { layout, time: `${hour}:${String(minute).padStart(2, '0')} PM`, skull, knight, target }
  }
}
