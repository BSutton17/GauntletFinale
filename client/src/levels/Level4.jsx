// Level 4: the distant lights (Morsematics, from Keep Talking and Nobody Explodes, told with lights).
//   Player 1: the manual.   Player 2: the window: three flashing lights, the cell number, the tower lamps,
//   the candles, a shutter, and a lantern to flash the answer back.
import { useEffect, useRef, useState } from 'react'
import { GiCandleFlame } from 'react-icons/gi'
import { MORSE, classifyTaps } from '@shared/morse.js'
import { useLevel } from '../lib/levelContext.js'

const UNIT_MS = 300
const ROMAN = ['I', 'II', 'III']

// ── Player 1: the manual ──────────────────────────────────────────────────
function Manual({ view }) {
  return (
    <div className="panel parchment l4-manual">
      <h2 className="l2-title">Distant Lights</h2>
      <p className="hint">Decode the letters flashed by the three distant lights, do some awkward arithmetic, and answer with the lantern in the same code.</p>
      <ul className="l4-list">
        <li>Every letter has a value equal to its place in the alphabet (A=1, B=2 … Z=26).</li>
        <li>Values outside 1–26 wrap around (Z+1 = A, 26+1 = 1).</li>
        <li>Three different letters are being flashed over and over, one by each of the three distant lights, taking turns.</li>
        <li>To finish, the correct letter must be flashed back in Morse with the lantern.</li>
        <li>The shutter covers and uncovers the distant lights.</li>
      </ul>
      <p className="l4-note">A quick tap of the lantern is a dot; holding it open is a dash. E and T count as the same letter.</p>

      <h3 className="l4-h">Working it out</h3>
      <p>Take the <strong>4th and 5th characters of the cell number</strong> (on the plate, top right). This is your pair. Perform each step in order, changing the pair as you go:</p>
      <ol className="l4-list">
        <li>For each tower lamp (top left, three letters) whose plate has a letter in common with the received letters: add 1 to the <em>first</em> character if the lamp is lit, or to the <em>second</em> if it is dark. Once per lamp</li>
        <li>If the two characters add up to a square number, add 4 to the first; otherwise subtract 4 from the second.</li>
        <li>Add the largest received letter to the first character.</li>
        <li>If any received letters are prime, subtract them from the first character.</li>
        <li>If any received letters are square, subtract them from the second character.</li>
        <li>If any candles are burning and any received letters are divisible by the number of candles, subtract those letters from both characters.</li>
      </ol>
      <p>Then:</p>
      <ul className="l4-list">
        <li>Characters equal: send the first.</li>
        <li>First character larger: send the difference of the two.</li>
        <li>Second character larger: send the sum of the two.</li>
      </ul>
      <p className="l4-note">If the wrong letter is sent, the tower shows the letter it received, then begins a new message.</p>

      <h3 className="l4-h">How to read the lights</h3>
      <ul className="l4-list">
        <li>A short flash is a dot. A long flash is a dash.</li>
        <li>A long gap between letters. A very long gap before the message repeats.</li>
      </ul>

      <div className="l4-tables">
        <div className="l4-table">
          {Object.keys(MORSE).map((l, i) => <span key={l}><strong>{l}</strong> {i + 1}</span>)}
        </div>
        <div className="l4-table morse">
          {Object.entries(MORSE).map(([l, code]) => <span key={l}><strong>{l}</strong> <code>{code.replace(/\./g, '•').replace(/-/g, '—')}</code></span>)}
        </div>
      </div>
      <Feedback view={view} />
    </div>
  )
}

function Feedback({ view }) {
  if (view.done) return <p className="l4-feedback good">The far light blinks twice… they understood.</p>
  if (view.unreadable) return <p className="l4-feedback">The lantern signal couldn’t be read as a letter. Try again.</p>
  if (view.wrong && view.lastReceived) return <p className="l4-feedback bad" key={view.version}>The tower received <strong>{view.lastReceived}</strong>. Wrong. A new message begins… ({view.wrong} wrong)</p>
  return null
}

