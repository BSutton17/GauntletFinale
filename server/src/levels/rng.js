// Random numbers for puzzle generation. Crypto-strength by default (no guessable Math.random seed);
// tests pass a seeded one so a failure can be reproduced.
import { randomInt } from 'node:crypto'

export function cryptoRng() {
  return makeRng((n) => randomInt(n))
}

// mulberry32: small, fast, deterministic.
export function seededRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return makeRng((n) => Math.floor(next() * n))
}

function makeRng(int) {
  return {
    int,                                      // 0 .. n-1
    range: (lo, hi) => lo + int(hi - lo + 1), // lo .. hi inclusive
    float: () => int(1 << 30) / (1 << 30),
    pick: (arr) => arr[int(arr.length)],
    chance: (p) => int(1_000_000) < p * 1_000_000,
    shuffle(arr) {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(i + 1)
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
  }
}
