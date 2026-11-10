// Every setting the server reads from the environment, in one place.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

// server/.env, wherever the process was started from.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const env = process.env
const isProduction = env.NODE_ENV === 'production'

export const config = {
  port: Number(env.PORT) || 3001,
  isProduction,
  mongoUri: env.MONGO_URI || '',
  mongoDb: env.MONGO_DB || 'gauntlet_finale',
  clientOrigins: (env.CLIENT_ORIGIN || 'http://localhost:5173,https://kmssykfhxzf3.vercel.app,https://kmssykfhxzf3.netlify.app')
    .split(',').map(s => s.trim()).filter(Boolean),
  googleClientId: env.GOOGLE_CLIENT_ID
    || '607981026586-o3k5n213tdvhev5526v74aa9804lg74b.apps.googleusercontent.com',
  adminEmail: (env.ADMIN_EMAIL || 'btpitch27@gmail.com').toLowerCase(),
  // Dev mode is decided HERE, on the server. The client is only told about it, so flipping a flag in the
  // browser unlocks nothing.
  devMode: env.GAME_DEV_MODE === '1',
  devLogin: !isProduction && env.AUTH_DEV_LOGIN === '1',
}
