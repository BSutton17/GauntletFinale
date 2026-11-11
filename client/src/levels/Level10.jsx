// Level 10: the night ride.
//   Player 1 (rider): a tiny circle of lantern light, nothing else. W/S/A/D or arrows; phones: see-through arrows
//     (speed up / brake bottom-left, turn bottom-right).
//   Player 2 (map): the whole road, lit orange by the lantern, turning with the horse. The lantern sometimes flickers.
// Both: the clock (flashes red and white under 30 seconds), "You Crashed", and the countdown.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight } from 'react-icons/fa'
import { useLevel, useStream } from '../lib/levelContext.js'

const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' }
const MAP_METRES = 95 // how much road Player 2 sees top to bottom

// World (x right, y up) -> screen, with the horse's heading pointing up the screen.
function projector(hx, hy, heading, cx, cy, scale) {
  const a = Math.PI / 2 - heading
  const ca = Math.cos(a), sa = Math.sin(a)
  return (x, y) => {
    const dx = x - hx, dy = y - hy
    return [cx + (dx * ca - dy * sa) * scale, cy - (dx * sa + dy * ca) * scale]
  }
}

function checkerboard(ctx, P, end, width, scale) {
  const [ex, ey, eh] = end
  const nx = Math.cos(eh + Math.PI / 2), ny = Math.sin(eh + Math.PI / 2)
  const fx = Math.cos(eh), fy = Math.sin(eh)
  const n = 7, cell = width / n
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
    const ox = ex + nx * (-width / 2 + i * cell) + fx * (j * cell)
    const oy = ey + ny * (-width / 2 + i * cell) + fy * (j * cell)
    const corners = [[0, 0], [cell, 0], [cell, cell], [0, cell]].map(([a, b]) => P(ox + nx * a + fx * b, oy + ny * a + fy * b))
    ctx.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'
    ctx.beginPath(); corners.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill()
  }
  void scale
}

function horseMarker(ctx, x, y, size, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -size); ctx.lineTo(size * 0.6, size * 0.7); ctx.lineTo(0, size * 0.35); ctx.lineTo(-size * 0.6, size * 0.7)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
}

// Past halfway: five red riders (the guards), ON THE ROAD behind you, drawn with the SAME arrow as yours and
// facing along the road. The server says where they are; a little riding wobble is added here.
function drawGuards(ctx, P, heading, guards, size, now) {
  if (!guards) return
  guards.forEach(([x, y, h], i) => {
    const wob = Math.sin(now / 150 + i * 1.7) * 0.25
    const [sx, sy] = P(x - Math.sin(h) * wob, y + Math.cos(h) * wob)
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(heading - h) // turned the way the road goes, relative to your heading-up screen
    ctx.shadowColor = 'rgba(255, 30, 30, .9)'
    ctx.shadowBlur = 14
    horseMarker(ctx, 0, 0, size, '#d61f1f')
    ctx.restore()
  })
}

function useCanvas(draw) {
  const ref = useRef(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    let raf
    const loop = () => {
      const c = ref.current
      if (c) {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth, h = c.clientHeight
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
        const ctx = c.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawRef.current(ctx, w, h)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return ref
}

// Smooth the 30-per-second updates between frames.
function usePose(view) {
  const last = useRef({ prev: null, cur: null, at: 0 })
  useEffect(() => { last.current = { prev: null, cur: { ...view.start }, at: performance.now() } }, [view.version]) // eslint-disable-line react-hooks/exhaustive-deps
  useStream('ride', (d) => { last.current = { prev: last.current.cur, cur: d, at: performance.now() } })
  return useCallback(() => {
    const { prev, cur, at } = last.current
    if (!cur) return null
    if (!prev) return cur
    const k = Math.min(1, (performance.now() - at) / 33)
    const dh = Math.atan2(Math.sin(cur.h - prev.h), Math.cos(cur.h - prev.h))
    return { ...cur, x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k, h: prev.h + dh * k }
  }, [])
}

function Clock({ view }) {
  const offset = useRef(0)
  useEffect(() => { offset.current = view.now - Date.now() }, [view.now])
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 200); return () => clearInterval(t) }, [])
  const now = Date.now() + offset.current
  const left = view.status === 'countdown' ? view.limitSec * 1000 : Math.max(0, view.endsAt - now)
  const secs = Math.ceil(left / 1000)
  const urgent = view.status === 'riding' && secs <= 30
  const count = view.status === 'countdown' ? Math.ceil((view.goAt - now) / 1000) : null
  return (
    <>
      <div className={`l10-clock ${urgent ? 'urgent' : ''}`}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</div>
      {count > 0 && <div className="l10-count" key={count}>{count}</div>}
    </>
  )
}

