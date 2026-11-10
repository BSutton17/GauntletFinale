import { io } from 'socket.io-client'
import { SERVER_URL } from './api.js'

export function connectSocket(token) {
  return io(SERVER_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 4000,
  })
}

// emit with an acknowledgement, as a promise: resolves to the server's { ok, ... } reply.
export function request(socket, event, payload) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'The server did not answer.' }) } }, 10000)
    socket.emit(event, payload, (reply) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(reply ?? { ok: false, error: 'No reply.' })
    })
  })
}
