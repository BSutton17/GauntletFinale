import { useEffect, useRef, useState } from 'react'
import { api, GOOGLE_CLIENT_ID } from '../lib/api.js'

export default function Login({ onToken, notice }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [devName, setDevName] = useState('')
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      const g = window.google?.accounts?.id
      if (!g) {
        if (++tries > 100) { clearInterval(timer); setError('Google sign-in could not load. Check your connection or ad blocker.') }
        return
      }
      clearInterval(timer)
      g.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setBusy(true)
          setError(null)
          try {
            const { token, user } = await api.googleLogin(credential)
            onTokenRef.current(token, user)
          } catch (err) {
            setError(err.status === 503 ? 'Accounts are offline right now. Try again soon.' : 'Sign-in failed. Please try again.')
          } finally {
            setBusy(false)
          }
        },
      })
      if (buttonRef.current) g.renderButton(buttonRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' })
    }, 100)
    return () => clearInterval(timer)
  }, [])

  async function devLogin(e) {
    e.preventDefault()
    try {
      const { token, user } = await api.devLogin(devName)
      onToken(token, user)
    } catch {
      setError('Dev login is off on this server.')
    }
  }

  return (
    <div className="center-screen">
      <h1 className="title">The Gauntlet <span>Finale</span></h1>
      <div className="panel narrow">
        <p>Sign in to enter the dungeon.</p>
        <div ref={buttonRef} className="google-button" />
        {busy && <p className="faint">Checking the guard list…</p>}
        {(error || notice) && <p className="error">{error || notice}</p>}
        {import.meta.env.DEV && (
          <form onSubmit={devLogin} className="dev-login">
            <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Dev name (blank = random)" />
            <button className="btn small">Dev login</button>
          </form>
        )}
      </div>
    </div>
  )
}
