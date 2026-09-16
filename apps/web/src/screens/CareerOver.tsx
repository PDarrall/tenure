import type { World } from '@tenure/engine'
import { Career } from './Game.js'

export function CareerOver({ world, onExport, onNewCareer }: { world: World; onExport: () => void; onNewCareer: () => void }) {
  return (
    <main>
      <h1>The career is over</h1>
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
