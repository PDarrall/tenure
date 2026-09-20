import { useState } from 'react'
import {
  applicationInFlight,
  boardMood,
  wageBill,
  windowState,
  clubNameOf,
  competitionLabel,
  inboxSince,
  nextFixture,
  openVacancies,
  ordinal,
  pendingDecisions,
  qualifies,
  seasonFixtures,
  seasonWeek,
  squadOf,
  tableFor,
  tunables,
  type Decision,
  type MatchSide,
  type UnemployedActivity,
  type Vacancy,
  type World,
} from '@tenure/engine'
import { blockingUnanswered, cancellingAgreed, humanMatch, humanSide, isApplying, markFor, watched, withActivity, withAnswer, withApply, withCancelAgreed, withKeepAgreed, withWithdraw, type Session } from '../controller.js'
import { bandLine, continueNext, humanClub, player, positionLabel, seasonLine, standingLine, weekLabel } from './common.js'
import { BetOptions, Card, Chevron, Choices, Continue, Foot, Head, SectionLabel, Seg } from './ui.js'
import { OfferCard, defaultPick, offerOption, type OfferPick } from './FirstOffer.js'

interface Props {
  session: Session
  onChange: (s: Session) => void
  onContinue: () => void
  onKickOff: () => void
  saveNote: string | null
  turnsBack: number
  onEarlier: () => void
}

function fromLabel(from: string): string {
  return from.charAt(0).toUpperCase() + from.slice(1)
}

/** Home: what Continue plays next, the questions of the week, the inbox (DESIGN.md "Loop"). */
export function Home({ session, onChange, onContinue, onKickOff, saveNote, turnsBack, onEarlier }: Props) {
  const world = session.world
  const me = player(world)
  const club = humanClub(world)
  const decisions = pendingDecisions(world)
  const answers = session.inputs.answers ?? {}
  const [picks, setPicks] = useState<Record<number, OfferPick>>({})
  const pickFor = (d: Decision): OfferPick => picks[d.id] ?? defaultPick(d)

  const unemployed = me.status.kind === 'unemployed'
  const title = club ? club.name : unemployed ? 'Out of work' : 'The career is over'
  let sub: string | null = standingLine(world, boardMood)
  if (unemployed && me.status.kind === 'unemployed') {
    const months = Math.floor((world.week - me.status.sinceWeek) / tunables.MONTH_WEEKS)
    sub = `${months} month${months === 1 ? '' : 's'} · ${bandLine(me.reputation)} · ${tunables.NO_SHORTLIST_MONTHS - me.status.monthsSinceShortlisted} months before the phone stops ringing`
  }

  const blocked = blockingUnanswered(session)
  const forced = blocked[0]
  const cards = decisions.filter((d) => d.kind !== 'activity')
  const { next, kickOff } = continueNext(session)

  return (
    <>
      <Head eyebrow={seasonLine(world)} title={title} sub={sub} />
      <div className="scroll" aria-label="Home">
        <div className="stack g10 pt2">
          {club && <WindowBanner world={world} />}
          {club && <FixtureCard session={session} />}
          {unemployed && <AgentCard session={session} onChange={onChange} />}
          {unemployed && <ActivityCard session={session} onChange={onChange} />}
          {cards.map((d) =>
            d.kind === 'offer' ? (
              <OfferCard key={d.id} world={world} offer={d} pick={pickFor(d)} onPick={(p) => setPicks({ ...picks, [d.id]: p })} answered={answers[d.id]} />
            ) : d.kind === 'signing' ? (
              <SigningCard key={d.id} decision={d} chosen={answers[d.id]} onChoose={(key) => onChange(withAnswer(session, d.id, key))} />
            ) : (
              <DecisionCard key={d.id} decision={d} chosen={answers[d.id]} onChoose={(key) => onChange(withAnswer(session, d.id, key))} />
            ),
          )}
          {club && <AgreedCard session={session} onChange={onChange} />}
          {session.inputs.resign && <div className="note">You resign when you continue.</div>}
          {session.inputs.retire && <div className="note">You retire when you continue: the career ends and the score is banked.</div>}
          {saveNote && <div className="note">{saveNote}</div>}
        </div>
        {unemployed && <Vacancies session={session} onChange={onChange} />}
        <Inbox session={session} turnsBack={turnsBack} onEarlier={onEarlier} />
        <div className="tail" />
      </div>
      <Foot>
        {forced ? (
          forced.kind === 'offer' ? (
            <Choices
              title={forced.title}
              options={[
                { key: 'decline', label: 'Turn it down', testId: 'decline-offer' },
                { key: offerOption(forced, pickFor(forced))?.key ?? 'decline', label: 'Take the job', detail: offerOption(forced, pickFor(forced))?.detail, testId: 'accept-offer' },
              ]}
              onChoose={(key) => onChange(withAnswer(session, forced.id, key))}
            />
          ) : (
            <Choices
              title={forced.title}
              options={forced.options.map((o) => ({ key: o.key, label: o.key === forced.defaultKey ? `${o.label} (default)` : o.label, detail: o.confidence ? `${o.detail ? `${o.detail} · ` : ''}${o.confidence}` : o.detail, testId: o.key === forced.defaultKey ? 'choice-default' : undefined }))}
              onChoose={(key) => onChange(withAnswer(session, forced.id, key))}
            />
          )
        ) : (
          <Continue next={next} dataNext={kickOff ? 'kick-off' : undefined} onClick={kickOff ? onKickOff : onContinue} />
        )}
      </Foot>
    </>
  )
}

