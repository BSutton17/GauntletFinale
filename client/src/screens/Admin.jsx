// Admin: every live game, and a silent spectator seat. Players are never told (the server keeps watchers
// in a separate channel and never counts them).
import { useEffect, useState } from 'react'
import { request } from '../lib/socket.js'
import RoomView from './RoomView.jsx'

const PHASE = { lobby: 'In the lobby', story: 'Story', card: 'Level card', level: 'Puzzle', choice: 'The choice', credits: 'Credits' }

export default function Admin({ socket, watch, setWatch, onClose, makeSubscribe }) {
  const [list, setList] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (watch) return
    let alive = true
    const load = async () => {
      const r = await request(socket, 'admin:list')
      if (!alive) return
      if (r.ok) { setList(r.rooms); setError(null) } else setError(r.error)
    }
    load()
    const t = setInterval(load, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [socket, watch])

  async function stop() {
    await request(socket, 'admin:unwatch')
    setWatch(null)
  }

  if (watch) {
    return (
      <div className="spectate">
        <div className="spectate-bar">
          <span>Watching cell <strong>{watch.code}</strong> · {watch.players.A?.name} & {watch.players.B?.name ?? '…'} · Level {watch.level}</span>
          <button className="btn small ghost" onClick={stop}>Stop watching</button>
        </div>
        <RoomView socket={socket} room={watch} user={null} makeSubscribe={makeSubscribe} spectator />
      </div>
    )
  }

  return (
    <div className="center-screen">
      <h1 className="title small-title">The King’s Window</h1>
      <p className="faint">Watch any game in progress. Nobody will know.</p>
      <div className="panel wide">
        {error && <p className="error">{error}</p>}
        {list.length === 0 && <p className="faint">No games right now.</p>}
        {list.map((g) => (
          <div key={g.code} className="admin-row">
            <div>
              <strong>{g.code}</strong> · {g.A ?? '—'}{!g.online.A && ' (away)'} & {g.B ?? '—'}{g.B && !g.online.B && ' (away)'}
              <div className="faint small">{PHASE[g.phase] ?? g.phase} · Level {g.level} · started {new Date(g.createdAt).toLocaleTimeString()}</div>
            </div>
            <button className="btn small" onClick={() => request(socket, 'admin:watch', { code: g.code })}>Watch</button>
          </div>
        ))}
      </div>
      <button className="btn small ghost" onClick={onClose}>Back</button>
    </div>
  )
}
