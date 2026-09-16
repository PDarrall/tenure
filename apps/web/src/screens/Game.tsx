import { useState } from 'react'
import {
  boardMood,
  careerSummary,
  clubNameOf,
  competitionName,
  inbox,
  openVacancies,
  ordinal,
  pendingDecisions,
  qualifies,
  seasonWeek,
  spellOf,
  tableFor,
  tunables,
  type Decision,
  type Manager,
  type Mentality,
  type Shape,
  type Tier,
  type UnemployedActivity,
  type Vacancy,
  type World,
} from '@tenure/engine'
import {
  blockingUnanswered,
  canAdvance,
  isApplying,
  withActivity,
  withAnswer,
  withApply,
  withMentality,
  withResign,
  withRetire,
  withShape,
  withWithdraw,
  type Session,
} from '../controller.js'

type Tab = 'inbox' | 'vacancies' | 'table' | 'career'

interface Props {
  session: Session
  onChange: (s: Session) => void
  onNextWeek: () => void
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

export function Game({ session, onChange, onNextWeek, onExport, onImport, onReset, saveNote }: Props) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [weeksBack, setWeeksBack] = useState(0)
  const [confirm, setConfirm] = useState<'resign' | 'retire' | 'reset' | null>(null)
  // Week-scoped state: a half-finished confirm or an unrolled inbox belongs to the week it was made in.
  const [seenTurn, setSeenTurn] = useState(session.turn)
  if (seenTurn !== session.turn) {
    setSeenTurn(session.turn)
    setWeeksBack(0)
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

      <section aria-label="This week">
        <p>
          <button className="primary" disabled={!canAdvance(session)} onClick={onNextWeek}>
            Next week
          </button>
          {session.inputs.resign && <span className="notice">You will resign this week.</span>}
          {session.inputs.retire && <span className="notice">You will retire this week and the career will end.</span>}
        </p>
        {blocked.length > 0 && <p className="notice">Answer the starred decision{blocked.length > 1 ? 's' : ''} below before the week can move.</p>}
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
        {(['inbox', 'vacancies', 'table', 'career'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} aria-pressed={tab === t}>
            <span>{t === 'inbox' ? 'Inbox' : t === 'vacancies' ? `Vacancies (${openVacancies(world).length})` : t === 'table' ? 'Table' : 'Career'}</span>
          </button>
        ))}
      </nav>

      {tab === 'inbox' && <Inbox session={session} weeksBack={weeksBack} onEarlier={() => setWeeksBack(weeksBack + 1)} />}
      {tab === 'vacancies' && <Vacancies session={session} onChange={onChange} />}
      {tab === 'table' && <Table world={world} me={me} />}
      {tab === 'career' && <Career world={world} />}

      <section aria-label="Save">
        <h2>Save</h2>
        <p className="muted">The game saves itself on this device every week. Export a file to keep it or move it.</p>
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
  const phase = sw < tunables.MATCH_WEEKS ? `week ${sw + 1} of ${tunables.MATCH_WEEKS}` : `summer week ${sw - tunables.MATCH_WEEKS + 1}`
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
        Season {world.season}, {phase}.
      </p>
      <p>
        <strong>{score.games}</strong> games · <strong>£{score.earnings}m</strong> · <strong>{score.trophyPoints}</strong> trophy points · Legacy <strong>{score.legacy}</strong>
      </p>
      <p>{line}</p>
    </header>
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
  const shape = session.inputs.shape ?? world.human!.shape
  const mentality = session.inputs.mentality ?? world.human!.mentality
  // When the monthly card is pending the buttons answer it, so the two controls never disagree.
  const activityCard = pendingDecisions(world).find((d) => d.kind === 'activity')
  const cardAnswer = activityCard ? (session.inputs.answers ?? {})[activityCard.id] : undefined
  const activity = cardAnswer ?? session.inputs.activity ?? (me.status.kind === 'unemployed' ? me.status.activity : 'wait')
  const chooseActivity = (a: UnemployedActivity) => onChange(activityCard ? withAnswer(session, activityCard.id, a) : withActivity(session, a))
  return (
    <section aria-label="Controls">
      {employed && (
        <>
          <h3>Shape</h3>
          <div className="row">
            {(['A', 'B', 'C'] as Shape[]).map((s) => (
              <button key={s} className={shape === s ? 'selected' : ''} onClick={() => onChange(withShape(session, s))} aria-pressed={shape === s}>
                <span>Shape {s}</span>
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
          <p className="muted">Shape A beats B, B beats C, C beats A. Attack and defend change how open the game is.</p>
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
              <button onClick={() => { onChange(withResign(session, true)); setConfirm(null) }}>Yes, resign this week</button>
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

function Inbox({ session, weeksBack, onEarlier }: { session: Session; weeksBack: number; onEarlier: () => void }) {
  const world = session.world
  const from = Math.max(0, session.shownFromWeek - weeksBack)
  const items = inbox(world, from, world.week)
  return (
    <section aria-label="Inbox">
      {items.length === 0 && <p className="muted">Nothing this week.</p>}
      {[...items].reverse().map((item, i) => (
        <div className="item" key={`${item.week}-${i}`}>
          <div className="from">
            {item.from} · week {seasonWeek(item.week) + 1}
          </div>
          <div>{item.text}</div>
        </div>
      ))}
      {from > 0 && (
        <p>
          <button onClick={onEarlier}>Earlier weeks</button>
        </p>
      )}
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
        {s.score.games} games · £{s.score.earnings}m · {s.score.trophyPoints} trophy points · Legacy {s.score.legacy} · {s.seasonsManaged} seasons managed
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
    </section>
  )
}