function formText(form: readonly string[]): string {
  return form.length ? form.join(' ') : 'no games yet'
}

/** The fixture card carries what Continue plays next; before kick-off it has the odds and the report. */
function FixtureCard({ session }: { session: Session }) {
  const world = session.world
  const [open, setOpen] = useState(false)
  const sw = seasonWeek(world.week)
  const w = watched(session)
  const m = humanMatch(session)
  const club = humanClub(world)
  if (!club) return null

  if (w && m && m.played === 0 && !m.over) {
    const prepared = w.prepared[0]!
    const us = humanSide(session)
    const them: 'home' | 'away' = us === 'home' ? 'away' : 'home'
    const ours: MatchSide = m[us]
    const theirs: MatchSide = m[them]
    const theirParticipant = them === 'home' ? prepared.homeSide.participant : prepared.awaySide.participant
    const theirPosition = them === 'home' ? prepared.homePosition : prepared.awayPosition
    const odds = prepared.odds
    const pWin = us === 'home' ? odds.pHome : odds.pAway
    const pLose = us === 'home' ? odds.pAway : odds.pHome
    const pct = (x: number) => `${Math.round(x * 100)}%`
    const theirClub = world.clubs[theirs.clubId - 1]
    const absentees = theirClub ? squadOf(world, theirClub).filter((p) => p.injuryWeeks > 0 || p.suspension > 0) : []
    const keyPlayers = theirs.players
      .filter((p) => p.on)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)
    const captain = world.human!.selection.captain
    const captainName = captain === null ? null : ours.players.find((p) => p.id === captain)?.name
    const staffNotes = inboxSince(world, session.shownFrom).filter((i) => i.from === 'staff')
    const label = w.slot.kind === 'cup' ? competitionLabel(w.slot.competition) : 'League'
    const size = theirClub ? tableFor(world, theirClub.tier).length : null
    return (
      <Card label={`Next · ${label} · ${weekLabel(w.seasonWeek)}`} testId="fixture-card">
        <div className="between">
          <div className="card-title">{theirs.name}</div>
          <div className="caption strong shrink0">{us === 'home' ? 'Home' : 'Away'}</div>
        </div>
        <div className="sub">
          {theirPosition !== null && size !== null ? `${ordinal(theirPosition)} of ${size}` : 'European opposition'} · form {formText(theirParticipant.form)}
        </div>
        <div className="between center" style={{ marginTop: 2 }}>
          <div className="odds">
            <span>Win {pct(pWin)}</span>
            <span>Draw {pct(odds.pDraw)}</span>
            <span>Lose {pct(pLose)}</span>
          </div>
          <button type="button" className="text-btn" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="report-toggle">
            Report <Chevron dir={open ? 'up' : 'down'} />
          </button>
        </div>
        {open && (
          <div className="report">
            <div className="stack g2">
              <div className="label">Their side</div>
              <div className="sub ink">
                {theirs.formation}, {theirs.style}, {theirs.mentality}. Key: {keyPlayers.map((p) => `${p.name} (${positionLabel(p)} ${Math.round(p.rating)})`).join(', ')}.
                {absentees.length ? ` Absent: ${absentees.map((p) => `${p.name}, ${p.injuryWeeks > 0 ? 'injured' : 'banned'}`).join('; ')}.` : ' Nobody missing.'}
              </div>
            </div>
            <div className="stack g2">
              <div className="label">Your side</div>
              <div className="sub ink">
                {ours.formation}, {ours.style}, {ours.mentality}.{captainName ? ` ${captainName} captain.` : ''}
                {staffNotes.map((n) => ` ${n.text}`).join('')}
              </div>
            </div>
          </div>
        )}
      </Card>
    )
  }

  const next = nextFixture(world)
  const groups = seasonFixtures(world)
  const playedThisWeek = groups.flatMap((g) => g.fixtures).find((f) => f.seasonWeek === sw && f.played)
  const nextLine = next && next.kind === 'fixture' ? `${weekLabel(next.seasonWeek)} · ${next.opponent} (${next.home ? 'H' : 'A'})` : next && next.kind === 'draw' ? `${weekLabel(next.seasonWeek)} · ${next.competitionLabel} round ${next.round}, draw to come` : null

  if (next && next.kind === 'fixture' && next.seasonWeek === sw && !playedThisWeek) {
    const size = next.opponentTier !== null ? tableFor(world, next.opponentTier).length : null
    return (
      <Card label={`Next · ${next.competitionLabel} · ${weekLabel(sw)}`} testId="fixture-card">
        <div className="between">
          <div className="card-title">{next.opponent}</div>
          <div className="caption strong shrink0">{next.home ? 'Home' : 'Away'}</div>
        </div>
        <div className="sub">
          {next.opponentEuropean ? next.opponentEuropean : `${next.opponentPosition !== null ? ordinal(next.opponentPosition) : '?'} of ${size ?? '?'}`} · form {formText(next.opponentForm)}
        </div>
        <div className="caption">The side is picked and the odds set when you continue.</div>
      </Card>
    )
  }

  if (playedThisWeek) {
    const f = playedThisWeek
    const pens = f.shootoutWon === null ? '' : f.shootoutWon ? ', won on penalties' : ', lost on penalties'
    return (
      <Card label={`Played · ${competitionLabel(f.competition)} · ${weekLabel(sw)}`} testId="fixture-card">
        <div className="between">
          <div className="card-title">
            {f.result} {f.goalsFor}–{f.goalsAgainst}
          </div>
          <div className="caption strong shrink0">{f.home ? 'Home' : 'Away'}</div>
        </div>
        <div className="sub">
          {f.opponent}
          {pens}.
        </div>
        {nextLine && (
          <div className="next-line between">
            <div className="label">Next</div>
            <div className="sub ink strong">{nextLine}</div>
          </div>
        )}
      </Card>
    )
  }

  const cupLines = groups.filter((g) => g.competition !== 'league' && g.status).map((g) => `${g.label} · ${g.status}`)
  const summer = sw >= tunables.MATCH_WEEKS
  return (
    <Card label="This week" testId="fixture-card">
      <div className="h">{summer ? 'The summer' : 'No fixture'}</div>
      <div className="sub">{summer ? 'The fixtures come out with the new season.' : next && next.kind === 'draw' && next.seasonWeek === sw ? `${next.competitionLabel} round ${next.round}: the draw is still to be made.` : cupLines.length ? cupLines.join('. ') + '.' : 'A blank week.'}</div>
      {nextLine && (
        <div className="next-line between">
          <div className="label">Next</div>
          <div className="sub ink strong">{nextLine}</div>
        </div>
      )}
    </Card>
  )
}

