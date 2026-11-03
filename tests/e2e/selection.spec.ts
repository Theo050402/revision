import { expect, test, type Page } from '@playwright/test'
import { MAINTENANT, creneau, semer } from './graine-calendrier'
import { deplacer, images, lacher, pointGrille, pointeur, saisir, type Point } from './gestes'

// Sélection par zone (spec §D.1, §D.2, §D.4) : appui long sur un emplacement vide puis glisser trace un lasso sur
// plusieurs jours et plusieurs heures ; au lâcher avec au moins un créneau touché, le mode sélection s'ouvre (barre
// flottante « N sélectionnés », Supprimer, ✕). Données : celles du calendrier (semaine du 2 au 8 nov. 2026, « Stage »
// de 8 h à 13 h lundi, mardi, jeudi et vendredi ; 300 mardi de 14 h à 16 h 45 ; mercredi 290 à 8 h, 291 à 9 h,
// 292 de 13 h 30 à 15 h 30 ; vendredi 301 à 14 h et 291 à 17 h). Gestes : pointeurs tactiles (voir gestes.ts).

const LUNDI = '2026-11-02'
const MERCREDI = '2026-11-04'
const JEUDI = '2026-11-05'
const VENDREDI = '2026-11-06'
const SAMEDI = '2026-11-07'
const DIMANCHE = '2026-11-08'

const bloc = (page: Page, id: string) => page.locator(`[data-creneau="${id}"]`)
const barre = (page: Page) => page.getByRole('toolbar', { name: 'Sélection' })
const lasso = (page: Page) => page.locator('[data-lasso]')
const selectionnes = (page: Page) => page.locator('.bloc-creneau[data-selectionne]')

async function ouvrir(page: Page, extra: Parameters<typeof semer>[1] = {}): Promise<void> {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, extra)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

/** Appui long sur `de` (vide), glisser jusqu'à `vers`, lâcher. */
async function tracer(page: Page, de: Point, vers: Point): Promise<void> {
  await saisir(page, de, vers)
  await lacher(page, vers)
}

/** Lasso de lundi 15 h (vide) à mercredi 14 h : il touche 300 (mardi 14 h) et 292 (mercredi 13 h 30), rien d'autre. */
async function lassoLundiMercredi(page: Page): Promise<void> {
  await tracer(page, await pointGrille(page, LUNDI, 15, 0, 6), await pointGrille(page, MERCREDI, 14, 0, 0))
  await expect(barre(page)).toContainText('2 sélectionnés')
}

