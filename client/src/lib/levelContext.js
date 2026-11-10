import { createContext, useContext, useEffect, useRef } from 'react'

// What a level component gets besides its view:
//   send(msg)              a level action (ignored for spectators); resolves to the server's reply
//   query(msg)             read-only data from the level (works for spectators too)
//   role                   'A' | 'B'
//   players                { A: {name, pronouns}, B }
//   dev                    the server says dev mode is on
//   spectator              read-only admin view
//   subscribe(event, fn)   fast streams from the server (maze moves, the horse); returns an unsubscribe
//   leave()                leave the game (used by the maze's "You failed" screen)
export const LevelContext = createContext(null)

export function useLevel() {
  return useContext(LevelContext)
}

export function useStream(event, handler) {
  const { subscribe } = useLevel()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe(event, (data) => ref.current(data)), [subscribe, event])
}
