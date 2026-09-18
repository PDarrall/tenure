import { expect, type Page } from '@playwright/test'

/** What the screen is showing: the match view, a club's Home, out of work, or the end. */
export async function state(page: Page): Promise<'match' | 'employed' | 'unemployed' | 'over' | 'offer'> {
  if ((await page.getByTestId('score').count()) > 0) return 'match'
  if ((await page.getByTestId('accept-offer').count()) > 0 && (await page.getByTestId('start-unemployed').count()) > 0) return 'offer'
  const head = await page.locator('.head').first().innerText()
  if (head.includes('The career is over')) return 'over'
  if (head.includes('Out of work')) return 'unemployed'
  return 'employed'
}

export async function headText(page: Page): Promise<string> {
  return page.locator('.head').first().innerText()
}

/** The club named at the top of Home, or null when out of work. */
export async function clubOf(page: Page): Promise<string | null> {
  const title = await page.locator('.head .title').first().innerText()
  return title === 'Out of work' || title === 'The career is over' ? null : title.trim()
}

export async function seasonOf(page: Page): Promise<number | null> {
  const m = (await headText(page)).match(/Season (\d+)/)
  return m ? Number(m[1]) : null
}

/** A forced decision replaces Continue: take the job on offer, else the default, else the first way. */
export async function answerForced(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const choices = page.locator('.foot .choice')
    if ((await choices.count()) === 0) return
    if ((await page.getByTestId('accept-offer').count()) > 0) await page.getByTestId('accept-offer').click()
    else if ((await page.getByTestId('choice-default').count()) > 0) await page.getByTestId('choice-default').click()
    else await choices.first().click()
  }
}

/** Continue, answering anything that stands in the way. Kicks off if that is what Continue does. */
export async function continueTurn(page: Page): Promise<void> {
  await answerForced(page)
  await page.getByTestId('continue').click()
}

export async function inMatch(page: Page): Promise<boolean> {
  return (await page.getByTestId('score').count()) > 0
}

/** In the match view: straight to full time, then to the inbox. */
export async function playMatchQuickly(page: Page): Promise<void> {
  await expect(page.getByTestId('to-full-time')).toBeVisible()
  await page.getByTestId('to-full-time').click()
  await expect(page.getByTestId('continue-after-match')).toBeVisible()
  await page.getByTestId('continue-after-match').click()
}

/** On Home: apply to every vacancy on the list. */
export async function applyEverywhere(page: Page): Promise<void> {
  const buttons = page.getByRole('button', { name: 'Apply', exact: true })
  const n = await buttons.count()
  for (let i = 0; i < n; i++) await buttons.nth(0).click()
}

/** Out of work: apply to everything until a job comes. False if the career ends first. */
export async function getAJob(page: Page): Promise<boolean> {
  for (let i = 0; i < 260; i++) {
    const s = await state(page)
    if (s === 'employed' || s === 'match') return true
    if (s === 'over') return false
    await applyEverywhere(page)
    await continueTurn(page)
  }
  return false
}

export async function startCareer(page: Page, seed: number, name: string): Promise<void> {
  await page.goto('./')
  await page.getByLabel('World seed').fill(String(seed))
  await page.getByLabel('Your name').fill(name)
  await page.getByTestId('start-career').click()
  await expect(page.getByLabel('Your first offer')).toBeVisible()
}
