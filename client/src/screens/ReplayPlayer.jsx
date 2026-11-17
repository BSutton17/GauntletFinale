// Plays a recorded game back in the King's Window, through the same read-only RoomView as live spectating.
// The timeline (see server/src/replays/recorder.js) is a list of [t, type, data]:
//   's' a spectator snapshot, 'l' a level stream message, 'a' level assets (Level 3's pictures), 'x' the end.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import RoomView from './RoomView.jsx'

const SPEEDS = [1, 2, 4, 8]
const QUIET_MS = 15000      // "skip pauses": a gap longer than this jumps to just before the next thing
const QUIET_LEAD_MS = 1000
const STREAM_LOOKBACK_MS = 10000 // after a seek, the latest stream message of each kind from this far back

export function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const PHASE = { lobby: 'Lobby', story: 'Story', card: 'Level card', level: 'Puzzle', choice: 'The choice', credits: 'Credits' }

// Index of the first entry after time t.
function firstAfter(events, t) {
  let lo = 0, hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid][0] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export default function ReplayPlayer({ meta, onClose }) {
  const [events, setEvents] = useState(null)
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState(null)
  const [room, setRoom] = useState(null)
  const [shownT, setShownT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [skipQuiet, setSkipQuiet] = useState(true)
  const [epoch, setEpoch] = useState(0) // bumps on every seek, so the screens start fresh
  const subs = useRef(new Map())        // "role|event" -> Set<fn>
  const assets = useRef({})             // merged level assets, e.g. { images: { id: url } }
  const pos = useRef({ t: 0, i: 0 })    // playback time and the next entry to play
  const pendingStreams = useRef(null)

  // ── load every chunk ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const all = []
        for (let i = 0; i < meta.chunks; i++) {
          const part = await api.replayChunk(meta.id, i)
          if (!alive) return
          for (const e of part) all.push(e)
          setLoaded(i + 1)
        }
        for (const [, type, data] of all) {
          if (type !== 'a') continue
          for (const [k, v] of Object.entries(data)) if (k !== 'level' && v && typeof v === 'object') Object.assign(assets.current[k] ??= {}, v)
        }
        if (alive) setEvents(all)
      } catch (e) {
        if (alive) setError(e.status === 403 ? 'Not allowed.' : 'Could not load this replay.')
      }
    })()
    return () => { alive = false }
  }, [meta.id, meta.chunks])

  const end = events?.length ? events[events.length - 1][0] : 0
  const start = events?.length ? events[0][0] : 0

  // ── streams, the same shape App gives live spectators ──
  const makeSubscribe = useCallback((role) => (event, fn) => {
    const key = `${role ?? ''}|${event}`
    if (!subs.current.has(key)) subs.current.set(key, new Set())
    subs.current.get(key).add(fn)
    return () => subs.current.get(key)?.delete(fn)
  }, [])
  const dispatch = (msg) => subs.current.get(`${msg.role ?? ''}|${msg.event}`)?.forEach((fn) => fn(msg.data))

  // Level 3 asks for piece pictures; answer from the recording.
  const replayQuery = useCallback((_role, msg) => {
    if (msg?.type === 'images' && Array.isArray(msg.ids)) {
      const all = assets.current.images ?? {}
      const images = {}
      for (const id of msg.ids) if (all[id]) images[id] = all[id]
      return Promise.resolve({ ok: true, images })
    }
    return Promise.resolve({ ok: true })
  }, [])

  // ── jump to any time: the last snapshot before it, plus the latest of each stream ──
  const seek = useCallback((target) => {
    if (!events?.length) return
    const t = Math.max(start, Math.min(end, target))
    const i = firstAfter(events, t)
    let snap = null
    const latest = new Map()
    for (let k = i - 1; k >= 0; k--) {
      const [et, type, data] = events[k]
      if (type === 's' && !snap) snap = data
      if (type === 'l' && et >= t - STREAM_LOOKBACK_MS) {
        const key = `${data.role ?? ''}|${data.event}`
        if (!latest.has(key)) latest.set(key, data)
      }
      if (snap && et < t - STREAM_LOOKBACK_MS) break
    }
    pos.current = { t, i }
    pendingStreams.current = [...latest.values()].reverse()
    setRoom(snap)
    setEpoch((n) => n + 1)
    setShownT(t)
  }, [events, start, end])

  useEffect(() => { if (events) seek(start) }, [events]) // eslint-disable-line react-hooks/exhaustive-deps

  // After a seek, the fresh screens subscribe in their effects; hand them the streams once they have.
  useEffect(() => {
    if (!pendingStreams.current) return
    const t = setTimeout(() => {
      const list = pendingStreams.current
      pendingStreams.current = null
      list?.forEach(dispatch)
    }, 60)
    return () => clearTimeout(t)
  }, [epoch])

  // ── playing ──
  useEffect(() => {
    if (!playing || !events) return
    let raf
    let last = performance.now()
    let lastShown = 0
    const frame = (nowMs) => {
      const p = pos.current
      let target = p.t + (nowMs - last) * speed
      last = nowMs
      if (skipQuiet && p.i < events.length && events[p.i][0] - p.t > QUIET_MS) target = Math.max(target, events[p.i][0] - QUIET_LEAD_MS)
      let snap = null
      while (p.i < events.length && events[p.i][0] <= target) {
        const [, type, data] = events[p.i++]
        if (type === 's') snap = data
        else if (type === 'l') dispatch(data)
      }
      p.t = Math.min(target, end)
      if (snap) setRoom(snap)
      if (p.t - lastShown >= 250 || p.t >= end) { lastShown = p.t; setShownT(p.t) }
      if (p.t >= end) { setPlaying(false); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [playing, events, speed, skipQuiet, end])

  // Space to play/pause, arrows to skip 10 s.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea')) return
      if (e.key === ' ') { e.preventDefault(); setPlaying((v) => !v) }
      else if (e.key === 'ArrowRight') seek(pos.current.t + 10000)
      else if (e.key === 'ArrowLeft') seek(pos.current.t - 10000)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seek])

  // Where each level's puzzle starts, for the "jump to" list.
  const chapters = useMemo(() => {
    const out = []
    let prev = null
    for (const [t, type, s] of events ?? []) {
      if (type !== 's') continue
      const key = s.phase === 'level' ? `level:${s.level}` : s.phase === 'lobby' ? 'lobby' : s.phase === 'choice' || s.phase === 'credits' ? s.phase : prev
      if (key !== prev && key) out.push({ t, label: s.phase === 'level' ? `Level ${s.level}` : PHASE[s.phase] })
      prev = key
    }
    return out
  }, [events])

  const view = useMemo(() => (room
    ? <RoomView key={epoch} socket={null} room={room} user={null} makeSubscribe={makeSubscribe} spectator replayQuery={replayQuery} />
    : null), [room, epoch, makeSubscribe, replayQuery])

  const names = `${meta.players?.A ?? '—'} & ${meta.players?.B ?? '—'}`
  const atEnd = shownT >= end

  return (
    <div className="spectate">
      <div className="spectate-bar replay-bar">
        <span>Replay · {names} · {new Date(meta.startedAt).toLocaleString()}{room && <> · {PHASE[room.phase] ?? room.phase}{room.phase !== 'lobby' && ` · Level ${room.level}`}</>}</span>
        <button className="btn small ghost" onClick={onClose}>Close replay</button>
        {events && (
          <div className="replay-controls">
            <button className="btn small" onClick={() => { if (atEnd) seek(start); setPlaying((v) => !v || atEnd) }}>
              {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
            </button>
            <span className="replay-time">{clockText(shownT - start)} / {clockText(end - start)}</span>
            <input className="replay-seek" type="range" min={start} max={end} step={250} value={shownT}
              onChange={(e) => seek(Number(e.target.value))} aria-label="Position" />
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
            <select value="" onChange={(e) => e.target.value !== '' && seek(Number(e.target.value))} aria-label="Jump to">
              <option value="">Jump to…</option>
              {chapters.map((c) => <option key={c.t} value={c.t}>{c.label} ({clockText(c.t - start)})</option>)}
            </select>
            <label className="replay-skip"><input type="checkbox" checked={skipQuiet} onChange={(e) => setSkipQuiet(e.target.checked)} /> Skip pauses</label>
          </div>
        )}
      </div>
      {error && <div className="center-screen"><p className="error">{error}</p></div>}
      {!error && !events && <div className="center-screen"><p className="faint">Loading the replay… {meta.chunks ? Math.round((loaded / meta.chunks) * 100) : 0}%</p></div>}
      {view}
    </div>
  )
}
