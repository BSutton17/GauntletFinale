// Cards and hand ranking for Level 11's poker.
// A card is { r: 2..14 (11 J, 12 Q, 13 K, 14 A), s: 'c' | 'd' | 'h' | 's' }.

export const SUITS = ['c', 'd', 'h', 's']
export const RANK_NAME = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' }
const PLURAL = (r) => (r === 6 ? 'sixes' : `${RANK_NAME[r]}s`)
export const CATEGORY = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']

export function newDeck(rng) {
  const d = []
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s })
  return rng.shuffle(d)
}

// A 5-card hand -> [category, ...tiebreakers]; bigger compares higher.
export function rank5(cards) {
  const rs = cards.map(c => c.r).sort((a, b) => b - a)
  const flush = cards.every(c => c.s === cards[0].s)
  const uniq = [...new Set(rs)]
  let straightHigh = 0
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0]
    else if (rs.join() === '14,5,4,3,2') straightHigh = 5 // the wheel: A-2-3-4-5
  }
  const counts = new Map()
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1)
  // ranks ordered by (count, rank)
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const shape = groups.map(g => g[1]).join('')
  const byGroup = groups.map(g => g[0])
  if (straightHigh && flush) return [8, straightHigh]
  if (shape === '41') return [7, ...byGroup]
  if (shape === '32') return [6, ...byGroup]
  if (flush) return [5, ...rs]
  if (straightHigh) return [4, straightHigh]
  if (shape === '311') return [3, ...byGroup]
  if (shape === '221') return [2, ...byGroup]
  if (shape === '2111') return [1, ...byGroup]
  return [0, ...rs]
}

export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return 0
}

// The best 5 of up to 7 cards: { rank, cards, name }.
export function best(cards) {
  let top = null
  const n = cards.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
    const r = rank5(five)
    if (!top || compare(r, top.rank) > 0) top = { rank: r, cards: five }
  }
  return { ...top, name: describe(top.rank) }
}

export function describe(rank) {
  const [cat, a, b] = rank
  switch (cat) {
    case 8: return a === 14 ? 'a royal flush' : `a straight flush, ${RANK_NAME[a]} high`
    case 7: return `four ${PLURAL(a)}`
    case 6: return `a full house, ${PLURAL(a)} full of ${PLURAL(b)}`
    case 5: return `a flush, ${RANK_NAME[a]} high`
    case 4: return `a straight, ${RANK_NAME[a]} high`
    case 3: return `three ${PLURAL(a)}`
    case 2: return `two pair, ${PLURAL(a)} and ${PLURAL(b)}`
    case 1: return `a pair of ${PLURAL(a)}`
    default: return `${RANK_NAME[a]} high`
  }
}
