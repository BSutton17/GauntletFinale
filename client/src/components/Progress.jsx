// Where this account got to. Player B's runs are listed separately, with whose game it was, so two people
// coming back days later know who hosted (and so who is Player A).
export default function Progress({ progress }) {
  if (!progress) return null
  const host = progress.host ?? {}
  const guest = Object.values(progress.guest ?? {}).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  const hostPlayed = (host.furthest ?? 1) > 1 || host.finished
  if (!hostPlayed && guest.length === 0) return null
  const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')
  return (
    <div className="panel progress">
      <h3>Your escapes so far</h3>
      {hostPlayed && (
        <p>
          <strong>As host (Player 1):</strong> {host.finished ? 'escaped!' : `reached Level ${host.furthest}`}
          {host.partner && <> with {host.partner}</>}
          <span className="faint small"> {when(host.updatedAt)}</span>
        </p>
      )}
      {guest.map((g, i) => (
        <p key={i}>
          <strong>As Player 2</strong> in {g.hostName}’s game: {g.finished ? 'escaped!' : `reached Level ${g.furthest}`}
          <span className="faint small"> {when(g.updatedAt)}</span>
          {!g.finished && <><br /><span className="faint small">To pick that run back up, {g.hostName} needs to host.</span></>}
        </p>
      ))}
    </div>
  )
}
