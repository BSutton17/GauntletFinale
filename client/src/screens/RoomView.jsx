// Picks the screen for the room's current phase. Also used, read-only, by the admin spectator.
import { useCallback } from 'react'
import { request } from '../lib/socket.js'
import Lobby from './Lobby.jsx'
import Story from './Story.jsx'
import LevelCard from './LevelCard.jsx'
import LevelScreen from './LevelScreen.jsx'
import Choice from './Choice.jsx'
import Credits from './Credits.jsx'

export default function RoomView({ socket, room, user, makeSubscribe, spectator = false }) {
  const isHost = !spectator && room.you?.isHost
  const emit = useCallback((event, payload) => (spectator ? Promise.resolve({ ok: false }) : request(socket, event, payload)), [socket, spectator])

  const fadeKey = `${room.phase}:${room.level}:${room.story?.id ?? ''}`
  let screen
  switch (room.phase) {
    case 'lobby':
      screen = <Lobby room={room} user={user} emit={emit} spectator={spectator} />
      break
    case 'story':
      screen = <Story room={room} isHost={isHost} emit={emit} spectator={spectator} isAdmin={!spectator && !!user?.isAdmin} />
      break
    case 'card':
      screen = <LevelCard level={room.level} />
      break
    case 'level':
      screen = <LevelScreen room={room} emit={emit} makeSubscribe={makeSubscribe} spectator={spectator} socket={socket} isAdmin={!spectator && !!user?.isAdmin} />
      break
    case 'choice':
      screen = <Choice room={room} emit={emit} spectator={spectator} />
      break
    case 'credits':
      screen = <Credits room={room} emit={emit} isHost={isHost} />
      break
    default:
      screen = null
  }
  return <div key={fadeKey} className="phase fade-in">{screen}</div>
}
