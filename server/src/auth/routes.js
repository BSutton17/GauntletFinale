// Sign in with Google. The browser gets a signed ID token from Google's button and sends it here; we check
// Google's signature and that it was issued for THIS app, then hand back a session token of our own.

import express from 'express'
import { OAuth2Client } from 'google-auth-library'
import { config } from '../config.js'
import { getStore, StoreUnavailable } from '../db/store.js'
import { createSession, resolveSession, deleteSession } from './sessions.js'

const google = new OAuth2Client(config.googleClientId)

let verifyCredential = async (credential) => {
  const ticket = await google.verifyIdToken({ idToken: credential, audience: config.googleClientId })
  const p = ticket.getPayload()
  if (!p?.sub) throw new Error('no subject in the Google token')
  if (p.email && p.email_verified === false) throw new Error('email not verified')
  return { id: `google:${p.sub}`, email: (p.email ?? '').toLowerCase() || null, name: p.name ?? p.email ?? 'Prisoner', picture: p.picture ?? null }
}
export function setCredentialVerifier(fn) { verifyCredential = fn }

// The admin is decided by the VERIFIED Google email, here on the server. The client only gets told the
// answer so it can show the button; the spectate events re-check it.
export function isAdmin(user) {
  if (!user) return false
  // Local testing only: the dev login named "Admin" (dev login is refused in production).
  if (config.devLogin && user.id === 'dev:Admin') return true
  return !!user.email && user.email.toLowerCase() === config.adminEmail && user.id.startsWith('google:')
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture ?? null,
    profile: user.profile ?? null,
    progress: user.progress,
    isAdmin: isAdmin(user),
  }
}

export function bearerToken(req) {
  const h = req.get('authorization') ?? ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

export async function userFromToken(token) {
  const userId = await resolveSession(token)
  if (!userId) return null
  return getStore().getUser(userId)
}

async function requireUser(req, res, next) {
  try {
    const user = await userFromToken(bearerToken(req))
    if (!user) return res.status(401).json({ error: 'signed_out' })
    req.user = user
    next()
  } catch (err) { next(err) }
}

export function createAuthRouter() {
  const router = express.Router()
  router.use(express.json({ limit: '16kb' }))
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

  async function finishLogin(profile) {
    const user = await getStore().upsertUser(profile)
    const token = await createSession(profile.id)
    return { token, user: publicUser(user) }
  }

  router.post('/google', async (req, res, next) => {
    try {
      const { credential } = req.body ?? {}
      if (typeof credential !== 'string' || credential.length > 8192) return res.status(400).json({ error: 'bad_request' })
      let profile
      try {
        profile = await verifyCredential(credential)
      } catch (err) {
        console.warn(`[auth] rejected a Google token: ${err.message}`)
        return res.status(401).json({ error: 'google_rejected' })
      }
      res.json(await finishLogin(profile))
    } catch (err) { next(err) }
  })

  router.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }))

  router.post('/logout', async (req, res, next) => {
    try {
      await deleteSession(bearerToken(req))
      res.json({ ok: true })
    } catch (err) { next(err) }
  })

  // Local testing without Google. Refused in production no matter what the env says.
  router.post('/dev-login', async (req, res, next) => {
    if (!config.devLogin) return res.status(404).end()
    try {
      // An empty name gets a random one, so two test browsers never end up as the same account by accident.
      const name = String(req.body?.name ?? '').replace(/[^A-Za-z0-9 '-]/g, '').trim().slice(0, 30)
        || `Prisoner ${1000 + Math.floor(Math.random() * 9000)}`
      res.json(await finishLogin({ id: `dev:${name}`, email: `${name.replace(/ /g, '.')}@dev.local`, name }))
    } catch (err) { next(err) }
  })

  router.use((err, _req, res, next) => {
    if (res.headersSent) return next(err)
    if (err instanceof StoreUnavailable) return res.status(503).json({ error: 'unavailable' })
    console.error(`[auth] ${err.stack ?? err.message}`)
    res.status(500).json({ error: 'server_error' })
  })
  return router
}
