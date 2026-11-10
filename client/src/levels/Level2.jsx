// Level 2. Player A: the translation sheet. Player B: the message and the answer box.
import { useEffect, useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

function Segment({ s }) {
  if (s.k === 'tok') return <span className="l2-tok">“{s.v}”</span>
  if (s.k === 'eng') return <span className="l2-eng">{s.v}</span>
  return <span>{s.v}</span>
}

function Rewritten({ view }) {
  if (!view.wrong) return null
  return (
    <p key={view.version} className="error l2-shift">
      {view.lastWrong ? `“${view.lastWrong}” was wrong. ` : ''}The ink shifts… everything has been rewritten. ({view.wrong} wrong)
    </p>
  )
}

function PlayerA({ view }) {
  return (
    <div className="panel parchment l2-sheet" key={view.version}>
      <h2 className="l2-title">Translation Sheet</h2>
      <ul className="l2-notes">
        {view.notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
      <ol className="l2-rules">
        {view.sheet.map((segs, i) => (
          <li key={i}>{segs.map((s, j) => <Segment key={j} s={s} />)}</li>
        ))}
      </ol>
      <Rewritten view={view} />
    </div>
  )
}

function PlayerB({ view }) {
  const { send, spectator } = useLevel()
  const [text, setText] = useState('')
  useEffect(() => setText(''), [view.version])
  const submit = (e) => {
    e.preventDefault()
    if (text.trim()) send({ type: 'answer', text })
  }
  return (
    <div className="panel parchment l2-message" key={view.version}>
      <p className="hint">The note reads:</p>
      <p className="l2-code">{view.message.join(' ')}</p>
      <form onSubmit={submit} className="answer-form">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" disabled={spectator} autoComplete="off" autoCapitalize="none" />
        <button className="btn" disabled={spectator}>Answer</button>
      </form>
      {view.nudge && <p className="hint l2-nudge">That’s what it says… but what’s the answer?</p>}
      <Rewritten view={view} />
    </div>
  )
}

export default function Level2({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return (
    <div className="center-screen l2">
      {role === 'A' ? <PlayerA view={view} /> : <PlayerB view={view} />}
    </div>
  )
}
