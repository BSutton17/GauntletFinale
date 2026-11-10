// Level 10's horse, on an icy road at night. Units: metres, seconds, radians (0 = +x, counter-clockwise).
//   W: speed up   S: brake   A/D: turn
// Ice: the horse turns its head quickly, but where it's actually GOING (its velocity) only swings round to match
// at the rate GRIP, so it slides outward through turns. Steering gets slower as speed rises.

export const P = {
  dt: 1 / 30,
  accel: 5.2,       // m/s² with W held
  brake: 10,        // m/s² with S held. Was 4.2; the user asked for stronger brakes (ice/grip unchanged). In a
                    // simulated 80%-speed, 0.3 s-late rider, 10 kept them on the road on 18 of 20 roads (4.2: 8 of 20).
  drag: 0.12,       // per second, coasting
  vmax: 16,         // m/s
  steer: 1.9,       // rad/s at low speed
  steerFade: 0.5,   // at top speed, steering is this much weaker
  grip: 3.2,        // how fast the slide catches up with the heading (per second)
}

export function newHorse(x, y, h) {
  return { x, y, h, vx: 0, vy: 0 }
}

export const speedOf = (s) => Math.hypot(s.vx, s.vy)

export function turnRate(v) {
  return P.steer * Math.min(1, v / 4) * (1 - P.steerFade * Math.min(1, v / P.vmax))
}

// One tick. input: { up, down, left, right } booleans.
export function step(s, input, dt = P.dt) {
  let v = speedOf(s)
  // steering turns the head
  const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0)
  s.h += turn * turnRate(v) * dt
  // speed along the way it's going
  if (input.up) v += P.accel * dt
  if (input.down) v = Math.max(0, v - P.brake * dt)
  v *= 1 - P.drag * dt
  v = Math.min(P.vmax, v)
  // the slide: velocity direction swings toward the heading, but only so fast
  let dir = v > 0.01 ? Math.atan2(s.vy, s.vx) : s.h
  let diff = Math.atan2(Math.sin(s.h - dir), Math.cos(s.h - dir))
  const k = Math.min(1, P.grip * dt)
  dir += diff * k
  s.vx = Math.cos(dir) * v
  s.vy = Math.sin(dir) * v
  s.x += s.vx * dt
  s.y += s.vy * dt
  return s
}
