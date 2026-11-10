// Visual-novel style backdrop for the story: the scene's picture, blurred and darkened, crossfading when the
// scene changes. Pictures live in client/public/backgrounds/<scene>.jpg; a missing one just shows the
// dungeon wall behind it.
import { useEffect, useState } from 'react'

const FADE_MS = 1200
const known = new Map() // scene -> true (loaded) | false (missing)

function probe(bg) {
  if (known.has(bg)) return Promise.resolve(known.get(bg))
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => { known.set(bg, true); resolve(true) }
    img.onerror = () => { known.set(bg, false); resolve(false) }
    img.src = `/backgrounds/${bg}.jpg`
  })
}

export default function SceneBackground({ bg }) {
  const [layers, setLayers] = useState([]) // [{ bg, id }]

  useEffect(() => {
    if (!bg) return
    let alive = true
    probe(bg).then((ok) => {
      if (!alive || !ok) return
      setLayers((ls) => (ls[ls.length - 1]?.bg === bg ? ls : [...ls.slice(-1), { bg, id: Date.now() }]))
    })
    return () => { alive = false }
  }, [bg])

  // Drop the old layer once the new one has faded in over it.
  useEffect(() => {
    if (layers.length < 2) return
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), FADE_MS + 100)
    return () => clearTimeout(t)
  }, [layers])

  return (
    <div className="scene-bg" aria-hidden>
      {layers.map((l) => (
        <div key={l.id} className="scene-bg-layer" style={{ backgroundImage: `url(/backgrounds/${l.bg}.jpg)`, animationDuration: `${FADE_MS}ms` }} />
      ))}
      <div className="scene-bg-shade" />
    </div>
  )
}