/** A decision card says what Continue will answer if you leave it; a forced one is answered below. */
/** The window, when one is open: which, the days to the deadline, the pot and the wage bill (DESIGN.md "Transfers"). */
function WindowBanner({ world }: { world: World }) {
  const w = windowState(world)
  const club = humanClub(world)
  if (!w.open || !club) return null
  const weeks = w.weeksToDeadline ?? 0
  return (
    <div className="banner" data-testid="window-banner" data-window={w.window} data-weeks={weeks}>
      <span>
        <span className="strong">{w.window === 'summer' ? 'Summer window' : 'January window'}</span> · {weeks === 0 ? 'deadline day' : `${weeks} week${weeks === 1 ? '' : 's'} to the deadline`}
      </span>
      <span className="ink2">
        pot £{club.transferPot}m · wages £{wageBill(world, club)}m of £{club.wageBudget}m
      </span>
    </div>
  )
}

/** A recommendation from the director (DESIGN.md "Transfers"): the player as ranges, fee, wage, reason, confidence, the pot after; approve, decline, ask for another. */
function SigningCard({ decision, chosen, onChoose }: { decision: Decision; chosen: string | undefined; onChoose: (key: string) => void }) {
  const p = decision.payload
  const value = chosen ?? decision.defaultKey
  const labelOf = (key: string | undefined) => decision.options.find((o) => o.key === key)?.label ?? key ?? ''
  const reason = p['reason'] === 'request' ? 'what you asked for' : p['reason'] === 'bargain' ? 'a bargain' : 'the weakest slot'
  const when = p['signNow'] === true ? ' · a free agent, sign now' : p['agreed'] === true ? ' · for the window' : ''
  return (
    <Card label={`Director · optional · ${reason}${when}`} testId="decision-signing">
      <div className="h" data-testid="signing-name">{String(p['name'])}</div>
      <div className="sub">
        {String(p['position'])} · {String(p['age'])} · from {String(p['from'])} · {(p['traits'] as string[]).length ? (p['traits'] as string[]).join(', ') : 'no traits to speak of'}
      </div>
      <div className="triple" style={{ marginTop: 4 }}>
        <div>
          <span className="h bold">{String(p['lo'])}–{String(p['hi'])}</span>
          <div className="label">Rating, his estimate</div>
        </div>
        <div>
          <span className="h bold">{String(p['plo'])}–{String(p['phi'])}</span>
          <div className="label">Potential</div>
        </div>
        <div>
          <span className="h bold">{Number(p['fee']) > 0 ? `£${String(p['fee'])}m` : 'Free'}</span>
          <div className="label">£{String(p['wage'])}k a week</div>
        </div>
      </div>
      <div className="sub">
        The director: <span className="strong">{String(p['confidence'])}</span>. Pot after: £{String(p['after'])}m of £{String(p['pot'])}m.
      </div>
      <BetOptions options={decision.options} value={value} defaultKey={decision.defaultKey} onChoose={onChoose} testId={(key) => `signing-${key}`} />
      <div className="caption">Continue answers {labelOf(value)}.</div>
    </Card>
  )
}