// ── Player 2: the window ──────────────────────────────────────────────────
// The three lights take turns: light I flashes its letter, then II, then III, then a long pause, forever.
function useFlashing(signals) {
  const [lit, setLit] = useState(-1)
  useEffect(() => {
    if (!signals?.length) return
    const timeline = [] // { lamp, on, units }
    signals.forEach((code, lamp) => {
      ;[...code].forEach((sym, k) => {
        timeline.push({ lamp, on: true, units: sym === '-' ? 3 : 1 })
        timeline.push({ lamp: -1, on: false, units: k === code.length - 1 ? 3 : 1 })
      })
    })
    timeline.push({ lamp: -1, on: false, units: 7 })
    const total = timeline.reduce((n, s) => n + s.units, 0) * UNIT_MS
    const start = performance.now()
    let raf
    const tick = () => {
      let t = (performance.now() - start) % total
      let now = -1
      for (const s of timeline) {
        const d = s.units * UNIT_MS
        if (t < d) { now = s.on ? s.lamp : -1; break }
        t -= d
      }
      setLit(prev => (prev === now ? prev : now))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [signals?.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return lit
}

function Window({ view }) {
  const { send, spectator } = useLevel()
  const lit = useFlashing(view.signals)
  const [shutter, setShutter] = useState(false)
  const [holds, setHolds] = useState([])
  const [gaps, setGaps] = useState([])
  const [open, setOpen] = useState(false)
  const pressAt = useRef(0)
  const releaseAt = useRef(0)

  useEffect(() => { setHolds([]); setGaps([]) }, [view.version])

  const down = () => {
    if (spectator || view.done || open) return
    const t = performance.now()
    if (holds.length) setGaps(g => [...g, Math.round(t - releaseAt.current)])
    pressAt.current = t
    setOpen(true)
  }
  const up = () => {
    if (!open) return
    const t = performance.now()
    releaseAt.current = t
    setHolds(h => [...h, Math.round(t - pressAt.current)])
    setOpen(false)
  }
  useEffect(() => {
    if (spectator) return
    const kd = (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); down() } }
    const ku = (e) => { if (e.code === 'Space') { e.preventDefault(); up() } }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  })

  const preview = classifyTaps(holds)
  const sendSignal = () => {
    if (!holds.length) return
    send({ type: 'transmit', holds, gaps })
    setHolds([]); setGaps([])
  }

  return (
    <div className="l4-window">
      <div className="l4-top">
        <div className="l4-lamps">
          {view.lamps.map(l => (
            <div key={l.label} className={`l4-lamp ${l.lit ? 'lit' : ''}`}>
              <span className="l4-bulb" />
              <span className="l4-plate">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="l4-cell"><span>Cell</span><strong>{view.cell}</strong></div>
      </div>

      <div className="l4-candles">
        {view.candles === 0
          ? <span className="faint small">No candles burning in the window</span>
          : Array.from({ length: view.candles }, (_, i) => <GiCandleFlame key={i} className="l4-candle" style={{ animationDelay: `${i * -0.37}s` }} />)}
      </div>

      <div className="l4-sky">
        <div className={`l4-lights ${shutter ? 'shut' : ''}`}>
          {[0, 1, 2].map(i => (
            <div key={i} className="l4-light-wrap">
              <div className={`l4-light ${lit === i && !shutter ? 'on' : ''}`} />
              <span>{ROMAN[i]}</span>
            </div>
          ))}
        </div>
        <button className={`l4-shutter ${shutter ? 'closed' : ''}`} onClick={() => setShutter(s => !s)} aria-pressed={shutter}>
          <span className="l4-switch" /> Shutter {shutter ? 'closed' : 'open'}
        </button>
      </div>

      <div className="l4-answer">
        <button
          className={`l4-lantern ${open ? 'open' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); down() }}
          onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
          disabled={spectator || view.done}
        >
          Lantern
        </button>
        <div className="l4-signal">
          <div className="l4-preview">{preview ? preview.replace(/\./g, '•').replace(/-/g, '—') : <span className="faint small">Tap the lantern (or Space) for a dot, hold it for a dash</span>}</div>
          <div className="l4-signal-buttons">
            <button className="btn small" onClick={sendSignal} disabled={!holds.length || spectator}>Send signal</button>
            <button className="btn small ghost" onClick={() => { setHolds([]); setGaps([]) }} disabled={!holds.length}>Clear</button>
          </div>
        </div>
      </div>
      <Feedback view={view} />
    </div>
  )
}

export default function Level4({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return <div className="l4">{role === 'A' ? <Manual view={view} /> : <Window view={view} />}</div>
}
