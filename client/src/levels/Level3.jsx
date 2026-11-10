// Level 3: the key jigsaw. Each player drags their own pieces into the mold; a piece only sticks when it's
// let go near its own spot (the server decides). Partner's loose pieces are never sent here.
//
// Touch: the tray is a sideways-scrolling strip; drag a piece UP to lift it out. Mouse: drag straight away.
// While you hold a piece, your PARTNER's mold glows where it goes (and theirs on yours), so you can talk
// each other in.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches

// Piece pictures, fetched once and kept for the rest of the level.
function usePieceImages(view, query) {
  const cache = useRef(new Map())
  const asked = useRef(new Set())
  const [, bump] = useState(0)
  useEffect(() => {
    if (!view) return
    const want = [...view.tray, ...view.placed.map(p => p.id)].filter(id => !cache.current.has(id) && !asked.current.has(id))
    if (!want.length) return
    want.forEach(id => asked.current.add(id))
    query({ type: 'images', ids: want }).then((r) => {
      if (r?.images) for (const [id, url] of Object.entries(r.images)) cache.current.set(id, url)
      want.forEach(id => { if (!cache.current.has(id)) asked.current.delete(id) })
      bump(n => n + 1)
    })
  }, [view, query])
  return cache.current
}

export default function Level3({ view }) {
  const { send, query, spectator, players, role } = useLevel()
  const images = usePieceImages(view, query)
  const wrapRef = useRef(null)
  const moldRef = useRef(null)
  const [cellPx, setCellPx] = useState(30)
  const [drag, setDrag] = useState(null)          // { id, x, y, touch }
  const [pending, setPending] = useState(() => new Set())
  const [notice, setNotice] = useState(null)
  const start = useRef(null)
  const coarse = useMemo(coarsePointer, [])

  // Size the mold to fit the screen (width, and leave room for the tray).
  useEffect(() => {
    if (!view) return
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth
      const maxH = window.innerHeight * (coarse ? 0.56 : 0.58)
      setCellPx(Math.max(12, Math.min((w - 8) / view.cols, maxH / view.rows)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [view?.cols, view?.rows, coarse]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = view?.margin ?? 0.3
  const size = (1 + 2 * m) * cellPx            // a piece's picture at mold scale
  const lift = (d) => (d?.touch ? size * 0.8 : 0) // keep a dragged piece above the finger

  const drop = useCallback(async (d) => {
    const rect = moldRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (d.x - rect.left) / cellPx
    const y = (d.y - lift(d) - rect.top) / cellPx
    if (x < -1 || y < -1 || x > view.cols + 1 || y > view.rows + 1) { send({ type: 'release' }); return }
    setPending(p => new Set(p).add(d.id))
    const r = await send({ type: 'drop', id: d.id, x, y })
    setPending(p => { const n = new Set(p); n.delete(d.id); return n })
    if (r?.cooldown) {
      setNotice('Your hands are shaking… take a breath.')
      setTimeout(() => setNotice(null), 1800)
    }
  }, [cellPx, send, view?.cols, view?.rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // One set of window listeners drives every drag.
  useEffect(() => {
    if (spectator) return
    const move = (e) => {
      const s = start.current
      if (!s) return
      if (!s.dragging) {
        const dx = e.clientX - s.x, dy = e.clientY - s.y
        const go = s.touch ? (dy < -8 && Math.abs(dy) > Math.abs(dx)) : Math.hypot(dx, dy) > 3
        if (!go) return
        s.dragging = true
        send({ type: 'grab', id: s.id }) // lights up its spot on the partner's screen
      }
      e.preventDefault()
      setDrag({ id: s.id, x: e.clientX, y: e.clientY, touch: s.touch })
    }
    const up = (e) => {
      const s = start.current
      start.current = null
      if (s?.dragging) drop({ id: s.id, x: e.clientX, y: e.clientY, touch: s.touch })
      setDrag(null)
    }
    const cancel = () => {
      if (start.current?.dragging) send({ type: 'release' })
      start.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [drop, send, spectator])

  if (!view) return null
  const onPieceDown = (e, id) => {
    if (spectator || view.done) return
    if (e.pointerType === 'mouse') e.preventDefault()
    start.current = { id, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', dragging: false }
  }

  const partner = players[role === 'A' ? 'B' : 'A']?.name ?? 'Your partner'
  const inTray = view.tray.filter(id => !pending.has(id))

  return (
    <div className={`l3 ${coarse ? 'touch' : ''}`} ref={wrapRef}>
      <div className="l3-status">
        <span>In the mold: <strong>{view.placed.length}</strong> / {view.total}</span>
        <span>Your pieces: <strong>{view.tray.length}</strong></span>
        <span>{partner} holds: <strong>{view.partnerLeft}</strong></span>
      </div>

      <div className="l3-mold" ref={moldRef} style={{ width: view.cols * cellPx, height: view.rows * cellPx }}>
        <svg className="l3-outline" viewBox={`0 0 ${view.cols} ${view.rows}`} preserveAspectRatio="none">
          {/* rim underneath, fill on top: only the outer edge of the overlapping shapes shows */}
          <path className="rim" d={view.outline} />
          <path className="fill" d={view.outline} />
        </svg>
        {view.partnerTarget && (
          <div className="l3-partner-target" style={{ left: view.partnerTarget[0] * cellPx, top: view.partnerTarget[1] * cellPx, width: cellPx, height: cellPx }} />
        )}
        {view.placed.map(p => images.get(p.id) && (
          <img key={p.id} className="l3-placed" src={images.get(p.id)} alt="" draggable={false}
            style={{ left: (p.c - m) * cellPx, top: (p.r - m) * cellPx, width: size, height: size }} />
        ))}
        {view.done && <div className="l3-done">The key holds together!</div>}
      </div>

      <p className="l3-hint">
        {notice ?? (spectator ? 'Spectating' : coarse ? 'Swipe the tray to browse · drag a piece up into the mold' : 'Drag your pieces into the mold. While you hold one, your partner sees where it goes.')}
      </p>

      <div className="l3-tray">
        {inTray.map(id => (
          <div key={id} className={`l3-slot ${drag?.id === id ? 'lifted' : ''}`} onPointerDown={(e) => onPieceDown(e, id)}>
            {images.get(id) ? <img src={images.get(id)} alt="" draggable={false} /> : <span className="l3-loading" />}
          </div>
        ))}
        {inTray.length === 0 && !view.done && <p className="faint small">All your pieces are in. Help {partner} with theirs.</p>}
      </div>

      {drag && images.get(drag.id) && (
        <img className="l3-drag" src={images.get(drag.id)} alt=""
          style={{ left: drag.x - size / 2, top: drag.y - lift(drag) - size / 2, width: size, height: size }} />
      )}
    </div>
  )
}
