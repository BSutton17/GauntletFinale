// Talking to the game server over HTTP (sign-in only; the game itself runs over the socket).

const PROD_SERVER = 'https://gauntletfinale-28915540db1f.herokuapp.com'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3001` : PROD_SERVER)

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '607981026586-o3k5n213tdvhev5526v74aa9804lg74b.apps.googleusercontent.com'

const TOKEN_KEY = 'gauntlet-finale-token'

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } },
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  googleLogin: (credential) => call('/auth/google', { method: 'POST', body: { credential } }),
  devLogin: (name) => call('/auth/dev-login', { method: 'POST', body: { name } }),
  me: (token) => call('/auth/me', { token }),
  logout: (token) => call('/auth/logout', { method: 'POST', token }).catch(() => {}),
}
