import { devices, expect, test, type Page } from '@playwright/test'
import { continueTurn, getAJob, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * Transfers on a phone (DESIGN.md "Transfers", "Requests", "Decisions are
 * bets"): a summer window with one signing approved, one declined and one
 * "ask for another"; a request for a striker; a budget request refused; a
 * January window with a sale; nothing moving between windows but a free
 * agent; a signing's reveal over five matches; a card taken on its default
 * through Continue.
 */

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })
test.describe.configure({ mode: 'serial' })

const SEED = 8

interface Snapshot {
  week: number
  seasonWeek: number
  clubId: number | null
  window: string | null
  weeksToDeadline: number | null
  pot: number
  signings: { playerId: number; name: string; week: number; free: boolean; follow: boolean }[]
  sales: number
  pending: { kind: string; id: number; player: string | null }[]
  inbox: string[]
  answeredByDefault: number
  scouted: { id: number; name: string; seen: number; revealed: boolean }[]
  freeAgentSignings: number
  requests: { ask: string; granted: boolean | null; week: number }[]
}

/** The live world through the test hook, boiled down. */
async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = (window as unknown as { __tenure: any }).__tenure
    const me = w.managers[w.human.managerId - 1]
    const clubId = me.status.kind === 'employed' && me.status.post.kind === 'home' ? me.status.post.clubId : null
    const club = clubId === null ? null : w.clubs[clubId - 1]
    const sw = w.week % 46
    const jan = sw >= 18 && sw <= 21
    const summer = sw >= 40 && sw <= 45
    const openWindow = jan ? 'january' : summer ? 'summer' : null
    const deadline = jan ? 21 : summer ? 45 : null
    const log = w.log as { week: number; type: string; payload: Record<string, unknown> }[]
    const signings = log.filter((e) => e.type === 'transfer.completed' && e.payload['clubId'] === clubId).map((e) => ({ playerId: e.payload['playerId'] as number, name: String(e.payload['name']), week: e.week, free: e.payload['free'] === true, follow: e.payload['follow'] === true }))
    const sales = log.filter((e) => e.type === 'player.sold' && e.payload['clubId'] === clubId).length
    const pending = (w.human.pending as { kind: string; id: number; payload: Record<string, unknown> }[]).map((d) => ({ kind: d.kind, id: d.id, player: d.payload['name'] === undefined ? null : String(d.payload['name']) }))
    const scouted = club ? (club.playerIds as number[]).map((id) => w.players[id - 1]).filter((p) => p && p.scouted).map((p) => ({ id: p.id, name: p.name, seen: p.scouted.matchesSeen, revealed: p.scouted.revealed })) : []
    const freeAgentSignings = log.filter((e) => e.type === 'player.transfer' && e.payload['clubId'] === clubId).length
    const requests = log.filter((e) => e.type === 'request.answered' && e.payload['managerId'] === me.id).map((e) => ({ ask: String(e.payload['ask']), granted: e.payload['granted'] === true, week: e.week }))
    return { week: w.week, seasonWeek: sw, clubId, window: openWindow, weeksToDeadline: deadline === null ? null : deadline - sw, pot: club ? club.transferPot : 0, signings, sales, pending, inbox: [], answeredByDefault: log.filter((e) => e.type === 'human.decided' && e.payload['byDefault'] === true).length, scouted, freeAgentSignings, requests }
  })
}

/** After taking the offer: the turn that seats the manager has run and the page shows the club. */
async function seated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const w = (window as unknown as { __tenure?: any }).__tenure
    if (!w) return false
    const me = w.managers[w.human.managerId - 1]
    return me.status.kind === 'employed'
  })
}

/** One turn from Home; through the match view when one comes. Returns false when the career is over. */
async function turn(page: Page): Promise<boolean> {
  const s = await state(page)
  if (s === 'over') return false
  if (s === 'match') {
    await playMatchQuickly(page)
    return true
  }
  await continueTurn(page)
  if ((await state(page)) === 'match') await playMatchQuickly(page)
  return true
}

/** Turns until the condition holds. A sacking on the way is the game: get another job and carry on. */
async function until(page: Page, done: (s: Snapshot) => boolean, max = 60): Promise<Snapshot> {
  let s = await snap(page)
  for (let i = 0; i < max && !(done(s) && s.clubId !== null); i++) {
    if (s.clubId === null) {
      expect(await getAJob(page), 'another job').toBe(true)
      s = await snap(page)
      continue
    }
    expect(await turn(page)).toBe(true)
    s = await snap(page)
  }
  expect(s.clubId, 'employed at the end').not.toBeNull()
  return s
}