// Every 20th crash in a row: switch sides? Both have to say yes; the server does the switching.
function SwitchOffer({ offer }) {
  const { send, spectator, players, role } = useLevel()
  const partner = players[role === 'A' ? 'B' : 'A']?.name ?? 'Your partner'
  return (
    <div className="l10-offer">
      <p>Wow. You guys really suck at this, do you want to switch sides?</p>
      {offer.mine === true
        ? <p className="faint">Waiting for {partner}…</p>
        : !spectator && (
          <>
            {offer.theirs === true && <p className="faint">{partner} wants to switch.</p>}
            <div className="l10-offer-buttons">
              <button className="btn" onClick={() => send({ type: 'switchVote', yes: true })}>Switch sides</button>
              <button className="btn ghost" onClick={() => send({ type: 'switchVote', yes: false })}>Keep sides</button>
            </div>
          </>
        )}
    </div>
  )
}

function Crashed({ view }) {
  const { send, spectator } = useLevel()
  if (!['crashed', 'timeout', 'finished'].includes(view.status)) return null
  return (
    <div className="l10-crash">
      <h2>You Crashed</h2>
      {view.offer && <SwitchOffer offer={view.offer} />}
      {view.status !== 'finished' && !view.offer && !spectator && <button className="btn" onClick={() => send({ type: 'retry' })}>Try again</button>}
    </div>
  )
}

// Touch steering (the user asked for more forgiving left/right): one zone covering the bottom-right corner, much
// bigger than the two buttons drawn in it. Its left half steers left, its right half right; the thumb can slide
// from one to the other, and nothing lets go until the thumb lifts.
function SteerZone({ setKey }) {
  const [dir, setDir] = useState(null)
  const finger = useRef(null) // { id, dir }
  const sideOf = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX < r.left + r.width / 2 ? 'left' : 'right'
  }
  const steer = (next) => {
    const prev = finger.current?.dir
    if (prev === next) return
    if (prev) setKey(prev, false)
    if (next) setKey(next, true)
    if (finger.current) finger.current.dir = next
    setDir(next)
  }
  const onDown = (e) => {
    if (finger.current) return // one steering thumb at a time
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    finger.current = { id: e.pointerId, dir: null }
    steer(sideOf(e))
  }
  const onMove = (e) => { if (finger.current?.id === e.pointerId) steer(sideOf(e)) }
  const onUp = (e) => { if (finger.current?.id !== e.pointerId) return; steer(null); finger.current = null }
  return (
    <div className="l10-pad right l10-steer" onContextMenu={e => e.preventDefault()}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}>
      <span className={`l10-btn${dir === 'left' ? ' on' : ''}`}><FaArrowLeft /></span>
      <span className={`l10-btn${dir === 'right' ? ' on' : ''}`}><FaArrowRight /></span>
    </div>
  )
}

