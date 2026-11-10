import Level1 from './Level1.jsx'
import Level2 from './Level2.jsx'
import Level3 from './Level3.jsx'
import Level4 from './Level4.jsx'
import Level5 from './Level5.jsx'
import Level6 from './Level6.jsx'
import Level7 from './Level7.jsx'
import Level8 from './Level8.jsx'
import Level9 from './Level9.jsx'
import Level10 from './Level10.jsx'
import Level11 from './Level11.jsx'

const BUILT = { 1: Level1, 2: Level2, 3: Level3, 4: Level4, 5: Level5, 6: Level6, 7: Level7, 8: Level8, 9: Level9, 10: Level10, 11: Level11 }

export function levelComponent(n) {
  return BUILT[n]
}
