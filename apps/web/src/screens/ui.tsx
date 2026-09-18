/** The design system's parts: labels, the segmented control, cards, Continue, the replaced foot, the tab bar, icons. */
import type { ReactNode } from 'react'

export function Label({ children, className = '', accent = false }: { children: ReactNode; className?: string; accent?: boolean }) {
  return <div className={`label${accent ? ' accent' : ''}${className ? ` ${className}` : ''}`}>{children}</div>
}

export function SectionLabel({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <div className={`label section-label${accent ? ' accent' : ''}`}>{children}</div>
}

/** The head of a screen: an eyebrow, a title and a standing line. */
export function Head({ eyebrow, title, sub, before }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; before?: ReactNode }) {
  return (
    <div className="head">
      {before}
      {eyebrow && <div className="label">{eyebrow}</div>}
      <h1 className="title">{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

/** Selection is an ink fill inside a hairline track. */
export function Seg<T extends string>({ options, value, onChange, small = false, testId }: { options: { key: T; label: string }[]; value: T | null; onChange: (key: T) => void; small?: boolean; testId?: (key: T) => string }) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="group">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} data-testid={testId ? testId(o.key) : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ label, children, testId, ariaLabel }: { label?: ReactNode; children: ReactNode; testId?: string; ariaLabel?: string }) {
  return (
    <section className="card" data-testid={testId} aria-label={ariaLabel}>
      {label && <div className="label">{label}</div>}
      {children}
    </section>
  )
}

/** The one primary button, full width above the tab bar. Ink, never the accent. The second line says what it will do. */
export function Continue({ main = 'Continue', next, disabled = false, onClick, testId = 'continue', dataNext }: { main?: string; next?: string; disabled?: boolean; onClick: () => void; testId?: string; dataNext?: string }) {
  return (
    <button type="button" className="continue" disabled={disabled} onClick={onClick} data-testid={testId} data-next={dataNext}>
      <span className="main">{main}</span>
      {next && <span className="next">{next}</span>}
    </button>
  )
}

export interface Choice {
  key: string
  label: string
  detail?: string
  testId?: string
}

/** A forced decision replaces Continue: two ways side by side, more than three stacked. */
export function Choices({ title, options, onChoose }: { title: string; options: Choice[]; onChoose: (key: string) => void }) {
  const stacked = options.length > 2
  return (
    <>
      <div className="foot-title">{title}</div>
      <div className={`choices${stacked ? ' stacked' : ''}`}>
        {options.map((o) => (
          <button key={o.key} type="button" className="choice" onClick={() => onChoose(o.key)} data-testid={o.testId} data-key={o.key}>
            <span className="main">{o.label}</span>
            {o.detail && <span className="detail">{o.detail}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

export function Foot({ children }: { children: ReactNode }) {
  return <div className="foot">{children}</div>
}

export function FootSpace() {
  return <div className="foot-space" />
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stack g2">
      <div className="figure">{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}

/** The mark on your players. */
export function Star({ size = 10 }: { size?: number }) {
  return (
    <svg className="star" width={size} height={size} viewBox="0 0 24 24" aria-label="one of yours" role="img">
      <path fill="currentColor" d="M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7z" />
    </svg>
  )
}

export function Chevron({ dir }: { dir: 'down' | 'up' | 'right' | 'left' }) {
  const d = dir === 'down' ? 'M5 9l7 7 7-7' : dir === 'up' ? 'M5 15l7-7 7 7' : dir === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export type Tab = 'home' | 'squad' | 'tactics' | 'fixtures' | 'career'

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  {
    key: 'home',
    label: 'Home',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6h16l1.5 7v5H2.5v-5z" />
        <path d="M2.5 13h5.5l1.5 2.5h5L16 13h5.5" />
      </svg>
    ),
  },
  {
    key: 'squad',
    label: 'Squad',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
        <circle cx="17" cy="9" r="2.75" />
        <path d="M17 13.5c2.5 0 4.5 2 4.5 4.5v2" />
      </svg>
    ),
  },
  {
    key: 'tactics',
    label: 'Tactics',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M12 4v16" />
        <circle cx="12" cy="12" r="2.75" />
        <path d="M3 9h3v6H3M21 9h-3v6h3" />
      </svg>
    ),
  },
  {
    key: 'fixtures',
    label: 'Fixtures',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 9.5h18M3 15h18M9 4v16" />
      </svg>
    ),
  },
  {
    key: 'career',
    label: 'Career',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.75" />
        <path d="M4.5 20.5c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" />
      </svg>
    ),
  },
]

/** Five tabs, one tap each. The selected tab takes the accent. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((t) => (
        <button key={t.key} type="button" className="tab" aria-current={tab === t.key ? 'page' : undefined} onClick={() => onTab(t.key)} data-testid={`tab-${t.key}`}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

/** A form line: W D L, wins in ink. */
export function Form({ form }: { form: readonly string[] }) {
  return (
    <span className="form">
      {form.map((r, i) => (
        <span key={i} className={r}>
          {r}
        </span>
      ))}
    </span>
  )
}
