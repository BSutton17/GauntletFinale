// Level 7's hidden pictures: two 25 x 25 images that look like static.
//   Player 1: looks like dark black-and-white static. Every pixel is near-black, but the RABBIT's pixels are a touch
//             darker than the rest. Eyes and screens can't tell deep shadows apart; brighten it (brightness,
//             exposure or shadows in any photo app) and the rabbit's face comes out clean.
//             (Tried first and dropped: a faint colour tint revealed by saturation. Whatever saturation can amplify
//             is also visible before editing, so it had to be so faint the animal came out as a blob.)
//   Player 2: looks like colourful static. Every pixel is a random vivid colour, but the CAT's pixels are darker
//             in brightness than the rest. Make it black and white and the cat appears.
// New random static every game; the shapes are fixed (randomly mirrored).

export const SIZE = 25

// ── the shapes, drawn with simple geometry and sampled onto the 25 x 25 grid ──
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1
function inTri(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

const inLine = (x, y, x0, y0, x1, y1, w) => {
  const dx = x1 - x0, dy = y1 - y0
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= w / 2
}

// Emoji-style faces, front on (the user asked for emoji-like animals). Features (eyes, nose,
// mouth) are cut OUT of the face so they show in the background colour.

// 🐱 cat face: round head, pointed ears, eyes, nose, whiskers.
function cat(x, y) {
  const head = inEllipse(x, y, 12.5, 14.2, 9.2, 7.8)
  const ears = inTri(x, y, [4.2, 10.5], [4.6, 1.6], [11, 7.2]) || inTri(x, y, [20.8, 10.5], [20.4, 1.6], [14, 7.2])
  const whiskers = [[-1, 14.2], [-1, 17.2], [1, 14.2], [1, 17.2]].some(([side, wy]) => {
    const x0 = side < 0 ? 0.2 : 24.8, x1 = side < 0 ? 4.8 : 20.2
    return inLine(x, y, x0, wy + (wy < 15 ? -0.8 : 0.8), x1, wy, 1.1)
  })
  const eyes = inEllipse(x, y, 9, 13, 1.25, 1.9) || inEllipse(x, y, 16, 13, 1.25, 1.9)
  const nose = inTri(x, y, [11.2, 16.2], [13.8, 16.2], [12.5, 17.8])
  const mouth = inLine(x, y, 12.5, 17.6, 10.6, 19.4, 0.9) || inLine(x, y, 12.5, 17.6, 14.4, 19.4, 0.9)
  return ((head || ears) && !eyes && !nose && !mouth) || (whiskers && !head)
}

// 🐰 rabbit face: round head, two tall upright ears, eyes, nose, mouth.
// (A dog face was tried first: at 25 x 25 it read as a helmet. Tall ears can't be mistaken for anything.)
function rabbit(x, y) {
  const head = inEllipse(x, y, 12.5, 16.6, 7.4, 6.6)
  const ears = inEllipse(x, y, 9, 6.6, 2.3, 6.6) || inEllipse(x, y, 16, 6.6, 2.3, 6.6)
  const eyes = inEllipse(x, y, 9.8, 15.2, 1.15, 1.5) || inEllipse(x, y, 15.2, 15.2, 1.15, 1.5)
  const nose = inEllipse(x, y, 12.5, 18.4, 1.3, 0.9)
  const mouth = inLine(x, y, 12.5, 19.2, 11.1, 20.6, 0.9) || inLine(x, y, 12.5, 19.2, 13.9, 20.6, 0.9)
  return (head || ears) && !eyes && !nose && !mouth
}

function raster(shape, mirror) {
  const N = 6
  const grid = []
  for (let r = 0; r < SIZE; r++) {
    const row = []
    for (let c = 0; c < SIZE; c++) {
      let hit = 0
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = c + (i + 0.5) / N, y = r + (j + 0.5) / N
        if (shape(mirror ? SIZE - x : x, y)) hit++
      }
      row.push(hit / (N * N) >= 0.45)
    }
    grid.push(row)
  }
  return grid
}

export const SHAPES = { cat, rabbit }
export const rasterShape = (name, mirror = false) => raster(SHAPES[name], mirror)

// ── colour helpers ──
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

// HSV (h 0..360, s,v 0..1) -> rgb 0..255
function hsv(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return [f(5) * 255, f(3) * 255, f(1) * 255]
}

// Player 1's picture: dark static, the animal a touch darker (overlapping slightly so it never shows as a clean
// edge before editing).
export function darkWithHiddenShape(rng, mask, shapeLow = 0, shapeHigh = 14, bgLow = 10, bgHigh = 33) {
  const px = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = mask[r][c] ? shapeLow + rng.float() * (shapeHigh - shapeLow) : bgLow + rng.float() * (bgHigh - bgLow)
    px.push([clamp(v), clamp(v), clamp(v)])
  }
  return px
}

// Player 2's picture: vivid random colours; the cat's pixels are darker (in black and white) than the rest.
// Every pixel gets a random hue, then its brightness is scaled until its grey value hits the target.
export function colourWithHiddenLuma(rng, mask, dark = 103, light = 127, jitter = 10) {
  const px = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const target = (mask[r][c] ? dark : light) + (rng.float() * 2 - 1) * jitter
    let rgb = hsv(rng.float() * 360, 0.65 + rng.float() * 0.35, 1)
    // scale toward the target grey value; if a colour can't get bright enough, mix in white
    const l = luma(...rgb)
    if (target <= l) rgb = rgb.map(v => v * (target / l))
    else { const k = (target - l) / (255 - l); rgb = rgb.map(v => v + (255 - v) * k) }
    px.push(rgb.map(clamp))
  }
  return px
}

// ── a small PNG encoder (no async image library needed), scaled up with hard pixel edges ──
import { deflateSync } from 'node:zlib'

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// pixels: SIZE*SIZE [r,g,b] -> data: URL of a (SIZE*scale)^2 PNG
export function toPngDataUrl(pixels, scale = 10) {
  const W = SIZE * scale
  const raw = Buffer.alloc(W * (W * 3 + 1))
  for (let y = 0; y < W; y++) {
    const row = y * (W * 3 + 1)
    raw[row] = 0 // no filter
    for (let x = 0; x < W; x++) {
      const p = pixels[Math.floor(y / scale) * SIZE + Math.floor(x / scale)]
      raw.set(p, row + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}
