import { inboxSince, seasonWeek, type InboxMark, type World } from '@tenure/engine'
import { Career } from './Game.js'

export function CareerOver({ world, from, onExport, onNewCareer }: { world: World; from: InboxMark; onExport: () => void; onNewCareer: () => void }) {
  const items = inboxSince(world, from)
  return (
    <main>
      <h1>The career is over</h1>
      <section aria-label="Final week">
        {[...items].reverse().map((item, i) => (
          <div className="item" key={`${item.week}-${i}`}>
            <div className="from">
              {item.from} · week {seasonWeek(item.week) + 1}
            </div>
            <div>{item.text}</div>
          </div>
        ))}
      </section>
      <h2>Career</h2>
      <Career world={world} />
      <p className="row">
        <button onClick={onExport}>Export this career</button>
        <button className="primary" onClick={onNewCareer}>
          Start a new career
        </button>
      </p>
    </main>
  )
}
