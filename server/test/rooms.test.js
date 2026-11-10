import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRoomManager, GameError } from '../src/rooms/roomManager.js'
import { applyProgress } from '../src/db/store.js'
import { seededRng } from '../src/levels/rng.js'

function harness({ devMode = false, furthest = 1 } = {}) {
  const sent = []
  const watchers = new Set()
  const timers = []
  const progress = []
  const m = createRoomManager({
    devMode,
    transport: {
      toSeat: (code, role, event, data) => sent.push({ to: role, event, data }),
      toWatchers: (code, event, data) => sent.push({ to: 'watch', event, data }),
      hasWatchers: (code) => watchers.has(code),
    },
    recordProgress: async (userId, entry) => progress.push({ userId, ...entry }),
    getHostFurthest: async () => furthest,
    rngFactory: () => seededRng(1),
    setTimer: (fn) => { timers.push(fn); return timers.length },
    clearTimer: () => {},
  })
  const last = (to) => [...sent].reverse().find(s => s.to === to && s.event === 'room:state')?.data
  const runTimers = () => { while (timers.length) timers.shift()() }
  return { m, sent, last, runTimers, progress, watchers }
}

const host = { id: 'u:host' }
const guest = { id: 'u:guest' }
const hp = { name: 'Ash', pronouns: 'she/her' }
const gp = { name: 'Blair', pronouns: 'he/him' }

function clickThroughStory(h, m) {
  for (let i = 0; i < 500 && h.last('A').phase === 'story'; i++) m.advanceStory(host.id, { typed: true })
}

test('create, join, start from level 1, the prologue, the level card, then level 1', async () => {
  const h = harness()
  const { m } = h
  const { code } = m.create(host, hp)
  m.attach(host.id, 's1')
  m.join(guest, ` ${code.slice(0, 2)}-${code.slice(2)} `, gp) // stray spaces/dashes are ignored
  m.attach(guest.id, 's2')
  assert.equal(h.last('B').players.A.name, 'Ash')
  assert.equal(h.last('B').you.isHost, false)

  await assert.rejects(() => Promise.resolve().then(() => m.start(guest.id, 1)), GameError)
  await m.start(host.id, 1)
  let a = h.last('A')
  assert.equal(a.phase, 'story')
  assert.equal(a.story.id, 'prologue')

  // First click reveals the rest of the line, second moves on.
  m.advanceStory(host.id, {})
  assert.equal(h.last('A').story.revealed, true)
  assert.equal(h.last('A').story.index, 0)
  m.advanceStory(host.id, {})
  assert.equal(h.last('A').story.index, 1)
  // Player B can't advance.
  m.advanceStory(guest.id, { typed: true })
  assert.equal(h.last('A').story.index, 1)

  clickThroughStory(h, m)
  assert.equal(h.last('A').phase, 'card')
  h.runTimers()
  a = h.last('A')
  const b = h.last('B')
  assert.equal(a.phase, 'level')
  assert.ok(a.levelView.letters)
  assert.ok(b.levelView.shifts)
  assert.equal(a.levelView.shifts, undefined)
  assert.equal(b.levelView.letters, undefined)

  m.levelAction(host.id, { type: 'guess', text: 'tile in the top right' })
  a = h.last('A')
  assert.equal(a.phase, 'story')
  assert.equal(a.story.id, '1')
  assert.equal(a.level, 2)
  assert.deepEqual(h.progress.map(p => [p.userId, p.role, p.level]), [['u:host', 'A', 2], ['u:guest', 'B', 2]])
  assert.equal(h.progress[1].hostName, 'Ash')
})

test('locked levels are refused unless dev mode', async () => {
  const h = harness({ furthest: 3 })
  const { code } = h.m.create(host, hp)
  h.m.join(guest, code, gp)
  await assert.rejects(() => h.m.start(host.id, 4), /locked/)
  await h.m.start(host.id, 3)
  assert.equal(h.last('A').story.id, '2')

  const d = harness({ devMode: true })
  const r = d.m.create(host, hp)
  d.m.join(guest, r.code, gp)
  await d.m.start(host.id, 11)
  assert.equal(d.last('A').story.id, '10')
})

