// One line at a time, typed out. Only the host's click moves the story on; a click mid-line first
// finishes the line, on both screens.
import { useCallback, useEffect, useRef, useState } from 'react'
import SceneBackground from '../components/SceneBackground.jsx'
import SaveQuit from '../components/SaveQuit.jsx'

const CHAR_MS = 32
const PAUSE_CHAR_MS = 450

function TypedLine({ line, revealed, onDone }) {
  const total = line.parts.reduce((n, p) => n + p.text.length, 0)
  const [count, setCount] = useState(revealed ? total : 0)
  const speed = line.kind === 'pause' ? PAUSE_CHAR_MS : CHAR_MS

  useEffect(() => { if (revealed) setCount(total) }, [revealed, total])
  useEffect(() => {
    if (count >= total) { onDone(); return }
    const t = setTimeout(() => setCount((c) => c + 1), speed)
    return () => clearTimeout(t)
  }, [count, total, speed, onDone])

  let left = count
  return (
    <p className={`story-line ${line.kind}`}>
      {line.parts.map((p, i) => {
        const shown = p.text.slice(0, Math.max(0, left))
        left -= p.text.length
        return p.italic ? <em key={i}>{shown}</em> : <span key={i}>{shown}</span>
      })}
      {count < total && <span className="caret" />}
    </p>
  )
}

export default function Story({ room, isHost, emit, spectator, isAdmin = false }) {
  const { story } = room
  const done = useRef(false)
  const [typed, setTyped] = useState(false)
  const key = `${story.id}:${story.index}`

  useEffect(() => { done.current = false; setTyped(false) }, [key])
  const onDone = useCallback(() => { done.current = true; setTyped(true) }, [])

  const advance = useCallback(() => {
    if (isHost) emit('story:advance', { typed: done.current })
  }, [isHost, emit])

  useEffect(() => {
    if (!isHost) return
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advance() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isHost, advance])

  return (
    <div className={`story-screen ${isHost ? 'clickable' : ''}`} onClick={advance}>
      <SceneBackground bg={story.line.bg} />
      <TypedLine key={key} line={story.line} revealed={story.revealed} onDone={onDone} />
      <div className="story-hint">
        {isHost
          ? <span className={typed ? 'pulse' : 'invisible'}>Click to continue</span>
          : <span className="faint">{room.players.A?.name} is the host</span>}
      </div>
      {isHost && room.dev && (
        <button className="btn small ghost dev-skip" onClick={(e) => { e.stopPropagation(); emit('story:devSkip') }}>
          Skip story (dev)
        </button>
      )}
      {!spectator && <SaveQuit emit={emit} level={room.level} canSwitch={isAdmin} swapped={!!room.swapped} />}
    </div>
  )
}
