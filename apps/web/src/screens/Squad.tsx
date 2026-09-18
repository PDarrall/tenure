import { useState } from 'react'
import { squadOf, type Player, type World } from '@tenure/engine'
import { humanClub, isMine, positionLabel, rating, ratingChange, ratingChangeUp, seasonLine, stateLine, traitsOf } from './common.js'
import { Head, Star } from './ui.js'

type SortKey = 'name' | 'position' | 'age' | 'rating'

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

/** The squad, one row each, your players marked (DESIGN.md "Players", "Your players"). */
export function Squad({ world, onOpen }: { world: World; onOpen: (playerId: number) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'position', desc: false })
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
  return (
    <>
      <Head eyebrow={seasonLine(world)} title="Squad" sub={`${players.length} players · ${mine} of them yours`} />
      <div className="scroll" aria-label="Squad">
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
          <button type="button" className="list-row" key={p.id} onClick={() => onOpen(p.id)} data-testid="squad-row" data-player={p.id} data-name={p.name} data-age={p.age} data-rating={rating(p)} data-apps={p.season.apps}>
            <div className="between">
              <div className="name-cell">
                {isMine(world, p) && <Star />}
                <span className="row-name nowrap">{p.name}</span>
              </div>
              <div className="cells">
                <span className="w34 cell-dim">{positionLabel(p)}</span>
                <span className="w34 cell">{p.age}</span>
                <span className="w34 cell-strong">{rating(p)}</span>
                <span className={`w40 cell-change ${ratingChangeUp(p) ? 'ink' : 'ink3'}`}>{ratingChange(p)}</span>
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
        <div className="tail" />
      </div>
    </>
  )
}
