import { devices, expect, test, type Page } from '@playwright/test'
import { continueTurn, getAJob, inMatch, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * The director on arrival and Requests (DESIGN.md "Transfers" On arrival,
 * "Requests") at 390 × 844: take a job mid-season and see the director's
 * assessment and his first cards the week you arrive; open Requests from
 * Career, read a row's likelihood, cost and effect, make one on its card,
 * and see the board's answer as a post. Nothing about requests on Home.
 */

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })
test.describe.configure({ mode: 'serial' })

const SEED = 12

interface Snapshot {
  seasonWeek: number
  clubId: number | null
  window: 'january' | 'summer' | null
  assessment: boolean
  signingCards: { signNow: boolean; agreed: boolean }[]
  answered: { ask: string; granted: boolean }[]
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = (window as unknown as { __tenure: any }).__tenure
    const me = w.managers[w.human.managerId - 1]
    const clubId = me.status.kind === 'employed' && me.status.post.kind === 'home' ? me.status.post.clubId : null
    const sw = w.week % 52
    const jan = sw >= 21 && sw <= 24
    const summer = sw >= 40 || sw <= 2
    const log = w.log as { week: number; type: string; payload: Record<string, unknown> }[]
    const pending = w.human.pending as { kind: string; payload: Record<string, unknown> }[]
    return {
      seasonWeek: sw,
      clubId,
      window: jan ? 'january' : summer ? 'summer' : null,
      assessment: log.some((e) => e.type === 'director.assessment' && e.payload['managerId'] === me.id && e.payload['clubId'] === clubId),
      signingCards: pending.filter((d) => d.kind === 'signing').map((d) => ({ signNow: d.payload['signNow'] === true, agreed: d.payload['agreed'] === true })),
      answered: log.filter((e) => e.type === 'request.answered' && e.payload['managerId'] === me.id).map((e) => ({ ask: String(e.payload['ask']), granted: e.payload['granted'] === true })),
    }
  })
}

async function seated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const w = (window as unknown as { __tenure?: any }).__tenure
    if (!w) return false
    const me = w.managers[w.human.managerId - 1]
    return me.status.kind === 'employed'
  })
}

/** One week from Home: through the pre-match stop and the match view when one comes. */
async function turn(page: Page): Promise<void> {
  if ((await state(page)) === 'match') {
    await playMatchQuickly(page)
    return
  }
  await continueTurn(page)
  if (await inMatch(page)) await playMatchQuickly(page)
  else if ((await page.getByTestId('continue').count()) > 0 && (await page.getByTestId('continue').getAttribute('data-next')) === 'kick-off') {
    await continueTurn(page)
    if (await inMatch(page)) await playMatchQuickly(page)
  }
}

test('take a job mid-season: the director posts his assessment and his first cards the week you arrive', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000)
  await startCareer(page, SEED, 'Arrival')
  await page.getByTestId('start-unemployed').click()
  expect(await getAJob(page)).toBe(true)
  const s = await snap(page)
  expect(s.clubId).not.toBeNull()
  console.log(`hired in week ${s.seasonWeek + 1}, window ${s.window ?? 'shut'}, ${s.signingCards.length} cards`)
  // The assessment: the two positions that need cover, the players he would sell.
  expect(s.assessment).toBe(true)
  // His first cards: bids in a window; outside one a free agent to sign now and targets agreed for the window.
  expect(s.signingCards.length).toBeGreaterThan(0)
  if (s.window === null) expect(s.signingCards.some((c) => c.signNow || c.agreed)).toBe(true)
  else expect(s.signingCards.every((c) => !c.signNow && !c.agreed)).toBe(true)
  if ((await state(page)) === 'employed') {
    const cards = page.getByTestId('decision-signing')
    expect(await cards.count()).toBe(s.signingCards.length)
    if (s.window === null) await expect(cards.first().locator('.label').first()).toContainText(/sign now|for the window/)
    // Approve the first card: outside a window a free agent signs now, a target is agreed for the window.
    await cards.first().getByTestId('signing-approve').click()
    await turn(page)
    const after = await snap(page)
    if (after.clubId === s.clubId && s.window === null && s.signingCards[0]!.agreed) {
      await expect(page.getByTestId('agreed-card')).toBeVisible()
      await page.getByTestId('cancel-agreed').first().click()
      await expect(page.getByTestId('keep-agreed').first()).toBeVisible()
    }
  }
})

test('Requests from Career: grouped rows with likelihood, cost and effect; a card; an answer as a post; nothing on Home', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000)
  await startCareer(page, SEED, 'Asker')
  await page.getByTestId('accept-offer').click()
  await seated(page)
  await expect(page.getByTestId('requests-card')).toHaveCount(0)
  await page.getByTestId('tab-career').click()
  await page.getByTestId('open-requests').click()
  for (const group of ['The board', 'The director', 'Players']) await expect(page.locator(`section[aria-label="${group}"]`)).toBeVisible()
  for (const ask of ['budget', 'wages', 'stadium', 'coaching', 'academy', 'medical', 'scouting', 'backing', 'newContract', 'profile', 'named', 'sell', 'loan', 'talks', 'contract', 'captaincy', 'playingTime']) {
    const row = page.getByTestId(`req-${ask}`)
    await expect(row).toHaveCount(1)
    const text = await row.innerText()
    expect(text, ask).toMatch(/Cost/)
    expect(text, ask).toMatch(/Effect/)
    expect(['sure thing', 'likely', 'gamble']).toContain(await row.getAttribute('data-likely'))
  }
  // The card: the ask, bold, with likely, downside and confidence, against holding, the default.
  await page.getByTestId('req-wages').click()
  const card = page.getByTestId('request-card')
  await expect(card).toBeVisible()
  await expect(card.getByText(/Likely/).first()).toBeVisible()
  await expect(card.getByText(/Downside/).first()).toBeVisible()
  await expect(card.locator('[data-default="true"]')).toHaveAttribute('data-key', 'hold')
  await page.getByTestId('request-ask').click()
  await expect(page.getByTestId('request-state')).toHaveText(/Asked when you continue/)
  await page.getByTestId('requests-back').click()
  await expect(page.getByTestId('req-wages')).toContainText('Asked when you continue')
  // One board request a month: the rest of the board's rows say so once this one is in.
  await page.getByTestId('requests-back').click()
  await expect(page.getByTestId('open-requests')).toContainText('1 queued')
  await page.getByTestId('tab-home').click()
  await expect(page.getByTestId('requests-card')).toHaveCount(0)
  await turn(page)
  const s = await snap(page)
  expect(s.answered.some((r) => r.ask === 'wages')).toBe(true)
  await expect(page.locator('.inbox-item', { hasText: /wage budget/ }).first()).toBeVisible()
  await page.getByTestId('tab-career').click()
  await page.getByTestId('open-requests').click()
  await expect(page.getByTestId('req-budget')).toHaveAttribute('data-available', 'false')
})
