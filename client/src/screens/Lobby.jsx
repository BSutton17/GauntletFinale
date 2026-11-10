import { useEffect, useState } from 'react'
import { LEVEL_COUNT } from '@shared/levels.js'

export default function Lobby({ room, user, emit, spectator }) {
  const isHost = room.you?.isHost
  const allUnlocked = room.dev || user?.isAdmin // the server checks this too
  const unlocked = allUnlocked ? LEVEL_COUNT : Math.min(LEVEL_COUNT, user?.progress?.host?.furthest ?? 1)
  const [level, setLevel] = useState(unlocked)
  const [error, setError] = useState(null)
  useEffect(() => setLevel(unlocked), [unlocked])

  async function start() {
    setError(null)
    const r = await emit('room:start', { level })
    if (!r.ok) setError(r.error)
  }

  const seat = (role) => {
    const p = room.players[role]
    if (!p) return <span className="faint">waiting for a prisoner…</span>
    return <>{p.name} <span className="faint small">({p.pronouns}){!p.online && ' · disconnected'}</span></>
  }

  return (
    <div className="center-screen">
      <h1 className="title small-title">Cell <span className="code">{room.code}</span></h1>
      {isHost && <p className="faint">Give your partner this code.</p>}
      <div className="panel">
        <p><strong>Player 1 (host):</strong> {seat('A')}</p>
        <p><strong>Player 2:</strong> {seat('B')}</p>
      </div>

      {isHost && !spectator && (
        <div className="panel">
          <label className="field">
            <span>Start from</span>
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: unlocked }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? 'The beginning (Level 1)' : `Level ${n}`}</option>
              ))}
            </select>
          </label>
          {room.dev && <p className="faint small">Dev mode: every level is unlocked.</p>}
          {!room.dev && user?.isAdmin && <p className="faint small">Admin: every level is unlocked.</p>}
          <button className="btn" disabled={!room.players.B} onClick={start}>Begin</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
      {!isHost && !spectator && <p className="faint">Waiting for {room.players.A?.name} to begin…</p>}
      {!spectator && <button className="btn small ghost" onClick={() => emit('room:leave')}>Leave</button>}
    </div>
  )
}
