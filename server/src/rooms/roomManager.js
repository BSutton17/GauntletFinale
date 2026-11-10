// Rooms, seats and the flow of a game:
//
//   lobby -> story (before puzzle N) -> card ("Level N") -> level (puzzle N) -> story N -> card N+1 -> ...
//   ... puzzle 11 (poker) -> story "ending" -> choice (winner keeps or gives) -> endingKeep|endingGive -> credits
//
// The host is ALWAYS Player A, and only the host advances the story. The server decides what level a room
// is on; a browser can only ask to act within the current one.
//
// A SEAT belongs to one sign-in session (one browser), not one account: the same account signed in on two
// browsers is two different players. Everything below calls that seat key `userId`; the account it belongs
// to (where progress is saved) is `accountId`.
//
// This file knows nothing about sockets. It talks through a `transport` so the tests can drive it:
//   transport.toSeat(code, role, event, data)
//   transport.toWatchers(code, event, data)      (silent admin spectators)
//   transport.hasWatchers(code) -> boolean

import { LEVEL_COUNT, PRONOUN_OPTIONS, cleanName } from '../../../shared/levels.js'
import { STORIES, storyBeforeLevel } from '../story/script.js'
import { buildStory } from '../story/engine.js'
import { choiceView, finalCard, CREDIT_ROLES } from '../story/endings.js'
import { getLevel } from '../levels/index.js'
import { cryptoRng } from '../levels/rng.js'

export const CARD_MS = 6200 // long enough for the difficulty flames (they start at 2.5 s)
const ABANDON_MS = 15 * 60 * 1000

export class GameError extends Error {}

