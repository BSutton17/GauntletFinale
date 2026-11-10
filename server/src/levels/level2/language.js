// Level 2's made-up language: a fresh rule sheet and a message encoded with it, every game and after every
// wrong answer.
//
// The language only uses VOCAB, and most of those are real English words, so "the" might mean "word",
// "that umm" might mean "this", and the word "that" itself shows up all over the place. That's the point.
//
// Rule kinds (t = the word being read):
//   def   t = E                          the plain meaning of t ('' = means nothing)
//   seq   t followed by u = E            the two words are read together
//   next  t before x = E                 peeks at the next word (x is still translated on its own)
//   prev  t after p = E                  peeks at the previous word
//   end   t at the very end = E
// A specific rule (seq/next/prev/end) beats t's usual meaning. The checker (decode) insists that at every
// step exactly ONE specific rule applies, or none and exactly one plain meaning, so the sheet can only be
// read one way.
//
// ⚠️ NO RULE MAY LIE (the user's rule). Confusing is fine, false is not:
//   - two specific rules for the same word can never both apply, in ANY situation, not just this message
//     (a "prev" rule's word gets no seq/next/end rules, and vice versa; see canConflict)
//   - a word's plain meaning is only stated absolutely ("Ignore every…") when nothing can override it;
//     otherwise it's hedged ("usually…"), which is true Decoys are real-looking rules for words that aren't in the message, guaranteed never to
// apply anywhere in it.

export const VOCAB = ['yes', 'no', 'what', 'what?', 'umm', 'uhh', 'this', 'that', 'there', 'is', 'a', 'the', 'ok', 'okay', 'yeah', 'their', 'they’re', 'two', 'too', 'to']

export const TARGET = ['the', 'answer', 'to', 'this', 'problem', 'is', 'the', 'word', 'that']
const COMMA_AFTER = 4 // "problem,"

const DECOY_WORDS = ['key', 'door', 'guard', 'king', 'escape', 'cell', 'not', 'never', 'open', 'run', 'left', 'right', 'secret', 'free', 'hide', 'lock', 'question', 'riddle', 'wrong', 'yes']

// ── reading a message ──────────────────────────────────────────────────────
export function specificMatches(rules, tokens, i) {
  const t = tokens[i], next = tokens[i + 1], prev = tokens[i - 1]
  return rules.filter(r => r.t === t && (
    (r.type === 'seq' && next === r.u) ||
    (r.type === 'next' && next === r.x) ||
    (r.type === 'prev' && i > 0 && prev === r.p) ||
    (r.type === 'end' && i === tokens.length - 1)))
}

// Returns { ok, words, used } or { ok: false, why }. `used` = the rule chosen at each step.
export function decode(rules, tokens) {
  const words = []
  const used = []
  let i = 0
  while (i < tokens.length) {
    const specific = specificMatches(rules, tokens, i)
    let rule
    if (specific.length > 1) return { ok: false, why: `two rules fit "${tokens[i]}" at ${i}` }
    if (specific.length === 1) rule = specific[0]
    else {
      const plain = rules.filter(r => r.type === 'def' && r.t === tokens[i])
      if (plain.length !== 1) return { ok: false, why: `no single meaning for "${tokens[i]}" at ${i}` }
      rule = plain[0]
    }
    used.push(rule)
    if (rule.e) words.push(rule.e)
    i += rule.type === 'seq' ? 2 : 1
  }
  return { ok: true, words, used }
}

