// Level 9: the split maze. You can't see your own half; you see your partner and a circle of their half around
// them (and the meeting square). Talk each other through it.
//   Keys: arrows or WASD (hold to keep walking). Phones: the see-through pad in the bottom left.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GiKey, GiLantern, GiSaddle, GiRopeCoil } from 'react-icons/gi'
import { FaArrowUp, FaArrowDown, FaArrowLeft, FaArrowRight } from 'react-icons/fa'
import { useLevel } from '../lib/levelContext.js'

const VIEW_ROWS = 15          // squares visible top to bottom (the camera follows your partner)
const REPEAT_MS = 130         // holding a direction keeps walking
const COLOR = { red: '#e0473a', blue: '#4c8ef0', green: '#3fbf63' }
const ITEM_ICON = { lantern: GiLantern, reins: GiRopeCoil, saddle: GiSaddle }
const ITEM_NAME = { lantern: 'lantern', reins: 'reins', saddle: 'saddle' }
const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }
const N = 1, E = 2, S = 4, Wb = 8

function useClock(view) {
  const offset = useRef(0)
  useEffect(() => { offset.current = view.now - Date.now() }, [view.now])
  const [left, setLeft] = useState(() => view.endsAt - view.now)
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, view.endsAt - (Date.now() + offset.current)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [view.endsAt])
  return left
}

function Inventory({ label, inv }) {
  return (
    <div className="l9-inv">
      <span className="l9-inv-label">{label}</span>
      {['lantern', 'reins', 'saddle'].map(it => {
        const Icon = ITEM_ICON[it]
        return <Icon key={it} className={`l9-item ${inv.items.includes(it) ? 'got' : ''}`} title={ITEM_NAME[it]} />
      })}
      {inv.keys.map(k => <GiKey key={k} style={{ color: COLOR[k] }} className="l9-key" />)}
    </div>
  )
}

