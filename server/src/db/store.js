// Accounts, sign-in sessions and saved progress.
//
// Google only proves WHO someone is; this is where what they've done is kept. MongoDB when MONGO_URI is
// set. Without it, local development falls back to memory (lost on restart) and production refuses
// sign-in with a 503, so a missing config var can never silently throw everyone's progress away.
//
// Progress shape on a user:
//   progress.host  = { furthest, partner, updatedAt, finished }        levels reached as the host (Player A)
//   progress.guest = { [hostKey]: { furthest, hostName, updatedAt, finished } }
//                                                                       levels reached as Player B, per host
// Player B's progress is kept apart and labelled with whose game it was, so two people coming back days
// later can tell who hosted (and so who was Player A).

import { MongoClient } from 'mongodb'
import { config } from '../config.js'

export class StoreUnavailable extends Error {
  constructor() { super('The account database is not configured') }
}

const keyOf = (id) => String(id).replace(/[^A-Za-z0-9_:-]/g, '_')

function freshProgress() {
  return { host: { furthest: 1, partner: null, updatedAt: null, finished: false }, guest: {} }
}

// ── Memory store ────────────────────────────────────────────────────────────
export function createMemoryStore() {
  const users = new Map()
  const sessions = new Map()
  return {
    kind: 'memory',
    async getUser(id) { return users.get(id) ?? null },
    async upsertUser({ id, email, name, picture }) {
      const prev = users.get(id)
      const user = prev
        ? { ...prev, email, name, picture: picture ?? null }
        : { id, email, name, picture: picture ?? null, profile: null, progress: freshProgress(), createdAt: new Date() }
      users.set(id, user)
      return user
    },
    async saveProfile(id, profile) {
      const u = users.get(id)
      if (u) u.profile = { ...profile }
    },
    async recordProgress(userId, entry) {
      const u = users.get(userId)
      if (!u) return
      applyProgress(u.progress, entry)
    },
    async putSession(hash, s) { sessions.set(hash, { ...s }) },
    async getSession(hash) { return sessions.get(hash) ?? null },
    async deleteSession(hash) { sessions.delete(hash) },
  }
}

// Shared by the memory store and the tests; Mongo does the same thing with $max / $set.
export function applyProgress(progress, { role, level, partnerName, hostId, hostName, finished }) {
  const now = new Date()
  if (role === 'A') {
    progress.host.furthest = Math.max(progress.host.furthest ?? 1, level)
    progress.host.partner = partnerName ?? progress.host.partner
    progress.host.updatedAt = now
    if (finished) progress.host.finished = true
  } else {
    const k = keyOf(hostId)
    const prev = progress.guest[k] ?? { furthest: 1, hostName, finished: false }
    progress.guest[k] = {
      furthest: Math.max(prev.furthest, level),
      hostName: hostName ?? prev.hostName,
      updatedAt: now,
      finished: prev.finished || !!finished,
    }
  }
}

// ── Mongo store ─────────────────────────────────────────────────────────────
export async function createMongoStore(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  const db = client.db(dbName)
  const users = db.collection('users')
  const sessions = db.collection('sessions')
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  const fromDoc = (d) => (d ? { id: d._id, ...d, _id: undefined } : null)

  return {
    kind: 'mongo',
    async getUser(id) { return fromDoc(await users.findOne({ _id: id })) },
    async upsertUser({ id, email, name, picture }) {
      const d = await users.findOneAndUpdate(
        { _id: id },
        {
          $set: { email, name, picture: picture ?? null },
          $setOnInsert: { profile: null, progress: freshProgress(), createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' },
      )
      return fromDoc(d)
    },
    async saveProfile(id, profile) {
      await users.updateOne({ _id: id }, { $set: { profile } })
    },
    async recordProgress(userId, { role, level, partnerName, hostId, hostName, finished }) {
      const now = new Date()
      if (role === 'A') {
        const set = { 'progress.host.updatedAt': now }
        if (partnerName) set['progress.host.partner'] = partnerName
        if (finished) set['progress.host.finished'] = true
        await users.updateOne({ _id: userId }, { $max: { 'progress.host.furthest': level }, $set: set })
      } else {
        const base = `progress.guest.${keyOf(hostId)}`
        const set = { [`${base}.updatedAt`]: now, [`${base}.hostName`]: hostName }
        if (finished) set[`${base}.finished`] = true
        await users.updateOne({ _id: userId }, { $max: { [`${base}.furthest`]: level }, $set: set })
      }
    },
    async putSession(hash, s) { await sessions.replaceOne({ _id: hash }, s, { upsert: true }) },
    async getSession(hash) { return sessions.findOne({ _id: hash }) },
    async deleteSession(hash) { await sessions.deleteOne({ _id: hash }) },
  }
}

// ── The one store the server uses ───────────────────────────────────────────
let store = null

export async function initStore() {
  if (config.mongoUri) {
    try {
      store = await createMongoStore(config.mongoUri, config.mongoDb)
      console.log(`[db] MongoDB connected (${config.mongoDb})`)
      return
    } catch (err) {
      console.error(`[db] ⚠️  COULD NOT CONNECT TO MONGODB: ${err.message}`)
      if (/auth/i.test(err.message)) console.error('[db]    Check the database user\'s name and password in MONGO_URI (Atlas → Database Access).')
      if (config.isProduction) { console.error('[db]    Sign-in is disabled until this is fixed.'); return }
    }
  }
  if (!config.isProduction) {
    store = createMemoryStore()
    console.warn('[db] Using IN-MEMORY accounts: progress is lost when the server restarts')
  } else {
    console.error('[db] MONGO_URI not set in production: sign-in is disabled until it is')
  }
}

export function setStore(s) { store = s }

export function getStore() {
  if (!store) throw new StoreUnavailable()
  return store
}
