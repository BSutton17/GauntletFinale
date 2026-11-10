import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORIES } from '../src/story/script.js'
import { buildStory, renderTemplate, toParts } from '../src/story/engine.js'
import { PRONOUN_OPTIONS } from '../../shared/levels.js'

const text = (lines) => lines.map(l => l.parts.map(p => p.text).join('')).join('\n')

function castOf(a, b, names = ['Ash', 'Blair']) {
  const c = { A: { name: names[0], pronouns: a }, B: { name: names[1], pronouns: b } }
  return { ...c, W: c.A, L: c.B }
}

test('every story renders for every pronoun pair with no leftover tags', () => {
  for (const a of PRONOUN_OPTIONS) for (const b of PRONOUN_OPTIONS) {
    for (const [id, lines] of Object.entries(STORIES)) {
      const out = text(buildStory(lines, castOf(a, b)))
      assert.ok(!/[{}]/.test(out), `${id} (${a}, ${b}) left a tag:\n${out.match(/.*[{}].*/)?.[0]}`)
      assert.ok(!/_/.test(out), `${id} left an italics marker`)
      assert.ok(!/\b(he|she) (attempt|fall|get|point|lift|explain|put|bring|do|ask|look|see|agree|pull|try|hand|realize|have|are|don’t)\b/i.test(out),
        `${id} (${a}, ${b}) has a singular pronoun with a plural verb`)
      assert.ok(!/\bthey (attempts|falls|gets|points|lifts|explains|puts|brings|does|asks|looks|sees|agrees|pulls|tries|hands|realizes|has|is|doesn’t)\b/i.test(out),
        `${id} (${a}, ${b}) has "they" with a singular verb`)
    }
  }
})

test('verb agreement and capitals', () => {
  const c = castOf('she/her', 'they/them')
  assert.equal(renderTemplate('{A.They} {A:attempt|attempts} to reach {A.their} ankle.', c), 'She attempts to reach her ankle.')
  assert.equal(renderTemplate('{B.They} {B:attempt|attempts} to reach {B.their} ankle.', c), 'They attempt to reach their ankle.')
  assert.equal(renderTemplate('{A} gives it to {B.them}.', castOf('he/him', 'he/him')), 'Ash gives it to him.')
})

test('the hair pin line depends on Player B being she/her', () => {
  const she = text(buildStory(STORIES[4], castOf('he/him', 'she/her')))
  const not = text(buildStory(STORIES[4], castOf('she/her', 'they/them')))
  assert.match(she, /hair pin in her hair/)
  assert.doesNotMatch(she, /on the ground/)
  assert.match(not, /hair pin on the ground/)
  assert.doesNotMatch(not, /in their hair/)
})

test('Jester Jaden becomes Jester Chase when a player is named Jaden', () => {
  const normal = text(buildStory(STORIES[10], castOf('he/him', 'he/him')))
  const jaden = text(buildStory(STORIES[10], castOf('he/him', 'he/him', ['Sam', ' jaden '])))
  assert.match(normal, /Jester Jaden/)
  assert.doesNotMatch(normal, /Jester Chase/)
  assert.match(jaden, /Jester Chase/)
  assert.doesNotMatch(jaden, /Jester Jaden/)
})

test('italics', () => {
  assert.deepEqual(toParts('_This_ is the key'), [{ text: 'This', italic: true }, { text: ' is the key' }])
})

test('every story line has a background scene', () => {
  const scenes = new Set()
  for (const [id, lines] of Object.entries(STORIES)) {
    for (const line of buildStory(lines, castOf('he/him', 'she/her'))) {
      assert.ok(line.bg, `${id} has a line with no scene`)
      scenes.add(line.bg)
    }
  }
  assert.deepEqual([...scenes].sort(), ['ballroom', 'castle-night', 'cell', 'corridor', 'dungeon-hall', 'maze', 'stables', 'throne-room', 'trail', 'warden-room'])
})