/** Targets agreed in principle outside a window (DESIGN.md "Transfers", On arrival): bids the day it opens unless called off here. */
function AgreedCard({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world = session.world
  const targets = world.human?.agreedTargets ?? []
  if (targets.length === 0) return null
  const w = windowState(world)
  return (
    <Card label={`Director · agreed for the window${w.open ? '' : ' · bids when it opens'}`} testId="agreed-card">
      {targets.map((t) => {
        const off = cancellingAgreed(session, t.playerId)
        return (
          <div className="ask-row" key={t.playerId} data-testid="agreed-row">
            <div className="stack g2 grow">
              <span className="row-name">{t.name}</span>
              <span className="caption">
                {t.position} · {t.fromClubId > 0 ? clubNameOf(world, t.fromClubId) : 'the pool'} · £{t.fee}m, £{t.wage}k a week{off ? ' · called off when you continue' : ''}
              </span>
            </div>
            {off ? (
              <button type="button" className="btn small" onClick={() => onChange(withKeepAgreed(session, t.playerId))} data-testid="keep-agreed">
                Keep
              </button>
            ) : (
              <button type="button" className="btn small" onClick={() => onChange(withCancelAgreed(session, t.playerId))} data-testid="cancel-agreed">
                Call off
              </button>
            )}
          </div>
        )
      })}
    </Card>
  )
}

function DecisionCard({ decision, chosen, onChoose }: { decision: Decision; chosen: string | undefined; onChoose: (key: string) => void }) {
  const labelOf = (key: string | undefined) => decision.options.find((o) => o.key === key)?.label ?? key ?? ''
  const bets = decision.options.some((o) => o.likely)
  const compact = !bets && decision.options.length <= 3 && decision.options.every((o) => o.label.length <= 12)
  const showControl = !decision.blocking || chosen !== undefined
  const value = chosen ?? (decision.blocking ? null : decision.defaultKey)
  return (
    <Card label={`${fromLabel(decision.from)} · ${decision.blocking ? 'must answer' : 'optional'}`} testId={`decision-${decision.kind}`}>
      <div className="h">{decision.title}</div>
      <div className="sub">{decision.body}</div>
      {showControl && (
        <div style={{ marginTop: 2 }}>
          {bets ? (
            <BetOptions options={decision.options} value={value} defaultKey={decision.defaultKey} onChoose={onChoose} testId={(key) => (key === decision.defaultKey ? 'option-default' : undefined)} />
          ) : compact ? (
            <Seg small options={decision.options.map((o) => ({ key: o.key, label: o.label }))} value={value} onChange={onChoose} />
          ) : (
            <div className="choices stacked">
              {decision.options.map((o) => (
                <button key={o.key} type="button" className="choice" aria-pressed={value === o.key} style={value === o.key ? { background: 'var(--ink)', color: 'var(--on-ink)' } : undefined} onClick={() => onChoose(o.key)}>
                  <span className="main">{o.label}</span>
                  {o.detail && (
                    <span className="detail" style={value === o.key ? { color: 'var(--on-ink-dim)' } : undefined}>
                      {o.detail}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="caption">{decision.blocking && chosen === undefined ? 'Answer below.' : `Continue answers ${labelOf(chosen ?? decision.defaultKey)}.`}</div>
    </Card>
  )
}

function vacancyName(world: World, v: Vacancy): string {
  return clubNameOf(world, v.post.clubId)
}

function vacancyTier(world: World, v: Vacancy): string {
  return `Tier ${world.clubs[v.post.clubId - 1]?.tier ?? '?'}`
}

/** The agent's application of the week, above the vacancies. */
function AgentCard({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world = session.world
  const me = player(world)
  const inFlight = applicationInFlight(world, me)
  const agentEvent = inFlight ? [...world.log].reverse().find((e) => e.type === 'agent.applied' && e.payload['vacancyId'] === inFlight.id) : undefined
  const withdrawing = inFlight ? (session.inputs.withdraw ?? []).includes(inFlight.id) : false
  return (
    <Card label="Your agent · this week" testId="agent-application" ariaLabel="Your agent">
      {inFlight && agentEvent ? (
        <>
          <div className="h">Your name is in at {vacancyName(world, inFlight)}</div>
          <div className="sub">
            {vacancyTier(world, inFlight)}, {inFlight.ownerType} owner, {inFlight.crisis ? 'a crisis appointment' : 'a planned appointment'}: {String(agentEvent.payload['why'])}. Withdraw it if you would rather not.
          </div>
          <div className="between center" style={{ marginTop: 4 }}>
            {withdrawing ? (
              <>
                <span className="caption">Withdrawing when you continue.</span>
                <button type="button" className="btn small" onClick={() => onChange(withApply(session, inFlight.id))}>
                  Keep it in
                </button>
              </>
            ) : (
              <>
                <span className="caption">The shortlist rules apply as to anyone.</span>
                <button type="button" className="btn small" onClick={() => onChange(withWithdraw(session, inFlight.id))} data-testid="withdraw-agent">
                  Withdraw
                </button>
              </>
            )}
          </div>
        </>
      ) : inFlight ? (
        <>
          <div className="h">Your own application is in at {vacancyName(world, inFlight)}</div>
          <div className="sub">The agent waits on it.</div>
        </>
      ) : (
        <>
          <div className="h">Nothing in flight</div>
          <div className="sub">The agent puts your name in for the best-fitting vacancy at the end of each week.</div>
        </>
      )}
    </Card>
  )
}

const ACTIVITIES: { key: UnemployedActivity; label: string }[] = [
  { key: 'wait', label: 'Wait' },
  { key: 'punditry', label: 'Punditry' },
  { key: 'assistant', label: 'Assistant' },
]

/** This month out of work: wait, punditry or an assistant role (DESIGN.md "Job market"). */
function ActivityCard({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world = session.world
  const me = player(world)
  const card = pendingDecisions(world).find((d) => d.kind === 'activity')
  const cardAnswer = card ? (session.inputs.answers ?? {})[card.id] : undefined
  const activity = (cardAnswer ?? session.inputs.activity ?? (me.status.kind === 'unemployed' ? me.status.activity : 'wait')) as UnemployedActivity
  const choose = (a: UnemployedActivity) => onChange(card ? withAnswer(session, card.id, a) : withActivity(session, a))
  return (
    <Card label="Agent · optional" testId="activity-card">
      <div className="h">This month</div>
      <div style={{ marginTop: 2 }}>
        <Seg small options={ACTIVITIES} value={activity} onChange={choose} testId={(k) => `activity-${k}`} />
      </div>
      <div className="caption">Waiting is a bet. Punditry halves the slide; an assistant role stops it, at a price. Continue keeps {ACTIVITIES.find((a) => a.key === activity)?.label.toLowerCase() === 'wait' ? 'waiting' : ACTIVITIES.find((a) => a.key === activity)?.label.toLowerCase()}.</div>
    </Card>
  )
}

/** Every open vacancy: apply to any (DESIGN.md "Job market"). */
function Vacancies({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world = session.world
  const me = player(world)
  const open = openVacancies(world)
  return (
    <section aria-label="Vacancies">
      <SectionLabel>Vacancies</SectionLabel>
      {open.length === 0 && <div className="sub" style={{ padding: '10px 0 16px' }}>No vacancies open this week.</div>}
      {open.map((v) => {
        const fits = qualifies(world, me, v)
        const applying = isApplying(session, v.id)
        return (
          <div className="list-row" key={v.id} data-testid="vacancy-row">
            <div className="between">
              <span className="row-name nowrap">{vacancyName(world, v)}</span>
              <span className="caption shrink0">{vacancyTier(world, v)}</span>
            </div>
            <div className="between center">
              <span className="caption">
                {v.ownerType} owner · {v.contract.years}-year offer · target {ordinal(v.expectation)}
                {v.crisis ? ' · crisis' : ''}
                {fits ? '' : ' · below their band'}
              </span>
              {applying ? (
                <button type="button" className="btn small" onClick={() => onChange(withWithdraw(session, v.id))}>
                  Withdraw
                </button>
              ) : (
                <button type="button" className="btn small" onClick={() => onChange(withApply(session, v.id))}>
                  Apply
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Inbox({ session, turnsBack, onEarlier }: { session: Session; turnsBack: number; onEarlier: () => void }) {
  const world = session.world
  const items = inboxSince(world, markFor(session, turnsBack))
  return (
    <section aria-label="Inbox">
      <SectionLabel>Inbox</SectionLabel>
      <div className="stack">
        {items.length === 0 && <div className="sub" style={{ padding: '10px 0' }}>Nothing new.</div>}
        {[...items].reverse().map((item, i) => (
          <div className="inbox-item" key={`${item.week}-${i}`}>
            <div className="between">
              <div className="label">{fromLabel(item.from)}</div>
              <div className="label">{weekLabel(seasonWeek(item.week))}</div>
            </div>
            <div className="body">{item.text}</div>
          </div>
        ))}
      </div>
      {turnsBack < session.earlier.length && (
        <div style={{ padding: '14px 0 4px' }}>
          <button type="button" className="btn small" onClick={onEarlier}>
            Earlier
          </button>
        </div>
      )}
    </section>
  )
}
