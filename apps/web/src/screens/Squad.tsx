import { useState } from 'react'
import { squadOf, type Player, type World } from '@tenure/engine'
import { averageRatingOf, fitness, humanClub, isMine, positionLabel, rating, ratingChange, traitsOf } from './common.js'

type SortKey = 'name' | 'position' | 'age' | 'rating' | 'change' | 'condition' | 'morale' | 'contract' | 'apps' | 'goals' | 'assists' | 'avg'

const ORDER: Record<string, number> = { GK: 0, D: 1, M: 2, F: 3 }

function keyOf(p: Player, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return p.name
    case 'position':
      return ORDER[p.position] ?? 9
    case 'age':
      return p.age
    case 'rating':
      return p.rating
    case 'change':
      return p.rating - p.season.ratingAtStart
    case 'condition':
      return p.condition
    case 'morale':
      return p.morale
    case 'contract':
      return p.contract.years
    case 'apps':
      return p.season.apps
    case 'goals':
      return p.season.goals
    case 'assists':
      return p.season.assists
    case 'avg':
      return p.season.rated ? p.season.ratingSum / p.season.rated : -1
  }
}

const HEADERS: { key: SortKey; label: string; title: string }[] = [
  { key: 'name', label: 'Player', title: 'Name; ★ means one of yours' },
  { key: 'position', label: 'Pos', title: 'Position and side' },
  { key: 'age', label: 'Age', title: 'Age' },
  { key: 'rating', label: 'Rat', title: 'Rating out of 100, and the change this season' },
  { key: 'condition', label: 'Cond', title: 'Condition, or injury and ban' },
  { key: 'morale', label: 'Mor', title: 'Morale' },
  { key: 'contract', label: 'Yrs', title: 'Contract years left' },
  { key: 'apps', label: 'Apps', title: 'Appearances (starts) this season' },
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'avg', label: 'Avg', title: 'Average match rating' },
]

/** The squad, sortable, with your players marked (DESIGN.md "Players", "Your players"). */
export function Squad({ world, onOpen }: { world: World; onOpen: (playerId: number) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'position', desc: false })
  const club = humanClub(world)
  if (!club) {
    return (
      <section aria-label="Squad">
        <p className="muted">No club, no squad.</p>
      </section>
    )
  }
  const players = [...squadOf(world, club)].sort((a, b) => {
    const x = keyOf(a, sort.key)
    const y = keyOf(b, sort.key)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number)
    const tie = (ORDER[a.position] ?? 9) - (ORDER[b.position] ?? 9) || b.rating - a.rating
    return (sort.desc ? -c : c) || tie
  })
  const choose = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'position' }))
  const mine = players.filter((p) => isMine(world, p)).length
  return (
    <section aria-label="Squad">
      <p className="muted">
        {players.length} players, {mine} of them yours (★). Tap a heading to sort, a player to open him.
      </p>
      <table>
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th key={h.key} className={h.key === 'name' ? 'name' : ''}>
                <button className="th" onClick={() => choose(h.key)} title={h.title} aria-sort={sort.key === h.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  {h.label}
                  {sort.key === h.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className={isMine(world, p) ? 'me' : ''} onClick={() => onOpen(p.id)} data-testid="squad-row" data-player={p.id}>
              <td className="name">
                <button className="link" onClick={() => onOpen(p.id)}>
                  {isMine(world, p) ? '★ ' : ''}
                  {p.name}
                </button>
                {p.traits.length > 0 && <div className="muted small">{traitsOf(p)}</div>}
              </td>
              <td>{positionLabel(p)}</td>
              <td>{p.age}</td>
              <td>
                {rating(p)} <span className="muted small">{ratingChange(p)}</span>
              </td>
              <td>{fitness(p)}</td>
              <td>{Math.round(p.morale)}</td>
              <td>{p.contract.years}</td>
              <td>
                {p.season.apps} ({p.season.starts})
              </td>
              <td>{p.season.goals}</td>
              <td>{p.season.assists}</td>
              <td>{averageRatingOf(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
