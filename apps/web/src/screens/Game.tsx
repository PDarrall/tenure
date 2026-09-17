import { useState, type ReactNode } from 'react'
import {
  boardMood,
  careerSummary,
  clubNameOf,
  competitionName,
  inboxSince,
  nextFixture,
  openVacancies,
  ordinal,
  pendingDecisions,
  qualifies,
  seasonFixtures,
  seasonWeek,
  spellOf,
  tableFor,
  tunables,
  FORMATION_NAMES,
  type Decision,
  type FixtureView,
  type Manager,
  type Formation,
  type Mentality,
  type Style,
  type Tier,
  type UnemployedActivity,
  type Vacancy,
  type World,
} from '@tenure/engine'
import {
  blockingUnanswered,
  canAdvance,
  isApplying,
  markFor,
  withActivity,
  withAnswer,
  withApply,
  withMentality,
  withResign,
  withRetire,
  withFormation,
  withStyle,
  withWithdraw,
  type Session,
} from '../controller.js'

type Tab = 'inbox' | 'fixtures' | 'vacancies' | 'career'

interface Props {
  session: Session
  onChange: (s: Session) => void
  onContinue: () => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  saveNote: string | null
}

function player(world: World): Manager {
  return world.managers[world.human!.managerId - 1] as Manager
}

function bandName(rep: number): string {
  if (rep >= 90) return 'elite'
  if (rep >= 75) return 'tier 1'
  if (rep >= 60) return 'tier 2'
  if (rep >= 40) return 'tier 3'
  if (rep >= 20) return 'tier 4'
  return 'non-league'
}

function vacancyName(world: World, v: Vacancy): string {
  return clubNameOf(world, v.post.clubId)
}

function vacancyWhere(world: World, v: Vacancy): string {
  return v.post.kind === 'home' ? `tier ${world.clubs[v.post.clubId - 1]?.tier ?? '?'}` : `${v.post.league} league abroad`
}

function weekLabel(sw: number): string {
  return sw < tunables.MATCH_WEEKS ? `week ${sw + 1}` : `summer week ${sw - tunables.MATCH_WEEKS + 1}`
}

export function Game({ session, onChange, onContinue, onExport, onImport, onReset, saveNote }: Props) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [turnsBack, setTurnsBack] = useState(0)
  const [confirm, setConfirm] = useState<'resign' | 'retire' | 'reset' | null>(null)
  // Turn-scoped state: a half-finished confirm or an unrolled inbox belongs to the turn it was made in.
  const [seenTurn, setSeenTurn] = useState(session.turn)
  if (seenTurn !== session.turn) {
    setSeenTurn(session.turn)
    setTurnsBack(0)
    setConfirm(null)
  }
  const world = session.world
  const me = player(world)
  const decisions = pendingDecisions(world)
  const blocked = blockingUnanswered(session)
  const answers = session.inputs.answers ?? {}

  return (
    <main>
      <Header session={session} />

      <NextFixtureCard world={world} />

      <section aria-label="This turn">
        <p>
          <button className="primary" disabled={!canAdvance(session)} onClick={onContinue}>
            Continue
          </button>
          {session.inputs.resign && <span className="notice">You will resign this turn.</span>}
          {session.inputs.retire && <span className="notice">You will retire this turn and the career will end.</span>}
        </p>
        {blocked.length > 0 && <p className="notice">Answer the starred decision{blocked.length > 1 ? 's' : ''} below before the game can move.</p>}
        {saveNote && <p className="muted">{saveNote}</p>}
      </section>

      {decisions.length > 0 && (
        <section aria-label="Decisions">
          <h2>Decisions</h2>
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} chosen={answers[d.id]} onChoose={(key) => onChange(withAnswer(session, d.id, key))} />
          ))}
        </section>
      )}

      <Controls session={session} onChange={onChange} confirm={confirm} setConfirm={setConfirm} />

      <nav className="tabs" aria-label="Sections">
        {(['inbox', 'fixtures', 'vacancies', 'career'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} aria-pressed={tab === t}>
            <span>{t === 'inbox' ? 'Inbox' : t === 'fixtures' ? 'Fixtures & table' : t === 'vacancies' ? `Vacancies (${openVacancies(world).length})` : 'Career'}</span>
          </button>
        ))}
      </nav>

      {tab === 'inbox' && <Inbox session={session} turnsBack={turnsBack} onEarlier={() => setTurnsBack(turnsBack + 1)} />}
      {tab === 'fixtures' && (
        <>
          <Fixtures world={world} />
          <Table world={world} me={me} />
        </>
      )}
      {tab === 'vacancies' && <Vacancies session={session} onChange={onChange} />}
      {tab === 'career' && <Career world={world} />}

      <section aria-label="Save">
        <h2>Save</h2>
        <p className="muted">The game saves itself on this device every turn. Export a file to keep it or move it.</p>
        <div className="row">
          <button onClick={onExport}>Export save</button>
          <label style={{ display: 'inline', margin: 0 }}>
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImport(file)
                e.target.value = ''
              }}
            />
            <span role="button" className="muted" style={{ display: 'inline-block', minHeight: 44, padding: '0.5rem 1rem', border: '2px solid currentColor', borderRadius: 8, cursor: 'pointer' }}>
              Import save
            </span>
          </label>
          {confirm === 'reset' ? (
            <>
              <button onClick={onReset}>Yes, delete this career</button>
              <button onClick={() => setConfirm(null)}>Keep it</button>
            </>
          ) : (
            <button onClick={() => setConfirm('reset')}>Reset</button>
          )}
        </div>
      </section>
    </main>
  )
}

