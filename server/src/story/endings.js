// The ending's choice and the final tally. Sent only when the room reaches them, so the twist isn't
// sitting in the browser bundle for anyone to read.

export function choiceView(players, winner) {
  const loser = winner === 'A' ? 'B' : 'A'
  return {
    prompt: '“I will leave the choice to you.”',
    keep: 'Keep the coins',
    give: `Give the coins to ${players[loser].name}`,
    waiting: `${players[winner].name} is deciding your fate…`,
  }
}

export function finalCard(players, winner, choice) {
  const W = players[winner]
  const L = players[winner === 'A' ? 'B' : 'A']
  if (choice === 'give') {
    return {
      congrats: `Congratulations, ${players.A.name} and ${players.B.name}!`,
      lines: [
        { who: players.A.name, what: '$25' },
        { who: players.B.name, what: '$25' },
        { who: 'King Bryson', what: 'a missing head' },
      ],
    }
  }
  return {
    congrats: `Congratulations, ${W.name}!`,
    lines: [
      { who: W.name, what: '$50' },
      { who: L.name, what: '$0', note: '(and a missing head)' },
    ],
  }
}

// Every job went to the same man.
export const CREDIT_ROLES = [
  'Directed by', 'Produced by', 'Executive Producer', 'Written by', 'Screenplay by', 'Based on a Story by',
  'Starring', 'Also Starring', 'The Dungeon Guard', 'The Executioner', 'The Warden', 'Queen Alle’s Stunt Double', 
  'The Horse', 'Casting Director', 'Director of Photography',
  'Film Editor', 'Original Music', 'Sound Design', 'Costume Design', 'Hair & Makeup', 'Visual Effects',
  'Maze Architect', 'Head of Tile Inspection', 'Lantern Operator', 'Key Grip', 'Gaffer',
  'Stunt Coordinator', 'Horse Wrangler', 'Catering', 'Tax Collector', 'Special Thanks To',
]
