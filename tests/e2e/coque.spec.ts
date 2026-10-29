import { expect, test, type Page } from '@playwright/test'

const estIpad = (nom: string) => nom === 'ipad'
const racine = (page: Page) => page.locator('html')

test('s\'ouvre sur le calendrier', async ({ page }, info) => {
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  // Vue par défaut : semaine sur iPad, jour sur iPhone (spec §9.1).
  const defaut = estIpad(info.project.name) ? 'Semaine' : 'Jour'
  await expect(page.getByRole('button', { name: defaut, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Mois', exact: true })).toHaveAttribute('aria-pressed', 'false')
  // Titre : mois en français et numéro de semaine.
  await expect(page.locator('.barre-titre')).toHaveText(/^\S+\s*semaine \d+$/)
  // Rien n'est placé : le bouton Exporter est inactif (export.spec.ts couvre le reste).
  await expect(page.getByRole('button', { name: 'Exporter' })).toBeDisabled()
})

test('disposition : panneau de la bibliothèque (iPad) ou bouton Items (iPhone)', async ({ page }, info) => {
  await page.goto('./')
  const panneau = page.getByRole('complementary', { name: 'Bibliothèque d\'items' })
  const items = page.getByRole('button', { name: 'Items', exact: true })
  await expect(items).toBeVisible()

  if (estIpad(info.project.name)) {
    await expect(panneau).toBeVisible()
    const boite = await panneau.boundingBox()
    expect(Math.round(boite!.width)).toBe(340)
    // Le panneau se replie puis se déplie.
    await items.click()
    await expect(panneau).toBeHidden()
    await items.click()
    await expect(panneau).toBeVisible()
  } else {
    await expect(panneau).toHaveCount(0)
    // La bibliothèque est une feuille du bas, qui se ferme par « Fermer » ou Échap.
    const feuille = page.getByRole('dialog', { name: 'Items' })
    await expect(feuille).toHaveCount(0)
    await items.click()
    await expect(feuille).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect(feuille).toHaveCount(0)
    await expect(items).toBeFocused()
    await items.click()
    await expect(feuille).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(feuille).toHaveCount(0)
  }
})

test('annuler et rétablir sont désactivés sans historique', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Rétablir' })).toBeDisabled()
})

test('les cibles tactiles de la barre font au moins 44 px', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  const boutons = page.locator('.barre button')
  const n = await boutons.count()
  expect(n).toBeGreaterThanOrEqual(7)
  for (let i = 0; i < n; i++) {
    const boite = await boutons.nth(i).boundingBox()
    expect(boite!.width, `largeur du bouton ${i}`).toBeGreaterThanOrEqual(44)
    expect(boite!.height, `hauteur du bouton ${i}`).toBeGreaterThanOrEqual(44)
  }
})

test('changer de vue met à jour la sélection', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Mois', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mois', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.mois-vue')).toBeVisible()
})

test('le thème suit le réglage Apparence', async ({ page }) => {
  await page.goto('./')
  await expect(racine(page)).toHaveAttribute('data-theme', 'auto')
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()

  const apparence = page.getByRole('group', { name: 'Apparence' })
  await apparence.getByRole('button', { name: 'Sombre' }).click()
  await expect(racine(page)).toHaveAttribute('data-theme', 'sombre')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(43, 30, 62)')

  await apparence.getByRole('button', { name: 'Clair' }).click()
  await expect(racine(page)).toHaveAttribute('data-theme', 'clair')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(252, 252, 250)')

  await apparence.getByRole('button', { name: 'Auto' }).click()
  await expect(racine(page)).toHaveAttribute('data-theme', 'auto')

  // Les réglages ne sont pas annulables (spec §9.6) : ↶ et ↷ restent désactivés.
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Rétablir' })).toBeDisabled()

  // Retour au calendrier.
  await page.getByRole('button', { name: 'Retour au calendrier' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
})

test('« auto » suit le thème sombre de l\'appareil', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('./')
  await expect(racine(page)).toHaveAttribute('data-theme', 'auto')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(43, 30, 62)')
})

test('lecture impossible : message d\'erreur, aucune commande d\'édition', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error('base indisponible')
    }
  })
  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('Lecture impossible : ')
  await expect(page.locator('[data-emplacement="restauration"]')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toHaveCount(0)
  // Seule commande offerte : la restauration d'une sauvegarde (chemin de récupération, tâche 19).
  await expect(page.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Restaurer une sauvegarde' })).toBeVisible()
})

test('une erreur d\'écriture reste affichée dans un bandeau', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  // Simule un quota plein : toute écriture échoue.
  await page.evaluate(() => {
    const quota = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    IDBObjectStore.prototype.put = quota
    IDBObjectStore.prototype.add = quota
    IDBObjectStore.prototype.delete = quota
    IDBObjectStore.prototype.clear = quota
  })
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('group', { name: 'Apparence' }).getByRole('button', { name: 'Sombre' }).click()
  const bandeau = page.getByRole('alert')
  await expect(bandeau.locator('p')).toHaveText('Plus d\'espace pour enregistrer. Sauvegarde tes données puis libère de la place.')
  // §14 : le bandeau propose « Sauvegarder ».
  await expect(bandeau.getByRole('button', { name: 'Sauvegarder' })).toBeVisible()
  // Persistant : toujours là bien après la durée d'un toast.
  await page.waitForTimeout(5500)
  await expect(bandeau).toBeVisible()
})
