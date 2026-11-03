import { expect, test, type Page } from '@playwright/test'
import { AUJOURDHUI, MAINTENANT, semer } from './graine-calendrier'
import { lacher, pointGrille, pointeur } from './gestes'

// « + Indisponibilité » (spec §D.5) : un bouton de la barre de navigation ouvre une feuille (Titre, Jour, Début, Fin)
// préremplie avec l'emplacement libre touché en dernier, sinon avec aujourd'hui de l'heure suivante pendant 1 h.
// Données : celles du calendrier, « maintenant » figé à mercredi 4 nov. 2026, 10 h 30 à Paris.

const bouton = (page: Page) => page.getByRole('button', { name: '+ Indisponibilité' })
const feuille = (page: Page) => page.getByRole('dialog', { name: 'Nouvelle indisponibilité' })
const blocs = (page: Page) => page.locator(`.colonne[data-jour="${AUJOURDHUI}"] .bloc-indispo`)

async function ouvrir(page: Page): Promise<void> {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

/** Touche un emplacement libre de mercredi (16 h) : « Pour combler ce trou » s'ouvre (feuille sur iPhone, qu'on referme). */
async function toucherTrou(page: Page): Promise<void> {
  const p = await pointGrille(page, AUJOURDHUI, 16, 0, 10)
  await pointeur(page, 'pointerdown', p)
  await lacher(page, p)
  const items = page.getByRole('dialog', { name: 'Items' })
  if (await items.isVisible().catch(() => false)) {
    await items.getByRole('button', { name: 'Fermer' }).click()
    await expect(items).toHaveCount(0)
  }
}

test.describe('Indisponibilité par bouton', () => {
  test('le bouton est à côté d’« Aujourd’hui » et reste dans la barre, sans déborder', async ({ page }) => {
    await ouvrir(page)
    const barre = page.locator('.calendrier-barre')
    await expect(bouton(page)).toBeVisible()
    const a = (await page.getByRole('button', { name: "Aujourd'hui" }).boundingBox())!
    const b = (await bouton(page).boundingBox())!
    expect(Math.abs(b.y + b.height / 2 - (a.y + a.height / 2))).toBeLessThan(4)
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
    const cadre = (await barre.boundingBox())!
    expect(b.x + b.width).toBeLessThanOrEqual(cadre.x + cadre.width)
    const largeur = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(largeur[0]).toBeLessThanOrEqual(largeur[1])
  })

  test('à 375 px : le bouton reste accessible sous son nom complet et la période n’est pas rognée', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await ouvrir(page)
    await expect(bouton(page)).toBeVisible()
    const periode = await page.locator('.calendrier-periode').evaluate((el) => [el.scrollWidth, el.clientWidth])
    expect(periode[0]).toBeLessThanOrEqual(periode[1])
    const largeur = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(largeur[0]).toBeLessThanOrEqual(largeur[1])
  })

  test('sans emplacement touché : aujourd’hui de l’heure suivante, pendant 1 h', async ({ page }) => {
    await ouvrir(page)
    await bouton(page).click()
    const f = feuille(page)
    await expect(f).toBeVisible()
    await expect(f.getByRole('textbox', { name: 'Titre' })).toHaveValue('')
    await expect(f.getByLabel('Jour')).toHaveValue(AUJOURDHUI)
    await expect(f.getByLabel('Début')).toHaveValue('11:00')
    await expect(f.getByLabel('Fin')).toHaveValue('12:00')
    // Pas de titre : rien à ajouter.
    await expect(f.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  test('après un tap sur un emplacement libre : ce jour, cette heure, pendant 1 h', async ({ page }) => {
    await ouvrir(page)
    await toucherTrou(page)
    await bouton(page).click()
    const f = feuille(page)
    await expect(f).toBeVisible()
    await expect(f.getByLabel('Jour')).toHaveValue(AUJOURDHUI)
    await expect(f.getByLabel('Début')).toHaveValue('16:00')
    await expect(f.getByLabel('Fin')).toHaveValue('17:00')
  })

  test('fin avant début : message en ligne et « Ajouter » désactivé', async ({ page }) => {
    await ouvrir(page)
    await bouton(page).click()
    const f = feuille(page)
    await f.getByRole('textbox', { name: 'Titre' }).fill('Sport')
    await expect(f.getByRole('button', { name: 'Ajouter' })).toBeEnabled()
    await f.getByLabel('Fin').fill('10:00')
    await expect(f.getByText('La fin doit suivre le début.')).toBeVisible()
    await expect(f.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
    await f.getByLabel('Fin').fill('12:30')
    await expect(f.getByText('La fin doit suivre le début.')).toHaveCount(0)
    await expect(f.getByRole('button', { name: 'Ajouter' })).toBeEnabled()
  })

  test('« Ajouter » crée le bloc hachuré au bon jour et à la bonne heure ; ↶ le retire', async ({ page }) => {
    await ouvrir(page)
    await expect(blocs(page)).toHaveCount(0)
    await bouton(page).click()
    const f = feuille(page)
    await f.getByRole('textbox', { name: 'Titre' }).fill('Sport')
    await f.getByRole('button', { name: 'Ajouter' }).click()
    await expect(feuille(page)).toHaveCount(0)

    await expect(blocs(page)).toHaveCount(1)
    await expect(blocs(page)).toHaveAttribute('aria-label', 'Sport, indisponible de 11h à 12h')
    await expect(page.getByText('Indisponibilité ajoutée.')).toBeVisible()

    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(blocs(page)).toHaveCount(0)
  })
})