export function createRoomManager({ transport, devMode = false, recordProgress = async () => {}, getHostFurthest = async () => 1, rngFactory = cryptoRng, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const rooms = new Map()       // code -> room
  const userRoom = new Map()    // userId -> code

  // ── helpers ──────────────────────────────────────────────────────────────
  // A 4-digit number, 1000-9999 (no leading zero for anyone to drop).
  function newCode() {
    for (;;) {
      const c = String(1000 + Math.floor(Math.random() * 9000))
      if (!rooms.has(c)) return c
    }
  }

  function checkProfile({ name, pronouns }) {
    const clean = cleanName(name)
    if (!clean) throw new GameError('Please enter a name (letters only, up to 20).')
    if (!PRONOUN_OPTIONS.includes(pronouns)) throw new GameError('Please choose your pronouns.')
    return { name: clean, pronouns }
  }

  const roleOf = (room, userId) => (room.seats.A?.userId === userId ? 'A' : room.seats.B?.userId === userId ? 'B' : null)

  // "Switch sides" (admin only): the two players swap which side of the PUZZLE they play. Seats don't move, so the
  // host is still the host and progress is saved as before. The map is its own inverse: seat -> level role and
  // level role -> seat are the same function.
  const other = (r) => (r === 'A' ? 'B' : 'A')
  const sideOf = (room, role) => (room.swapped ? other(role) : role)

  function cast(room) {
    const c = {
      A: { name: room.seats.A.name, pronouns: room.seats.A.pronouns },
      B: { name: room.seats.B.name, pronouns: room.seats.B.pronouns },
    }
    if (room.result) { c.W = c[room.result.winner]; c.L = c[room.result.winner === 'A' ? 'B' : 'A'] }
    return c
  }

  function clearTimers(room) {
    if (room.cardTimer) { clearTimer(room.cardTimer); room.cardTimer = null }
  }

  function disposeLevel(room) {
    if (room.levelModule?.dispose && room.levelState) {
      try { room.levelModule.dispose(room.levelState) } catch (e) { console.error(e) }
    }
    room.levelModule = null
    room.levelState = null
  }

  // ── what each browser is allowed to see ─────────────────────────────────
  function snapshot(room, who) {
    const seat = (s) => (s ? { name: s.name, pronouns: s.pronouns, online: s.sockets.size > 0 } : null)
    const base = {
      code: room.code,
      dev: devMode,
      phase: room.phase,
      level: room.level,
      players: { A: seat(room.seats.A), B: seat(room.seats.B) },
      story: room.story
        ? { id: String(room.story.id), index: room.story.index, total: room.story.lines.length, line: room.story.lines[room.story.index], revealed: room.story.revealed }
        : null,
      result: room.result ? { winner: room.result.winner, choice: room.choice ?? null } : null,
      swapped: !!room.swapped,
    }
    // Who is on which side of the puzzle (the same as players unless the sides are switched).
    base.levelPlayers = room.swapped ? { A: base.players.B, B: base.players.A } : base.players
    const names = { A: { name: room.seats.A.name }, B: { name: room.seats.B?.name ?? '' } }
    if (room.phase === 'choice') base.choice = choiceView(names, room.result.winner)
    if (room.phase === 'credits') base.credits = { roles: CREDIT_ROLES, ...finalCard(names, room.result.winner, room.choice) }
    const levelOpts = { devMode }
    if (who === 'spectator') {
      base.you = { spectator: true }
      if (room.phase === 'level' && room.levelModule) {
        base.levelViews = { A: room.levelModule.view(room.levelState, 'A', levelOpts), B: room.levelModule.view(room.levelState, 'B', levelOpts) }
      }
    } else {
      base.you = { role: who, isHost: who === 'A', levelRole: sideOf(room, who) }
      if (room.phase === 'level' && room.levelModule) base.levelView = room.levelModule.view(room.levelState, sideOf(room, who), levelOpts)
    }
    return base
  }

  function broadcast(room) {
    room.updatedAt = now()
    for (const role of ['A', 'B']) {
      if (room.seats[role]) transport.toSeat(room.code, role, 'room:state', snapshot(room, role))
    }
    if (transport.hasWatchers(room.code)) transport.toWatchers(room.code, 'room:state', snapshot(room, 'spectator'))
  }

  // ── flow ─────────────────────────────────────────────────────────────────
  function beginStory(room, id) {
    room.phase = 'story'
    room.story = { id, lines: buildStory(STORIES[id], cast(room)), index: 0, revealed: false }
  }

  function finishStory(room) {
    const id = room.story.id
    room.story = null
    if (id === 'ending') {
      room.phase = 'choice'
    } else if (id === 'endingKeep' || id === 'endingGive') {
      room.phase = 'credits'
      saveProgress(room, LEVEL_COUNT, true)
    } else {
      room.phase = 'card'
      room.cardTimer = setTimer(() => {
        room.cardTimer = null
        if (room.phase === 'card') { startPuzzle(room); broadcast(room) }
      }, CARD_MS)
    }
  }

  function startPuzzle(room) {
    const mod = getLevel(room.level)
    room.levelModule = mod
    room.levelRng = rngFactory()
    room.levelState = mod.create({ rng: room.levelRng, devMode })
    room.phase = 'level'
    // Levels that run on their own clock (the maze's timer) start it here, with the same api actions get.
    mod.start?.(room.levelState, levelApi(room))
  }

  function levelApi(room) {
    const levelAtStart = room.level
    const live = () => rooms.get(room.code) === room && room.phase === 'level' && room.level === levelAtStart
    return {
      devMode,
      rng: room.levelRng,
      update: () => { if (live()) broadcast(room) },
      emit: (role, event, data) => {
        if (!live()) return
        transport.toSeat(room.code, sideOf(room, role), 'level:stream', { event, data })
        if (transport.hasWatchers(room.code)) transport.toWatchers(room.code, 'level:stream', { role, event, data })
      },
      complete: (result = {}) => { if (live()) completeLevel(room, result) },
      // the players swap puzzle sides (the same switch the admin has); the caller then calls update()
      switchSides: () => { if (live()) room.swapped = !room.swapped },
    }
  }

  function completeLevel(room, result) {
    const finished = room.level
    disposeLevel(room)
    if (finished === LEVEL_COUNT) {
      room.result = { winner: sideOf(room, result.winner === 'B' ? 'B' : 'A') } // the winning side -> that player's seat
      beginStory(room, 'ending')
    } else {
      room.level = finished + 1
      saveProgress(room, room.level, false)
      beginStory(room, finished)
    }
    broadcast(room)
  }

  function saveProgress(room, level, finished) {
    const A = room.seats.A
    const B = room.seats.B
    const write = (userId, entry) => Promise.resolve(recordProgress(userId, entry)).catch(e => console.error(`[progress] ${e.message}`))
    write(A.accountId, { role: 'A', level, partnerName: B?.name ?? null, finished })
    if (B) write(B.accountId, { role: 'B', level, hostId: A.accountId, hostName: A.name, finished })
  }

  function closeRoom(room, reason) {
    clearTimers(room)
    disposeLevel(room)
    rooms.delete(room.code)
    for (const role of ['A', 'B']) {
      const s = room.seats[role]
      if (!s) continue
      if (userRoom.get(s.userId) === room.code) userRoom.delete(s.userId)
      transport.toSeat(room.code, role, 'room:closed', { code: room.code, reason })
    }
    if (transport.hasWatchers(room.code)) transport.toWatchers(room.code, 'room:closed', { code: room.code, reason })
  }

  function requireRoom(userId) {
    const code = userRoom.get(userId)
    const room = code && rooms.get(code)
    if (!room) throw new GameError('You are not in a game.')
    return { room, role: roleOf(room, userId) }
  }

  // ── public API (called by the socket layer) ─────────────────────────────
  return {
    roomOf(userId) {
      const code = userRoom.get(userId)
      const room = code && rooms.get(code)
      return room ? { code, role: roleOf(room, userId) } : null
    },

    create(user, profile) {
      const p = checkProfile(profile)
      if (userRoom.has(user.id)) this.leave(user.id)
      const code = newCode()
      const room = {
        code,
        createdAt: now(),
        updatedAt: now(),
        seats: { A: { userId: user.id, accountId: user.accountId ?? user.id, ...p, sockets: new Set() }, B: null },
        phase: 'lobby',
        level: 1,
        story: null,
        result: null,
        choice: null,
        swapped: false,
      }
      rooms.set(code, room)
      userRoom.set(user.id, code)
      return { code, role: 'A' }
    },

    join(user, codeRaw, profile) {
      const p = checkProfile(profile)
      const code = String(codeRaw ?? '').replace(/[^0-9]/g, '')
      const room = rooms.get(code)
      if (!room) throw new GameError('No cell with that code.')
      const existing = roleOf(room, user.id)
      if (existing) { userRoom.set(user.id, code); return { code, role: existing } }
      if (room.seats.B) throw new GameError('That cell already has two prisoners.')
      if (room.phase !== 'lobby') throw new GameError('That game has already started.')
      if (userRoom.has(user.id)) this.leave(user.id)
      room.seats.B = { userId: user.id, accountId: user.accountId ?? user.id, ...p, sockets: new Set() }
      userRoom.set(user.id, code)
      broadcast(room)
      return { code, role: 'B' }
    },

    // Explicit "leave": the host closes the room; Player B frees the seat while still in the lobby.
    leave(userId) {
      const code = userRoom.get(userId)
      const room = code && rooms.get(code)
      userRoom.delete(userId)
      if (!room) return
      const role = roleOf(room, userId)
      if (role === 'A') return closeRoom(room, 'The host left the game.')
      if (role === 'B') {
        if (room.phase === 'lobby') {
          room.seats.B = null
          broadcast(room)
        } else {
          // Mid-game the seat is kept so they can come back; the room ends if it's abandoned.
          room.seats.B.sockets.clear()
          broadcast(room)
        }
      }
    },

    // "Save and quit" from inside a game: progress is saved at the level the room is on, and the game ends for
    // both (neither can carry on alone). Either player can do it. Returns the level saved.
    saveAndQuit(userId) {
      const { room, role } = requireRoom(userId)
      if (room.phase === 'lobby') { this.leave(userId); return { level: null } }
      const atEnd = room.level === LEVEL_COUNT && (room.result || room.phase === 'choice' || room.phase === 'credits')
      if (!atEnd) saveProgress(room, room.level, false)
      const name = room.seats[role].name
      closeRoom(room, atEnd
        ? `${name} left the game.`
        : `${name} saved and quit. Your progress is saved at Level ${room.level}.`)
      return { level: atEnd ? null : room.level }
    },

    attach(userId, socketId) {
      const code = userRoom.get(userId)
      const room = code && rooms.get(code)
      if (!room) return null
      const role = roleOf(room, userId)
      room.seats[role].sockets.add(socketId)
      broadcast(room)
      return { code, role }
    },

    detach(userId, socketId) {
      const code = userRoom.get(userId)
      const room = code && rooms.get(code)
      if (!room) return
      const role = roleOf(room, userId)
      room.seats[role]?.sockets.delete(socketId)
      broadcast(room)
    },

    start(userId, levelRaw) {
      const { room, role } = requireRoom(userId)
      if (role !== 'A') throw new GameError('Only the host can start the game.')
      if (room.phase !== 'lobby') throw new GameError('The game has already started.')
      if (!room.seats.B) throw new GameError('Waiting for a second prisoner.')
      const level = Number(levelRaw)
      if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) throw new GameError('No such level.')
      return Promise.resolve(devMode ? LEVEL_COUNT : getHostFurthest(room.seats.A.accountId)).then((furthest) => {
        if (level > furthest) throw new GameError('That level is still locked.')
        if (room.phase !== 'lobby' || !room.seats.B) return
        room.level = level
        beginStory(room, storyBeforeLevel(level))
        broadcast(room)
      })
    },

    // The host's click. `typed` = the host's screen has already finished typing the line, so the click goes
    // straight to the next line instead of first revealing the rest of this one.
    advanceStory(userId, { typed } = {}) {
      const { room, role } = requireRoom(userId)
      if (role !== 'A' || room.phase !== 'story' || !room.story) return
      const s = room.story
      if (!s.revealed && !typed) {
        s.revealed = true
      } else if (s.index + 1 < s.lines.length) {
        s.index++
        s.revealed = false
      } else {
        finishStory(room)
      }
      broadcast(room)
    },

    devSkipStory(userId) {
      if (!devMode) return
      const { room, role } = requireRoom(userId)
      if (role !== 'A' || room.phase !== 'story') return
      finishStory(room)
      broadcast(room)
    },

    // Dev mode only: the host can finish any level instantly (poker counts as a win for Player A).
    devSkipLevel(userId) {
      if (!devMode) return
      const { room, role } = requireRoom(userId)
      if (role !== 'A' || room.phase !== 'level') return
      completeLevel(room, { winner: sideOf(room, 'A') })
    },

    // Whatever the level's action returns goes back to that player (e.g. { placed: true }).
    levelAction(userId, msg) {
      const { room, role } = requireRoom(userId)
      if (room.phase !== 'level' || !room.levelModule) return
      return room.levelModule.action(room.levelState, sideOf(room, role), msg, levelApi(room)) ?? undefined
    },

    // Read-only data a level hands out on request (Level 3's piece pictures), for one role.
    levelQuery(userId, msg) {
      const { room, role } = requireRoom(userId)
      if (room.phase !== 'level' || !room.levelModule?.query) return {}
      return room.levelModule.query(room.levelState, sideOf(room, role), msg)
    },

    // Admin only (the socket layer checks): swap sides with your partner. Works mid-puzzle; the puzzle carries on
    // with each player now looking at the other's side. Stays switched until switched back or the next lobby.
    switchSides(userId) {
      const { room } = requireRoom(userId)
      if (room.phase === 'lobby' || room.phase === 'credits') throw new GameError('Sides can only be switched during the game.')
      room.swapped = !room.swapped
      broadcast(room)
      return { swapped: room.swapped }
    },

    // The same, for a silent admin spectator looking at either role.
    spectatorQuery(code, role, msg) {
      const room = rooms.get(code)
      if (!room || room.phase !== 'level' || !room.levelModule?.query || (role !== 'A' && role !== 'B')) return {}
      return room.levelModule.query(room.levelState, role, msg)
    },

    // Only the poker winner chooses.
    choose(userId, give) {
      const { room, role } = requireRoom(userId)
      if (room.phase !== 'choice' || role !== room.result?.winner) return
      room.choice = give ? 'give' : 'keep'
      beginStory(room, give ? 'endingGive' : 'endingKeep')
      broadcast(room)
    },

    // Back to the lobby after the credits (or from a dead end), same two players.
    returnToLobby(userId) {
      const { room, role } = requireRoom(userId)
      if (role !== 'A') return
      clearTimers(room)
      disposeLevel(room)
      Object.assign(room, { phase: 'lobby', story: null, result: null, choice: null, level: 1, swapped: false })
      broadcast(room)
    },

    // ── admin ──
    list() {
      return [...rooms.values()].map(r => ({
        code: r.code,
        A: r.seats.A?.name ?? null,
        B: r.seats.B?.name ?? null,
        online: { A: (r.seats.A?.sockets.size ?? 0) > 0, B: (r.seats.B?.sockets.size ?? 0) > 0 },
        phase: r.phase,
        level: r.level,
        createdAt: r.createdAt,
      })).sort((a, b) => b.createdAt - a.createdAt)
    },

    spectatorSnapshot(code) {
      const room = rooms.get(code)
      return room ? snapshot(room, 'spectator') : null
    },

    // Rooms where nobody has been connected for a while are closed.
    sweep() {
      const t = now()
      for (const room of [...rooms.values()]) {
        const anyone = ['A', 'B'].some(r => room.seats[r]?.sockets.size > 0)
        if (!anyone && t - room.updatedAt > ABANDON_MS) closeRoom(room, 'The game was abandoned.')
      }
    },

    _rooms: rooms,
  }
}
