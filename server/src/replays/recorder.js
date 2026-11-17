// Game replays for the King's Window.
//
// Every room is recorded exactly as the silent admin spectator would see it: each spectator snapshot
// (room:state, with both players' level views) and each fast level stream (the horse, 30 times a second), with
// the time it happened. Nothing is written until the recording becomes a real game (it left the lobby) that has
// run for more than three minutes; shorter ones are thrown away when the room closes. From then on the
// timeline is written to the database in compressed chunks every 30 seconds, so a server restart loses at most
// the last half minute.
//
// The timeline is a list of JSON entries, t = milliseconds since the room was created:
//   [t, 's', snapshot]                  the spectator's room:state
//   [t, 'l', { role, event, data }]     a level stream message (role = the side of the puzzle)
//   [t, 'a', { level, ...assets }]      read-only level data a replay can't ask the server for later
//                                       (Level 3's piece pictures, normally fetched with a query)
//   [t, 'x', reason]                    the room closed
// Each stored chunk is a brotli-compressed JSON array of entries; the chunks join up in order.

import { brotliCompress, constants } from 'node:zlib'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

export const MIN_REPLAY_MS = 3 * 60 * 1000
export const FLUSH_MS = 30 * 1000
const CHUNK_BYTES = 6 * 1024 * 1024 // write early if this much is waiting (keeps chunks far below Mongo's 16 MB)

const compress = promisify(brotliCompress)
// A big window so the many near-identical snapshots in a chunk compress against each other.
export const packChunk = (json) => compress(Buffer.from(json), {
  params: {
    [constants.BROTLI_PARAM_QUALITY]: 5,
    [constants.BROTLI_PARAM_LGWIN]: 22,
    [constants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(json),
  },
})

export function createRecorder({ getStore, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, maxBytes = Infinity, log = console } = {}) {
  const recs = new Map() // recording id -> recording
  const pending = new Set() // writes in flight

  function begin(code, createdAt = now()) {
    const id = randomUUID()
    recs.set(id, {
      id, code, startedAt: createdAt,
      events: [], bytes: 0, lastT: 0, lastSnap: null,
      players: { A: null, B: null }, levelFrom: null, levelTo: null, finished: false, started: false,
      saved: false, chunks: 0, stored: 0, timer: null, chain: Promise.resolve(), ended: false, endReason: null,
    })
    return id
  }

  function push(rec, type, json) {
    const t = Math.max(0, now() - rec.startedAt)
    const entry = `[${t},"${type}",${json}]`
    rec.events.push(entry)
    rec.bytes += entry.length
    if (type !== 'x') rec.lastT = t
    if (!rec.saved && rec.started && rec.lastT > MIN_REPLAY_MS) {
      rec.saved = true
      flush(rec)
    } else if (rec.saved && rec.bytes >= CHUNK_BYTES) {
      flush(rec)
    }
  }

  function state(id, snap) {
    const rec = recs.get(id)
    if (!rec || rec.ended) return
    const json = JSON.stringify(snap)
    if (json === rec.lastSnap) return
    rec.lastSnap = json
    rec.players = { A: snap.players?.A?.name ?? rec.players.A, B: snap.players?.B?.name ?? rec.players.B }
    if (snap.phase !== 'lobby') rec.started = true
    if (snap.phase === 'level') {
      rec.levelFrom = Math.min(rec.levelFrom ?? snap.level, snap.level)
      rec.levelTo = Math.max(rec.levelTo ?? snap.level, snap.level)
    }
    if (snap.phase === 'credits') rec.finished = true
    push(rec, 's', json)
  }

  function stream(id, msg) {
    const rec = recs.get(id)
    if (rec && !rec.ended) push(rec, 'l', JSON.stringify(msg))
  }

  function assets(id, level, data) {
    const rec = recs.get(id)
    if (rec && !rec.ended && data) push(rec, 'a', JSON.stringify({ level, ...data }))
  }

  function end(id, reason) {
    const rec = recs.get(id)
    if (!rec || rec.ended) return
    push(rec, 'x', JSON.stringify(reason ?? null))
    rec.ended = true
    rec.endReason = reason ?? null
    recs.delete(id)
    if (rec.timer) { clearTimer(rec.timer); rec.timer = null }
    if (rec.saved) flush(rec, true)
  }

  function meta(rec) {
    return {
      id: rec.id,
      code: rec.code,
      players: { ...rec.players },
      startedAt: rec.startedAt,
      updatedAt: now(),
      durationMs: rec.lastT,
      levelFrom: rec.levelFrom,
      levelTo: rec.levelTo,
      finished: rec.finished,
      chunks: rec.chunks,
      bytes: rec.stored,
      ended: rec.ended,
      endReason: rec.endReason,
    }
  }

  // Writes are chained per recording so chunks and the summary land in order.
  function flush(rec, final = false) {
    if (rec.timer) { clearTimer(rec.timer); rec.timer = null }
    const events = rec.events
    rec.events = []
    rec.bytes = 0
    const index = events.length ? rec.chunks++ : -1
    rec.chain = rec.chain.then(async () => {
      const store = getStore()
      if (index >= 0) {
        const buf = await packChunk(`[${events.join(',')}]`)
        await store.putReplayChunk(rec.id, index, buf)
        rec.stored += buf.length
      }
      await store.saveReplay(meta(rec))
      if (final) await prune(store, rec.id)
    }).catch((e) => log.error(`[replays] could not save ${rec.id}: ${e.message}`))
    const p = rec.chain
    pending.add(p)
    p.then(() => pending.delete(p))
    if (!final) {
      rec.timer = setTimer(() => { rec.timer = null; if (!rec.ended) flush(rec) }, FLUSH_MS)
      rec.timer?.unref?.()
    }
    return rec.chain
  }

  // Oldest replays go first once they take up more than maxBytes in all.
  async function prune(store, keepId) {
    if (!Number.isFinite(maxBytes)) return
    const list = await store.listReplays() // newest first
    let total = list.reduce((n, r) => n + (r.bytes ?? 0), 0)
    for (const r of [...list].reverse()) {
      if (total <= maxBytes) break
      if (r.id === keepId || isLive(r.id)) continue
      await store.deleteReplay(r.id)
      total -= r.bytes ?? 0
    }
  }

  const isLive = (id) => recs.has(id)

  return {
    begin, state, stream, assets, end, isLive,
    // tests: wait for every pending write
    settle: async () => { while (pending.size) await Promise.all([...pending]) },
    _recs: recs,
  }
}