function Header({ session }: { session: Session }) {
  const world = session.world
  const me = player(world)
  const sw = seasonWeek(world.week)
  const score = careerSummary(world).score
  const spell = spellOf(world, me)
  let line: string
  if (spell && spell.post.kind === 'home') {
    const club = world.clubs[spell.post.clubId - 1]!
    const table = tableFor(world, club.tier)
    const pos = table.findIndex((r) => r.clubId === club.id) + 1
    line = `${club.name} (tier ${club.tier}), ${ordinal(pos)} of ${table.length}. Target ${ordinal(spell.expectation)}. Board: ${boardMood(spell)}. Contract to season ${Math.floor(spell.contract.endWeek / tunables.SEASON_WEEKS) + 1}.`
  } else if (spell && spell.post.kind === 'abroad') {
    line = `Abroad in the ${spell.post.league} league. Target ${ordinal(spell.expectation)}. Board: ${boardMood(spell)}.`
  } else if (me.status.kind === 'unemployed') {
    const months = Math.floor((world.week - me.status.sinceWeek) / tunables.MONTH_WEEKS)
    line = `Out of work ${months} month${months === 1 ? '' : 's'} (${me.status.activity}). Reputation band: ${bandName(me.reputation)}. ${tunables.NO_SHORTLIST_MONTHS - me.status.monthsSinceShortlisted} months before the phone stops ringing for good.`
  } else {
    line = 'The career is over.'
  }
  return (
    <header>
      <h1>
        {me.name}, {me.age}
      </h1>
      <p>
        Season {world.season}, {weekLabel(sw)}.
      </p>
      <p>
        <strong>{score.games}</strong> games · <strong>£{score.earnings}m</strong> · <strong>{score.trophyPoints}</strong> trophy points · <strong>{score.playersMade}</strong> players made · Legacy <strong>{score.legacy}</strong>
      </p>
      <p>{line}</p>
    </header>
  )
}

function formText(form: readonly string[]): string {
  return form.length ? form.join(' ') : 'no games yet'
}

