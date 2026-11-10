import { useState } from 'react'
import { PRONOUN_OPTIONS, NAME_MAX, cleanName } from '@shared/levels.js'
import { request } from '../lib/socket.js'
import Progress from '../components/Progress.jsx'

export default function Home({ socket, user, notice, clearNotice, onSignOut, onAdmin }) {
  const [name, setName] = useState(user.profile?.name ?? '')
  const [pronouns, setPronouns] = useState(user.profile?.pronouns ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function profile() {
    const clean = cleanName(name)
    if (!clean) { setError('Enter your name (letters only).'); return null }
    if (!pronouns) { setError('Choose your pronouns.'); return null }
    return { name: clean, pronouns }
  }

  async function go(event, payload) {
    setError(null)
    clearNotice()
    setBusy(true)
    const r = await request(socket, event, payload)
    setBusy(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="center-screen">
      <h1 className="title">The Gauntlet <span>Finale</span></h1>
      {notice && <p className="error">{notice}</p>}

      <div className="panel">
        <h2>Who are you, prisoner?</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </label>
        <label className="field">
          <span>Pronouns</span>
          <select value={pronouns} onChange={(e) => setPronouns(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {PRONOUN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <div className="split">
          <div>
            <h3>Start an escape</h3>
            <p className="faint small">You'll host as Player 1 and choose where to resume.</p>
            <button className="btn" disabled={busy} onClick={() => { const p = profile(); if (p) go('room:create', p) }}>Open a cell</button>
          </div>
          <div>
            <h3>Join a partner</h3>
            <input className="code-input" value={code} maxLength={4} placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            <button className="btn" disabled={busy || code.length !== 4}
              onClick={() => { const p = profile(); if (p) go('room:join', { code, profile: p }) }}>Join</button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <Progress progress={user.progress} />

      <div className="footer-row">
        <span className="faint small">Signed in as {user.email}</span>
        {user.isAdmin && <button className="btn small ghost" onClick={onAdmin}>Admin</button>}
        <button className="btn small ghost" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  )
}