export default function Level9({ view }) {
  const { send, spectator, players, role, leave } = useLevel()
  const boxRef = useRef(null)
  const [box, setBox] = useState({ w: 800, h: 360 })
  const [note, setNote] = useState(null)
  const [peek, setPeek] = useState(false) // dev mode only: see your own side
  const held = useRef(null)
  const timer = useRef(null)
  const left = useClock(view)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const say = useCallback((text) => {
    setNote({ text, at: Date.now() })
  }, [])
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 1800); return () => clearTimeout(t) }, [note])

  const move = useCallback(async (dir) => {
    const r = await send({ type: 'move', dir })
    if (!r) return
    if (r.why === 'wall') { say('Thud. A wall.'); navigator.vibrate?.(25) }
    if (r.why === 'locked') { say(`Locked. You need the ${r.color} key.`); navigator.vibrate?.([20, 40, 20]) }
    if (r.picked?.key) say(`You picked up the ${r.picked.key} key!`)
    if (r.picked?.item) say(`You found the ${ITEM_NAME[r.picked.item]}!`)
  }, [send, say])

  const press = useCallback((dir) => {
    if (spectator || held.current === dir) return
    clearInterval(timer.current)
    held.current = dir
    move(dir)
    timer.current = setInterval(() => move(dir), REPEAT_MS)
  }, [move, spectator])
  const release = useCallback((dir) => {
    if (dir && held.current !== dir) return
    held.current = null
    clearInterval(timer.current)
  }, [])

  useEffect(() => {
    if (spectator) return
    const down = (e) => { const d = KEYS[e.code]; if (d) { e.preventDefault(); press(d) } }
    const up = (e) => { const d = KEYS[e.code]; if (d) release(d) }
    const blur = () => release()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); release() }
  }, [press, release, spectator])
  useEffect(() => { release() }, [view.version, view.failed, release])

  const me = role
  const partnerRole = role === 'A' ? 'B' : 'A'
  const partnerName = players[partnerRole]?.name ?? 'Partner'
  const myHalfTop = me === 'A'
  const rows = VIEW_ROWS
  const cols = Math.max(rows, Math.round(rows * (box.w / Math.max(1, box.h))))
  const p = view.partner
  const peeking = peek && view.dev
  const cam = peeking ? view.dev.me : p
  const x0 = cam.c + 0.5 - cols / 2, y0 = cam.r + 0.5 - rows / 2

  const cells = useMemo(() => view.cells.map(([r, c, w, t]) => ({ r, c, w, t })), [view.cells])
  const devCells = useMemo(() => (peeking ? view.dev.cells.map(([r, c, w, t]) => ({ r, c, w, t })) : []), [peeking, view.dev])
  // A key, gate or item on square (r, c).
  const renderThing = (r, c, t) => {
      if (t.kind === 'gate') return <rect key={`t${r}-${c}`} x={c + 0.08} y={r + 0.08} width=".84" height=".84" rx=".1"
        className={`l9-gate ${t.open ? 'open' : ''}`} style={{ stroke: COLOR[t.color], fill: t.open ? 'none' : COLOR[t.color] }} />
      // ⚠️ react-icons sets width/height from its `size` prop (default "1em" = 16 squares here!), so size them
      // with `size`, never width/height.
      if (t.kind === 'key') return (
        <g key={`t${r}-${c}`}>
          <circle cx={c + 0.5} cy={r + 0.5} r=".42" className="l9-glow" style={{ fill: COLOR[t.color] }} />
          <GiKey x={c + 0.14} y={r + 0.14} size={0.72} style={{ color: '#fff8e6' }} />
        </g>
      )
      const Icon = ITEM_ICON[t.item]
      return (
        <g key={`t${r}-${c}`}>
          <circle cx={c + 0.5} cy={r + 0.5} r=".44" className="l9-glow item" />
          <Icon x={c + 0.12} y={r + 0.12} size={0.76} className="l9-thing-item" />
        </g>
      )
  }

  const secs = Math.ceil(left / 1000)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div className="l9">
      <div className="l9-hud">
        <Inventory label="You" inv={view.inv[me]} />
        <div className={`l9-timer ${secs <= 30 ? 'urgent' : ''}`}>{clock}</div>
        <Inventory label={partnerName} inv={view.inv[partnerRole]} />
      </div>

      <div className="l9-board" ref={boxRef}>
        <svg viewBox={`${x0} ${y0} ${cols} ${rows}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id={`l9hatch${me}`} width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1" height="1" fill="#050404" /><line x1="0" y1="0" x2="0" y2="1" stroke="#15110c" strokeWidth=".25" />
            </pattern>
            <mask id={`l9fog${me}`}>
              <rect x={x0 - 1} y={y0 - 1} width={cols + 2} height={rows + 2} fill="white" />
              <circle cx={p.c + 0.5} cy={p.r + 0.5} r={view.sight + 0.5} fill="black" />
              <rect x={view.mid.c} y={view.mid.r} width="1" height="1" fill="black" />
            </mask>
          </defs>
          {/* the two halves */}
          <rect x="0" y={myHalfTop ? 0 : view.half} width={view.w} height={view.half} fill={`url(#l9hatch${me})`} />
          <rect x="0" y={myHalfTop ? view.half : 0} width={view.w} height={view.half} fill="#120e0a" />
          <text x={view.w / 2} y={myHalfTop ? view.half / 2 : view.half * 1.5} className="l9-ownlabel">Your side: you can’t see it</text>
          <line x1="0" y1={view.half} x2={view.w} y2={view.half} className="l9-split" />
          <rect x="-.15" y="-.15" width={view.w + 0.3} height={view.h + 0.3} className="l9-edge" />

          {/* what's visible around your partner */}
          {cells.map(({ r, c }) => <rect key={`f${r}-${c}`} x={c} y={r} width="1" height="1" className="l9-floor" />)}
          {cells.map(({ r, c, w }) => (
            <g key={`w${r}-${c}`} className="l9-wall">
              {!(w & N) && <line x1={c} y1={r} x2={c + 1} y2={r} />}
              {!(w & S) && <line x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />}
              {!(w & Wb) && <line x1={c} y1={r} x2={c} y2={r + 1} />}
              {!(w & E) && <line x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />}
            </g>
          ))}
          {cells.filter(x => x.t).map(({ r, c, t }) => renderThing(r, c, t))}

          {/* the meeting square, always visible */}
          <rect x={view.mid.c} y={view.mid.r} width="1" height="1" className="l9-mid" />

          {/* the fog: only a circle around your partner can be seen */}
          <rect x={x0 - 1} y={y0 - 1} width={cols + 2} height={rows + 2} className="l9-fog" mask={`url(#l9fog${me})`} />

          {/* DEV MODE: peek at your own side */}
          {peeking && (
            <g className="l9-devpeek">
              {devCells.map(({ r, c }) => <rect key={`df${r}-${c}`} x={c} y={r} width="1" height="1" className="l9-floor" />)}
              {devCells.map(({ r, c, w }) => (
                <g key={`dw${r}-${c}`} className="l9-wall">
                  {!(w & N) && <line x1={c} y1={r} x2={c + 1} y2={r} />}
                  {!(w & S) && <line x1={c} y1={r + 1} x2={c + 1} y2={r + 1} />}
                  {!(w & Wb) && <line x1={c} y1={r} x2={c} y2={r + 1} />}
                  {!(w & E) && <line x1={c + 1} y1={r} x2={c + 1} y2={r + 1} />}
                </g>
              ))}
              {devCells.filter(x => x.t).map(({ r, c, t }) => renderThing(r, c, t))}
              <circle cx={view.dev.me.c + 0.5} cy={view.dev.me.r + 0.5} r=".3" className="l9-me" />
            </g>
          )}
          {/* people */}
          <circle cx={p.c + 0.5} cy={p.r + 0.5} r=".36" className="l9-partner" />
          <text x={p.c + 0.5} y={p.r + 0.62} className="l9-initial">{partnerName[0]}</text>
          {view.onMid[me] && <circle cx={view.mid.c + 0.5} cy={view.mid.r + 0.5} r=".26" className="l9-me" />}
        </svg>

        <svg className="l9-mini" viewBox={`0 0 ${view.w} ${view.h}`}>
          <rect x="0" y={myHalfTop ? 0 : view.half} width={view.w} height={view.half} fill="#050404" />
          <rect x="0" y={myHalfTop ? view.half : 0} width={view.w} height={view.half} fill="#2a2118" />
          <rect x={view.mid.c - 1} y={view.mid.r - 1} width="3" height="3" fill="#d9a441" />
          <circle cx={p.c + 0.5} cy={p.r + 0.5} r="2" fill="#7cf3a0" />
        </svg>

        {!spectator && (
          <div className="l9-pad">
            {[['up', FaArrowUp], ['left', FaArrowLeft], ['right', FaArrowRight], ['down', FaArrowDown]].map(([d, Icon]) => (
              <button key={d} className={`l9-padbtn ${d}`} onContextMenu={e => e.preventDefault()}
                onPointerDown={(e) => { e.preventDefault(); press(d) }} onPointerUp={() => release(d)} onPointerLeave={() => release(d)} onPointerCancel={() => release(d)}>
                <Icon />
              </button>
            ))}
          </div>
        )}

        {view.dev && !spectator && (
          <button className="btn small ghost l9-peekbtn" onClick={() => setPeek(v => !v)}>{peek ? 'Stop peeking (dev)' : 'Peek my side (dev)'}</button>
        )}
        {note && <div className="l9-note" key={note.at}>{note.text}</div>}

        {view.failed && (
          <div className="l9-overlay">
            <h2>You failed</h2>
            <p className="faint">The guards closed in before you made it out.</p>
            {!spectator && (
              <div className="choice-buttons">
                <button className="btn" onClick={() => send({ type: 'restart' })}>Try again</button>
                <button className="btn ghost" onClick={leave}>Leave</button>
              </div>
            )}
          </div>
        )}
        {view.done && <div className="l9-overlay done"><h2>Together at last!</h2><p className="faint">Now… the stables.</p></div>}
      </div>
      <p className="l9-hint">{spectator ? 'Spectating' : `Find your lantern, reins and saddle, then meet ${partnerName} on the gold square. You can only see ${partnerName}’s side.`}</p>
    </div>
  )
}
