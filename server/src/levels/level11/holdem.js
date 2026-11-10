// Heads-up no-limit Texas Hold'em for Level 11. 25 chips each; the game ends when one player has all 50.
//   Heads-up rules: the dealer (button) posts the small blind and acts first before the flop, last after it.
//   Blinds start at 1/2; every BLIND_EVERY hands the big blind goes up by BLIND_STEP (the user's rule: "up by 2
//   every 2 rounds"), the small blind is always half of it: 1/2, 2/4, 3/6, then capped at 4/8 (the user's cap).
import { newDeck, best, compare } from './cards.js'

export const START_STACK = 25
export const BLIND_EVERY = 2
export const BLIND_STEP = 2
export const BIG_BLIND_CAP = 8
const other = (p) => (p === 'A' ? 'B' : 'A')

export function newGame() {
  return { stacks: { A: START_STACK, B: START_STACK }, handNo: 0, button: 'B', hand: null, last: null, over: null }
}

export function blindsFor(handNo) {
  const bb = Math.min(BIG_BLIND_CAP, 2 + BLIND_STEP * Math.floor((handNo - 1) / BLIND_EVERY))
  return [bb / 2, bb]
}

// Deal a new hand: move the button, post the blinds, two cards each.
export function startHand(g, rng) {
  g.handNo++
  g.button = other(g.button)
  const [sb, bb] = blindsFor(g.handNo)
  const deck = newDeck(rng)
  const h = {
    deck, board: [], street: 'preflop',
    hole: { A: [deck.pop(), deck.pop()], B: [deck.pop(), deck.pop()] },
    bets: { A: 0, B: 0 }, put: { A: 0, B: 0 }, pot: 0,
    blinds: [sb, bb], minRaise: bb, acted: { A: false, B: false }, toAct: g.button, log: [],
  }
  g.hand = h
  g.last = null
  post(g, g.button, sb)
  post(g, other(g.button), bb)
  h.log.push(`Blinds ${sb}/${bb}`)
  // someone all in from just the blinds: nothing left to bet, or they can't be the one to act
  if (streetDone(g)) runOut(g)
  else if (g.stacks[h.toAct] === 0) h.toAct = other(h.toAct)
}

function post(g, who, amount) {
  const pay = Math.min(amount, g.stacks[who])
  g.stacks[who] -= pay
  g.hand.bets[who] += pay
  g.hand.put[who] += pay
}

// What `who` may do right now.
export function options(g, who) {
  const h = g.hand
  if (!h || h.street === 'done' || h.toAct !== who) return null
  const me = h.bets[who], them = h.bets[other(who)]
  const stack = g.stacks[who]
  const toCall = Math.min(them - me, stack)
  const maxTo = me + stack
  // a raise must be at least the last raise (or the big blind); all-in is always allowed
  const minTo = Math.min(maxTo, Math.max(them + h.minRaise, h.blinds[1]))
  const canRaise = stack > toCall && g.stacks[other(who)] > 0
  // "Bet" when nobody has bet yet this street (after the flop); otherwise it's a raise
  const word = h.street !== 'preflop' && them === 0 ? 'Bet' : 'Raise'
  return { canCheck: toCall === 0, toCall, canRaise, minTo, maxTo, word }
}

// Apply an action. Returns an error string, or null.
export function act(g, who, { type, to }) {
  const h = g.hand
  const o = options(g, who)
  if (!o) return 'not your turn'
  const opp = other(who)
  if (type === 'fold') {
    h.log.push(`${who} folds`)
    return finish(g, { winner: opp, reason: 'fold' })
  }
  if (type === 'check') {
    if (!o.canCheck) return 'cannot check'
    h.log.push(`${who} checks`)
  } else if (type === 'call') {
    if (o.toCall <= 0) return 'nothing to call'
    post(g, who, o.toCall)
    h.log.push(`${who} calls ${o.toCall}`)
  } else if (type === 'raise') {
    if (!o.canRaise) return 'cannot raise'
    let target = Math.floor(Number(to))
    if (!Number.isFinite(target)) return 'bad amount'
    target = Math.max(o.minTo, Math.min(o.maxTo, target))
    const raiseBy = target - h.bets[opp]
    if (raiseBy >= h.minRaise) h.minRaise = raiseBy
    post(g, who, target - h.bets[who])
    h.acted[opp] = false
    h.log.push(g.stacks[who] === 0 ? `${who} is all in (${target})` : `${who} raises to ${target}`)
  } else return 'unknown action'
  h.acted[who] = true
  advance(g)
  return null
}

function streetDone(g) {
  const h = g.hand
  const allIn = (p) => g.stacks[p] === 0
  if (h.bets.A === h.bets.B) return (h.acted.A || allIn('A')) && (h.acted.B || allIn('B'))
  // unequal: only done if the one behind is all in (the excess goes back)
  const low = h.bets.A < h.bets.B ? 'A' : 'B'
  return allIn(low)
}

function collect(g) {
  const h = g.hand
  // an uncalled part of a bet goes back to whoever made it
  const hi = h.bets.A > h.bets.B ? 'A' : 'B'
  const excess = h.bets[hi] - h.bets[other(hi)]
  if (excess > 0) { g.stacks[hi] += excess; h.bets[hi] -= excess; h.put[hi] -= excess }
  h.pot += h.bets.A + h.bets.B
  h.bets = { A: 0, B: 0 }
}

function deal(h, n) { for (let i = 0; i < n; i++) h.board.push(h.deck.pop()) }

function nextStreet(g) {
  const h = g.hand
  collect(g)
  h.minRaise = h.blinds[1]
  h.acted = { A: false, B: false }
  if (h.street === 'preflop') { h.street = 'flop'; deal(h, 3) }
  else if (h.street === 'flop') { h.street = 'turn'; deal(h, 1) }
  else if (h.street === 'turn') { h.street = 'river'; deal(h, 1) }
  else return showdown(g)
  h.toAct = other(g.button) // after the flop the non-dealer acts first
  return null
}

function advance(g) {
  const h = g.hand
  if (!streetDone(g)) { h.toAct = other(h.toAct); return }
  // anyone all in: no more betting, deal the rest of the board and show down
  if (g.stacks.A === 0 || g.stacks.B === 0) return runOut(g)
  nextStreet(g)
}

function runOut(g) {
  while (g.hand.street !== 'done') nextStreet(g)
}

function showdown(g) {
  const h = g.hand
  const a = best([...h.hole.A, ...h.board]), b = best([...h.hole.B, ...h.board])
  const c = compare(a.rank, b.rank)
  return finish(g, { winner: c > 0 ? 'A' : c < 0 ? 'B' : null, reason: 'showdown', hands: { A: a.name, B: b.name } })
}

function finish(g, { winner, reason, hands }) {
  const h = g.hand
  collect(g)
  const pot = h.pot
  if (winner) g.stacks[winner] += pot
  else {
    // split; an odd chip goes to the player who isn't the dealer
    const half = Math.floor(pot / 2)
    g.stacks.A += half; g.stacks.B += half
    if (pot % 2) g.stacks[other(g.button)] += 1
  }
  h.pot = 0
  h.street = 'done'
  h.toAct = null
  g.last = { winner, reason, pot, hands: hands ?? null, showCards: reason === 'showdown' ? { A: h.hole.A, B: h.hole.B } : null, board: [...h.board] }
  if (g.stacks.A === 0 || g.stacks.B === 0) g.over = g.stacks.A > 0 ? 'A' : 'B'
  return null
}
