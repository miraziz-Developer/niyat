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