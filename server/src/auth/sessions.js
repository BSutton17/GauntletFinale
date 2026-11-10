// Staying signed in. Google proves who somebody is once; after that the client holds a token of ours.
// It lasts a year and the year restarts whenever it's used. Only a HASH is stored, so a leaked database
// holds nothing that can be replayed as a login.

import { createHash, randomBytes } from 'node:crypto'
import { getStore } from '../db/store.js'

const LIFETIME_MS = 365 * 24 * 60 * 60 * 1000
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

const hashOf = (token) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId, now = Date.now()) {
  const token = randomBytes(32).toString('base64url')
  await getStore().putSession(hashOf(token), {
    userId,
    createdAt: new Date(now),
    refreshedAt: new Date(now),
    expiresAt: new Date(now + LIFETIME_MS),
  })
  return token
}

// The user id behind a token, or null.
export async function resolveSession(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null
  const hash = hashOf(token)
  const store = getStore()
  const s = await store.getSession(hash)
  if (!s) return null
  if (new Date(s.expiresAt).getTime() <= now) {
    await store.deleteSession(hash)
    return null
  }
  if (now - new Date(s.refreshedAt).getTime() > REFRESH_AFTER_MS) {
    await store.putSession(hash, { ...s, refreshedAt: new Date(now), expiresAt: new Date(now + LIFETIME_MS) })
  }
  return s.userId
}

export async function deleteSession(token) {
  if (typeof token === 'string') await getStore().deleteSession(hashOf(token))
}
