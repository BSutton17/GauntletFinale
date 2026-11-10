// Level 1. Player A: the scrambled letters and the answer box. Player B: how far to move each letter, and
// which way. Neither browser ever has both halves.
import { useState } from 'react'
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa'
import { useLevel } from '../lib/levelContext.js'

function Feedback({ view }) {
  if (!view?.wrong) return null
  return <p className="error">Not quite{view.lastWrong ? `: “${view.lastWrong}”` : ''}. ({view.wrong} wrong)</p>
}

function PlayerA({ view }) {
  const { send, spectator } = useLevel()
  const [text, setText] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (text.trim()) send({ type: 'guess', text })
  }
  return (
    <div className="panel parchment l1">
      <p className="hint">The letter is written in a script you can almost read.</p>
      <div className="l1-row">
        {view.letters.map((ch, i) => (
          <div key={i} className="l1-cell">
            <div className="l1-letter">{ch}</div>
            <div className="l1-index">{i + 1}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="answer-form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What does it say?" disabled={spectator} autoComplete="off" />
        <button className="btn" disabled={spectator}>Read it aloud</button>
      </form>
      <Feedback view={view} />
    </div>
  )
}

function PlayerB({ view }) {
  return (
    <div className="panel parchment l1">
      <p className="hint">Scratched into the wall of your cell:</p>
      <div className="l1-row">
        {view.shifts.map((s, i) => (
          <div key={i} className="l1-cell">
            <div className="l1-arrow">{s.dir === 'L' ? <FaArrowLeft /> : <FaArrowRight />}</div>
            <div className="l1-letter">{s.n}</div>
            <div className="l1-index">{i + 1}</div>
          </div>
        ))}
      </div>
      <Feedback view={view} />
    </div>
  )
}

export default function Level1({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return (
    <div className="center-screen">
      {role === 'A' ? <PlayerA view={view} /> : <PlayerB view={view} />}
    </div>
  )
}
