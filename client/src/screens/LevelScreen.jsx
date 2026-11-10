import { useMemo } from 'react'
import { request } from '../lib/socket.js'
import { LEVELS } from '@shared/levels.js'
import { LevelContext } from '../lib/levelContext.js'
import { usePortraitTouch } from '../lib/useOrientation.js'
import { levelComponent } from '../levels/index.js'
import RotateOverlay from '../components/RotateOverlay.jsx'
import SaveQuit from '../components/SaveQuit.jsx'

function Pane({ room, role, view, emit, makeSubscribe, spectator, socket }) {
  const Component = levelComponent(room.level)
  const ctx = useMemo(() => ({
    role,
    players: room.players,
    dev: room.dev,
    spectator,
    send: (msg) => (spectator ? Promise.resolve({ ok: false }) : emit('level:action', msg)),
    // Read-only requests (e.g. piece pictures); the admin asks on behalf of the role it's looking at.
    query: (msg) => (spectator ? request(socket, 'admin:levelQuery', { code: room.code, role, msg }) : emit('level:query', msg)),
    subscribe: makeSubscribe(spectator ? role : null),
    // leave the game entirely (the host leaving closes the cell for both)
    leave: () => (spectator ? undefined : emit('room:leave')),
  }), [role, room.players, room.dev, room.code, spectator, emit, makeSubscribe, socket])
  return (
    <LevelContext.Provider value={ctx}>
      <Component view={view} level={room.level} />
    </LevelContext.Provider>
  )
}

export default function LevelScreen({ room, emit, makeSubscribe, spectator, socket }) {
  const portrait = usePortraitTouch()
  const needsLandscape = LEVELS[room.level]?.orientation === 'landscape'

  if (spectator) {
    return (
      <div className="spectate-split">
        {['A', 'B'].map((role) => (
          <div key={role} className="spectate-pane">
            <div className="spectate-label">Player {role === 'A' ? 1 : 2}: {room.players[role]?.name}</div>
            <div className="spectate-body">
              <Pane room={room} role={role} view={room.levelViews?.[role]} emit={emit} makeSubscribe={makeSubscribe} spectator socket={socket} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="level-screen" data-level={room.level}>
      {needsLandscape && portrait && <RotateOverlay />}
      {room.dev && room.you.isHost && (
        <button className="btn small ghost dev-skip" onClick={() => emit('level:devSkip')}>Skip level (dev)</button>
      )}
      <Pane room={room} role={room.you.role} view={room.levelView} emit={emit} makeSubscribe={makeSubscribe} spectator={false} socket={socket} />
      <SaveQuit emit={emit} level={room.level} />
    </div>
  )
}
