import { test } from 'node:test'
import assert from 'node:assert/strict'
import level3 from '../src/levels/level3/index.js'
import { pieceCells } from '../src/levels/level3/keyArt.js'
import { seededRng } from '../src/levels/rng.js'

const api = () => {
  const a = { updates: 0, completed: 0 }
  a.update = () => a.updates++
  a.complete = () => a.completed++
  return a
}

test('the key is exactly 104 pieces: 4 in the mold, 50 each', () => {
  assert.equal(pieceCells().length, 104)
  const s = level3.create({ rng: seededRng(1) })
  assert.equal(s.pieces.length, 104)
  assert.equal(s.pieces.filter(p => p.placed).length, 4)
  assert.equal(s.pieces.filter(p => p.owner === 'A').length, 50)
  assert.equal(s.pieces.filter(p => p.owner === 'B').length, 50)
  level3.dispose(s)
})

test("a player's view never says where their loose pieces go, in any mode", () => {
  const s = level3.create({ rng: seededRng(2) })
  const a = level3.view(s, 'A', { devMode: false })
  assert.equal(a.tray.length, 50)
  assert.equal(a.targets, undefined)
  assert.ok(a.tray.every(id => typeof id === 'string'))
  assert.equal(a.placed.length, 4)
  assert.equal(a.partnerLeft, 50)
  const json = JSON.stringify(a)
  for (const id of a.tray) assert.ok(!a.placed.some(p => p.id === id))
  assert.ok(!/"owner"/.test(json))
  const dev = level3.view(s, 'A', { devMode: true })
  assert.equal(dev.targets, undefined)
  assert.equal(dev.partnerTarget, undefined)
})

test('dropping: near the right spot sticks, elsewhere doesn\'t, partner\'s pieces can\'t be moved', () => {
  const s = level3.create({ rng: seededRng(3) })
  const mine = s.pieces.find(p => p.owner === 'A')
  const theirs = s.pieces.find(p => p.owner === 'B')
  const ap = api()
  assert.deepEqual(level3.action(s, 'A', { type: 'drop', id: theirs.id, x: theirs.c + 0.5, y: theirs.r + 0.5 }, ap), { placed: false })
  assert.deepEqual(level3.action(s, 'A', { type: 'drop', id: mine.id, x: mine.c + 1.5, y: mine.r + 0.5 }, ap), { placed: false })
  assert.deepEqual(level3.action(s, 'A', { type: 'drop', id: mine.id, x: mine.c + 0.8, y: mine.r + 0.3 }, ap), { placed: true })
  assert.equal(ap.updates, 1)
  assert.ok(level3.view(s, 'B', {}).placed.some(p => p.id === mine.id), 'B now sees it')
  level3.dispose(s)
})

test("holding a piece lights up its spot on the PARTNER's screen only, until it's let go", () => {
  const s = level3.create({ rng: seededRng(7) })
  const ap = api()
  const [p1, p2] = s.pieces.filter(p => p.owner === 'A')
  const theirs = s.pieces.find(p => p.owner === 'B')
  level3.action(s, 'A', { type: 'grab', id: theirs.id }, ap)
  assert.equal(level3.view(s, 'B', {}).partnerTarget, undefined, "cannot hold the partner's piece")
  level3.action(s, 'A', { type: 'grab', id: p1.id }, ap)
  assert.deepEqual(level3.view(s, 'B', {}).partnerTarget, [p1.c, p1.r])
  assert.equal(level3.view(s, 'A', {}).partnerTarget, undefined, 'the holder does not see it')
  assert.equal(level3.view(s, 'A', {}).targets, undefined)
  level3.action(s, 'A', { type: 'release' }, ap)
  assert.equal(level3.view(s, 'B', {}).partnerTarget, undefined)
  // a wrong drop ends the hold too
  level3.action(s, 'A', { type: 'grab', id: p2.id }, ap)
  level3.action(s, 'A', { type: 'drop', id: p2.id, x: -9, y: -9 }, ap)
  assert.equal(level3.view(s, 'B', {}).partnerTarget, undefined)
  // and a right one
  level3.action(s, 'A', { type: 'grab', id: p2.id }, ap)
  level3.action(s, 'A', { type: 'drop', id: p2.id, x: p2.c + 0.5, y: p2.r + 0.5 }, ap)
  assert.equal(level3.view(s, 'B', {}).partnerTarget, undefined)
  level3.dispose(s)
})

test('rapid wrong guesses are throttled', () => {
  const s = level3.create({ rng: seededRng(4) })
  const mine = s.pieces.filter(p => p.owner === 'B')
  const ap = api()
  for (let i = 0; i < 6; i++) level3.action(s, 'B', { type: 'drop', id: mine[0].id, x: -5, y: -5 }, ap)
  const r = level3.action(s, 'B', { type: 'drop', id: mine[1].id, x: mine[1].c + 0.5, y: mine[1].r + 0.5 }, ap)
  assert.deepEqual(r, { placed: false, cooldown: true })
  level3.dispose(s)
})

test('pictures: only your own loose pieces and placed ones', async () => {
  const s = level3.create({ rng: seededRng(5) })
  const mine = s.pieces.find(p => p.owner === 'A' && !p.placed)
  const theirs = s.pieces.find(p => p.owner === 'B' && !p.placed)
  const preset = s.pieces.find(p => p.placed)
  const { images } = await level3.query(s, 'A', { type: 'images', ids: [mine.id, theirs.id, preset.id] })
  assert.ok(images[mine.id].startsWith('data:image/webp;base64,'))
  assert.ok(images[preset.id])
  assert.equal(images[theirs.id], undefined)
  level3.dispose(s)
})

test('placing every piece finishes the level after a pause', async () => {
  const s = level3.create({ rng: seededRng(6) })
  const ap = api()
  for (const p of s.pieces.filter(p => !p.placed)) level3.action(s, p.owner, { type: 'drop', id: p.id, x: p.c + 0.5, y: p.r + 0.5 }, ap)
  assert.equal(s.done, true)
  assert.equal(ap.completed, 0)
  assert.ok(s.finishTimer)
  level3.dispose(s)
})
