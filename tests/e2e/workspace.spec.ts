import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('local demo opens workspace, persists state, and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Jonli demoni ko‘rish' }).click()
  await expect(page.getByText('Xayrli tong, Miraziz.')).toBeVisible()
  await expect(page.locator('.product-shell')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter(item => ['critical', 'serious'].includes(item.impact ?? ''))
    .map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target.join(' ')) }))
  expect(serious).toEqual([])

  await page.reload()
  await page.getByRole('button', { name: 'Jonli demoni ko‘rish' }).click()
  await expect(page.locator('.product-shell')).toBeVisible()
})

test('workspace navigation remains usable on a mobile viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only responsive assertion')
  await page.goto('/')
  await page.getByRole('button', { name: 'Jonli demoni ko‘rish' }).click()
  const navigation = page.locator('.mobile-product-nav')
  await expect(navigation).toBeVisible()
  await navigation.getByRole('button', { name: 'Progress' }).click()
  await expect(page.getByText('Hamkorlik hali boshlanmagan')).toBeVisible()
})
test('capsule tags can be typed with the keyboard, removed, and gate publishing', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: 'Niyat yaratish' }).click()
  const offers = page.getByLabel('Sen nima bera olasan?')
  const offerChips = page.locator('.tag-input').first().getByRole('button', { name: /ni olib tashlash$/ })
  while (await offerChips.count()) await offerChips.first().click()
  await expect(page.getByText('Kamida bitta taklif — to‘ldirilmagan')).toBeVisible()
  await expect(page.getByRole('button', { name: /Niyatni tarmoqqa chiqarish/ })).toBeDisabled()

  await offers.pressSequentially('design, research')
  await offers.press('Enter')
  await expect(page.getByRole('button', { name: 'design ni olib tashlash', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'research ni olib tashlash', exact: true })).toBeVisible()
  await offers.press('Backspace')
  await expect(page.getByRole('button', { name: 'research ni olib tashlash', exact: true })).toHaveCount(0)

  for (const label of ['Senga nima kerak?', 'Asosiy mavzular']) {
    await page.getByLabel(label).fill('growth')
    await page.getByLabel(label).press('Enter')
  }
  await page.getByRole('radio', { name: 'Onlayn' }).check({ force: true })
  await expect(page.getByRole('button', { name: /Niyatni tarmoqqa chiqarish/ })).toBeEnabled()
  await page.getByRole('button', { name: /Niyatni tarmoqqa chiqarish/ }).click()
  await expect(page.locator('.product-shell')).toBeVisible()
})

test('every workspace section, including Trust, is reachable on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only navigation assertion')
  await page.goto('/')
  await page.getByRole('button', { name: 'Jonli demoni ko‘rish' }).click()
  await page.locator('.mobile-product-nav').getByRole('button', { name: 'Trust markazi' }).click()
  await expect(page.getByRole('heading', { name: 'Ma’lumoting — seniki.' })).toBeVisible()
  await page.getByRole('button', { name: 'Demodan chiqish' }).click()
  await expect(page.getByRole('button', { name: 'Ha, chiqish' })).toBeVisible()
})
