// Cuts the key into jigsaw pieces and renders each piece as a small picture.
//
// ⚠️ Anti-cheat: a piece is sent to the browser ONLY as a raster image in its own local frame, under a random
// id. Nothing in it (no SVG viewBox, no offsets, no metadata) says where it goes; only the server knows.
import sharp from 'sharp'
import { COLS, ROWS, pieceCells, keyArtSvg } from './keyArt.js'

export const MARGIN = 0.3   // tabs stick out up to this far (in cells) on each side of a piece
const S = 56                // pixels per cell in the rendered pictures
const TAB = 0.26            // how far a tab bulges, in cells

// One edge from P0 to P1, bulging along the outward normal n by `sign` (+1 out, -1 in, 0 flat).
function edge(P0, P1, n, sign) {
  if (!sign) return `L${P1[0].toFixed(1)},${P1[1].toFixed(1)}`
  const pt = (t, u) => {
    const x = P0[0] + (P1[0] - P0[0]) * t + n[0] * u * sign * S
    const y = P0[1] + (P1[1] - P0[1]) * t + n[1] * u * sign * S
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }
  const h = TAB
  return [
    `L${pt(0.36, 0)}`,
    `C${pt(0.42, 0)} ${pt(0.44, h * 0.3)} ${pt(0.39, h * 0.52)}`,
    `C${pt(0.33, h * 0.85)} ${pt(0.41, h)} ${pt(0.5, h)}`,
    `C${pt(0.59, h)} ${pt(0.67, h * 0.85)} ${pt(0.61, h * 0.52)}`,
    `C${pt(0.56, h * 0.3)} ${pt(0.58, 0)} ${pt(0.64, 0)}`,
    `L${P1[0].toFixed(1)},${P1[1].toFixed(1)}`,
  ].join('')
}

// Random tab directions for every edge shared by two pieces.
export function makeTabs(rng, cells) {
  const has = new Set(cells.map(({ c, r }) => `${c},${r}`))
  const h = new Map() // "c,r" -> sign of the edge on TOP of cell (c,r); +1 = bulges down into (c,r)
  const v = new Map() // "c,r" -> sign of the edge LEFT of cell (c,r); +1 = bulges right into (c,r)
  for (const { c, r } of cells) {
    if (has.has(`${c},${r - 1}`)) h.set(`${c},${r}`, rng.chance(0.5) ? 1 : -1)
    if (has.has(`${c - 1},${r}`)) v.set(`${c},${r}`, rng.chance(0.5) ? 1 : -1)
  }
  return { h, v }
}

// The outline of piece (c, r), in pixels of the full key drawing.
export function piecePath(c, r, tabs) {
  const x0 = c * S, y0 = r * S, x1 = x0 + S, y1 = y0 + S
  const top = tabs.h.get(`${c},${r}`) ?? 0
  const bottom = tabs.h.get(`${c},${r + 1}`) ?? 0
  const left = tabs.v.get(`${c},${r}`) ?? 0
  const right = tabs.v.get(`${c + 1},${r}`) ?? 0
  return [
    `M${x0},${y0}`,
    edge([x0, y0], [x1, y0], [0, -1], -top),      // top: outward is up; +1 on the shared edge bulges down
    edge([x1, y0], [x1, y1], [1, 0], right),      // right: outward is right; +1 bulges right
    edge([x1, y1], [x0, y1], [0, 1], bottom),     // bottom: outward is down
    edge([x0, y1], [x0, y0], [-1, 0], -left),     // left: outward is left
    'Z',
  ].join('')
}

const ART = keyArtSvg(S)

export async function renderPiece(c, r, tabs) {
  const size = Math.round((1 + 2 * MARGIN) * S)
  const vx = (c - MARGIN) * S, vy = (r - MARGIN) * S
  const path = piecePath(c, r, tabs)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vx} ${vy} ${size} ${size}">
    <defs><clipPath id="piece"><path d="${path}"/></clipPath></defs>
    <g clip-path="url(#piece)">${ART}</g>
    <g clip-path="url(#keyclip)"><path d="${path}" fill="none" stroke="#120c06" stroke-opacity=".55" stroke-width="2"/></g>
  </svg>`
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 82, alphaQuality: 90 }).toBuffer()
  return `data:image/webp;base64,${buf.toString('base64')}`
}

// Every piece's picture, keyed by "c,r".
export async function renderAll(cells, tabs) {
  const out = new Map()
  await Promise.all(cells.map(async ({ c, r }) => out.set(`${c},${r}`, await renderPiece(c, r, tabs))))
  return out
}

export { COLS, ROWS, pieceCells }