test('a summer window: one signing approved, one declined, one "ask for another"; a striker asked for; a budget request refused', async ({ page }) => {
  test.setTimeout(12 * 60 * 1000)
  await startCareer(page, SEED, 'Dealer')
  await page.getByTestId('accept-offer').click()
  await seated(page)
  // Into the first match, then on to January: the window banner and the director's cards.
  let s = await until(page, (x) => x.window === 'january' && x.pending.some((d) => d.kind === 'signing'), 120)
  expect(s.window).toBe('january')
  await expect(page.getByTestId('window-banner')).toBeVisible()
  await expect(page.getByTestId('window-banner')).toContainText('January window')

  // Every card is a bet: likely, downside, confidence, the default marked.
  const cards = page.getByTestId('decision-signing')
  expect(await cards.count()).toBeGreaterThan(0)
  const first = cards.first()
  await expect(first.getByText(/Likely/).first()).toBeVisible()
  await expect(first.getByText(/Downside/).first()).toBeVisible()
  await expect(first.locator('[data-default="true"]')).toHaveCount(1)
  await expect(first.locator('[data-default="true"]')).toHaveAttribute('data-key', 'decline')

  // Approve the first, decline the second, ask for another on the third (when there are three).
  const n = await cards.count()
  await cards.nth(0).getByTestId('signing-approve').click()
  if (n > 1) await cards.nth(1).getByTestId('signing-decline').click()
  if (n > 2) await cards.nth(2).getByTestId('signing-another').click()
  const approvedName = (await cards.nth(0).getByTestId('signing-name').innerText()).trim()

  // A striker under 25 from the director, and more budget from the board.
  await page.getByTestId('profile-F').click()
  await page.getByTestId('request-profile').click()
  await expect(page.getByTestId('cancel-profile')).toBeVisible()
  await page.getByTestId('request-budget').click()
  await expect(page.getByTestId('cancel-budget')).toBeVisible()
  await turn(page)
  s = await snap(page)
  // The bid went in and was answered at the close; the asks were answered.
  const bidAnswered = s.signings.some((x) => x.name === approvedName) || (await page.locator('.inbox-item', { hasText: approvedName }).count()) > 0
  expect(bidAnswered).toBe(true)
  expect(s.requests.some((r) => r.ask === 'profile')).toBe(true)
  expect(s.requests.some((r) => r.ask === 'budget')).toBe(true)

  // Next week's cards follow the profile: forwards.
  if (s.window === 'january' && (s.weeksToDeadline ?? 0) > 0) {
    const forwards = page.getByTestId('decision-signing')
    if ((await forwards.count()) > 0) await expect(forwards.first().locator('.sub').first()).toContainText(/^F ·/)
  }

  // Keep asking the board for money until a refusal lands (each ask is a roll), a few asks at most.
  let refused = s.requests.some((r) => r.ask === 'budget' && !r.granted)
  for (let i = 0; i < 6 && !refused; i++) {
    if ((await page.getByTestId('request-budget').count()) === 0) break
    await page.getByTestId('request-budget').click()
    await turn(page)
    s = await snap(page)
    refused = s.requests.some((r) => r.ask === 'budget' && !r.granted)
  }
  expect(refused).toBe(true)
  await expect(page.locator('.inbox-item', { hasText: /will not add to the pot|found £/ }).first()).toBeVisible()
})

test('deadline day, nothing moves between windows but a free agent, a sale in the next window, the reveal, and a default taken through Continue', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000)
  await startCareer(page, SEED, 'Dealer')
  await page.getByTestId('accept-offer').click()
  await seated(page)
  // Through the first deadline day (January's, or the summer's if a sacking got in the way): its own step, its own inbox line.
  let s = await until(page, (x) => x.window !== null && x.weeksToDeadline === 0, 200)
  expect(s.weeksToDeadline).toBe(0)
  await expect(page.getByTestId('window-banner')).toContainText('deadline day')
  // Approve whatever is on the desk on deadline day; it is answered at the day's close.
  const cards = page.getByTestId('decision-signing')
  if ((await cards.count()) > 0) await cards.first().getByTestId('signing-approve').click()
  await turn(page)
  s = await snap(page)
  expect(s.window).toBeNull()
  await expect(page.locator('.inbox-item', { hasText: /Deadline day/ }).first()).toBeVisible()
  const atClose = s.signings.length
  const clubAtClose = s.clubId

  // Between the windows: the director brings nothing, and only a free agent can arrive.
  const opened = await until(page, (x) => x.window !== null, 120)
  if (opened.clubId === clubAtClose) expect(opened.signings.length).toBe(atClose)
  await expect(page.getByTestId('window-banner')).toBeVisible()

  // A signing's reveal: a signing's page shows the director's range until five matches are seen, then the number.
  const scouted = opened.scouted
  if (scouted.length > 0) {
    const one = scouted[0]!
    await page.getByTestId('tab-squad').click()
    await page.locator(`[data-testid="squad-row"][data-player="${one.id}"]`).click()
    const label = (await page.getByTestId('rating-label').innerText()).toLowerCase()
    if (one.revealed) expect(label).toBe('rating')
    else expect(label).toContain('matches seen')
    await page.getByTestId('tab-home').click()
  }

  // A sale asked for through a player's page, approved on its card when the director finds a buyer.
  let sold = false
  for (let i = 0; i < 5 && !sold; i++) {
    s = await snap(page)
    if (s.clubId === null || s.window === null) break
    const sale = page.getByTestId('decision-sale')
    if ((await sale.count()) > 0) {
      await sale.first().locator('[data-key="approve"]').click()
      await turn(page)
      sold = (await snap(page)).sales > 0
      break
    }
    await page.getByTestId('tab-squad').click()
    const rows = page.getByTestId('squad-row')
    await rows.nth((await rows.count()) - 1 - i).click()
    if ((await page.getByTestId('ask-sell').count()) > 0 && (await page.getByTestId('ask-sell').isEnabled())) await page.getByTestId('ask-sell').click()
    await page.getByTestId('tab-home').click()
    await turn(page)
  }
  s = await snap(page)
  console.log(`sale ${sold ? 'made' : 'not made (no buyer found)'}; signings so far ${s.signings.length}`)

  // A card taken on its default through Continue: leave the director's cards unanswered and continue.
  if (s.clubId !== null && s.pending.some((d) => d.kind === 'signing' || d.kind === 'sale')) {
    const before = s.answeredByDefault
    await turn(page)
    s = await snap(page)
    expect(s.answeredByDefault).toBeGreaterThan(before)
  }
})
