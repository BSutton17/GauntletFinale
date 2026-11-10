// The whole app is driven by the server's room state; there are no URLs per level to guess.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, tokenStore } from './lib/api.js'
import { connectSocket, request } from './lib/socket.js'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import RoomView from './screens/RoomView.jsx'
import Admin from './screens/Admin.jsx'
import Dungeon from './components/Dungeon.jsx'

export default function App() {
  const [token, setToken] = useState(() => tokenStore.get())
  const [user, setUser] = useState(null)
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState(null)
  const [watch, setWatch] = useState(null)
  const [mode, setMode] = useState('home') // 'home' | 'admin'
  const [notice, setNotice] = useState(null)
  const subs = useRef(new Map()) // "role|event" -> Set<fn>
  const roomCode = useRef(null)
  roomCode.current = room?.code ?? null

  const signOut = useCallback(() => {
    if (token) api.logout(token)
    tokenStore.clear()
    setToken(null)
    setUser(null)
    setRoom(null)
    setWatch(null)
  }, [token])

  // Who am I?
  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.me(token)
      .then(({ user }) => { if (!cancelled) setUser(user) })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 401) { tokenStore.clear(); setToken(null) }
        else setNotice('The dungeon server is unreachable. Try again in a moment.')
      })
    return () => { cancelled = true }
  }, [token])

  // The game socket.
  useEffect(() => {
    if (!token || !user) return
    const s = connectSocket(token)
    s.on('connect', () => { setConnected(true); setNotice(null) })
    s.on('disconnect', () => setConnected(false))
    s.on('connect_error', (err) => {
      if (err.message === 'signed_out') { tokenStore.clear(); setToken(null); setUser(null) }
    })
    s.on('room:state', (snap) => (snap.you?.spectator ? setWatch(snap) : setRoom(snap)))
    s.on('room:none', () => setRoom(null))
    s.on('room:closed', ({ code, reason }) => {
      if (roomCode.current === code) { setNotice(reason); setRoom(null) }
      setWatch((w) => (w?.code === code ? null : w))
    })
    s.on('level:stream', ({ role, event, data }) => {
      subs.current.get(`${role ?? ''}|${event}`)?.forEach((fn) => fn(data))
    })
    setSocket(s)
    return () => { s.removeAllListeners(); s.disconnect(); setSocket(null) }
  }, [token, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fresh progress whenever we're back in a lobby.
  const refreshMe = useCallback(async () => {
    if (!socket) return
    const r = await request(socket, 'me')
    if (r.ok) setUser(r.user)
  }, [socket])
  const inLobby = !room || room.phase === 'lobby'
  useEffect(() => { if (inLobby) refreshMe() }, [inLobby, refreshMe])

  // Streams: players get { event, data }; spectators get { role, event, data }.
  const makeSubscribe = useCallback((role) => (event, fn) => {
    const key = `${role ?? ''}|${event}`
    if (!subs.current.has(key)) subs.current.set(key, new Set())
    subs.current.get(key).add(fn)
    return () => subs.current.get(key)?.delete(fn)
  }, [])

  let screen
  if (!token) screen = <Login onToken={(t, u) => { tokenStore.set(t); setToken(t); setUser(u) }} notice={notice} />
  else if (!user || !socket) screen = <div className="center-screen"><p className="faint">{notice ?? 'Unlocking the dungeon…'}</p></div>
  else if (mode === 'admin' && user.isAdmin) {
    screen = <Admin socket={socket} watch={watch} setWatch={setWatch} onClose={() => setMode('home')} makeSubscribe={makeSubscribe} />
  } else if (room) {
    screen = <RoomView socket={socket} room={room} user={user} makeSubscribe={makeSubscribe} />
  } else {
    screen = <Home socket={socket} user={user} notice={notice} clearNotice={() => setNotice(null)} onSignOut={signOut} onAdmin={() => setMode('admin')} />
  }

  return (
    <Dungeon>
      {token && user && !connected && socket && <div className="reconnecting">Reconnecting…</div>}
      {screen}
    </Dungeon>
  )
}
