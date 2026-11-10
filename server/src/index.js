// The Gauntlet Finale game server: sign-in over HTTP, everything else over Socket.io.
import http from 'node:http'
import { createHash } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import { config } from './config.js'
import { initStore, getStore } from './db/store.js'
import { createAuthRouter, userFromToken, isAdmin, publicUser } from './auth/routes.js'
import { createRoomManager, GameError } from './rooms/roomManager.js'
import { PRONOUN_OPTIONS, cleanName, LEVEL_COUNT } from '../../shared/levels.js'

await initStore()

const app = express()
app.disable('x-powered-by')
app.use(cors({ origin: config.clientOrigins }))
app.get('/', (_req, res) => res.type('text').send('The Gauntlet Finale server is running.'))
app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/auth', createAuthRouter())

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: config.clientOrigins } })

const seatChannel = (code, role) => `seat:${code}:${role}`
const watchChannel = (code) => `watch:${code}`

const rooms = createRoomManager({
  devMode: config.devMode,
  transport: {
    toSeat: (code, role, event, data) => io.to(seatChannel(code, role)).emit(event, data),
    toWatchers: (code, event, data) => io.to(watchChannel(code)).emit(event, data),
    hasWatchers: (code) => (io.sockets.adapter.rooms.get(watchChannel(code))?.size ?? 0) > 0,
  },
  recordProgress: (userId, entry) => getStore().recordProgress(userId, entry),
  // The admin account (verified Google email, see isAdmin) has every level from the start; everyone else
  // unlocks them by playing.
  getHostFurthest: async (userId) => {
    const u = await getStore().getUser(userId)
    return isAdmin(u) ? LEVEL_COUNT : u?.progress?.host?.furthest ?? 1
  },
})
setInterval(() => rooms.sweep(), 60 * 1000).unref()

// Every socket must carry a valid session token; the user (and so the seat) comes from it, never from
// anything the browser claims.
io.use(async (socket, next) => {
  try {
    const user = await userFromToken(socket.handshake.auth?.token)
    if (!user) return next(new Error('signed_out'))
    socket.data.user = user
    // The seat key: this account in THIS browser (its sign-in session). Two browsers = two players, even on
    // one account, and refreshing keeps the same seat.
    const session = createHash('sha256').update(String(socket.handshake.auth.token)).digest('hex').slice(0, 16)
    socket.data.player = { id: `${user.id}#${session}`, accountId: user.id }
    next()
  } catch {
    next(new Error('unavailable'))
  }
})

// Simple flood guard: at most ~40 messages a second per socket.
function rateLimited(socket) {
  const t = Date.now()
  const b = socket.data.bucket ?? (socket.data.bucket = { tokens: 40, at: t })
  b.tokens = Math.min(40, b.tokens + ((t - b.at) / 1000) * 40)
  b.at = t
  if (b.tokens < 1) return true
  b.tokens -= 1
  return false
}

io.on('connection', (socket) => {
  const user = socket.data.user
  const player = socket.data.player
  const admin = isAdmin(user)

  function seat(code, role) {
    for (const ch of socket.rooms) if (ch.startsWith('seat:')) socket.leave(ch)
    socket.join(seatChannel(code, role))
    rooms.attach(player.id, socket.id)
  }

  // Back in a game you were already in (refresh, dropped connection, phone locked).
  const current = rooms.roomOf(player.id)
  if (current) seat(current.code, current.role)
  else socket.emit('room:none')

  // Wraps a handler: rate limit, turn GameErrors into a message for the player, never crash the server.
  const on = (event, fn) => socket.on(event, async (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null
    if (rateLimited(socket)) return
    try {
      const result = await fn(...args)
      ack?.({ ok: true, ...(result ?? {}) })
    } catch (err) {
      if (err instanceof GameError) ack?.({ ok: false, error: err.message })
      else {
        console.error(`[socket ${event}] ${err.stack ?? err.message}`)
        ack?.({ ok: false, error: 'Something went wrong.' })
      }
    }
  })

  async function saveProfile(profile) {
    const name = cleanName(profile?.name)
    if (name && PRONOUN_OPTIONS.includes(profile?.pronouns)) {
      await getStore().saveProfile(user.id, { name, pronouns: profile.pronouns }).catch(() => {})
    }
  }

  on('room:create', async (profile) => {
    const r = rooms.create(player, profile ?? {})
    await saveProfile(profile)
    seat(r.code, r.role)
    return r
  })

  on('room:join', async ({ code, profile } = {}) => {
    const r = rooms.join(player, code, profile ?? {})
    await saveProfile(profile)
    seat(r.code, r.role)
    return r
  })

  // Leaving sends this seat (every tab of it) back home. The host leaving closes the cell for both.
  on('room:leave', () => {
    const where = rooms.roomOf(player.id)
    rooms.leave(player.id)
    if (where) {
      const ch = seatChannel(where.code, where.role)
      io.to(ch).emit('room:none')
      io.in(ch).socketsLeave(ch)
    }
    socket.emit('room:none')
  })

  on('room:saveQuit', () => rooms.saveAndQuit(player.id))
  on('room:start', ({ level } = {}) => rooms.start(player.id, level))
  on('room:lobby', () => rooms.returnToLobby(player.id))
  on('story:advance', (opts) => rooms.advanceStory(player.id, opts ?? {}))
  on('story:devSkip', () => rooms.devSkipStory(player.id))
  on('level:action', (msg) => rooms.levelAction(player.id, msg ?? {}))
  on('level:query', (msg) => rooms.levelQuery(player.id, msg ?? {}))
  on('level:devSkip', () => rooms.devSkipLevel(player.id))
  on('ending:choose', ({ give } = {}) => rooms.choose(player.id, !!give))

  on('me', async () => ({ user: publicUser((await getStore().getUser(user.id)) ?? user) }))

  // ── admin spectating: silent. Watchers are in their own channel, never counted, never announced.
  on('admin:list', () => {
    if (!admin) throw new GameError('Not allowed.')
    return { rooms: rooms.list() }
  })
  on('admin:watch', ({ code } = {}) => {
    if (!admin) throw new GameError('Not allowed.')
    const snap = rooms.spectatorSnapshot(code)
    if (!snap) throw new GameError('That game has ended.')
    for (const ch of socket.rooms) if (ch.startsWith('watch:')) socket.leave(ch)
    socket.join(watchChannel(code))
    socket.emit('room:state', snap)
  })
  on('admin:levelQuery', ({ code, role, msg } = {}) => {
    if (!admin) throw new GameError('Not allowed.')
    return rooms.spectatorQuery(String(code ?? ''), role, msg ?? {})
  })
  on('admin:unwatch', () => {
    for (const ch of socket.rooms) if (ch.startsWith('watch:')) socket.leave(ch)
  })

  socket.on('disconnect', () => rooms.detach(player.id, socket.id))
})

server.listen(config.port, () => {
  console.log(`[server] listening on ${config.port}${config.devMode ? ' (DEV MODE: all levels unlocked)' : ''}`)
})
