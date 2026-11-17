// Replay chunks for the King's Window, over HTTP so the stored brotli bytes go out as they are
// (Content-Encoding: br) and the browser unpacks them itself. Admin only, like spectating.
import express from 'express'
import { brotliDecompress } from 'node:zlib'
import { promisify } from 'node:util'
import { getStore, StoreUnavailable } from '../db/store.js'
import { bearerToken, isAdmin, userFromToken } from '../auth/routes.js'

const decompress = promisify(brotliDecompress)

export function createReplayRouter() {
  const router = express.Router()

  router.get('/:id/:i', async (req, res, next) => {
    try {
      const user = await userFromToken(bearerToken(req))
      if (!isAdmin(user)) return res.status(403).json({ error: 'not_allowed' })
      const i = Number(req.params.i)
      if (!Number.isInteger(i) || i < 0) return res.status(400).json({ error: 'bad_request' })
      const buf = await getStore().getReplayChunk(String(req.params.id), i)
      if (!buf) return res.status(404).json({ error: 'not_found' })
      res.set('Cache-Control', 'private, max-age=86400')
      res.set('Vary', 'Accept-Encoding')
      res.type('application/json')
      if (req.acceptsEncodings('br')) {
        res.set('Content-Encoding', 'br')
        return res.send(buf)
      }
      res.send(await decompress(buf))
    } catch (err) { next(err) }
  })

  router.use((err, _req, res, next) => {
    if (res.headersSent) return next(err)
    if (err instanceof StoreUnavailable) return res.status(503).json({ error: 'unavailable' })
    console.error(`[replays] ${err.stack ?? err.message}`)
    res.status(500).json({ error: 'server_error' })
  })
  return router
}
