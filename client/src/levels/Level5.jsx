// Level 5: connect the dots (picking the lock).
//   Player 1 drags through the dots, without numbers. Player 2 sees the numbers and guides them.
//   Dragging across any dot counts as touching it; a wrong one scatters everything (the server decides).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

// Touch screens: bigger pins and a bigger touch area (the server sends how big).
const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// Distance from p to segment a-b, and how far along it (0..1) the closest point is.
function segInfo(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t }
}

function Status({ view, joined }) {
  return (
    <div className="l5-status">
      <span>Pins set: <strong>{joined}</strong> / {view.total}</span>
      {view.wrong > 0 && !view.done && <span key={view.version} className="l5-wrong">Wrong pin! The tumblers scatter… ({view.wrong})</span>}
      {view.done && <span className="l5-done">Click. The lock gives way.</span>}
    </div>
  )
}

function Picker({ view }) {
  const { send, spectator } = useLevel()
  const svgRef = useRef(null)
  const drag = useRef(null)          // { last: {x,y} }
  const sent = useRef(new Set())     // dots already reported for this layout
  const [pointer, setPointer] = useState(null)
  const [touch] = useState(coarse)
  const hitR = touch ? (view.touchHitR ?? view.hitR) : view.hitR
  const dotR = touch ? 1.9 : 1.25

  useEffect(() => { sent.current = new Set(); drag.current = null; setPointer(null) }, [view.version])

  const byId = useMemo(() => new Map(view.dots.map(d => [d.id, d])), [view.dots])
  const visited = new Set(view.visited)
  const path = view.visited.map(id => byId.get(id)).filter(Boolean)
  const lastDot = path[path.length - 1]

  const toBoard = (e) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: p.x, y: p.y }
  }

  // Report every dot the finger passed over between two samples, in the order it passed them.
  const sweep = (a, b) => {
    const hits = []
    for (const d of view.dots) {
      if (visited.has(d.id) || sent.current.has(d.id)) continue
      const { d: dist, t } = segInfo(d, a, b)
      if (dist <= hitR) hits.push({ id: d.id, t })
    }
    hits.sort((x, y) => x.t - y.t)
    for (const h of hits) { sent.current.add(h.id); send({ type: 'touch', id: h.id }) }
  }

  const onDown = (e) => {
    if (spectator || view.done) return
    e.preventDefault()
    svgRef.current.setPointerCapture?.(e.pointerId)
    const p = toBoard(e)
    drag.current = { last: p }
    setPointer(p)
    sweep(p, p)
  }
  const onMove = (e) => {
    if (!drag.current) return
    const p = toBoard(e)
    sweep(drag.current.last, p)
    drag.current.last = p
    setPointer(p)
  }
  const onUp = () => { drag.current = null; setPointer(null) }

  return (
    <div className="l5 picker-layout">
      <Status view={view} joined={view.visited.length} />
      <svg ref={svgRef} className="l5-board picker" viewBox={`0 0 ${view.w} ${view.h}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <rect x="0" y="0" width={view.w} height={view.h} className="l5-bg" />
        {path.length > 1 && <polyline className="l5-line" points={path.map(d => `${d.x},${d.y}`).join(' ')} />}
        {pointer && lastDot && <line className="l5-live" x1={lastDot.x} y1={lastDot.y} x2={pointer.x} y2={pointer.y} />}
        {view.dots.map(d => <circle key={d.id} cx={d.x} cy={d.y} r={dotR} className={`l5-dot ${visited.has(d.id) ? 'done' : ''}`} />)}
      </svg>
      <p className="l5-hint">{spectator ? 'Spectating' : 'Drag through the pins in order. Your partner knows the order. Touching a wrong pin scatters them all.'}</p>
    </div>
  )
}

function Guide({ view }) {
  const { spectator } = useLevel()
  const path = view.dots.slice(0, view.visited)
  return (
    <div className="l5">
      <Status view={view} joined={view.visited} />
      <svg className="l5-board" viewBox={`0 0 ${view.w} ${view.h}`}>
        <rect x="0" y="0" width={view.w} height={view.h} className="l5-bg" />
        {path.length > 1 && <polyline className="l5-line" points={path.map(d => `${d.x},${d.y}`).join(' ')} />}
        {view.dots.map(d => (
          <g key={d.n}>
            <circle cx={d.x} cy={d.y} r={1.25} className={`l5-dot ${d.n <= view.visited ? 'done' : ''} ${d.n === view.visited + 1 ? 'next' : ''}`} />
            <text x={d.x + 1.7} y={d.y - 1.5} className="l5-num">{d.n}</text>
          </g>
        ))}
      </svg>
      <p className="l5-hint">{spectator ? 'Spectating' : 'Only you can see the numbers. Guide your partner from pin to pin.'}</p>
    </div>
  )
}

export default function Level5({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return role === 'A' ? <Picker view={view} /> : <Guide view={view} />
}