test.describe('Sélection par zone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'lasso sur plusieurs jours : vue Semaine (iPad)')

  test('lasso sur plusieurs jours : rectangle visible, créneaux touchés en direct ; au lâcher, « 2 sélectionnés »', async ({ page }) => {
    await ouvrir(page)
    const de = await pointGrille(page, LUNDI, 15, 0, 6)
    const vers = await pointGrille(page, MERCREDI, 14, 0, 0)
    await saisir(page, de, vers)

    // Le rectangle couvre lundi à mercredi, de 14 h au point d'appui.
    await expect(lasso(page)).toBeVisible()
    const r = (await lasso(page).boundingBox())!
    const lundi = (await page.locator(`.colonne[data-jour="${LUNDI}"]`).boundingBox())!
    const mercredi = (await page.locator(`.colonne[data-jour="${MERCREDI}"]`).boundingBox())!
    expect(Math.abs(r.x - lundi.x)).toBeLessThan(4)
    expect(Math.abs(r.x + r.width - (mercredi.x + mercredi.width))).toBeLessThan(4)
    expect(Math.abs(r.y - vers.y)).toBeLessThan(3)
    expect(Math.abs(r.y + r.height - de.y)).toBeLessThan(3)

    // En direct, avant le lâcher : 300 et 292 seulement ; la barre n'est pas encore là.
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-selectionne', '')
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-selectionne', '')
    await expect(selectionnes(page)).toHaveCount(2)
    await expect(barre(page)).toHaveCount(0)

    await lacher(page, vers)
    await expect(lasso(page)).toHaveCount(0)
    await expect(barre(page)).toBeVisible()
    await expect(barre(page)).toContainText('2 sélectionnés')
    await expect(barre(page).getByRole('button', { name: 'Supprimer' })).toBeVisible()
    await expect(barre(page).getByRole('button', { name: 'Quitter la sélection' })).toBeVisible()
    await expect(selectionnes(page)).toHaveCount(2)
    // Cibles tactiles de la barre : 44 px au moins.
    for (const nom of ['Supprimer', 'Quitter la sélection']) {
      const b = (await barre(page).getByRole('button', { name: nom }).boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(44)
      expect(b.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('lâcher sans créneau touché : rien ; les indisponibilités ne sont jamais sélectionnées', async ({ page }) => {
    await ouvrir(page)
    // Samedi 9 h → jeudi 12 h : « Stage » jeudi et vendredi, aucun créneau.
    const de = await pointGrille(page, SAMEDI, 9, 0, 6)
    const vers = await pointGrille(page, JEUDI, 12, 0, 0)
    await saisir(page, de, vers)
    await expect(lasso(page)).toBeVisible()
    await expect(page.locator('[data-indispo][data-selectionne]')).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)
    await lacher(page, vers)
    await expect(lasso(page)).toHaveCount(0)
    await expect(barre(page)).toHaveCount(0)
    // Aucune indisponibilité tracée non plus (l'appui long sur vide ne la crée plus).
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('toucher un créneau l’ajoute ou le retire, sans ouvrir sa fiche', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    await bloc(page, 'cr-b').tap()
    await expect(barre(page)).toContainText('3 sélectionnés')
    await expect(bloc(page, 'cr-b')).toHaveAttribute('data-selectionne', '')
    await bloc(page, 'cr-a').tap()
    await expect(barre(page)).toContainText('2 sélectionnés')
    await expect(bloc(page, 'cr-a')).not.toHaveAttribute('data-selectionne', '')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Un seul : le singulier.
    await bloc(page, 'cr-b').tap()
    await expect(barre(page)).toContainText('1 sélectionné')
    await expect(barre(page)).not.toContainText('sélectionnés')
  })

  test('toucher le vide, ✕ ou Échap quitte le mode', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    const vide = await pointGrille(page, SAMEDI, 10, 0, 10)
    await pointeur(page, 'pointerdown', vide)
    await lacher(page, vide)
    await expect(barre(page)).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)
    // Le toucher a servi à quitter : « Pour combler ce trou » ne s'ouvre pas.
    await expect(page.getByRole('heading', { name: 'Pour combler ce trou' })).toHaveCount(0)

    await lassoLundiMercredi(page)
    await barre(page).getByRole('button', { name: 'Quitter la sélection' }).tap()
    await expect(barre(page)).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)

    await lassoLundiMercredi(page)
    await page.keyboard.press('Escape')
    await expect(barre(page)).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)

    // Hors du mode, toucher un créneau ouvre de nouveau sa fiche.
    await bloc(page, 'cr-a').tap()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('un deuxième lasso ajoute à la sélection', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    // Samedi 15 h → vendredi 17 h 15 : 301 (14 h–16 h 15) et 291 (17 h).
    await tracer(page, await pointGrille(page, SAMEDI, 15, 0, 6), await pointGrille(page, VENDREDI, 17, 15, 0))
    await expect(barre(page)).toContainText('4 sélectionnés')
    for (const id of ['cr-a', 'cr-d', 'cr-f', 'cr-g']) await expect(bloc(page, id)).toHaveAttribute('data-selectionne', '')
  })

  test('ouvrir un autre écran quitte le mode', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    await page.getByRole('button', { name: 'Réglages' }).tap()
    await page.getByRole('button', { name: 'Retour au calendrier' }).tap()
    await expect(page.locator('.bloc-creneau').first()).toBeAttached()
    await expect(barre(page)).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)
  })

  test('supprimer : les créneaux partent, « 2 créneaux supprimés », ↶ les ramène en un pas', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    await barre(page).getByRole('button', { name: 'Supprimer' }).tap()
    await expect(bloc(page, 'cr-a')).toHaveCount(0)
    await expect(bloc(page, 'cr-d')).toHaveCount(0)
    await expect(bloc(page, 'cr-b')).toHaveCount(1)
    await expect(page.getByText('2 créneaux supprimés')).toBeVisible()
    await expect(barre(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Annuler' }).tap()
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-11-03T14:00')
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', '2026-11-04T13:30')
    // Un seul pas : plus rien à annuler.
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('supprimer un seul créneau : « 1 créneau supprimé »', async ({ page }) => {
    await ouvrir(page)
    // Samedi 15 h → vendredi 16 h : 301 seulement.
    await tracer(page, await pointGrille(page, SAMEDI, 15, 0, 6), await pointGrille(page, VENDREDI, 16, 0, 0))
    await expect(barre(page)).toContainText('1 sélectionné')
    await barre(page).getByRole('button', { name: 'Supprimer' }).tap()
    await expect(bloc(page, 'cr-f')).toHaveCount(0)
    await expect(page.getByText('1 créneau supprimé')).toBeVisible()
  })

  test('défilement pendant le tracé : la grille défile au bas, le rectangle et la sélection restent justes', async ({ page }) => {
    await ouvrir(page, {
      creneaux: [creneau('cr-s1', 'c1:290', '2026-11-07T21:00', 60), creneau('cr-s2', 'c1:292', '2026-11-08T22:00', 45)],
    })
    const defil = page.locator('.calendrier-defilement')
    await defil.evaluate((el) => {
      el.scrollTop = 0
    })
    await images(page)
    const de = await pointGrille(page, SAMEDI, 16, 0, 0)
    const cadre = (await defil.boundingBox())!
    const dimanche = await pointGrille(page, DIMANCHE, 16)
    const bas = { x: dimanche.x, y: cadre.y + cadre.height - 4 }
    await saisir(page, de, bas)

    // Le doigt reste contre le bas : la grille défile jusqu'au bout.
    const max = await defil.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(max).toBeGreaterThan(40)
    await expect.poll(() => defil.evaluate((el) => el.scrollTop), { timeout: 5000 }).toBe(max)

    // Le haut du rectangle reste accroché à samedi 16 h (coordonnées de grille, pas d'écran).
    const ancre = await pointGrille(page, SAMEDI, 16, 0, 0)
    expect(Math.abs(ancre.y - de.y)).toBeGreaterThan(40) // la grille a bien bougé sous le doigt
    expect(Math.abs((await lasso(page).boundingBox())!.y - ancre.y)).toBeLessThan(3)
    // Tout ce qui est sous le rectangle, jusqu'au bas de la grille.
    await expect(bloc(page, 'cr-s1')).toHaveAttribute('data-selectionne', '')
    await expect(bloc(page, 'cr-s2')).toHaveAttribute('data-selectionne', '')

    // Le doigt remonte à dimanche 21 h 30 : 22 h n'est plus touché, 21 h l'est toujours.
    const vers = await pointGrille(page, DIMANCHE, 21, 30, 0)
    await deplacer(page, bas, vers)
    await expect(bloc(page, 'cr-s2')).not.toHaveAttribute('data-selectionne', '')
    await expect(bloc(page, 'cr-s1')).toHaveAttribute('data-selectionne', '')
    const r = (await lasso(page).boundingBox())!
    expect(Math.abs(r.y + r.height - vers.y)).toBeLessThan(3)
    await lacher(page, vers)
    await expect(barre(page)).toContainText('1 sélectionné')
  })

  test('défilement simple : un glisser sans appui long ne trace pas de lasso', async ({ page }) => {
    await ouvrir(page)
    // Le navigateur garde le défilement vertical au doigt sur la grille.
    await expect(page.locator('.calendrier-defilement')).toHaveCSS('touch-action', 'pan-y')
    const de = await pointGrille(page, SAMEDI, 10, 0, 10)
    const vers = { x: de.x, y: de.y + 120 }
    // Le doigt bouge tout de suite (avant 150 ms) : c'est un défilement.
    await pointeur(page, 'pointerdown', de)
    await deplacer(page, de, vers)
    await page.waitForTimeout(250)
    await deplacer(page, vers, { x: vers.x - 200, y: vers.y + 60 })
    await expect(lasso(page)).toHaveCount(0)
    await lacher(page, { x: vers.x - 200, y: vers.y + 60 })
    await expect(lasso(page)).toHaveCount(0)
    await expect(barre(page)).toHaveCount(0)
    await expect(selectionnes(page)).toHaveCount(0)
    // Ni tap : « Pour combler ce trou » ne s'ouvre pas.
    await expect(page.getByRole('heading', { name: 'Pour combler ce trou' })).toHaveCount(0)
  })
})

// Captures (rapport de la tâche 11 des améliorations) : `CAPTURES=1 npx playwright test selection --project=ipad -g captures`.
test.describe('captures : sélection', () => {
  test.skip(!process.env.CAPTURES, 'captures à la demande')
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'iPad')
  const dossier = '.superpowers/sdd/2026-11-02-ameliorations/shots'

  for (const theme of ['clair', 'sombre'] as const) {
    test(`captures sélection ${theme}`, async ({ page }) => {
      await ouvrir(page, theme === 'sombre' ? { reglages: { theme: 'sombre' } } : {})
      const de = await pointGrille(page, LUNDI, 15, 0, 6)
      const vers = await pointGrille(page, MERCREDI, 14, 0, 0)
      await saisir(page, de, vers)
      await page.screenshot({ path: `${dossier}/task-11-ipad-${theme}-lasso.png` })
      await lacher(page, vers)
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${dossier}/task-11-ipad-${theme}-barre.png` })
    })
  }
})
