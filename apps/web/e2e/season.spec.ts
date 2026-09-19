import { expect, test } from '@playwright/test'
import { applyEverywhere, clubOf, continueTurn, getAJob, inMatch, playMatchQuickly, seasonOf, startCareer, state } from './helpers.js'

/**
 * A season in the browser, on an iPad viewport (DESIGN.md "Match", phase 3d):
 * turn the day-one offer down, get a job through the market, play every
 * fixture from the match screen (the first to key events, with a substitution
 * and a mentality change while paused; the rest to full time in one press),
 * play a cup tie, renew a contract, see an under-24 debut and grow, and visit
 * every tab. Every tap target on Home is at least 32px.
 */

const SEED = 3

test.describe.configure({ mode: 'serial' })

test('a season on an iPad: the match view, subs, mentality, a cup tie, a contract, a debut', async ({ page }) => {
  await startCareer(page, SEED, 'Smoke Tester')
  // This smoke goes through the market instead (jobs.spec.ts takes the offer).
  await page.getByTestId('start-unemployed').click()
  await expect(page.getByTestId('continue')).toBeVisible()

  // Tap targets on the first screen.
  for (const b of await page.getByRole('button').all()) {
    const box = await b.boundingBox()
    if (box && (await b.isVisible())) expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(32)
  }

  // Get a job: apply to everything until an offer stops the turn, then take it.
  const hired = await getAJob(page)
  console.log(`hired after ${hired ? 'some' : 'no'} weeks`)
  expect(hired).toBe(true)
  let matches = 0
  if (await inMatch(page)) {
    await playMatchQuickly(page)
    matches++
  }
  const firstClub = await clubOf(page)
  expect(firstClub).not.toBeNull()

  // Every tab renders.
  await page.getByTestId('tab-squad').click()
  await expect(page.getByTestId('squad-row').first()).toBeVisible()
  await page.getByTestId('tab-tactics').click()
  await expect(page.getByTestId('pick-xi').first()).toBeVisible()
  await page.getByTestId('tab-fixtures').click()
  await expect(page.getByTestId('fixture-row').first()).toBeVisible()
  await page.getByTestId('view-table').click()
  await expect(page.getByTestId('table-row').first()).toBeVisible()
  await page.getByTestId('tab-career').click()
  await expect(page.getByText(/Players made/).first()).toBeVisible()
  await expect(page.getByText(/Legacy/).first()).toBeVisible()
  // The version stamp at the foot: the commit and date the Pages workflow injects, "dev" in a local build.
  await expect(page.getByTestId('build-stamp')).toHaveText(/^Build (dev|[0-9a-f]{7})/)

  // Renew a contract: open the squad, the first player in his last year, talk terms.
  await page.getByTestId('tab-squad').click()
  const rows = page.getByTestId('squad-row')
  const total = await rows.count()
  expect(total).toBeGreaterThan(15)
  let talked = false
  for (let i = 0; i < total && !talked; i++) {
    const text = await rows.nth(i).innerText()
    if (/· 1 yr$/.test(text.trim())) {
      await rows.nth(i).click()
      // Talking terms is an ask with a stated likelihood now (DESIGN.md "Requests"): queued for the turn.
      await page.getByRole('button', { name: /Talk terms/ }).click()
      await expect(page.getByTestId('ask-contract')).toHaveText(/Asked/)
      talked = true
    }
  }
  expect(talked).toBe(true)

  // The youngest player on the books and his rating today: a debut and growth are checked at the end.
  await page.getByTestId('tab-squad').click()
  const ageHeader = page.getByRole('button', { name: /^Age/ })
  await ageHeader.click()
  if (Number(await rows.first().getAttribute('data-age')) > Number(await rows.last().getAttribute('data-age'))) await ageHeader.click()
  const youngest = rows.first()
  const youngName = (await youngest.getAttribute('data-name')) ?? ''
  const youngAge = Number(await youngest.getAttribute('data-age'))
  expect(youngAge).toBeLessThan(24)
  const youngRatingBefore = Number(await youngest.getAttribute('data-rating'))
  await page.getByTestId('tab-home').click()

  let cupTies = 0
  let keyEventPresses: number | null = null
  let subbed = false
  let mentalityChanged = false
  let renewed = false
  const startSeason = await seasonOf(page)

  for (let turn = 0; turn < 420; turn++) {
    const s = await state(page)
    if (turn % 10 === 0) console.log(`turn ${turn}: matches ${matches}, cups ${cupTies}, ${s}`)
    if (s === 'over') break
    if (s === 'unemployed') {
      // Sacked or released: that is the game; get another job and play on.
      console.log(`turn ${turn}: out of work after ${matches} matches, looking again`)
      if (!(await getAJob(page))) break
      continue
    }
    if (s === 'match') {
      const eyebrow = await page.locator('main[aria-label="Match"] .head .label').first().innerText()
      if (eyebrow.toLowerCase().includes('cup')) cupTies++
      if (keyEventPresses === null) {
        // The first match to key events: Continue at each pause; change mentality once and substitute once while paused; count the presses.
        await page.getByTestId('play-keyEvents').click()
        await expect(page.getByTestId('continue')).toHaveText(/Kick off · to next event/)
        let presses = 0
        for (let i = 0; i < 40; i++) {
          if ((await page.getByTestId('continue-after-match').count()) > 0) break
          if ((await page.getByTestId('choice-default').count()) > 0) {
            // An injury needing a change replaces Continue until a substitute is chosen.
            await page.getByTestId('choice-default').click()
            subbed = true
            continue
          }
          const next = await page.getByTestId('continue').getAttribute('data-next')
          if (next === 'next-event' && i > 0) {
            if (!mentalityChanged && (await page.getByTestId('mentality-attack').count()) > 0) {
              await page.getByTestId('mentality-attack').click()
              mentalityChanged = true
            }
            if (!subbed && (await page.getByTestId('make-a-change').count()) > 0) {
              await page.getByTestId('make-a-change').click()
              await page.getByTestId('sub-off').last().click()
              await page.getByTestId('sub-best').click()
              subbed = true
            }
          }
          await page.getByTestId('continue').click()
          presses++
        }
        keyEventPresses = presses
      } else {
        // Every other match to full time: the toggle back if the first match left it on key events, then one press and the ticker.
        if ((await page.getByTestId('play-fullTime').getAttribute('aria-pressed')) !== 'true') await page.getByTestId('play-fullTime').click()
        await expect(page.getByTestId('continue')).toHaveText(/Kick off · to full time/)
        await page.getByTestId('continue').click()
      }
      await expect(page.getByTestId('continue-after-match')).toBeVisible()
      // The commentary names players; the ratings and, for the league, the table at full time are there.
      expect(await page.getByTestId('commentary').locator('li').count()).toBeGreaterThan(5)
      matches++
      await page.getByTestId('continue-after-match').click()
      continue
    }
    // A season's worth of matches, at least one cup tie, and into the next season.
    const season = await seasonOf(page)
    if (season !== null && startSeason !== null && season > startSeason && matches > 30 && cupTies >= 1) break
    if (matches > 110) break

    // Between matches: a contract decision may be waiting; renew once.
    if (!renewed) {
      const renew = page.locator('main').getByRole('button', { name: /renew|offer|years/i }).first()
      if ((await renew.count()) > 0) {
        await renew.click()
        renewed = true
      }
    }
    await continueTurn(page)
  }

  expect(matches).toBeGreaterThan(30)
  expect(cupTies).toBeGreaterThanOrEqual(1)
  expect(subbed).toBe(true)
  expect(mentalityChanged).toBe(true)
  expect(renewed).toBe(true)
  // To key events: kick-off, each pause, then Result (DESIGN.md "Validation targets": four to six presses in the common case).
  console.log(`first match to key events: ${keyEventPresses} presses`)
  expect(keyEventPresses).not.toBeNull()
  expect(keyEventPresses!).toBeGreaterThanOrEqual(3)
  expect(keyEventPresses!).toBeLessThanOrEqual(14)

  // The youngster made his debut and grew: checked at the club he was noted at, by his exact name.
  if ((await state(page)) === 'match') await playMatchQuickly(page)
  const clubNow = await clubOf(page)
  if (clubNow === firstClub) {
    await page.getByTestId('tab-squad').click()
    const row = page.locator(`[data-testid="squad-row"][data-name="${youngName}"]`)
    if ((await row.count()) > 0) {
      const apps = Number(await row.first().getAttribute('data-apps'))
      const ratingNow = Number(await row.first().getAttribute('data-rating'))
      expect(apps).toBeGreaterThanOrEqual(1)
      expect(ratingNow).toBeGreaterThanOrEqual(youngRatingBefore)
      console.log(`youngster ${youngName}: debut and growth checked`)
    } else {
      console.log(`youngster ${youngName}: no longer at the club`)
    }
  } else {
    console.log(`moved on from ${firstClub} to ${clubNow}: the youngster check is skipped`)
  }
  // The career page shows the four score lines and the players made.
  await page.getByTestId('tab-career').click()
  await expect(page.getByText(/Players made/).first()).toBeVisible()
  await expect(page.getByText(/Legacy/).first()).toBeVisible()
  // Unused but exercised: applying from Home works while employed too (no vacancies list, so nothing to click).
  await page.getByTestId('tab-home').click()
  await applyEverywhere(page)
})
