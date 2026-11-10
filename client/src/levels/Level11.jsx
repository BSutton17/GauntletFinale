// Level 11: the King's poker game. Heads-up Texas Hold'em, 25 coins each, first to 50.
// The "refresher" button (top left) is the one the King mentions in the story.
import { useEffect, useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
const SUIT = { c: '♣', d: '♦', h: '♥', s: '♠' }

function Card({ card, back, small }) {
  if (back || !card) return <div className={`l11-card back ${small ? 'small' : ''}`} />
  const red = card.s === 'h' || card.s === 'd'
  return (
    <div className={`l11-card ${red ? 'red' : ''} ${small ? 'small' : ''}`}>
      <span className="l11-rank">{RANK[card.r] ?? card.r}</span>
      <span className="l11-suit">{SUIT[card.s]}</span>
    </div>
  )
}

function Refresher({ onClose }) {
  return (
    <div className="l11-help" onClick={onClose}>
      <div className="panel parchment l11-help-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="l2-title">How to play Texas Hold’em</h2>
        <ul className="l4-list">
          <li>You each get two secret cards. Five shared cards are dealt face up in the middle: three (the <em>flop</em>), then one (the <em>turn</em>), then one more (the <em>river</em>).</li>
          <li>Your hand is the best five cards out of your two plus the five shared ones.</li>
          <li>Before each new deal of shared cards there’s a round of betting. On your turn you can <strong>check</strong> (bet nothing, if nobody has bet), <strong>call</strong> (match their bet), <strong>bet/raise</strong> (put in more), or <strong>fold</strong> (give up the hand and the pot).</li>
          <li>Every hand, the two players take turns paying small “blinds” so there’s always something to win. They go up every few hands.</li>
          <li>If nobody folds, the best hand wins the pot. Win all 50 coins to win the game.</li>
        </ul>
        <h3 className="l4-h">Hands, best to worst</h3>
        <ol className="l4-list l11-ranks">
          <li><strong>Straight flush:</strong> five in a row, same suit</li>
          <li><strong>Four of a kind</strong></li>
          <li><strong>Full house:</strong> three of a kind and a pair</li>
          <li><strong>Flush:</strong> five of the same suit</li>
          <li><strong>Straight:</strong> five in a row (A-2-3-4-5 counts)</li>
          <li><strong>Three of a kind</strong></li>
          <li><strong>Two pair</strong></li>
          <li><strong>Pair</strong></li>
          <li><strong>High card</strong></li>
        </ol>
        <button className="btn small" onClick={onClose}>Back to the table</button>
      </div>
    </div>
  )
}

function Result({ view, me, players }) {
  const { last, over } = view
  if (!last) return null
  const name = (r) => (r === me ? 'You' : players[r]?.name ?? 'They')
  let text
  if (!last.winner) text = `Split pot (${last.pot} each way)`
  else if (last.reason === 'fold') text = `${name(last.winner)} ${last.winner === me ? 'win' : 'wins'} ${last.pot}. ${name(last.winner === 'A' ? 'B' : 'A')} folded.`
  else text = `${name(last.winner)} ${last.winner === me ? 'win' : 'wins'} ${last.pot} with ${last.hands[last.winner]}`
  return (
    <div className="l11-result" key={view.handNo + text}>
      <p>{text}</p>
      {last.reason === 'showdown' && last.winner && <p className="faint small">{name(last.winner === 'A' ? 'B' : 'A')} had {last.hands[last.winner === 'A' ? 'B' : 'A']}</p>}
      {over
        ? <p className="l11-over">{over === me ? 'You have all 50 coins!' : `${players[over]?.name} has all 50 coins.`}</p>
        : <p className="faint small">Next hand coming…</p>}
    </div>
  )
}

export default function Level11({ view }) {
  const { send, spectator, players, role } = useLevel()
  const [help, setHelp] = useState(false)
  const o = view?.options
  const [raiseTo, setRaiseTo] = useState(0)
  useEffect(() => { if (o) setRaiseTo(o.minTo) }, [o?.minTo, view?.version]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) return null

  const me = role, them = role === 'A' ? 'B' : 'A'
  const themName = players[them]?.name ?? 'Opponent'
  const pot = view.pot + view.bets.A + view.bets.B
  const doAct = (action, to) => send({ type: 'act', action, to })
  const quick = (frac) => setRaiseTo(Math.max(o.minTo, Math.min(o.maxTo, view.bets[them] + Math.round(frac * (pot + o.toCall)))))
  const showdownCards = view.street === 'done' && view.theirCards

  return (
    <div className="l11">
      <button className="btn small ghost l11-help-btn" onClick={() => setHelp(true)}>How to play</button>
      <div className="l11-blinds faint small">Hand {view.handNo} · blinds {view.blinds[0]}/{view.blinds[1]}{view.nextBlinds ? ` · up to ${view.nextBlinds.join('/')} in ${view.blindsUpIn} ${view.blindsUpIn === 1 ? 'hand' : 'hands'}` : ' (max)'}</div>

      <div className={`l11-seat them ${view.toAct === them ? 'turn' : ''}`}>
        <div className="l11-who">{themName}{view.button === them && <span className="l11-dealer">D</span>}</div>
        <div className="l11-cards">{showdownCards ? view.theirCards.map((c, i) => <Card key={i} card={c} />) : [0, 1].map(i => <Card key={i} back />)}</div>
        <div className="l11-stack">{view.stacks[them]} coins{view.bets[them] > 0 && <span className="l11-bet">bet {view.bets[them]}</span>}</div>
      </div>

      <div className="l11-table">
        <div className="l11-board">{[0, 1, 2, 3, 4].map(i => <Card key={i} card={view.board[i]} back={!view.board[i]} small />)}</div>
        <div className="l11-pot">Pot: <strong>{pot}</strong></div>
        <Result view={view} me={me} players={players} />
      </div>

      <div className={`l11-seat me ${view.toAct === me ? 'turn' : ''}`}>
        <div className="l11-cards">{view.myCards.map((c, i) => <Card key={i} card={c} />)}</div>
        <div className="l11-who">You{view.button === me && <span className="l11-dealer">D</span>} · {view.stacks[me]} coins{view.bets[me] > 0 && <span className="l11-bet">bet {view.bets[me]}</span>}</div>
        {view.myHand && <div className="faint small">You have {view.myHand}</div>}
      </div>

      <div className="l11-actions">
        {o && !spectator ? (
          <>
            <button className="btn ghost" onClick={() => doAct('fold')}>Fold</button>
            {o.canCheck
              ? <button className="btn" onClick={() => doAct('check')}>Check</button>
              : <button className="btn" onClick={() => doAct('call')}>Call {o.toCall}</button>}
            {o.canRaise && (
              <div className="l11-raise">
                <input type="range" min={o.minTo} max={o.maxTo} value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))} />
                <div className="l11-quick">
                  <button className="btn small ghost" onClick={() => quick(0.5)}>½ pot</button>
                  <button className="btn small ghost" onClick={() => quick(1)}>Pot</button>
                  <button className="btn small ghost" onClick={() => setRaiseTo(o.maxTo)}>All in</button>
                </div>
                <button className="btn" onClick={() => doAct('raise', raiseTo)}>{raiseTo >= o.maxTo ? `All in (${o.maxTo})` : `${o.word} to ${raiseTo}`}</button>
              </div>
            )}
          </>
        ) : (
          <p className="faint">{view.street === 'done' ? '' : spectator ? 'Spectating' : `${themName} is thinking…`}</p>
        )}
      </div>
      {help && <Refresher onClose={() => setHelp(false)} />}
    </div>
  )
}
