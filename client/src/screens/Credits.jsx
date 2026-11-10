// The end: movie-style credits, then the final tally (both sent by the server).
// Music: put a file at client/public/audio/credits.mp3 and it plays here; without it, silence.
import { useEffect, useState } from 'react'

const ROLL_MS = 42000

export default function Credits({ room, emit, isHost }) {
  const [rolled, setRolled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRolled(true), ROLL_MS)
    return () => clearTimeout(t)
  }, [])
  const c = room.credits
  if (!c) return null

  return (
    <div className="credits-screen" onClick={() => setRolled(true)}>
      <audio src="/audio/credits.mp3" autoPlay onError={() => {}} />
      {!rolled ? (
        <div className="credits-roll" style={{ animationDuration: `${ROLL_MS}ms` }}>
          <h1 className="title">The Gauntlet <span>Finale</span></h1>
          <p className="credits-congrats">{c.congrats}</p>
          {c.roles.map((r) => (
            <div key={r} className="credit">
              <div className="credit-role">{r}</div>
              <div className="credit-name">King Bryson</div>
            </div>
          ))}
          <p className="faint small">No horses were harmed in the making of this escape. One was stolen.</p>
        </div>
      ) : (
        <div className="center-screen final-card">
          <p className="credits-congrats">{c.congrats}</p>
          {c.lines.map((l) => (
            <p key={l.who}>{l.who}: <strong>{l.what}</strong>{l.note && <> {l.note}</>}</p>
          ))}
          <p className="send-screenshot">Please send this screenshot to King Bryson</p>
          {isHost && <button className="btn small ghost" onClick={() => emit('room:lobby')}>Back to the cell</button>}
        </div>
      )}
    </div>
  )
}