// ── making one ─────────────────────────────────────────────────────────────
function attempt(rng) {
  const rules = []
  const has = (pred) => rules.some(pred)
  const fillers = rng.shuffle(VOCAB).slice(0, rng.range(1, 2))
  for (const f of fillers) rules.push({ type: 'def', t: f, e: '' })

  // The words, with "means nothing" fillers sprinkled between them.
  const items = []
  if (rng.chance(0.3)) items.push({ filler: rng.pick(fillers) })
  TARGET.forEach((w, i) => {
    items.push({ w, i })
    if (i < TARGET.length - 1 && rng.chance(0.3)) items.push({ filler: rng.pick(fillers) })
  })

  // Built back to front, so each word knows which token comes after it.
  const chunks = []
  let after = null
  for (const item of [...items].reverse()) {
    let chunk
    if (item.filler) {
      chunk = { tokens: [item.filler] }
    } else {
      chunk = encodeWord(rng, rules, item.w, after)
      if (!chunk) return null
      chunk.word = item.i
    }
    chunks.unshift(chunk)
    after = chunk.tokens[0]
  }
  const tokens = chunks.flatMap(c => c.tokens)
  if (tokens.length < 11 || tokens.length > 24) return null

  const first = decode(rules, tokens)
  if (!first.ok || first.words.join(' ') !== TARGET.join(' ')) return null

  // Decoys: never apply anywhere in this message.
  const pairs = new Set(tokens.slice(0, -1).map((t, i) => `${t}|${tokens[i + 1]}`))
  const nDecoys = rng.range(7, 9)
  const decoyWords = rng.shuffle(DECOY_WORDS.filter(w => !TARGET.includes(w)))
  for (let tries = 0; rules.filter(r => r.decoy).length < nDecoys && tries < 400; tries++) {
    const e = decoyWords[rules.filter(r => r.decoy).length]
    const kind = rng.pick(['seq', 'seq', 'next', 'prev', 'def', 'end'])
    const t = rng.chance(0.7) ? rng.pick(tokens) : rng.pick(VOCAB)
    let r
    if ((kind === 'seq' || kind === 'next' || kind === 'end') && has(x => x.t === t && x.type === 'prev')) continue
    if (kind === 'seq' || kind === 'next') {
      const u = rng.pick(VOCAB)
      if (pairs.has(`${t}|${u}`)) continue
      if (has(x => x.t === t && ((x.type === 'seq' && x.u === u) || (x.type === 'next' && x.x === u)))) continue
      r = kind === 'seq' ? { type: 'seq', t, u, e } : { type: 'next', t, x: u, e }
    } else if (kind === 'prev') {
      // "after" rules look backwards; they'd be able to clash with a forward-looking rule for the same word.
      if (has(x => x.t === t && (x.type === 'seq' || x.type === 'next' || x.type === 'end'))) continue
      const p = rng.pick(VOCAB)
      if (pairs.has(`${p}|${t}`) || has(x => x.type === 'prev' && x.t === t && x.p === p)) continue
      r = { type: 'prev', t, p, e }
    } else if (kind === 'end') {
      if (tokens[tokens.length - 1] === t || has(x => x.type === 'end' && x.t === t)) continue
      r = { type: 'end', t, e }
    } else {
      if (has(x => x.type === 'def' && x.t === t)) continue
      r = { type: 'def', t, e }
    }
    rules.push({ ...r, decoy: true })
    const check = decode(rules, tokens)
    if (!check.ok || check.words.join(' ') !== TARGET.join(' ') || check.used.some(u => u.decoy)) rules.pop()
  }
  if (rules.filter(r => r.decoy).length < nDecoys) return null

  const final = decode(rules, tokens)
  if (!final.ok || final.words.join(' ') !== TARGET.join(' ') || final.used.some(u => u.decoy)) return null

  // Where the comma goes: after the last token of "problem".
  let pos = 0, commaAt = -1
  for (const c of chunks) { pos += c.tokens.length; if (c.word === COMMA_AFTER) commaAt = pos - 1 }
  return { rules, tokens, commaAt }
}

// One English word -> a short run of tokens, reusing tokens other rules already use when it can (that's
// what makes it confusing). `after` is the token that will follow, or null at the very end.
function encodeWord(rng, rules, w, after) {
  const specificFor = (t) => rules.filter(r => r.t === t && r.type !== 'def')
  const plainOf = (t) => rules.find(r => r.type === 'def' && r.t === t)
  const firesBefore = (t, nxt) => specificFor(t).some(r => (r.type === 'seq' && r.u === nxt) || (r.type === 'next' && r.x === nxt) || (r.type === 'end' && nxt === null))
  const pickToken = () => (rng.chance(0.55) && rules.length ? rng.pick(rules).t : rng.pick(VOCAB))

  const kinds = rng.shuffle(after === null ? ['def', 'seq', 'end', 'seq'] : ['def', 'seq', 'next', 'next', 'seq'])
  for (const kind of kinds) {
    for (let tries = 0; tries < 12; tries++) {
      const t = pickToken()
      if (kind === 'def') {
        const p = plainOf(t)
        if (p && p.e !== w) continue
        if (firesBefore(t, after)) continue
        if (!p) rules.push({ type: 'def', t, e: w })
        return { tokens: [t] }
      }
      if (kind === 'seq') {
        const u = rng.pick(VOCAB)
        const same = rules.find(r => r.t === t && r.type === 'seq' && r.u === u)
        if (same && same.e !== w) continue
        if (rules.some(r => r.t === t && r.type === 'next' && r.x === u)) continue
        if (!same) rules.push({ type: 'seq', t, u, e: w })
        return { tokens: [t, u] }
      }
      if (kind === 'next') {
        const same = rules.find(r => r.t === t && r.type === 'next' && r.x === after)
        if (same && same.e !== w) continue
        if (rules.some(r => r.t === t && r.type === 'seq' && r.u === after)) continue
        if (!same) rules.push({ type: 'next', t, x: after, e: w })
        return { tokens: [t] }
      }
      if (kind === 'end') {
        const same = rules.find(r => r.t === t && r.type === 'end')
        if (same && same.e !== w) continue
        if (!same) rules.push({ type: 'end', t, e: w })
        return { tokens: [t] }
      }
    }
  }
  return null
}

