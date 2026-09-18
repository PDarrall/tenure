import { expect, test, type Page } from '@playwright/test'

/**
 * Jobs and world (DESIGN.md "Job market", the start): on day one the agent
 * has one offer ready. One career takes it and plays five matches from the
 * first turn; another turns it down, starts unemployed, withdraws one of the
 * agent's applications, and is hired through one he put in later.
 */

const SEED = 5

async function startCareer(page: Page, name: string): Promise<void> {
  await page.goto('./')
  await page.getByLabel('World seed').fill(String(SEED))
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Start the career' }).click()
  // The offer card: club and tier, the terms, the board's expectation.
  const card = page.getByLabel('Your first offer')
  await expect(card).toBeVisible()
  const text = await card.innerText()
  expect(text).toMatch(/\(tier [1-5]\)/)
  expect(text).toContain('-year contract')
  expect(text).toContain('budget')
  expect(text).toContain('the board expects')
}

async function answerBlocking(page: Page): Promise<void> {
  const cards = page.locator('.decision.blocking')
  const n = await cards.count()
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i)
    // A job offer's default is to decline; the smoke takes the first set of terms.
    if ((await card.innerText()).includes('want to talk')) {
      await card.getByRole('button', { name: /^(?!Decline)/ }).first().click()
      continue
    }
    const preferred = card.getByRole('button', { name: /\(default\)/ })
    if (await preferred.count()) await preferred.first().click()
    else await card.getByRole('button').first().click()
  }
}

async function continueTurn(page: Page): Promise<void> {
  await answerBlocking(page)
  await page.getByTestId('continue').click()
}

async function inMatch(page: Page): Promise<boolean> {
  return (await page.getByTestId('kick-off').count()) > 0 || (await page.getByTestId('score').count()) > 0
}

/** Play the match the turn stopped at straight through to the whistle. */
async function playMatch(page: Page): Promise<void> {
  if ((await page.getByTestId('kick-off').count()) > 0) await page.getByTestId('kick-off').click()
  await expect(page.getByTestId('score')).toBeVisible()
  await page.getByTestId('to-full-time').click()
  await expect(page.getByTestId('continue-after-match')).toBeVisible()
  await page.getByTestId('continue-after-match').click()
}

function clubOf(header: string): string | null {
  const m = header.match(/\n([^\n]+?) \(tier \d\), .*Target/)
  return m ? m[1]! : null
}

test.describe.configure({ mode: 'serial' })

test('accept the offer: employed from the first turn, five matches played', async ({ page }) => {
  await startCareer(page, 'Day One')
  await page.getByTestId('promise-stability').click()
  await page.getByTestId('accept-offer').click()

  let matches = 0
  for (let turn = 0; turn < 40 && matches < 5; turn++) {
    if (await inMatch(page)) {
      await playMatch(page)
      matches++
      continue
    }
    const header = await page.locator('header').innerText()
    expect(header, 'employed from the first turn').toContain('Target')
    await continueTurn(page)
  }
  expect(matches).toBe(5)
  const header = await page.locator('header').innerText()
  expect(header).toContain('Target')
  console.log(`accepted: ${clubOf(header)}, five matches played`)
})

test('decline the offer: unemployed, the agent applies weekly, one withdrawn, hired through his application', async ({ page }) => {
  await startCareer(page, 'Free Agent')
  await page.getByTestId('start-unemployed').click()
  await expect(page.getByTestId('continue')).toBeVisible()
  expect(await page.locator('header').innerText()).toContain('Out of work')

  const appliedAt = new Set<string>()
  let withdrawn: string | null = null
  let hiredAt: string | null = null
  for (let turn = 0; turn < 260 && hiredAt === null; turn++) {
    if (await inMatch(page)) {
      // Hired and straight into a match week.
      hiredAt = clubOf(await page.locator('header').innerText())
      break
    }
    const header = await page.locator('header').innerText()
    if (header.includes('career is over')) break
    const club = clubOf(header)
    if (club) {
      hiredAt = club
      break
    }
    // The agent's application of the week sits above the vacancies.
    await page.getByTestId('tab-vacancies').click()
    const panel = page.getByTestId('agent-application')
    await expect(panel).toBeVisible()
    const text = await panel.innerText()
    const m = text.match(/Your name is in at (.+?) \(/)
    if (m) {
      appliedAt.add(m[1]!)
      if (withdrawn === null) {
        await panel.getByTestId('withdraw-agent').click()
        await expect(panel.getByText('Withdrawing when you continue.')).toBeVisible()
        withdrawn = m[1]!
        await page.getByTestId('tab-inbox').click()
        await continueTurn(page)
        // Not resubmitted to the club just withdrawn from.
        await page.getByTestId('tab-vacancies').click()
        expect(await page.getByTestId('agent-application').innerText()).not.toContain(`in at ${withdrawn} (`)
      }
    }
    await page.getByTestId('tab-inbox').click()
    await continueTurn(page)
  }
  console.log(`agent applied at: ${[...appliedAt].join(', ')}; withdrawn: ${withdrawn}; hired at: ${hiredAt}`)
  expect(withdrawn).not.toBeNull()
  expect(hiredAt).not.toBeNull()
  // The smoke never applied itself, so the job came through an application the agent put in.
  expect(appliedAt.has(hiredAt!)).toBe(true)
})
