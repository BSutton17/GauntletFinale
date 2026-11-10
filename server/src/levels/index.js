// Every puzzle is a module with the same four parts:
//   create({ rng, devMode })           -> state             (all secrets live in here, on the server)
//   view(state, role, { devMode })     -> what ONE role may see; this is all that player's browser gets
//   action(state, role, msg, api)      -> handle a player's move; api.update() resends views,
//                                         api.complete() finishes the level, api.emit(role, event, data)
//                                         streams fast-changing data (mazes, the horse) to one role
//                                         whatever action returns is sent back to that player only
//   query?(state, role, msg)           -> read-only data on request (may be async), e.g. Level 3's pictures
//   start?(state, api)                 -> called once the puzzle is on screen; for levels with their own timers
//   dispose?(state)                    -> stop timers when the room moves on or closes
import { LEVEL_COUNT } from '../../../shared/levels.js'
import level1 from './level1.js'
import level2 from './level2/index.js'
import level3 from './level3/index.js'
import level4 from './level4/index.js'
import level5 from './level5/index.js'
import level6 from './level6/index.js'
import level7 from './level7/index.js'
import level8 from './level8/index.js'
import level9 from './level9/index.js'
import level10 from './level10/index.js'
import level11 from './level11/index.js'

const BUILT = { 1: level1, 2: level2, 3: level3, 4: level4, 5: level5, 6: level6, 7: level7, 8: level8, 9: level9, 10: level10, 11: level11 }

export function getLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > LEVEL_COUNT) throw new Error(`no level ${n}`)
  return BUILT[n]
}
