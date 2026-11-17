import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brotliDecompressSync } from 'node:zlib'
import { createRoomManager } from '../src/rooms/roomManager.js'
import { createRecorder, MIN_REPLAY_MS, FLUSH_MS } from '../src/replays/recorder.js'
import { createMemoryStore } from '../src/db/store.js'
import { seededRng } from '../src/levels/rng.js'

function harness() {
  let clock = 1_700_000_000_000
  const now = () => clock
  const store = createMemoryStore()
  const flushes = []
  const recorder = createRecorder({
    getStore: () => store, now,
    setTimer: (fn) => { flushes.push(fn); return flushes.length },
    clearTimer: () => {},
    log: { error: (m) => { throw new Error(m) } },
  })
  const sent = []
  const m = createRoomManager({
    transport: { toSeat: (code, role, event, data) => sent.push({ role, event, data }), toWatchers: () => {}, hasWatchers: () => false },
    getHostFurthest: async () => 11,
    rngFactory: () => seededRng(1),
    recorder, now,
    setTimer: () => 0, clearTimer: () => {},
  })
  return { m, store, recorder, sent, flushes, tick: (ms) => { clock += ms } }
}

const host = { id: 'u:host' }
const guest = { id: 'u:guest' }
const profile = (name) => ({ name, pronouns: 'they/them' })

async function startGame(h) {
  const { code } = h.m.create(host, profile('Ash'))
  h.m.attach(host.id, 's1')
  h.m.join(guest, code, profile('Blair'))
  h.m.attach(guest.id, 's2')
  await h.m.start(host.id, 1)
  return code
}

const readTimeline = async (store, meta) => {
  const out = []
  for (let i = 0; i < meta.chunks; i++) out.push(...JSON.parse(brotliDecompressSync(await store.getReplayChunk(meta.id, i)).toString()))
  return out
}

test('a game under three minutes is never stored', async () => {
  const h = harness()
  await startGame(h)
  h.tick(MIN_REPLAY_MS - 1000)
  h.m.advanceStory(host.id, { typed: true })
  h.m.leave(host.id)
  await h.recorder.settle()
  assert.deepEqual(await h.store.listReplays(), [])
})

test('three minutes of lobby alone is never stored', async () => {
  const h = harness()
  const { code } = h.m.create(host, profile('Ash'))
  h.m.attach(host.id, 's1')
  h.tick(MIN_REPLAY_MS + 60_000)
  h.m.join(guest, code, profile('Blair'))
  h.m.leave(host.id)
  await h.recorder.settle()
  assert.deepEqual(await h.store.listReplays(), [])
})

test('a longer game is stored in chunks as it goes, with what the spectator saw, and players are told nothing', async () => {
  const h = harness()
  await startGame(h)
  h.tick(60_000)
  h.m.advanceStory(host.id, { typed: true })
  assert.deepEqual(await h.store.listReplays(), []) // nothing written yet

  h.tick(MIN_REPLAY_MS)
  h.m.advanceStory(host.id, { typed: true })
  await h.recorder.settle()
  let [meta] = await h.store.listReplays()
  assert.equal(meta.ended, false)
  assert.equal(meta.chunks, 1)
  assert.deepEqual(meta.players, { A: 'Ash', B: 'Blair' })
  assert.ok(h.recorder.isLive(meta.id))

  // the periodic flush writes what came since
  h.tick(FLUSH_MS)
  h.m.advanceStory(host.id, { typed: true })
  h.flushes.shift()()
  await h.recorder.settle()
  assert.equal((await h.store.getReplay(meta.id)).chunks, 2)

  h.m.saveAndQuit(host.id)
  await h.recorder.settle()
  meta = await h.store.getReplay(meta.id)
  assert.equal(meta.ended, true)
  assert.ok(meta.durationMs > MIN_REPLAY_MS)
  assert.ok(!h.recorder.isLive(meta.id))

  const timeline = await readTimeline(h.store, meta)
  assert.deepEqual(timeline.map(e => e[0]), [...timeline.map(e => e[0])].sort((a, b) => a - b))
  const snaps = timeline.filter(e => e[1] === 's').map(e => e[2])
  assert.ok(snaps.every(s => s.you.spectator))
  assert.ok(snaps.some(s => s.phase === 'story'))
  assert.equal(timeline.at(-1)[1], 'x')

  // nothing about recording ever reaches a player
  for (const s of h.sent) assert.ok(!/recId|replay|recording/i.test(JSON.stringify(s.data)), JSON.stringify(s.data))
})

test('the oldest replays are deleted once over the size limit', async () => {
  const store = createMemoryStore()
  let clock = 0
  const recorder = createRecorder({ getStore: () => store, now: () => clock, setTimer: () => 0, clearTimer: () => {}, maxBytes: 1 })
  const ids = []
  for (let k = 0; k < 2; k++) {
    const id = recorder.begin('1234', clock)
    recorder.state(id, { phase: 'level', level: 1, players: {} })
    clock += MIN_REPLAY_MS + 1
    recorder.state(id, { phase: 'level', level: 2, players: {} })
    recorder.end(id, 'done')
    await recorder.settle()
    ids.push(id)
  }
  const left = await store.listReplays()
  assert.deepEqual(left.map(r => r.id), [ids[1]]) // the newest is always kept
})