// ── Player 1: the rider ───────────────────────────────────────────────
function Rider({ view }) {
  const { send, spectator, dev } = useLevel()
  const poseNow = usePose(view)
  const roadRef = useRef({ road: [], end: null })
  const guards = useRef(null)
  useStream('ride', (d) => { roadRef.current = { road: d.road ?? [], end: d.end ?? null }; guards.current = d.guards ?? null })
  const input = useRef({ up: false, down: false, left: false, right: false })
  const setKey = useCallback((k, on) => {
    if (spectator || input.current[k] === on) return
    input.current = { ...input.current, [k]: on }
    send({ type: 'input', ...input.current })
  }, [send, spectator])

  useEffect(() => {
    if (spectator) return
    const down = (e) => { const k = KEYMAP[e.code]; if (k) { e.preventDefault(); setKey(k, true) } }
    const up = (e) => { const k = KEYMAP[e.code]; if (k) setKey(k, false) }
    const blur = () => ['up', 'down', 'left', 'right'].forEach(k => setKey(k, false))
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [setKey, spectator])

  const canvas = useCanvas((ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
    const p = poseNow()
    if (!p) return
    const R = Math.min(w, h) * 0.17           // the lantern's circle on screen
    const scale = R / view.lantern
    const cx = w / 2, cy = h * 0.58
    const P = projector(p.x, p.y, p.h, cx, cy, scale)
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()
    const { road, end } = roadRef.current
    // Only the ROAD is lit (warm in the middle of the lantern, fading out); off the road stays pitch black.
    const light = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
    light.addColorStop(0, '#b39565'); light.addColorStop(0.6, '#7d6544'); light.addColorStop(1, '#1d160d')
    if (road.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.strokeStyle = light; ctx.lineWidth = view.width * scale
      ctx.beginPath(); road.forEach(([x, y], i) => { const [sx, sy] = P(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) }); ctx.stroke()
      ctx.strokeStyle = 'rgba(30,22,12,.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10])
      ctx.beginPath(); road.forEach(([x, y], i) => { const [sx, sy] = P(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) }); ctx.stroke()
      ctx.setLineDash([])
    }
    if (end) checkerboard(ctx, P, end, view.width, scale)
    ctx.restore()
    // the faint rim of the lantern's reach
    ctx.strokeStyle = 'rgba(255,210,122,.12)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    const size = Math.max(9, R * 0.16)
    if (view.status === 'riding') drawGuards(ctx, P, p.h, guards.current, size, performance.now())
    horseMarker(ctx, cx, cy, size, '#ffd27a')
  })

  const pad = (k, Icon) => (
    <button className={`l10-btn ${k}`} onContextMenu={e => e.preventDefault()}
      onPointerDown={(e) => { e.preventDefault(); setKey(k, true) }} onPointerUp={() => setKey(k, false)}
      onPointerLeave={() => setKey(k, false)} onPointerCancel={() => setKey(k, false)}><Icon /></button>
  )
  return (
    <div className="l10">
      <canvas ref={canvas} className="l10-canvas" />
      <Clock view={view} />
      {dev && !spectator && view.status === 'riding' && (
        <div className="l10-devjump">
          {[0.6, 0.75, 0.95].map(f => (
            <button key={f} className="btn small ghost" onClick={() => send({ type: 'devJump', fraction: f })}>Jump to {Math.round(f * 100)}% (dev)</button>
          ))}
        </div>
      )}
      <p className="l10-hint">{spectator ? 'Spectating the rider' : 'W / ↑ faster · S / ↓ brake · A D / ← → steer.'}</p>
      {!spectator && (
        <>
          <div className="l10-pad left">{pad('up', FaArrowUp)}{pad('down', FaArrowDown)}</div>
          <SteerZone setKey={setKey} />
        </>
      )}
      <Crashed view={view} />
    </div>
  )
}

// ── Player 2: the map ─────────────────────────────────────────────────
function MapReader({ view }) {
  const { spectator } = useLevel()
  const poseNow = usePose(view)
  const dark = useRef(false)
  const [isDark, setIsDark] = useState(false)
  const guards = useRef(null)
  useStream('ride', (d) => {
    guards.current = d.guards ?? null
    if (dark.current !== d.dark) { dark.current = d.dark; setIsDark(d.dark) }
  })
  const road = view.road

  const canvas = useCanvas((ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
    const p = poseNow()
    if (!p || dark.current) return
    const scale = h / MAP_METRES
    const cx = w / 2, cy = h * 0.7
    const P = projector(p.x, p.y, p.h, cx, cy, scale)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const path = () => { ctx.beginPath(); road.forEach(([x, y], i) => { const [sx, sy] = P(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) }) }
    ctx.strokeStyle = '#3a1f08'; ctx.lineWidth = view.width * scale + 4; path(); ctx.stroke()
    ctx.strokeStyle = '#c8782a'; ctx.lineWidth = view.width * scale; path(); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,230,180,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 12]); path(); ctx.stroke(); ctx.setLineDash([])
    const last = road[road.length - 1], prev = road[road.length - 2]
    checkerboard(ctx, P, [last[0], last[1], Math.atan2(last[1] - prev[1], last[0] - prev[0])], view.width, scale)
    if (view.status === 'riding') drawGuards(ctx, P, p.h, guards.current, 11, performance.now())
    horseMarker(ctx, cx, cy, 11, '#fff3c9')
    // lantern light: everything tinted orange, darker at the edges
    const g = ctx.createRadialGradient(cx, cy, h * 0.1, cx, cy, Math.max(w, h) * 0.8)
    g.addColorStop(0, 'rgba(255,150,40,.10)'); g.addColorStop(1, 'rgba(60,20,0,.55)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  })

  return (
    <div className="l10 map">
      <canvas ref={canvas} className="l10-canvas" />
      <Clock view={view} />
      {isDark && <div className="l10-dark">The lantern flickers out…</div>}
      <p className="l10-hint">{spectator ? 'Spectating the map' : 'Your partner can only see a few feet ahead. Guide them to the exit'}</p>
      <Crashed view={view} />
    </div>
  )
}

export default function Level10({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return role === 'A' ? <Rider view={view} key={view.version} /> : <MapReader view={view} key={view.version} />
}
