import { expect, test } from '@playwright/test'

test('la page charge et s\'intitule Révisions', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Révisions')
})
