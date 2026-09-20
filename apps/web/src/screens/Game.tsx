import { useState } from 'react'
import { pendingDecisions } from '@tenure/engine'
import { backFromPreMatch, blockingUnanswered, humanMatch, watched, type Session } from '../controller.js'
import { continueNext, player } from './common.js'
import { Squad } from './Squad.js'
import { PlayerProfile } from './PlayerProfile.js'
import { Tactics } from './Tactics.js'
import { Fixtures } from './Fixtures.js'
import { Career } from './Career.js'
import { Requests } from './Requests.js'
import { Home } from './Home.js'
import { MatchView } from './MatchView.js'
import { FirstOffer, defaultPick, type OfferPick } from './FirstOffer.js'
import { Continue, Foot, TabBar, type Tab } from './ui.js'

interface Props {
  session: Session
  onChange: (s: Session) => void
  /** Take the turn; with a session, take it with those inputs instead of the current ones (the first offer answers and continues in one tap). */
  onContinue: (s?: Session) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  saveNote: string | null
}

export function Game({ session, onChange, onContinue, onExport, onImport, onReset, saveNote }: Props) {
  const [tab, setTab] = useState<Tab>('home')
  const [turnsBack, setTurnsBack] = useState(0)
  const [openPlayer, setOpenPlayer] = useState<number | null>(null)
  const [openRequests, setOpenRequests] = useState(false)
  const [kickedOff, setKickedOff] = useState(false)
  const [firstPick, setFirstPick] = useState<OfferPick | null>(null)
  // Turn-scoped state: an unrolled inbox or a kick-off belongs to the turn it was made in.
  const [seenTurn, setSeenTurn] = useState(session.turn)
  if (seenTurn !== session.turn) {
    setSeenTurn(session.turn)
    setTurnsBack(0)
    setKickedOff(false)
  }
  const world = session.world
  const me = player(world)
  const decisions = pendingDecisions(world)
  const answers = session.inputs.answers ?? {}

  // Day one: the agent's offer, before anything else.
  const firstOffer = world.week === 0 && me.status.kind === 'unemployed' ? decisions.find((d) => d.kind === 'offer' && d.payload['firstOffer'] === true && answers[d.id] === undefined) : undefined
  if (firstOffer) {
    return <FirstOffer session={session} offer={firstOffer} pick={firstPick ?? defaultPick(firstOffer)} onPick={setFirstPick} onContinue={onContinue} />
  }

  // A match week stopped before kick-off: Home offers the kick-off; then the match view, then Continue.
  const match = humanMatch(session)
  if (watched(session) && match && (kickedOff || match.played > 0 || match.over)) {
    return <MatchView session={session} onChange={onChange} onContinue={() => onContinue()} />
  }
  const kickOff = () => {
    // The side was picked when the week was prepared: changes made since need it picked again.
    if (session.inputs.tactic || session.inputs.selection) onContinue(backFromPreMatch(session))
    else setKickedOff(true)
  }

  return (
    <main className="screen">
      {tab === 'home' && <Home session={session} onChange={onChange} onContinue={() => onContinue()} onKickOff={kickOff} saveNote={saveNote} turnsBack={turnsBack} onEarlier={() => setTurnsBack(turnsBack + 1)} />}
      {tab === 'squad' && openPlayer === null && <Squad session={session} onChange={onChange} onOpen={(id) => setOpenPlayer(id)} />}
      {tab === 'squad' && openPlayer !== null && <PlayerProfile session={session} playerId={openPlayer} onChange={onChange} onBack={() => setOpenPlayer(null)} />}
      {tab === 'tactics' && <Tactics session={session} onChange={onChange} />}
      {tab === 'fixtures' && <Fixtures world={world} />}
      {tab === 'career' && !openRequests && <Career session={session} onChange={onChange} onExport={onExport} onImport={onImport} onReset={onReset} onRequests={() => setOpenRequests(true)} />}
      {tab === 'career' && openRequests && <Requests session={session} onChange={onChange} onBack={() => setOpenRequests(false)} />}
      {tab !== 'home' && <TurnFoot session={session} onContinue={() => onContinue()} onKickOff={kickOff} onHome={() => setTab('home')} />}
      <TabBar
        tab={tab}
        onTab={(t) => {
          setTab(t)
          setOpenPlayer(null)
          setOpenRequests(false)
        }}
      />
    </main>
  )
}

/** Continue on the other tabs: the same button, or a pointer back to a question waiting on Home. */
function TurnFoot({ session, onContinue, onKickOff, onHome }: { session: Session; onContinue: () => void; onKickOff: () => void; onHome: () => void }) {
  const blocked = blockingUnanswered(session)
  if (blocked.length > 0) {
    return (
      <Foot>
        <Continue next="A question waits on Home" onClick={onHome} testId="to-home" />
      </Foot>
    )
  }
  const { next, kickOff } = continueNext(session)
  return (
    <Foot>
      <Continue next={next} dataNext={kickOff ? 'kick-off' : undefined} onClick={kickOff ? onKickOff : onContinue} />
    </Foot>
  )
}
