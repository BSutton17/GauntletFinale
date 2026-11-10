// The taped-together key for Level 3, drawn in GRID UNITS (one jigsaw cell = 1 x 1).
// Every cell the key touches becomes a piece; the shape is tuned so that's exactly 104.

export const COLS = 26
export const ROWS = 8
export const COVER = 0.02 // a cell is a piece if the key touches it at all (so no metal is left uncut)

const BOW = { cx: 4.1, cy: 4.0, R: 3.9, r: 1.7 }
const COLLAR = { x0: 7.7, x1: 8.9, y0: 2.5, y1: 5.5 }
const SHAFT = { x0: 8.0, x1: 22.6, y0: 3.15, y1: 4.85 }
const TIP = { cx: 22.6, cy: 4.0, r: 0.78 }
const TEETH = [
  { x0: 15.15, x1: 16.85, y0: 4.85, y1: 7.3 },
  { x0: 19.15, x1: 21.85, y0: 4.85, y1: 7.6 },
]
const NOTCH = { x0: 20.0, x1: 21.0, y0: 6.7, y1: 7.6 } // splits the last tooth in two

const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

export function insideKey(x, y) {
  const d = Math.hypot(x - BOW.cx, y - BOW.cy)
  if (d <= BOW.R && d >= BOW.r) return true
  if (inRect(x, y, COLLAR) || inRect(x, y, SHAFT)) return true
  if (Math.hypot(x - TIP.cx, y - TIP.cy) <= TIP.r) return true
  return TEETH.some(t => inRect(x, y, t)) && !inRect(x, y, NOTCH)
}

// Which cells are pieces: [{ c, r }]
export function pieceCells() {
  const cells = []
  const N = 12
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let hit = 0
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (insideKey(c + (i + 0.5) / N, r + (j + 0.5) / N)) hit++
      if (hit / (N * N) >= COVER) cells.push({ c, r })
    }
  }
  return cells
}

// ── drawing (SVG, in pixels: S px per cell) ─────────────────────────────
const rect = (S, r) => `M${r.x0 * S},${r.y0 * S}H${r.x1 * S}V${r.y1 * S}H${r.x0 * S}Z`
// sweep 1 = clockwise, the same way the rectangles are drawn, so overlaps add up; sweep 0 cuts a hole.
const circle = (S, cx, cy, rad, sweep = 1) => `M${(cx - rad) * S},${cy * S}a${rad * S},${rad * S} 0 1,${sweep} ${2 * rad * S},0a${rad * S},${rad * S} 0 1,${sweep} ${-2 * rad * S},0Z`

// The key's silhouette as one path (nonzero fill; the bow's hole is drawn the other way round).
export function silhouettePath(S) {
  const teeth = TEETH.map((t, i) => {
    if (i < TEETH.length - 1) return rect(S, t)
    // last tooth as two prongs around the notch
    return rect(S, { ...t, x1: NOTCH.x0 }) + rect(S, { x0: NOTCH.x0, x1: NOTCH.x1, y0: t.y0, y1: NOTCH.y0 }) + rect(S, { ...t, x0: NOTCH.x1 })
  }).join('')
  return [
    circle(S, BOW.cx, BOW.cy, BOW.R, 1),
    circle(S, BOW.cx, BOW.cy, BOW.r, 0),
    rect(S, COLLAR), rect(S, SHAFT), circle(S, TIP.cx, TIP.cy, TIP.r), teeth,
  ].join('')
}

// The full key artwork (no <svg> wrapper). Engravings, rivets and rust patches make the pieces tell-apart-able
// without any text (the server has no fonts).
export function keyArtSvg(S) {
  const sil = silhouettePath(S)
  const p = (x, y) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`
  const chevrons = []
  for (let x = 9.6; x < 22.0; x += 1.15) chevrons.push(`M${p(x, 3.45)}L${p(x + 0.45, 4.0)}L${p(x, 4.55)}`)
  const rivets = [[8.3, 2.85], [8.3, 5.15], [22.6, 4.0], [16.0, 6.9], [19.6, 7.2], [21.4, 7.2]]
    .map(([x, y]) => `<circle cx="${x * S}" cy="${y * S}" r="${0.16 * S}" fill="url(#rivet)" stroke="#2a1d10" stroke-width="${0.03 * S}"/>`).join('')
  const petals = []
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const r1 = BOW.r + 0.4, r2 = BOW.R - 0.35
    petals.push(`M${p(BOW.cx + Math.cos(a) * r1, BOW.cy + Math.sin(a) * r1)}Q${p(BOW.cx + Math.cos(a + 0.26) * 2.9, BOW.cy + Math.sin(a + 0.26) * 2.9)} ${p(BOW.cx + Math.cos(a) * r2, BOW.cy + Math.sin(a) * r2)}`)
  }
  const rust = [[2.2, 1.4, 0.55], [6.4, 6.8, 0.45], [12.4, 4.4, 0.4], [14.8, 3.5, 0.35], [19.3, 3.8, 0.5], [20.5, 5.6, 0.45], [1.0, 4.8, 0.4], [5.6, 1.4, 0.3], [16.0, 5.8, 0.35], [10.6, 3.7, 0.3]]
    .map(([x, y, r]) => `<circle cx="${x * S}" cy="${y * S}" r="${r * S}" fill="#7a3b17" opacity=".45"/>`).join('')
  const scratches = [[3.0, 6.9, 1.4, -0.3], [11.2, 3.6, 1.6, 0.25], [17.2, 4.3, 1.2, -0.4], [21.0, 6.0, 0.9, 0.5], [6.8, 1.2, 1.0, 0.6], [13.6, 4.6, 1.3, -0.15]]
    .map(([x, y, len, a]) => `<path d="M${p(x, y)}l${(Math.cos(a) * len * S).toFixed(1)},${(Math.sin(a) * len * S).toFixed(1)}" stroke="#e8d4a8" stroke-opacity=".35" stroke-width="${0.05 * S}"/>`).join('')
  return `
    <defs>
      <linearGradient id="iron" x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0" stop-color="#c9b48a"/><stop offset=".35" stop-color="#8d7650"/>
        <stop offset=".6" stop-color="#5e4b30"/><stop offset="1" stop-color="#3b2e1d"/>
      </linearGradient>
      <radialGradient id="rivet"><stop offset="0" stop-color="#efe0b8"/><stop offset="1" stop-color="#6b5434"/></radialGradient>
      <clipPath id="keyclip"><path d="${sil}"/></clipPath>
    </defs>
    <g clip-path="url(#keyclip)">
      <path d="${sil}" fill="url(#iron)"/>
      <path d="${petals.join('')}" fill="none" stroke="#2b2013" stroke-width="${0.09 * S}" stroke-linecap="round"/>
      <circle cx="${BOW.cx * S}" cy="${BOW.cy * S}" r="${(BOW.R - 0.2) * S}" fill="none" stroke="#e8d4a8" stroke-opacity=".4" stroke-width="${0.06 * S}"/>
      <circle cx="${BOW.cx * S}" cy="${BOW.cy * S}" r="${(BOW.r + 0.2) * S}" fill="none" stroke="#2b2013" stroke-width="${0.1 * S}"/>
      <path d="${chevrons.join('')}" fill="none" stroke="#2b2013" stroke-width="${0.08 * S}"/>
      <path d="M${p(8.9, 3.35)}H${(22.2 * S).toFixed(1)}" stroke="#f0dfb5" stroke-opacity=".45" stroke-width="${0.06 * S}"/>
      ${rust}${scratches}${rivets}
    </g>`
}
