// "Save and quit": a small door in a corner of every level and story screen. Progress is saved at the level
// the game is on, and the game ends for both players (neither can carry on alone), so it asks first.
import { useState } from 'react'
import { GiExitDoor } from 'react-icons/gi'

export default function SaveQuit({ emit, level }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const stop = (e) => e.stopPropagation() // the story screen advances on any click

  return (
    <>
      <button className="save-quit" data-level={level} onClick={(e) => { stop(e); setAsking(true) }}
        title="Save and quit" aria-label="Save and quit">
        <GiExitDoor size={18} aria-hidden="true" /><span>Save &amp; Quit</span>
      </button>
      {asking && (
        <div className="save-quit-backdrop" onClick={(e) => { stop(e); setAsking(false) }} onKeyDown={(e) => { stop(e); if (e.key === 'Escape') setAsking(false) }}>
          <div className="panel save-quit-dialog" role="dialog" aria-modal="true" aria-labelledby="sq-title" onClick={stop}>
            <h3 id="sq-title">Save and quit?</h3>
            <p>Your progress is saved at <strong>Level {level}</strong>. This ends the game for both of you; you can pick up from here next time.</p>
            <div className="save-quit-actions">
              <button className="btn ghost" onClick={() => setAsking(false)} disabled={busy}>Keep playing</button>
              <button className="btn" disabled={busy} autoFocus
                onClick={async () => { setBusy(true); const r = await emit('room:saveQuit'); if (!r?.ok) setBusy(false) }}>Save &amp; quit</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
