import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateLanguage, decode, phrase, overridable, canConflict, specificMatches, TARGET, VOCAB } from '../src/levels/level2/language.js'
import level2 from '../src/levels/level2/index.js'
import { seededRng } from '../src/levels/rng.js'

test('every generated language reads one way only, and says the sentence', () => {
  const sizes = []
  for (let seed = 1; seed <= 300; seed++) {
    const lang = generateLanguage(seededRng(seed))
    const out = decode(lang.rules, lang.tokens)
    assert.ok(out.ok, `seed ${seed}: ${out.why}`)
    assert.deepEqual(out.words, TARGET, `seed ${seed}`)
    assert.ok(out.used.every((r) => !r.decoy), `seed ${seed}: a decoy fired`)
    assert.ok(lang.tokens.every((t) => VOCAB.includes(t)), 'only the allowed words')
    assert.ok(lang.rules.filter((r) => r.decoy).length >= 7, 'decoys')
    assert.ok(lang.commaAt >= 0 && lang.commaAt < lang.tokens.length)
    sizes.push(lang.tokens.length)
  }
  console.log(`message length ${Math.min(...sizes)}-${Math.max(...sizes)} tokens`)
})

test('no rule ever lies: specific rules never clash in ANY situation, absolutes are only used when true', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = seededRng(seed)
    const { rules } = generateLanguage(rng)
    for (const a of rules) for (const b of rules) assert.ok(!canConflict(a, b), `seed ${seed}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
    // Brute force too: every word, after every word (or nothing), before every word (or nothing).
    const ctx = [...VOCAB, undefined]
    for (const t of VOCAB) for (const p of ctx) for (const n of ctx) {
      const tokens = [p, t, n].filter((x) => x !== undefined)
      const i = p === undefined ? 0 : 1
      assert.ok(specificMatches(rules, tokens, i).length <= 1, `seed ${seed}: two rules fit "${tokens.join(' ')}"`)
    }
    for (const r of rules.filter((r) => r.type === 'def')) {
      const text = phrase(r, rng, rules).map((s) => s.v).join('')
      const hedged = /usually|normally|most of the time/i.test(text)
      if (overridable(r, rules)) assert.ok(hedged, `seed ${seed}: "${text}" is stated absolutely but can be overridden`)
      else assert.ok(!hedged, `seed ${seed}: "${text}" is hedged for no reason`)
    }
  }
})

test('decode refuses a sheet that can be read two ways', () => {
  const rules = [
    { type: 'next', t: 'that', x: 'the', e: 'a' },
    { type: 'seq', t: 'that', u: 'the', e: 'b' },
    { type: 'def', t: 'the', e: 'c' },
  ]
  assert.equal(decode(rules, ['that', 'the']).ok, false)
})

test('views: A gets the sheet, B gets the message; neither gets the rules or answer', () => {
  const s = level2.create({ rng: seededRng(5) })
  const a = level2.view(s, 'A')
  const b = level2.view(s, 'B')
  assert.ok(a.sheet.length >= 15 && !a.message)
  assert.ok(b.message.length >= 11 && !b.sheet)
  for (const v of [a, b]) {
    const json = JSON.stringify(v)
    assert.ok(!json.includes('"rules"') && !json.includes('decoy') && !json.includes('"tokens"'))
  }
  // B's message has no translation in it.
  assert.ok(!JSON.stringify(b).includes('problem'))
})

test('answers: "that" wins, the full translation gets a nudge, anything else rewrites the language', () => {
  const rng = seededRng(9)
  const s = level2.create({ rng })
  let done = 0, updates = 0
  const api = { rng, complete: () => done++, update: () => updates++ }
  const before = s.tokens.join(' ')
  level2.action(s, 'A', { type: 'answer', text: 'that' }, api)
  assert.equal(done, 0, 'only B answers')
  level2.action(s, 'B', { type: 'answer', text: 'The answer to this problem, is the word that' }, api)
  assert.equal(s.nudge, true)
  assert.equal(s.tokens.join(' '), before, 'translation is not a wrong answer')
  level2.action(s, 'B', { type: 'answer', text: 'key' }, api)
  assert.equal(s.wrong, 1)
  assert.equal(s.version, 2)
  assert.notEqual(s.tokens.join(' ') + JSON.stringify(s.sheet), before)
  level2.action(s, 'B', { type: 'answer', text: ' "That." ' }, api)
  assert.equal(done, 1)
})
