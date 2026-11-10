// Level 6: the Guards' Carol. Player 1: six rows of coordinates. Player 2: six songs and the answer box.
// Deliberately unexplained; the only hint is the line both players see.
import { useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

function Hint({ text }) {
  return <p className="l6-hint">“{text}”</p>
}

function Done({ view }) {
  if (view.done) return <p className="l4-feedback good">The guard nods slowly. “…Correct.”</p>
  if (view.wrong) return <p className="error" key={view.wrong}>“{view.lastWrong}”? The guard narrows his eyes. ({view.wrong} wrong)</p>
  return null
}

function Coordinates({ view }) {
  return (
    <div className="panel parchment l6">
      <p className="hint">Scribbled on the back of the guard’s duty roster:</p>
      <div className="l6-rows">
        {view.rows.map((row, i) => (
          <div key={i} className="l6-row">
            {row.map(([line, word], j) => <span key={j} className="l6-coord">({line}, {word})</span>)}
          </div>
        ))}
      </div>
      <Hint text={view.hint} />
      <Done view={view} />
    </div>
  )
}

function Songs({ view }) {
  const { send, spectator } = useLevel()
  const [text, setText] = useState('')
  const submit = (e) => { e.preventDefault(); if (text.trim()) send({ type: 'answer', text }) }
  return (
    <div className="panel parchment l6">
      <p className="hint">A page torn from the guards’ songbook:</p>
      <ul className="l6-songs">
        {view.songs.map((s) => <li key={s.title}><strong>{s.title}</strong> <span>by {s.artist}</span></li>)}
      </ul>
      <Hint text={view.hint} />
      <form onSubmit={submit} className="answer-form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Recite the Guards’ Carol" disabled={spectator || view.done} autoComplete="off" />
        <button className="btn" disabled={spectator || view.done}>Recite</button>
      </form>
      <Done view={view} />
    </div>
  )
}

export default function Level6({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return <div className="center-screen">{role === 'A' ? <Coordinates view={view} /> : <Songs view={view} />}</div>
}
