import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * Full consent loop against a real API. Runs only when NIYAT_E2E_APP points at a server-mode build
 * (VITE_API_MODE=server, VITE_DEV_USER_ID=…0004) whose API uses a freshly seeded private-alpha database.
 */
const app = process.env.NIYAT_E2E_APP
const api = process.env.NIYAT_E2E_API ?? 'http://127.0.0.1:3000/v1'
const partnerId = '00000000-0000-4000-8000-000000000002'

test.skip(!app, 'Set NIYAT_E2E_APP to run the server-mode flow')
test.describe.configure({ mode: 'serial' })

type Auth = { cookie: string; token: string; csrf: string }
let key = 0

async function apiSession(userId: string): Promise<Auth> {
  const response = await fetch(`${api}/dev/session`, { method: 'POST', headers: { 'X-Dev-User-Id': userId } })
  const cookie = response.headers.get('set-cookie')!.split(';')[0]
  return { cookie, token: decodeURIComponent(cookie.split('=')[1]), csrf: (await response.json()).csrfToken }
}

async function apiCall<T>(auth: Auth, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { cookie: auth.cookie, 'X-CSRF-Token': auth.csrf, 'Idempotency-Key': `e2e-${Date.now()}-${key++}`.padEnd(16, '0'), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return (response.status === 204 ? null : await response.json()) as T
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact ?? '')).map(item => item.id)).toEqual([])
}

async function openWorkspace(page: Page) {
  await page.goto(app!)
  await page.getByRole('button', { name: 'Workspace’ni ochish' }).click()
  await expect(page.getByText('Serverga ulangan · o‘zgarishlar saqlanadi')).toBeVisible()
}

test('new member onboards, matches anonymously, and completes a counterparty-verified outcome', async ({ page, browser }) => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'Stateful flow runs once')
  const partner = await apiSession(partnerId)
  await apiCall(partner, '/intents', 'POST', { title: 'Dizayn studiyasi uchun texnik hamkor', outcome: '60 kunda MVP chiqarish', offers: ['product design'], needs: ['engineering'], topics: ['ai', 'education'], mode: 'hybrid', horizon: 'month', visibility: 'matched', status: 'active' })

  // Onboarding: profile and intent are created on the server in one publish.
  await page.goto(app!)
  await page.getByRole('button', { name: 'Niyat yaratish' }).click()
  await page.getByLabel(/Ismingiz/).fill('Aziza Karimova')
  await page.getByLabel(/Nima qurmoqchisan/).fill('Bolalar uchun AI o‘qituvchi')
  await page.getByLabel(/Qanday natija/).fill('90 kunda 100 oilada sinash')
  await page.getByLabel(/Sen nima bera olasan/).fill('engineering, ai')
  await page.getByLabel(/Senga nima kerak/).fill('product design, distribution')
  await page.getByLabel(/Asosiy mavzular/).fill('ai, education')
  await page.getByRole('button', { name: /Niyatni tarmoqqa chiqarish/ }).click()
  await expect(page.getByText('Xayrli tong, Aziza Karimova.')).toBeVisible()

  // The match explains mutual value while identity stays hidden.
  await page.getByRole('button', { name: /Anonim hamkor/ }).first().click()
  await expect(page.getByText('Ism rozilikdan keyin ochiladi').first()).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: /Rozilik bilan intro so‘rash/ }).click()
  await expect(page.getByText('Intro so‘rovi yuborildi')).toBeVisible()

  // The receiver sees no name before consenting; accepting reveals both identities.
  const intros = await apiCall<{ items: Array<{ id: string; status: string; counterpart: { displayName: string | null } }> }>(partner, '/intro-requests')
  const pending = intros.items.find(item => item.status === 'pending')!
  expect(pending.counterpart.displayName).toBeNull()
  await apiCall(partner, `/intro-requests/${pending.id}`, 'PATCH', { status: 'accepted' })

  await openWorkspace(page)
  await page.getByRole('button', { name: /So‘rovlar/ }).first().click()
  await expect(page.getByText('Alpha Counterparty').first()).toBeVisible()
  await page.getByRole('button', { name: /Hamkorlikni boshlash/ }).click()
  await expect(page.getByText('Hamkorlik boshlandi')).toBeVisible()
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: 'Bajarildi' }).first().click()
    await expect(page.getByRole('button', { name: 'Bajarildi' })).toHaveCount(1 - index)
  }
  await page.getByLabel('NIMA NATIJA YARATILDI?').fill('10 oila bilan pilot o‘tkazildi')
  await page.getByRole('button', { name: /Tasdiqqa yuborish/ }).click()
  await expect(page.getByText('HAMKOR QARORI KUTILMOQDA')).toBeVisible()
  await expect(page.getByRole('button', { name: '✓ Tasdiqlash' })).toHaveCount(0)

  // Only the counterparty, in their own session, can confirm.
  const partnerContext = await browser.newContext()
  await partnerContext.addCookies([{ name: 'niyat_session', value: partner.token, url: app! }])
  const partnerPage = await partnerContext.newPage()
  await openWorkspace(partnerPage)
  await partnerPage.getByRole('button', { name: /Progress/ }).first().click()
  await expect(partnerPage.getByText('SIZNING QARORINGIZ KERAK')).toBeVisible()
  await expectAccessible(partnerPage)
  await partnerPage.getByRole('button', { name: '✓ Tasdiqlash' }).click()
  await expect(partnerPage.getByText('Natija tasdiqlandi — trust signal yaratildi')).toBeVisible()
  await partnerContext.close()

  await openWorkspace(page)
  await page.getByRole('button', { name: /Trust markazi/ }).first().click()
  await expect(page.getByText(/Alpha Counterparty tasdiqladi/)).toBeVisible()
  await expectAccessible(page)
})
