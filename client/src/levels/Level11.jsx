// Level 11: the King's poker game. Heads-up Texas Hold'em, 25 coins each, until one player has every coin.
// The "refresher" button (top left) is the one the King mentions in the story.
// Between some hands the King asks a question (server/src/levels/level11/index.js); the winner gets a power for
// the next hand, shown here as a banner.
import { useEffect, useState } from 'react'
import { useLevel } from '../lib/levelContext.js'

const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
const SUIT = { c: '♣', d: '♦', h: '♥', s: '♠' }

function Card({ card, back, small, exposed }) {
  if (back || !card) return <div className={`l11-card back ${small ? 'small' : ''}`} />
  const red = card.s === 'h' || card.s === 'd'
  return (
    <div className={`l11-card ${red ? 'red' : ''} ${small ? 'small' : ''} ${exposed ? 'exposed' : ''}`} title={exposed ? 'The other player can see this card' : undefined}>
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
          <li>If nobody folds, the best hand wins the pot. Win all the coins to win the game.</li>
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

const nameOf = (r, me, players) => (r === me ? 'You' : players[r]?.name ?? 'They')
const possessive = (r, me, players) => (r === me ? 'your' : `${players[r]?.name ?? 'their'}’s`)

function rewardText(kind, winner, me, players) {
  const who = nameOf(winner, me, players)
  const whom = possessive(winner === 'A' ? 'B' : 'A', me, players)
  if (kind === 'cover') return `The King will cover ${possessive(winner, me, players)} buy-in next hand.`
  if (kind === 'card') return `Next hand, ${who} ${winner === me ? 'get' : 'gets'} to see one of ${whom} cards.`
  return `Next hand, ${who} ${winner === me ? 'get' : 'gets'} to peek at the flop before it is dealt.`
}

// The King's question. The answers appear a few seconds after the question; results once both have answered.
function Quiz({ quiz, me, players, spectator, send }) {
  const them = me === 'A' ? 'B' : 'A'
  const r = quiz.reveal
  const mark = (opt) => {
    if (!r) return quiz.mine === opt ? 'picked' : ''
    if (opt === r.answer) return 'right'
    return opt === r.answers[me] || opt === r.answers[them] ? 'wrong' : 'dim'
  }
  const line = (who) => {
    const a = r.answers[who]
    return <li key={who}>{nameOf(who, me, players)}: <strong>{a}</strong> {a === r.answer ? '✓' : '✗'}</li>
  }
  const bothRight = r && r.answers.A === r.answer && r.answers.B === r.answer
  const themName = players[them]?.name ?? 'The other player'
  return (
    <div className="l11-quiz">
      <div className="panel parchment l11-quiz-panel">
        <div className="l11-quiz-head">The King’s question {quiz.number} of {quiz.of}</div>
        <h2 className="l2-title">{quiz.q}</h2>
        {!quiz.options ? (
          <p className="l11-quiz-wait"><span className="pulse">Think carefully…</span></p>
        ) : (
          <div className="l11-quiz-options">
            {quiz.options.map((opt) => (
              <button key={opt} className={`btn l11-quiz-opt ${mark(opt)}`} disabled={spectator || !!quiz.mine || !!r}
                onClick={() => send({ type: 'answer', choice: opt })}>{opt}</button>
            ))}
          </div>
        )}
        {quiz.options && !r && (
          <p className="small l11-quiz-note">
            {spectator ? 'Spectating' : quiz.mine ? `Waiting for ${themName}…` : 'The first right answer wins a reward for the next hand.'}
            {quiz.theyAnswered && !quiz.mine && !spectator && ` ${themName} has answered!`}
          </p>
        )}
        {r && (
          <div className="l11-quiz-result">
            <ul>{[me, them].map(line)}</ul>
            {r.winner ? (
              <>
                <p><strong>{bothRight ? `Both right, but ${nameOf(r.winner, me, players)} answered first!` : `${nameOf(r.winner, me, players)} got it right!`}</strong></p>
                <p className="l11-reward">{rewardText(r.reward, r.winner, me, players)}</p>
              </>
            ) : <p><strong>Nobody got it right. No reward.</strong></p>}
          </div>
        )}
      </div>
    </div>
  )
}

// This hand's power from the last question.
function PowerBanner({ power, me, players }) {
  if (!power) return null
  const who = nameOf(power.winner, me, players)
  let text
  if (power.kind === 'cover') text = `The King covered ${possessive(power.winner, me, players)} buy-in (${power.amount}) this hand.`
  else if (power.kind === 'card') text = power.winner === me ? 'The King shows you one of their cards this hand.' : `${who} can see one of your cards this hand.`
  else text = power.winner === me ? (power.flop ? 'The King lets you peek at the flop:' : 'You peeked at the flop this hand.') : `${who} peeked at the flop this hand.`
  return (
    <div className="l11-power">
      <span>{text}</span>
      {power.flop && <span className="l11-peek">{power.flop.map((c, i) => <Card key={i} card={c} small />)}</span>}
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
        ? <p className="l11-over">{over === me ? `You have all ${view.total ?? 50} coins!` : `${players[over]?.name} has all ${view.total ?? 50} coins.`}</p>
        : <p className="faint small">Next hand coming…</p>}
    </div>
  )
}

export default function Level11({ view }) {
  const { send, spectator, players, role } = useLevel()
  const [help, setHelp] = useState(false)
  const o = view?.options
  const [raiseTo, setRaiseTo] = useState(0)
  const [entertain, setEntertain] = useState(0) // "The King wants to be entertained" (all in tried too early)
  useEffect(() => { if (o) setRaiseTo(o.minTo) }, [o?.minTo, view?.version]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!entertain) return
    const t = setTimeout(() => setEntertain(0), 3500)
    return () => clearTimeout(t)
  }, [entertain])
  if (!view) return null

  const me = role, them = role === 'A' ? 'B' : 'A'
  const themName = players[them]?.name ?? 'Opponent'
  const pot = view.pot + view.bets.A + view.bets.B
  const doAct = (action, to) => send({ type: 'act', action, to })
  const quick = (frac) => setRaiseTo(Math.max(o.minTo, Math.min(o.maxTo, view.bets[them] + Math.round(frac * (pot + o.toCall)))))
  const showdownCards = view.street === 'done' && view.theirCards
  const power = view.power
  const seenCard = power?.kind === 'card' && power.winner === me ? power.card : null
  const exposedMine = power?.kind === 'card' && power.winner === them && view.street !== 'done'
  const allIn = () => {
    if (o.noAllIn) setEntertain((n) => n + 1) // hands 1 and 2: as far as the King allows
    setRaiseTo(o.maxTo)
  }

  return (
    <div className="l11">
      <button className="btn small ghost l11-help-btn" onClick={() => setHelp(true)}>How to play</button>
      <div className="l11-blinds faint small">Hand {view.handNo} · blinds {view.blinds[0]}/{view.blinds[1]}{view.nextBlinds ? ` · up to ${view.nextBlinds.join('/')} in ${view.blindsUpIn} ${view.blindsUpIn === 1 ? 'hand' : 'hands'}` : ' (max)'}</div>

      <div className={`l11-seat them ${view.toAct === them ? 'turn' : ''}`}>
        <div className="l11-who">{themName}{view.button === them && <span className="l11-dealer">D</span>}</div>
        <div className="l11-cards">
          {showdownCards ? view.theirCards.map((c, i) => <Card key={i} card={c} />)
            : [0, 1].map(i => (i === 0 && seenCard ? <Card key={i} card={seenCard} exposed /> : <Card key={i} back />))}
        </div>
        <div className="l11-stack">{view.stacks[them]} coins{view.bets[them] > 0 && <span className="l11-bet">bet {view.bets[them]}</span>}</div>
      </div>

      <div className="l11-table">
        <div className="l11-board">{[0, 1, 2, 3, 4].map(i => <Card key={i} card={view.board[i]} back={!view.board[i]} small />)}</div>
        <div className="l11-pot">Pot: <strong>{pot}</strong></div>
        {view.street !== 'done' && <PowerBanner power={power} me={me} players={players} />}
        <Result view={view} me={me} players={players} />
      </div>

      <div className={`l11-seat me ${view.toAct === me ? 'turn' : ''}`}>
        <div className="l11-cards">{view.myCards.map((c, i) => <Card key={i} card={c} exposed={exposedMine && i === 0} />)}</div>
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
                  <button className="btn small ghost" onClick={allIn}>All in</button>
                </div>
                <button className="btn" onClick={() => doAct('raise', raiseTo)}>{raiseTo >= o.maxTo && !o.noAllIn ? `All in (${o.maxTo})` : `${o.word} to ${raiseTo}`}</button>
              </div>
            )}
          </>
        ) : (
          <p className="faint">{view.street === 'done' ? '' : spectator ? 'Spectating' : `${themName} is thinking…`}</p>
        )}
      </div>
      {entertain > 0 && <div className="l11-entertain" key={entertain}>The King wants to be entertained.</div>}
      {view.quiz && <Quiz quiz={view.quiz} me={me} players={players} spectator={spectator} send={send} />}
      {help && <Refresher onClose={() => setHelp(false)} />}
    </div>
  )
}
