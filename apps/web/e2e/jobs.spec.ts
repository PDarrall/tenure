import { expect, test } from '@playwright/test'
import { clubOf, continueTurn, inMatch, playMatchQuickly, startCareer, state } from './helpers.js'

/**
 * Jobs and world (DESIGN.md "Job market", the start): on day one the agent
 * has one offer ready. One career takes it and plays five matches from the
 * first turn; another turns it down, starts unemployed, withdraws one of the
 * agent's applications, and is hired through one he put in later.
 */

const SEED = 5

test.describe.configure({ mode: 'serial' })

test('accept the offer: employed from the first turn, five matches played', async ({ page }) => {
  await startCareer(page, SEED, 'Day One')
  // The offer card: club and tier, the terms, the board's expectation.
  const text = await page.locator('main[aria-label="Your first offer"]').innerText()
  expect(text).toMatch(/Tier [1-5]/)
  expect(text).toContain('-year contract')
  expect(text).toContain('budget')
  expect(text).toContain('the board expects')
  await page.getByTestId('promise-stability').click()
  await page.getByTestId('accept-offer').click()

  let matches = 0
  for (let turn = 0; turn < 40 && matches < 5; turn++) {
    if (await inMatch(page)) {
      await playMatchQuickly(page)
      matches++
      continue
    }
    const s = await state(page)
    expect(s, 'employed from the first turn').toBe('employed')
    await continueTurn(page)
  }
  expect(matches).toBe(5)
  const club = await clubOf(page)
  expect(club).not.toBeNull()
  console.log(`accepted: ${club}, five matches played`)
})

test('decline the offer: unemployed, the agent applies weekly, one withdrawn, hired through his application', async ({ page }) => {
  await startCareer(page, SEED, 'Free Agent')
  await page.getByTestId('start-unemployed').click()
  await expect(page.getByTestId('continue')).toBeVisible()
  expect(await state(page)).toBe('unemployed')

  const appliedAt = new Set<string>()
  let withdrawn: string | null = null
  let hiredAt: string | null = null
  for (let turn = 0; turn < 260 && hiredAt === null; turn++) {
    const s = await state(page)
    if (s === 'over') break
    if (s === 'match') {
      // Hired and straight into a match week: play it, then read the club off Home.
      await playMatchQuickly(page)
      continue
    }
    if (s === 'employed') {
      hiredAt = await clubOf(page)
      break
    }
    // The agent's application of the week sits above the vacancies.
    const panel = page.getByTestId('agent-application')
    await expect(panel).toBeVisible()
    const text = await panel.innerText()
    const m = text.match(/Your name is in at (.+)\n/)
    if (m) {
      appliedAt.add(m[1]!.trim())
      if (withdrawn === null) {
        await panel.getByTestId('withdraw-agent').click()
        await expect(panel.getByText('Withdrawing when you continue.')).toBeVisible()
        withdrawn = m[1]!.trim()
        await continueTurn(page)
        // Not resubmitted to the club just withdrawn from.
        if ((await state(page)) === 'unemployed') expect(await page.getByTestId('agent-application').innerText()).not.toContain(`in at ${withdrawn}\n`)
        continue
      }
    }
    await continueTurn(page)
  }
  console.log(`agent applied at: ${[...appliedAt].join(', ')}; withdrawn: ${withdrawn}; hired at: ${hiredAt}`)
  expect(withdrawn).not.toBeNull()
  expect(hiredAt).not.toBeNull()
  // The smoke never applied itself, so the job came through an application the agent put in.
  expect(appliedAt.has(hiredAt!)).toBe(true)
})
