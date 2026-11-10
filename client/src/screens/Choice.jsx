// The winner's choice. All the words come from the server (see server/src/story/endings.js).
export default function Choice({ room, emit, spectator }) {
  const c = room.choice
  if (!c) return null
  const mine = !spectator && room.you.role === room.result.winner
  return (
    <div className="center-screen">
      <p className="story-line dialogue">{c.prompt}</p>
      {mine ? (
        <div className="choice-buttons">
          <button className="btn" onClick={() => emit('ending:choose', { give: false })}>{c.keep}</button>
          <button className="btn" onClick={() => emit('ending:choose', { give: true })}>{c.give}</button>
        </div>
      ) : (
        <p className="faint">{c.waiting}</p>
      )}
    </div>
  )
}
