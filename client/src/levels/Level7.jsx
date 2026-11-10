// Level 7: the wanted posters. Each player gets a picture that looks like static, with no tools to change it:
// they have to save or screenshot it and work it out themselves. Each names their own.
import { useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

export default function Level7({ view }) {
  const { send, spectator, players, role } = useLevel()
  const [text, setText] = useState('')
  if (!view) return null
  const partner = players[role === 'A' ? 'B' : 'A']?.name ?? 'Your partner'
  const submit = (e) => { e.preventDefault(); if (text.trim()) send({ type: 'answer', text }) }
  return (
    <div className="center-screen">
      <div className="panel parchment l7">
        <p className="hint">The guard hands you a sheet of paper. “Every guard should know who this is.”</p>
        <img className="l7-picture" src={view.image} alt="A picture that looks like static" />
        {view.solved ? (
          <p className="l4-feedback good">You know exactly who that is.</p>
        ) : (
          <form onSubmit={submit} className="answer-form">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Who is it?" disabled={spectator} autoComplete="off" autoCapitalize="none" />
            <button className="btn" disabled={spectator}>Answer</button>
          </form>
        )}
        {!view.solved && view.wrong > 0 && <p className="error" key={view.wrong}>“{view.lastWrong}”? The guard frowns. ({view.wrong} wrong)</p>}
        <p className="faint small l7-partner">{view.partnerSolved ? `${partner} has figured theirs out.` : `${partner} is still studying theirs.`}</p>
        {view.done && <p className="l4-feedback good">The guards exchange a look…</p>}
      </div>
    </div>
  )
}
