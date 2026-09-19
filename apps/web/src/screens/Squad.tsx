import { useState } from 'react'
import { requestLikelihood, searchPlayers, shortlistRows, squadOf, scoutedView, windowState, type Player, type Position, type SearchRow, type World } from '@tenure/engine'
import { requested, shortlistOf, withRequest, withShortlist, withoutRequest, type Session } from '../controller.js'
import { humanClub, isMine, positionLabel, rating, ratingChange, ratingChangeUp, seasonLine, stateLine, traitsOf } from './common.js'
import { Head, Seg, Star } from './ui.js'

type SortKey = 'name' | 'position' | 'age' | 'rating'
type View = 'squad' | 'shortlist' | 'search'

const ORDER: Record<string, number> = { GK: 0, D: 1, M: 2, F: 3 }
const SIDE: Record<string, number> = { L: 0, C: 1, R: 2, any: 3 }

function keyOf(p: Player, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return p.name
    case 'position':
      return (ORDER[p.position] ?? 9) * 10 + (SIDE[p.side] ?? 9)
    case 'age':
      return p.age
    case 'rating':
      return p.rating
  }
}

const HEADERS: { key: SortKey; label: string }[] = [
  { key: 'position', label: 'Pos' },
  { key: 'age', label: 'Age' },
  { key: 'rating', label: 'Rating' },
]

/** A signing's rating while the truth comes out: the director's range narrowing over five matches. */
function ratingCell(p: Player): string {
  const v = scoutedView(p)
  return v ? `${v.lo}–${v.hi}` : String(rating(p))
}