/** Always on screen: what Continue plays next (DESIGN.md "Fixtures"). */
function NextFixtureCard({ world }: { world: World }) {
  const me = player(world)
  const sw = seasonWeek(world.week)
  let body: ReactNode
  if (me.status.kind === 'unemployed') {
    body = <p>No fixture: you are out of work. Continue passes a week.</p>
  } else if (me.status.kind === 'employed' && me.status.post.kind === 'abroad') {
    body = <p>Abroad the season is settled at its end. Continue passes a week.</p>
  } else if (me.status.kind === 'retired') {
    body = <p>The career is over.</p>
  } else {
    const next = nextFixture(world)
    if (!next) {
      body = <p>{sw >= tunables.MATCH_WEEKS ? 'The summer. Continue passes a week; the fixtures come out with the new season.' : 'No more fixtures this season.'}</p>
    } else if (next.kind === 'draw') {
      body = (
        <p>
          <strong>{next.competitionLabel}</strong>, round {next.round}, {weekLabel(next.seasonWeek)}: the draw is still to be made.
        </p>
      )
    } else {
      const where = next.opponentAbroad ? `${next.opponentAbroad}` : `${next.opponentPosition !== null ? ordinal(next.opponentPosition) : '?'} in tier ${next.opponentTier}`
      const when = next.seasonWeek === sw ? 'this week' : `${weekLabel(next.seasonWeek)}`
      body = (
        <>
          <p>
            <strong>
              {next.opponent} ({next.home ? 'H' : 'A'})
            </strong>{' '}
            · {next.competitionLabel}
            {next.competition === 'league' ? '' : `, round ${next.round}`} · {when}
          </p>
          <p className="muted">
            {next.opponent}: {where}. Form: {formText(next.opponentForm)}.
          </p>
        </>
      )
    }
  }
  return (
    <section aria-label="Next fixture" className="decision">
      <p className="from">Next fixture</p>
      {body}
    </section>
  )
}

