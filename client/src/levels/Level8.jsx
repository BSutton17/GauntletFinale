// Level 8: the Mystic Square (from Keep Talking and Nobody Explodes, with a clock instead of the serial number).
//   Player 1: the clock and the sliding square.   Player 2: the rules.
import { GiChessKnight } from 'react-icons/gi'
import { useLevel } from '../lib/levelContext.js'

const TABLE = [
  [1, 3, 5, 4, 6, 7, 2, 8], [2, 5, 7, 3, 8, 1, 4, 6], [6, 4, 8, 1, 7, 3, 5, 2], [8, 1, 2, 5, 3, 4, 6, 7],
  [3, 2, 6, 8, 4, 5, 7, 1], [7, 6, 1, 2, 5, 8, 3, 4], [4, 7, 3, 6, 1, 2, 8, 5], [5, 8, 4, 7, 2, 6, 1, 3],
]
// Target layouts by [row group][column group], '?' = anything (same as the server's TARGETS).
const GRID = {
  R1: ['1?2 ??? 4?3', '1?2 ??? 3?4', '1?3 ??? 7?5', '1?3 ??? 5?7'],
  R2: ['?1? 4?2 ?3?', '??? 3?2 ?4?', '1?3 ??? 7?5', '1?3 ??? 5?7'],
  R3: ['1?? ?2? ??3', '??3 ?2? 1??', '3?? ?2? ??1', '??1 ?2? 3??'],
  else: ['123 ?4? ???', '1?? 24? 3??', '??? ?4? 123', '??1 ?42 ??3'],
}
const ROW_LABELS = { R1: 'R1 > R2, R3', R2: 'R2 > R1, R3', R3: 'R3 > R1, R2', else: 'else' }
const COL_LABELS = ['C1 > C2, C3', 'C2 > C1, C3', 'C3 > C1, C2', 'else']

function Mini({ pattern }) {
  const cells = pattern.replace(/\s/g, '').split('')
  return <div className="l8-mini">{cells.map((c, i) => <span key={i} className={c === '?' ? 'q' : ''}>{c}</span>)}</div>
}

function Status({ view }) {
  if (view.done) return <p className="l4-feedback good">The lock clicks. The doors are open.</p>
  if (view.struck) return <p className="l4-feedback bad" key={view.version}>A skull! The square scrambles itself… ({view.strikes} {view.strikes === 1 ? 'strike' : 'strikes'})</p>
  if (view.strikes) return <p className="faint small">Strikes so far: {view.strikes}</p>
  return null
}

// ── Player 2: the rules ───────────────────────────────────────────────
function Rules({ view }) {
  return (
    <div className="panel parchment l8-rules">
      <h2 className="l2-title">The Key Pad</h2>
      <p className="hint">O knight of shining armour, deliver us from the evil of the skull!</p>
      <ol className="l4-list">
        <li><strong>“Row” and “column” in this step always mean the table below.</strong></li>
        <li>Do not uncover the skull before uncovering the knight. (Sliding a tile away uncovers the space it sat on.)</li>
        <li>How to find the skull:
          <ol type="a">
            <li>If the middle space is empty, the skull is under the 7. Go to step 4.</li>
            <li>The number in the middle picks which row or column to use. Find the tile matching the <strong>last digit of the time on the clock</strong>. If that tile is on one of the five cross spaces (the middle and the four spaces touching it), use the <em>row</em>; otherwise use the <em>column</em>.</li>
            <li>Start from the empty space. Go through the numbers in that row or column in order; whenever a number’s tile is directly next to where you are, move there. Where you end up is where the skull is.</li>
          </ol>
        </li>
        <div className="l8-table-wrap">
        <table className="l8-table">
          <thead>
            <tr><th className="corner">clock digit on the cross: rows<br />not on the cross: columns</th>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <th key={n}>{n}</th>)}</tr>
          </thead>
          <tbody>
            {TABLE.map((row, i) => <tr key={i}><th>{i + 1}</th>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}
          </tbody>
        </table>
        <p className="faint small">The middle number picks a row (down the side) or a column (along the top).</p>
      </div>
        <li>To open the lock, slide the tiles into one of the target layouts below.</li>
      </ol>

      <h3 className="l4-h">The target layouts</h3>
      <p><strong>“Row” and “column” here mean the square itself.</strong> Before sliding anything, add up each row (R1, R2, R3) and each column (C1, C2, C3); the empty space counts as 0. Find your layout below. <em>?</em> means anything. This layout always works too:</p>
      <div className="l8-always"><Mini pattern="123 456 78?" /></div>
      <div className="l8-targets">
        <div />
        {COL_LABELS.map(c => <div key={c} className="l8-tlabel">{c}</div>)}
        {Object.entries(GRID).map(([k, pats]) => [
          <div key={k} className="l8-tlabel">{ROW_LABELS[k]}</div>,
          ...pats.map((p, i) => <Mini key={k + i} pattern={p} />),
        ])}
      </div>
      <Status view={view} />
    </div>
  )
}

// ── Player 1: the square ──────────────────────────────────────────────
function Square({ view }) {
  const { send, spectator } = useLevel()
  const empty = view.layout.indexOf(0)
  const near = (p) => (Math.abs(p - empty) === 3) || (Math.abs(p - empty) === 1 && Math.floor(p / 3) === Math.floor(empty / 3))
  const under = new Map(view.revealed.map(r => [r.pos, r.what]))
  const at = (pos) => ({ left: `${(pos % 3) * 33.333}%`, top: `${Math.floor(pos / 3) * 33.333}%` })
  return (
    <div className="panel l8-module">
      <div className="l8-clock"><span>The clock reads</span><strong>{view.time}</strong></div>
      <div className="l8-square">
        {/* what's under each uncovered space (only visible where there's no tile) */}
        {[...under].map(([pos, what]) => (
          <div key={'u' + pos} className="l8-under" style={at(pos)}>
            {what === 'knight' ? <GiChessKnight className="l8-knight" /> : <span className="l8-nothing">·</span>}
          </div>
        ))}
        {view.layout.map((n, pos) => n !== 0 && (
          <button key={n} className={`l8-tile ${near(pos) ? 'movable' : ''}`} style={at(pos)}
            disabled={spectator || view.done || !near(pos)} onClick={() => send({ type: 'slide', tile: n })}>
            {n}
          </button>
        ))}
      </div>
      <p className="faint small">{view.knightFound ? 'The knight has been found.' : 'Somewhere under these tiles: a knight… and a skull.'}</p>
      <Status view={view} />
    </div>
  )
}

export default function Level8({ view }) {
  const { role } = useLevel()
  if (!view) return null
  return <div className="l4">{role === 'A' ? <Square view={view} /> : <Rules view={view} />}</div>
}
