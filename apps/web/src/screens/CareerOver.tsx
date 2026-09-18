import { careerSummary, inboxSince, type InboxMark, type World } from '@tenure/engine'
import { seasonLine } from './common.js'
import { CareerBody } from './Career.js'
import { Continue, Foot, FootSpace, Head } from './ui.js'

/** The obituary: how it ended, the four score lines and the record (DESIGN.md "Scoring"). */
export function CareerOver({ world, from, onExport, onNewCareer }: { world: World; from: InboxMark; onExport: () => void; onNewCareer: () => void }) {
  const s = careerSummary(world)
  const items = inboxSince(world, from)
  const ending = items.filter((i) => /career is over|retire|the end/i.test(i.text))
  const shown = ending.length ? ending : items.slice(-2)
  const clubs = new Set(s.spells.map((sp) => sp.club)).size
  return (
    <main className="screen" aria-label="Career over">
      <Head eyebrow={seasonLine(world)} title="The career is over" sub={`${s.name}, ${s.age} · ${s.score.games} games across ${clubs === 0 ? 'no clubs' : clubs === 1 ? 'one club' : `${clubs} clubs`}`} />
      <div className="scroll">
        {shown.map((item, i) => (
          <div className="body lead" key={`${item.week}-${i}`} style={{ padding: '2px 0 16px' }}>
            {item.text}
          </div>
        ))}
        <CareerBody world={world} />
        <div style={{ padding: '18px 0 16px' }}>
          <button type="button" className="btn" onClick={onExport}>
            Export this career
          </button>
        </div>
      </div>
      <Foot>
        <Continue next="Start a new career" testId="new-career" onClick={onNewCareer} />
      </Foot>
      <FootSpace />
    </main>
  )
}
