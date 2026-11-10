// Level 5's dot layout, on a 160 x 90 board (16:9, phones sideways).
//   - 50 dots; each dot is close to the one before it, EXCEPT 14->15, 29->30 and 45->46, which are long jumps.
//   - Dots never crowd each other, and the straight line between two neighbours keeps clear of every other
//     dot, so dragging from one to the next doesn't brush a wrong dot (the user asked for this).

export const W = 160
export const H = 90
export const COUNT = 50
export const HIT_R = 2.4          // how close the finger has to come to "touch" a dot
const MARGIN = 6
const MIN_SPACING = 7.5
const CLEARANCE = 4                // a neighbour-to-neighbour line stays this far from every other dot
const STEP = [9, 15]
const JUMP_MIN = 55
const JUMPS_BEFORE = new Set([15, 30, 46]) // dot numbers that are reached by a long jump

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Distance from p to the segment a-b.
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function fits(c, pts) {
  if (c.x < MARGIN || c.x > W - MARGIN || c.y < MARGIN || c.y > H - MARGIN) return false
  if (pts.some(p => dist(p, c) < MIN_SPACING)) return false
  const last = pts[pts.length - 1]
  // the new line keeps clear of every earlier dot…
  for (let i = 0; i < pts.length - 1; i++) if (segDist(pts[i], last, c) < CLEARANCE) return false
  // …and the new dot keeps clear of every earlier line
  for (let i = 0; i < pts.length - 1; i++) if (segDist(c, pts[i], pts[i + 1]) < CLEARANCE) return false
  return true
}

function attempt(rng) {
  const pts = [{ x: MARGIN + rng.float() * (W - 2 * MARGIN), y: MARGIN + rng.float() * (H - 2 * MARGIN) }]
  let heading = rng.float() * Math.PI * 2
  for (let n = 2; n <= COUNT; n++) {
    const last = pts[pts.length - 1]
    let placed = null
    for (let tries = 0; tries < 120 && !placed; tries++) {
      let c
      if (JUMPS_BEFORE.has(n)) {
        c = { x: MARGIN + rng.float() * (W - 2 * MARGIN), y: MARGIN + rng.float() * (H - 2 * MARGIN) }
        if (dist(c, last) < JUMP_MIN) continue
      } else {
        const turn = (rng.float() - 0.5) * (tries < 60 ? 2.2 : 4.5) // mostly gentle wandering
        const a = heading + turn
        const d = STEP[0] + rng.float() * (STEP[1] - STEP[0])
        c = { x: last.x + Math.cos(a) * d, y: last.y + Math.sin(a) * d }
      }
      if (fits(c, pts)) placed = c
    }
    if (!placed) return null
    heading = Math.atan2(placed.y - last.y, placed.x - last.x)
    pts.push(placed)
  }
  return pts
}

// [{ x, y }] in order: index 0 is dot 1.
export function generateDots(rng) {
  for (let i = 0; i < 2000; i++) {
    const pts = attempt(rng)
    if (pts) return pts.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))
  }
  throw new Error('could not lay out the dots')
}

export const JUMP_DOTS = JUMPS_BEFORE
export const LIMITS = { MIN_SPACING, CLEARANCE, STEP, JUMP_MIN, MARGIN }
