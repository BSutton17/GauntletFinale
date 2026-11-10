// Level 7: paint by numbers.
//   Player 1: the grid of numbers and the key (each number is a coloured circle, no colour names).
//   Player 2: a blank grid and the same colours. Pick a colour, then tap or drag across squares to paint.
// Player 2 says what the picture is once it's painted.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaEraser } from 'react-icons/fa'
import { useLevel } from '../lib/levelContext.js'

const BLANK = -1
const FLUSH_MS = 80

function NumbersSheet({ view, partner }) {
  return (
    <div className="panel parchment l7">
      <p className="hint">Read the numbers to {partner} as colours. {partner} paints.</p>
      <div className="l7-board">
        <div className="l7-grid numbers" style={{ '--n': view.size }}>
          {view.grid.map((n, i) => <span key={i}>{n}</span>)}
        </div>
        <ul className="l7-key" aria-label="Key">
          {view.key.map((k) => (
            <li key={k.n}><span className="l7-dot" style={{ background: k.hex }} /> = {k.n}</li>
          ))}
        </ul>
      </div>
      <p className="faint small l7-partner">{view.done ? 'The guards exchange a look…' : `${partner} is painting.`}</p>
    </div>
  )
}

function Painter({ view }) {
  const { send, spectator } = useLevel()
  const size = view.size
  const [colour, setColour] = useState(view.palette[1]?.id ?? 0)
  const [local, setLocal] = useState(view.painted)
  const [text, setText] = useState('')
  const pending = useRef(new Map())   // square -> colour, painted here but not yet confirmed by the server
  const queue = useRef(new Map())     // colour -> squares waiting to be sent
  const timer = useRef(null)
  const drag = useRef(null)           // last square of the current stroke

  // The server's painting, with anything still in flight laid on top.
  useEffect(() => {
    const merged = view.painted.slice()
    for (const [c, col] of pending.current) merged[c] = col
    setLocal(merged)
  }, [view.painted])

  const flush = useCallback(() => {
    timer.current = null
    for (const [col, cells] of queue.current) {
      const list = [...cells]
      send({ type: 'paint', colour: col, cells: list }).then(() => {
        for (const c of list) if (pending.current.get(c) === col) pending.current.delete(c)
      })
    }
    queue.current = new Map()
  }, [send])
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush() } }, [flush])

  const paint = useCallback((cells) => {
    setLocal((cur) => {
      let next = null
      for (const c of cells) {
        if (cur[c] === colour) continue
        next ??= cur.slice()
        next[c] = colour
        pending.current.set(c, colour)
        if (!queue.current.has(colour)) queue.current.set(colour, new Set())
        queue.current.get(colour).add(c)
      }
      return next ?? cur
    })
    if (!timer.current) timer.current = setTimeout(flush, FLUSH_MS)
  }, [colour, flush])

  // the square under the pointer, and every square on the way from the last one (fast drags leave no gaps)
  const squareAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const c = Math.floor(((e.clientX - r.left) / r.width) * size)
    const row = Math.floor(((e.clientY - r.top) / r.height) * size)
    return c >= 0 && c < size && row >= 0 && row < size ? { row, c } : null
  }
  const stroke = (from, to) => {
    const out = []
    const steps = from ? Math.max(Math.abs(to.row - from.row), Math.abs(to.c - from.c)) : 0
    for (let k = 0; k <= steps; k++) {
      const t = steps ? k / steps : 1
      const row = Math.round((from ? from.row : to.row) + (to.row - (from ? from.row : to.row)) * t)
      const c = Math.round((from ? from.c : to.c) + (to.c - (from ? from.c : to.c)) * t)
      out.push(row * size + c)
    }
    return out
  }
  const onDown = (e) => {
    if (spectator || view.done) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const sq = squareAt(e)
    if (!sq) return
    drag.current = sq
    paint(stroke(null, sq))
  }
  const onMove = (e) => {
    if (!drag.current) return
    const sq = squareAt(e)
    if (!sq || (sq.row === drag.current.row && sq.c === drag.current.c)) return
    paint(stroke(drag.current, sq))
    drag.current = sq
  }
  const onUp = () => { drag.current = null }

  const hexOf = (id) => view.palette.find((p) => p.id === id)?.hex
  const submit = (e) => { e.preventDefault(); if (text.trim()) send({ type: 'answer', text }) }

  return (
    <div className="panel parchment l7">
      <p className="hint">Pick a colour, then tap or drag across the squares to paint.</p>
      <div className="l7-board">
        <div className="l7-grid canvas" style={{ '--n': size }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {local.map((id, i) => <span key={i} style={id === BLANK ? undefined : { background: hexOf(id) }} />)}
        </div>
        <div className="l7-side">
          <div className="l7-palette" role="radiogroup" aria-label="Colours">
            {view.palette.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={colour === p.id} aria-label={`Colour ${p.id + 1}`}
                className={`l7-swatch${colour === p.id ? ' on' : ''}`} style={{ background: p.hex }}
                onClick={() => setColour(p.id)} disabled={spectator} />
            ))}
            <button type="button" role="radio" aria-checked={colour === BLANK} aria-label="Eraser" title="Eraser"
              className={`l7-swatch eraser${colour === BLANK ? ' on' : ''}`} onClick={() => setColour(BLANK)} disabled={spectator}>
              <FaEraser size={16} aria-hidden="true" />
            </button>
          </div>
          {view.done ? (
            <p className="l4-feedback good">The guards exchange a look…</p>
          ) : (
            <form onSubmit={submit} className="answer-form">
              <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Answer" disabled={spectator} autoComplete="off" autoCapitalize="none" />
              <button className="btn" disabled={spectator}>Answer</button>
            </form>
          )}
          {!view.done && view.reply === 'notYet' && <p className="error" key={`n${view.notYet}`}>The guard glances at your painting. “Finish it first.”</p>}
          {!view.done && view.reply === 'wrong' && <p className="error" key={`w${view.wrong}`}>“{view.lastWrong}”? The guard frowns. ({view.wrong} wrong)</p>}
        </div>
      </div>
    </div>
  )
}

export default function Level7({ view }) {
  const { players, role } = useLevel()
  if (!view) return null
  const partner = players[role === 'A' ? 'B' : 'A']?.name ?? 'Your partner'
  return <div className="center-screen l7-screen">{view.grid ? <NumbersSheet view={view} partner={partner} /> : <Painter view={view} />}</div>
}
