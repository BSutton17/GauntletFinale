// Turns a story template line into text for one particular pair of players.
//
// The script is written with singular "they", which can't be swapped by find-and-replace: the VERB changes
// too ("they attempt" / "she attempts"), and "they" also often means both players. So every line is tagged
// by hand:
//
//   {A}  {B}  {W}  {L}        the name of Player A / Player B / the poker winner / the poker loser
//   {A.they} {A.them} {A.their} {A.theirs} {A.themself}
//                             that player's pronoun; capitalise the tag word for a capital ({A.They})
//   {A:attempt|attempts}      a verb: the first form for they/them, the second for he/him and she/her
//   _word_                    italics
//
// A plain "they" in the script (no braces) means the two of them together and is never changed.

export const PRONOUNS = {
  'he/him':    { they: 'he',   them: 'him',  their: 'his',   theirs: 'his',    themself: 'himself',  plural: false },
  'she/her':   { they: 'she',  them: 'her',  their: 'her',   theirs: 'hers',   themself: 'herself',  plural: false },
  'they/them': { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', plural: true },
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// cast: { A: { name, pronouns }, B: {...}, W?: {...}, L?: {...} }
export function renderTemplate(template, cast) {
  return template.replace(/\{([ABWL])(?:([.:])([^}]+))?\}/g, (whole, who, sep, rest) => {
    const person = cast[who]
    if (!person) throw new Error(`story tag ${whole} has no player ${who}`)
    if (!sep) return person.name
    const p = PRONOUNS[person.pronouns]
    if (!p) throw new Error(`unknown pronouns ${person.pronouns}`)
    if (sep === '.') {
      const key = rest.toLowerCase()
      if (!(key in p) || key === 'plural') throw new Error(`unknown pronoun tag ${whole}`)
      return rest[0] === rest[0].toUpperCase() ? cap(p[key]) : p[key]
    }
    const forms = rest.split('|')
    if (forms.length !== 2) throw new Error(`verb tag ${whole} needs exactly two forms`)
    return p.plural ? forms[0] : forms[1]
  })
}

// "Hello _there_" -> [{ text: 'Hello ' }, { text: 'there', italic: true }]
export function toParts(text) {
  const parts = []
  const re = /_([^_]+)_/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[1], italic: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

// Resolves a story's conditional lines for this cast and renders each one.
// Returns [{ kind: 'narration' | 'dialogue' | 'pause', parts, bg }]
// scene() markers aren't shown; they set the background (`bg`) for the lines after them.
export function buildStory(lines, cast) {
  const out = []
  let bg = null
  for (const line of lines) {
    if (line.when && !line.when(cast)) continue
    if (line.kind === 'scene') { bg = line.bg; continue }
    const text = renderTemplate(line.text, cast)
    out.push({ kind: line.kind, parts: toParts(text), bg })
  }
  return out
}
