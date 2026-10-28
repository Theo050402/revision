import { expect, test } from '@playwright/test'

test('la page charge et s\'intitule Révisions', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Révisions')
  // Le titre vient du HTML statique : #root non vide prouve que le bundle JS s'exécute.
  await expect(page.locator('#root')).not.toBeEmpty()
})
