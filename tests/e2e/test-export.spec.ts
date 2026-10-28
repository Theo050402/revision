import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

async function contenuTelecharge(page: Page, bouton: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: bouton }).click(),
  ])
  return (await readFile(await download.path())).toString('utf8')
}

test('#test-export affiche les 4 boutons', async ({ page }) => {
  await page.goto('./#test-export')
  await expect(page.getByRole('button', { name: '1. Exporter (partage)' })).toBeVisible()
  await expect(page.getByRole('button', { name: '2. Exporter (téléchargement)' })).toBeVisible()
  await expect(page.getByRole('button', { name: '3. Réexporter modifié' })).toBeVisible()
  await expect(page.getByRole('link', { name: '4. Ouvrir dans Safari' })).toHaveAttribute(
    'target',
    '_blank',
  )
})

test('le téléchargement contient 2 événements en SEQUENCE:1', async ({ page }) => {
  await page.goto('./#test-export')
  const ics = await contenuTelecharge(page, '2. Exporter (téléchargement)')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  expect(ics).toContain('UID:test-1@revisions-emma')
  expect(ics).toContain('UID:test-2@revisions-emma')
  expect(ics).toContain('SEQUENCE:1')
})

test('le réexport passe en SEQUENCE:2 avec test-1 à 11h', async ({ page }) => {
  await page.goto('./#test-export')
  // Sans méthode forcée, le bouton 3 livre par téléchargement.
  const ics = await contenuTelecharge(page, '3. Réexporter modifié')
  expect(ics).toContain('SEQUENCE:2')
  expect(ics).toMatch(
    /UID:test-1@revisions-emma\r\nSEQUENCE:2\r\nDTSTAMP:\S+\r\nDTSTART;TZID=Europe\/Paris:\d{8}T110000/,
  )
})