test('the whole game in dev mode reaches the ending choice and both endings', async () => {
  for (const give of [false, true]) {
    const h = harness({ devMode: true })
    const { m } = h
    const { code } = m.create(host, hp)
    m.join(guest, code, gp)
    await m.start(host.id, 1)
    for (let level = 1; level <= 11; level++) {
      clickThroughStory(h, m)
      h.runTimers()
      assert.equal(h.last('A').phase, 'level', `level ${level}`)
      assert.equal(h.last('A').level, level)
      if (level === 1) m.levelAction(host.id, { type: 'guess', text: 'tileinthetopright' })
      else if (level === 2) m.levelAction(guest.id, { type: 'answer', text: 'that' })
      else {
        m.devSkipLevel(guest.id) // only the host may
        assert.equal(h.last('A').level, level)
        m.devSkipLevel(host.id)
      }
    }
    assert.equal(h.last('A').story.id, 'ending')
    clickThroughStory(h, m)
    assert.equal(h.last('A').phase, 'choice')
    assert.equal(h.last('B').choice.give, 'Give the coins to Blair')
    m.choose(guest.id, give) // the loser can't choose
    assert.equal(h.last('A').phase, 'choice')
    m.choose(host.id, give)
    assert.equal(h.last('A').story.id, give ? 'endingGive' : 'endingKeep')
    clickThroughStory(h, m)
    assert.equal(h.last('A').phase, 'credits')
    const card = h.last('B').credits
    assert.ok(card.roles.length > 10)
    assert.deepEqual(card.lines.map(l => `${l.who}: ${l.what}`),
      give ? ['Ash: $25', 'Blair: $25', 'King Bryson: a missing head'] : ['Ash: $50', 'Blair: $0'])
    assert.ok(h.progress.some(p => p.finished))
  }
})

test('spectators see both halves; players never learn about them', async () => {
  const h = harness({ devMode: true })
  const { code } = h.m.create(host, hp)
  h.m.join(guest, code, gp)
  h.watchers.add(code)
  await h.m.start(host.id, 1)
  clickThroughStory(h, h.m)
  h.runTimers()
  const w = h.last('watch')
  assert.ok(w.levelViews.A.letters && w.levelViews.B.shifts)
  assert.ok(!JSON.stringify(h.last('A')).includes('spectat'))
  assert.ok(!JSON.stringify(h.last('B')).includes('spectat'))
})

test('a third person cannot join; B leaving the lobby frees the seat; host leaving closes it', () => {
  const h = harness()
  const { code } = h.m.create(host, hp)
  h.m.join(guest, code, gp)
  assert.throws(() => h.m.join({ id: 'u:3' }, code, gp), /two prisoners/)
  h.m.leave(guest.id)
  h.m.join({ id: 'u:3' }, code, gp)
  h.m.leave(host.id)
  assert.ok(h.sent.some(s => s.event === 'room:closed'))
  assert.equal(h.m.roomOf('u:3'), null)
})

test('the same account in two browsers is two players (seats belong to sessions)', async () => {
  const h = harness()
  const s1 = { id: 'acct#browser1', accountId: 'acct' }
  const s2 = { id: 'acct#browser2', accountId: 'acct' }
  const { code } = h.m.create(s1, hp)
  assert.deepEqual(h.m.join(s2, code, gp), { code, role: 'B' }, 'joins as player 2, not as the host')
  assert.equal(h.last('A').players.B.name, 'Blair')
  // Player 2 leaving the lobby frees their seat; it does NOT close the host's cell.
  h.m.leave(s2.id)
  assert.ok(!h.sent.some(s => s.event === 'room:closed'))
  assert.equal(h.last('A').players.B, null)
  assert.deepEqual(h.m.roomOf(s1.id), { code, role: 'A' })
  // Progress still goes to the account.
  h.m.join(s2, code, gp)
  await h.m.start(s1.id, 1)
  for (let i = 0; i < 500 && h.last('A').phase === 'story'; i++) h.m.advanceStory(s1.id, { typed: true })
  h.runTimers()
  h.m.levelAction(s1.id, { type: 'guess', text: 'tile in the top right' })
  assert.deepEqual(h.progress.map(p => [p.userId, p.role]), [['acct', 'A'], ['acct', 'B']])
})

test('cell codes are 4-digit numbers', () => {
  const h = harness()
  const codes = new Set()
  for (let i = 0; i < 200; i++) {
    const { code } = h.m.create({ id: `u:${i}` }, hp)
    assert.match(code, /^[1-9][0-9]{3}$/)
    codes.add(code)
  }
  assert.equal(codes.size, 200, 'no two open cells share a code')
  assert.throws(() => h.m.join(guest, 'ABCD', gp), /No cell/)
})

