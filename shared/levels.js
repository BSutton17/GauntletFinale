// Level facts both the client and the server need. ⚠️ Nothing secret goes in shared/: it is bundled into
// the browser. Answers, generators and story text stay in server/.

export const LEVEL_COUNT = 11

// 'landscape' = on a phone, BOTH players must turn the phone sideways before they can play.
// difficulty: 1-3 flames on the "Level #" card (the user's ratings; the poker game has none).
export const LEVELS = {
  1: { orientation: 'any', difficulty: 1 },
  2: { orientation: 'any', difficulty: 2 },
  3: { orientation: 'landscape', difficulty: 2 },
  4: { orientation: 'any', difficulty: 3 },
  5: { orientation: 'landscape', difficulty: 1 },
  6: { orientation: 'any', difficulty: 3 },
  7: { orientation: 'any', difficulty: 1 },
  8: { orientation: 'any', difficulty: 2 },
  9: { orientation: 'landscape', difficulty: 2 },
  10: { orientation: 'landscape', difficulty: 3 },
  11: { orientation: 'any' },
}

export const PRONOUN_OPTIONS = ['he/him', 'she/her', 'they/them']

export const NAME_MAX = 20
// Letters (any alphabet), spaces, apostrophes, hyphens and periods. No underscores or braces, which the
// story renderer uses.
export const NAME_PATTERN = /^[\p{L}][\p{L} '.-]*$/u

export function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > NAME_MAX || !NAME_PATTERN.test(name)) return null
  return name
}