/** The squad, one row each, your players marked (DESIGN.md "Players", "Your players"); the shortlist and the search beside it (DESIGN.md "Requests"). */
export function Squad({ session, onChange, onOpen }: { session: Session; onChange: (s: Session) => void; onOpen: (playerId: number) => void }) {
  const world: World = session.world
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'position', desc: false })
  const [view, setView] = useState<View>('squad')
  const club = humanClub(world)
  if (!club) {
    return (
      <>
        <Head eyebrow={seasonLine(world)} title="Squad" sub="No club, no squad." />
        <div className="scroll" aria-label="Squad" />
      </>
    )
  }
  const players = [...squadOf(world, club)].sort((a, b) => {
    const x = keyOf(a, sort.key)
    const y = keyOf(b, sort.key)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number)
    const tie = (ORDER[a.position] ?? 9) - (ORDER[b.position] ?? 9) || b.rating - a.rating
    return (sort.desc ? -c : c) || tie
  })
  const choose = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === 'rating' }))
  const mine = players.filter((p) => isMine(world, p)).length
  const sortState = (key: SortKey) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none')
  const sub = view === 'squad' ? `${players.length} players · ${mine} of them yours` : view === 'shortlist' ? `${shortlistOf(session).length} on the list · name one to the director` : 'other clubs and the pool, by position, age and rating'
  return (
    <>
      <Head eyebrow={seasonLine(world)} title="Squad" sub={sub} before={<Seg small options={[{ key: 'squad', label: 'Squad' }, { key: 'shortlist', label: 'Shortlist' }, { key: 'search', label: 'Search' }]} value={view} onChange={setView} testId={(k) => `view-${k}`} />} />
      <div className="scroll" aria-label="Squad">
        {view === 'squad' && (
          <>
            <div className="list-head">
              <button type="button" className="sort-btn" onClick={() => choose('name')} aria-sort={sortState('name')}>
                Player
              </button>
              <div className="cells">
                {HEADERS.map((h) => (
                  <button key={h.key} type="button" className={`sort-btn ${h.key === 'rating' ? 'w54' : 'w34'}`} style={{ textAlign: 'right', paddingLeft: 0 }} onClick={() => choose(h.key)} aria-sort={sortState(h.key)}>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            {players.map((p) => (
              <button type="button" className="list-row" key={p.id} onClick={() => onOpen(p.id)} data-testid="squad-row" data-player={p.id} data-name={p.name} data-age={p.age} data-rating={rating(p)} data-apps={p.season.apps} data-scouted={scoutedView(p) ? 'true' : undefined}>
                <div className="between">
                  <div className="name-cell">
                    {isMine(world, p) && <Star />}
                    <span className="row-name nowrap">{p.name}</span>
                  </div>
                  <div className="cells">
                    <span className="w34 cell-dim">{positionLabel(p)}</span>
                    <span className="w34 cell">{p.age}</span>
                    <span className="w54 cell-strong">{ratingCell(p)}</span>
                    <span className={`w40 cell-change ${ratingChangeUp(p) ? 'ink' : 'ink3'}`}>{scoutedView(p) ? '' : ratingChange(p)}</span>
                  </div>
                </div>
                <div className="between">
                  <span className="caption nowrap">{p.traits.length ? traitsOf(p) : '—'}</span>
                  <span className="caption shrink0" style={{ fontSize: 12, lineHeight: '16px' }}>
                    {stateLine(p)}
                  </span>
                </div>
              </button>
            ))}
          </>
        )}
        {view === 'shortlist' && <ShortlistView session={session} onChange={onChange} />}
        {view === 'search' && <SearchView session={session} onChange={onChange} />}
        <div className="tail" />
      </div>
    </>
  )
}

function MarketRow({ session, row, onChange, kind }: { session: Session; row: SearchRow; onChange: (s: Session) => void; kind: 'search' | 'shortlist' }) {
  const world = session.world
  const listed = shortlistOf(session).includes(row.playerId)
  const open = windowState(world).open
  const asked = requested(session, { to: 'director', ask: 'named', playerId: row.playerId })
  const like = requestLikelihood(world, { to: 'director', ask: 'named', playerId: row.playerId })
  return (
    <div className="list-row" data-testid={`${kind}-row`} data-player={row.playerId} data-name={row.name}>
      <div className="between">
        <div className="name-cell">
          <span className="row-name nowrap">{row.name}</span>
        </div>
        <div className="cells">
          <span className="w34 cell-dim">{positionLabel(row)}</span>
          <span className="w34 cell">{row.age}</span>
          <span className="w54 cell-strong">
            {row.lo}–{row.hi}
          </span>
        </div>
      </div>
      <div className="between">
        <span className="caption nowrap">
          {row.club}
          {row.tier ? ` (tier ${row.tier})` : ''} · {row.fee > 0 ? `£${row.fee}m` : 'free'} · £{row.wage}k a week
        </span>
        <span className="caption shrink0">{row.traits.length ? row.traits.join(', ') : ''}</span>
      </div>
      <div className="between" style={{ marginTop: 6, gap: 8 }}>
        <button type="button" className="btn small" onClick={() => onChange(withShortlist(session, listed ? [] : [row.playerId], listed ? [row.playerId] : []))} data-testid={listed ? 'shortlist-remove' : 'shortlist-add'}>
          {listed ? 'Take off the list' : 'Shortlist'}
        </button>
        {asked ? (
          <button type="button" className="btn small" onClick={() => onChange(withoutRequest(session, { to: 'director', ask: 'named', playerId: row.playerId }))} data-testid="ask-named-cancel">
            Asked · cancel
          </button>
        ) : (
          <button type="button" className="btn small" disabled={!open || !like.available} title={like.available ? like.words : (like.why ?? '')} onClick={() => onChange(withRequest(session, { to: 'director', ask: 'named', playerId: row.playerId }))} data-testid="ask-named">
            {open ? (like.available ? `Ask the director (${like.words})` : 'Out of reach') : 'Window shut'}
          </button>
        )}
      </div>
    </div>
  )
}

function ShortlistView({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const rows = shortlistRows(session.world)
  const queued = (session.inputs.shortlistAdd ?? []).length
  if (rows.length === 0) return <div className="body ink2" style={{ padding: '12px 0' }}>{queued ? 'Your additions land when you continue.' : 'Nobody on the list yet. Search and shortlist.'}</div>
  return <>{rows.map((r) => <MarketRow key={r.playerId} session={session} row={r} onChange={onChange} kind="shortlist" />)}</>
}

function SearchView({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const [position, setPosition] = useState<Position | 'any'>('any')
  const [maxAge, setMaxAge] = useState<number | null>(null)
  const [minRating, setMinRating] = useState<number | null>(null)
  const rows = searchPlayers(session.world, { ...(position === 'any' ? {} : { position }), ...(maxAge === null ? {} : { maxAge }), ...(minRating === null ? {} : { minRating }) })
  return (
    <>
      <div className="stack g6" style={{ padding: '6px 0 10px' }}>
        <Seg small options={[{ key: 'any', label: 'Any' }, { key: 'GK', label: 'GK' }, { key: 'D', label: 'D' }, { key: 'M', label: 'M' }, { key: 'F', label: 'F' }]} value={position} onChange={setPosition} testId={(k) => `search-${k}`} />
        <div className="field-row">
          <select aria-label="Age at most" value={maxAge ?? ''} onChange={(e) => setMaxAge(e.target.value === '' ? null : Number(e.target.value))} data-testid="search-age">
            <option value="">any age</option>
            {[21, 24, 27, 30].map((a) => (
              <option key={a} value={a}>
                under {a + 1}
              </option>
            ))}
          </select>
          <input aria-label="Rating at least" type="number" inputMode="numeric" placeholder="rating at least" value={minRating ?? ''} onChange={(e) => setMinRating(e.target.value === '' ? null : Number(e.target.value))} data-testid="search-rating" style={{ width: 130 }} />
        </div>
      </div>
      {rows.length === 0 && <div className="body ink2">Nobody fits.</div>}
      {rows.map((r) => (
        <MarketRow key={r.playerId} session={session} row={r} onChange={onChange} kind="search" />
      ))}
    </>
  )
}