test('switch sides: the players swap puzzle sides mid-level; seats, host and progress stay put', async () => {
  const h = harness({ furthest: 11 })
  const { code } = h.m.create(host, hp)
  h.m.join(guest, code, gp)
  assert.throws(() => h.m.switchSides(host.id), /during the game/, 'not in the lobby')
  await h.m.start(host.id, 1)
  clickThroughStory(h, h.m)
  h.runTimers()
  assert.ok(h.last('A').levelView.letters, 'before: the host has the letters side')
  assert.deepEqual(h.m.switchSides(host.id), { swapped: true })
  const a = h.last('A'), b = h.last('B')
  assert.ok(a.levelView.shifts && !a.levelView.letters, 'the host now sees the other side')
  assert.ok(b.levelView.letters, 'the guest now has the letters side')
  assert.equal(a.you.isHost, true)
  assert.equal(a.you.levelRole, 'B')
  assert.equal(b.you.levelRole, 'A')
  assert.equal(a.levelPlayers.A.name, 'Blair', 'names follow the sides')
  // Only the letters side can answer: that's the guest now.
  h.m.levelAction(host.id, { type: 'guess', text: 'tile in the top right' })
  assert.equal(h.last('A').phase, 'level', "the host's guess is ignored")
  h.progress.length = 0
  h.m.levelAction(guest.id, { type: 'guess', text: 'tile in the top right' })
  assert.equal(h.last('A').phase, 'story')
  assert.deepEqual(h.progress.map(p => [p.userId, p.role]), [['u:host', 'A'], ['u:guest', 'B']], 'progress by seat, as always')
  assert.deepEqual(h.m.switchSides(guest.id), { swapped: false }, 'switching again switches back')
})

test('switch sides: the poker winner is the player who won, whichever side they played', async () => {
  const h = harness({ furthest: 11, devMode: true })
  const { code } = h.m.create(host, hp)
  h.m.join(guest, code, gp)
  await h.m.start(host.id, 11)
  clickThroughStory(h, h.m)
  h.runTimers()
  h.m.switchSides(host.id)
  h.m.devSkipLevel(host.id) // dev skip = the host wins
  assert.equal(h.last('A').result.winner, 'A')
})

test('save and quit: either player saves the current level and the game ends for both', async () => {
  for (const quitter of [host, guest]) {
    const h = harness({ furthest: 11 })
    const { code } = h.m.create(host, hp)
    h.m.join(guest, code, gp)
    await h.m.start(host.id, 4)
    clickThroughStory(h, h.m)
    h.runTimers()
    assert.equal(h.last('A').phase, 'level')
    h.progress.length = 0
    assert.deepEqual(h.m.saveAndQuit(quitter.id), { level: 4 })
    assert.deepEqual(h.progress.map(p => [p.userId, p.role, p.level]), [['u:host', 'A', 4], ['u:guest', 'B', 4]])
    const closed = h.sent.filter(s => s.event === 'room:closed')
    assert.deepEqual(closed.map(s => s.to).sort(), ['A', 'B'])
    assert.match(closed[0].data.reason, quitter === host ? /^Ash saved and quit.*Level 4/ : /^Blair saved and quit.*Level 4/)
    assert.equal(h.m.roomOf(host.id), null)
    assert.equal(h.m.roomOf(guest.id), null)
  }
})

test('bad names and pronouns are refused', () => {
  const h = harness()
  assert.throws(() => h.m.create(host, { name: '', pronouns: 'he/him' }), GameError)
  assert.throws(() => h.m.create(host, { name: '{A}', pronouns: 'he/him' }), GameError)
  assert.throws(() => h.m.create(host, { name: 'Ash', pronouns: 'it/its' }), GameError)
})

test('progress: host and guest are kept apart, furthest only goes up', () => {
  const p = { host: { furthest: 1 }, guest: {} }
  applyProgress(p, { role: 'A', level: 5, partnerName: 'Blair' })
  applyProgress(p, { role: 'A', level: 3, partnerName: 'Blair' })
  applyProgress(p, { role: 'B', level: 7, hostId: 'google:9.9', hostName: 'Jordan' })
  assert.equal(p.host.furthest, 5)
  assert.deepEqual(Object.keys(p.guest), ['google:9_9'])
  assert.equal(p.guest['google:9_9'].furthest, 7)
  assert.equal(p.guest['google:9_9'].hostName, 'Jordan')
})