export function generateLanguage(rng) {
  for (let i = 0; i < 20000; i++) {
    const made = attempt(rng)
    if (made) return { ...made, rules: rng.shuffle(made.rules) }
  }
  throw new Error('could not build a language')
}

// ── the sheet, as text segments: { k: 'tok' | 'eng' | 'txt', v } ───────────
const T = (v) => ({ k: 'tok', v })
const E = (v) => ({ k: 'eng', v })
const X = (v) => ({ k: 'txt', v })

// Can another rule ever stop `rule` (a plain meaning) from applying? Rules that only PEEK at the word
// (next/prev) don't: it's still read on its own.
export function overridable(rule, rules) {
  return rules.some(r => r !== rule && r.type !== 'def' && (r.t === rule.t || (r.type === 'seq' && r.u === rule.t)))
}

// Could two specific rules ever both fit the same word, in any situation at all?
export function canConflict(a, b) {
  if (a === b || a.t !== b.t || a.type === 'def' || b.type === 'def') return false
  const forward = (r) => (r.type === 'seq' ? r.u : r.type === 'next' ? r.x : null)
  if (a.type === 'prev' || b.type === 'prev') {
    if (a.type === 'prev' && b.type === 'prev') return a.p === b.p
    return true // a backward look and any forward look (or end) can coincide
  }
  if (a.type === 'end' || b.type === 'end') return a.type === b.type
  return forward(a) === forward(b)
}

// One rule as sheet text. `rules` (the whole sheet) decides whether a plain meaning may be stated absolutely.
export function phrase(rule, rng, rules = []) {
  const { t, e } = rule
  const meaning = e === '' ? [X(rng.pick([' means nothing at all', ' is just noise; skip it', ' means nothing']))] : [X(rng.pick([' means ', ' = ', ' is read as '])), E(e)]
  switch (rule.type) {
    case 'def': {
      if (overridable(rule, rules)) {
        // True, but not absolute: something else on the sheet can change it.
        const hedged = e === ''
          ? [X(rng.pick([' usually means nothing', ' is usually just noise', ' normally means nothing']))]
          : [X(rng.pick([' usually means ', ' normally means ', ' most of the time means '])), E(e)]
        return rng.chance(0.3) ? [X('Most of the time, '), T(t), ...(e === '' ? [X(' means nothing')] : [X(' means '), E(e)])] : [T(t), ...hedged]
      }
      return e === '' && rng.chance(0.5) ? [X('Ignore every '), T(t)] : [T(t), ...meaning]
    }
    case 'seq': return rng.chance(0.5)
      ? [T(t), X(' followed by '), T(rule.u), ...meaning]
      : [T(`${t} ${rule.u}`), X(' together'), ...meaning]
    case 'next': return rng.chance(0.5)
      ? [T(t), X(' right before '), T(rule.x), ...meaning]
      : [T(t), X(', when the next word is '), T(rule.x), X(','), ...meaning]
    case 'prev': return [T(t), X(' right after '), T(rule.p), ...meaning]
    case 'end': return [T(t), X(' as the very last word'), ...meaning]
    default: throw new Error(rule.type)
  }
}

export const SHEET_NOTES = [
  'Read the message from left to right.',
  '“Followed by” and “together” mean the two words are read as one.',
  '“Before”, “after” and “next word” only peek at the neighbour. The neighbour still gets read on its own.',
  'A rule about a specific situation beats what a word usually means.',
  'Not every rule on this sheet will be needed.',
]