function DecisionCard({ decision, chosen, onChoose }: { decision: Decision; chosen: string | undefined; onChoose: (key: string) => void }) {
  return (
    <div className={`decision${decision.blocking ? ' blocking' : ''}`}>
      <p className="from">
        {decision.from}
        {decision.blocking ? ' · must answer' : ' · optional'}
      </p>
      <h3>
        {decision.blocking ? '★ ' : ''}
        {decision.title}
      </h3>
      <p>{decision.body}</p>
      <div>
        {decision.options.map((o) => (
          <button key={o.key} className={chosen === o.key ? 'selected' : ''} onClick={() => onChoose(o.key)} aria-pressed={chosen === o.key}>
            <span>
              {o.label}
              {o.key === decision.defaultKey ? ' (default)' : ''}
              {o.detail ? ` — ${o.detail}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Controls({ session, onChange, confirm, setConfirm }: { session: Session; onChange: (s: Session) => void; confirm: 'resign' | 'retire' | 'reset' | null; setConfirm: (c: 'resign' | 'retire' | 'reset' | null) => void }) {
  const world = session.world
  const me = player(world)
  const employed = me.status.kind === 'employed'
  const tactic = { ...world.human!.tactic, ...(session.inputs.tactic ?? {}) }
  const formation = tactic.formation
  const style = tactic.style
  const mentality = tactic.mentality
  // When the monthly card is pending the buttons answer it, so the two controls never disagree.
  const activityCard = pendingDecisions(world).find((d) => d.kind === 'activity')
  const cardAnswer = activityCard ? (session.inputs.answers ?? {})[activityCard.id] : undefined
  const activity = cardAnswer ?? session.inputs.activity ?? (me.status.kind === 'unemployed' ? me.status.activity : 'wait')
  const chooseActivity = (a: UnemployedActivity) => onChange(activityCard ? withAnswer(session, activityCard.id, a) : withActivity(session, a))
  return (
    <section aria-label="Controls">
      {employed && (
        <>
          <h3>Formation</h3>
          <select aria-label="Formation" value={formation} onChange={(e) => onChange(withFormation(session, e.target.value as Formation))}>
            {FORMATION_NAMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <h3>Style</h3>
          <div className="row">
            {(['possession', 'direct', 'counter', 'pressing'] as Style[]).map((st) => (
              <button key={st} className={style === st ? 'selected' : ''} onClick={() => onChange(withStyle(session, st))} aria-pressed={style === st}>
                <span>{st}</span>
              </button>
            ))}
          </div>
          <h3>Mentality</h3>
          <div className="row">
            {(['attack', 'balanced', 'defend'] as Mentality[]).map((m) => (
              <button key={m} className={mentality === m ? 'selected' : ''} onClick={() => onChange(withMentality(session, m))} aria-pressed={mentality === m}>
                <span>{m}</span>
              </button>
            ))}
          </div>
          <p className="muted">Structure does the work: midfielders win pressure, forwards against defenders make chances, width opens a narrow back line, a back five concedes less. Attack and defend change how open the game is. All apply from the next match.</p>
        </>
      )}
      {me.status.kind === 'unemployed' && (
        <>
          <h3>This month</h3>
          <div className="row">
            {(['wait', 'punditry', 'assistant', 'abroad'] as UnemployedActivity[]).map((a) => (
              <button key={a} className={activity === a ? 'selected' : ''} onClick={() => chooseActivity(a)} aria-pressed={activity === a}>
                <span>{a}</span>
              </button>
            ))}
          </div>
          <p className="muted">Waiting is a bet. Punditry halves the slide; an assistant role stops it, at a price; abroad opens foreign vacancies.</p>
        </>
      )}
      <div className="row">
        {employed &&
          (confirm === 'resign' ? (
            <>
              <button onClick={() => { onChange(withResign(session, true)); setConfirm(null) }}>Yes, resign now</button>
              <button onClick={() => setConfirm(null)}>Stay</button>
            </>
          ) : session.inputs.resign ? (
            <button onClick={() => onChange(withResign(session, false))}>Cancel resignation</button>
          ) : (
            <button onClick={() => setConfirm('resign')}>Resign</button>
          ))}
        {confirm === 'retire' ? (
          <>
            <button onClick={() => { onChange(withRetire(session, true)); setConfirm(null) }}>Yes, retire and bank the score</button>
            <button onClick={() => setConfirm(null)}>Carry on</button>
          </>
        ) : session.inputs.retire ? (
          <button onClick={() => onChange(withRetire(session, false))}>Cancel retirement</button>
        ) : (
          <button onClick={() => setConfirm('retire')}>Retire</button>
        )}
      </div>
    </section>
  )
}

function Inbox({ session, turnsBack, onEarlier }: { session: Session; turnsBack: number; onEarlier: () => void }) {
  const world = session.world
  const items = inboxSince(world, markFor(session, turnsBack))
  return (
    <section aria-label="Inbox">
      {items.length === 0 && <p className="muted">Nothing new.</p>}
      {[...items].reverse().map((item, i) => (
        <div className="item" key={`${item.week}-${i}`}>
          <div className="from">
            {item.from} · {weekLabel(seasonWeek(item.week))}
          </div>
          <div>{item.text}</div>
        </div>
      ))}
      {turnsBack < session.earlier.length && (
        <p>
          <button onClick={onEarlier}>Earlier</button>
        </p>
      )}
    </section>
  )
}

function scoreText(f: FixtureView): string {
  if (!f.played) return `${weekLabel(f.seasonWeek)}`
  const pens = f.shootoutWon === null ? '' : f.shootoutWon ? ', won on penalties' : ', lost on penalties'
  return `${f.result} ${f.goalsFor}-${f.goalsAgainst}${pens}`
}

/** The season's fixtures and results by competition (DESIGN.md "Fixtures"). */
function Fixtures({ world }: { world: World }) {
  const me = player(world)
  if (me.status.kind !== 'employed' || me.status.post.kind !== 'home') {
    return (
      <section aria-label="Fixtures">
        <p className="muted">No club, no fixtures.</p>
      </section>
    )
  }
  const groups = seasonFixtures(world)
  return (
    <section aria-label="Fixtures">
      {groups.map((g) => (
        <div key={g.competition}>
          <h3>
            {g.label}
            {g.status ? <span className="muted"> · {g.status}</span> : ''}
          </h3>
          {g.fixtures.length === 0 && <p className="muted">No ties yet.</p>}
          <table>
            <tbody>
              {g.fixtures.map((f) => (
                <tr key={`${f.competition}-${f.round}-${f.opponentId}-${f.home ? 'h' : 'a'}`} className={f.played ? '' : 'muted'}>
                  <td>{f.seasonWeek + 1}</td>
                  <td className="name">
                    {f.opponent} ({f.home ? 'H' : 'A'}){f.competition === 'league' ? '' : `, round ${f.round}`}
                  </td>
                  <td>{scoreText(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}

function Vacancies({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const world = session.world
  const me = player(world)
  const open = openVacancies(world)
  return (
    <section aria-label="Vacancies">
      {open.length === 0 && <p className="muted">No vacancies open this week.</p>}
      {open.map((v) => {
        const fits = qualifies(world, me, v)
        const applying = isApplying(session, v.id)
        return (
          <div className="item" key={v.id}>
            <div>
              <strong>{vacancyName(world, v)}</strong> ({vacancyWhere(world, v)}) · {v.ownerType} owner · {v.contract.years}-year offer · target {ordinal(v.expectation)}
              {v.crisis ? ' · crisis appointment' : ''}
            </div>
            <div className="muted">{fits ? 'Your reputation qualifies.' : 'Your reputation does not qualify yet; they may widen the search.'}</div>
            <div className="row">
              {applying ? (
                <button onClick={() => onChange(withWithdraw(session, v.id))}>
                  Withdraw
                </button>
              ) : (
                <button onClick={() => onChange(withApply(session, v.id))}>Apply</button>
              )}
              {applying && <span className="muted">Applied</span>}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Table({ world, me }: { world: World; me: Manager }) {
  const spell = spellOf(world, me)
  const tier: Tier = spell && spell.post.kind === 'home' ? world.clubs[spell.post.clubId - 1]!.tier : 1
  const rows = tableFor(world, tier)
  const mine = spell && spell.post.kind === 'home' ? spell.post.clubId : null
  return (
    <section aria-label="League table">
      <h3>Tier {tier}</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th className="name">Club</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.clubId} className={r.clubId === mine ? 'me' : ''}>
              <td>{i + 1}</td>
              <td className="name">{world.clubs[r.clubId - 1]?.name}</td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.drawn}</td>
              <td>{r.lost}</td>
              <td>{r.goalsFor - r.goalsAgainst}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function Career({ world }: { world: World }) {
  const s = careerSummary(world)
  return (
    <section aria-label="Career page">
      <p>
        {s.name}, {s.age}, {s.background}. {s.status}. Reputation {s.reputation} ({bandName(s.reputation)}).
      </p>
      <p>
        {s.score.games} games · £{s.score.earnings}m · {s.score.trophyPoints} trophy points · {s.score.playersMade} players made · Legacy {s.score.legacy} · {s.seasonsManaged} seasons managed
      </p>
      {s.spells.length === 0 && <p className="muted">No clubs yet.</p>}
      {s.spells.map((sp) => (
        <div className="item" key={sp.spellId}>
          <strong>{sp.club}</strong> ({sp.where}), season {sp.fromSeason}
          {sp.toSeason !== null ? `–${sp.toSeason}` : ' onward'}, {sp.seasons} seasons{sp.endReason ? `, ${sp.endReason}` : ''}
          {sp.finishes.length ? `. Finishes: ${sp.finishes.map((f) => ordinal(f)).join(', ')}` : ''}
        </div>
      ))}
      {s.honours.length > 0 && <p>Honours: {s.honours.map((h) => `${competitionName(h.competition)} (season ${h.season})`).join(', ')}</p>}
      {s.tags.length > 0 && <p>Tags: {s.tags.map((t) => t.tag).join(', ')}</p>}
      <h3>Players made</h3>
      {s.playersMade.length === 0 && <p className="muted">Nobody yet. Sign, debut or promote a player and he is yours for good.</p>}
      {s.playersMade.map((m) => (
        <div className="item" key={m.playerId}>
          <strong>{m.name}</strong> ({m.position}) · {m.circumstance} at {m.club}, season {m.season} · rated {Math.round(m.ratingThen)} then, {Math.round(m.ratingNow)} now · {m.points} points · {m.now}
        </div>
      ))}
    </section>
  )
}
