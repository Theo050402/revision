import { expect, test, type Locator, type Page } from '@playwright/test'
import { AUJOURDHUI, MAINTENANT, creneau, semer } from './graine-calendrier'

// « Maintenant » figé : mercredi 4 novembre 2026, 10 h 30 à Paris (semaine ISO 45).

async function ouvrir(page: Page, extra?: Parameters<typeof semer>[1]) {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, extra)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

async function choisirVue(page: Page, vue: 'Semaine' | 'Jour' | 'Mois') {
  await page.getByRole('button', { name: vue, exact: true }).click()
  await expect(page.getByRole('button', { name: vue, exact: true })).toHaveAttribute('aria-pressed', 'true')
}

const colonne = (page: Page, jour: string) => page.locator(`.colonne[data-jour="${jour}"]`)
const titre = (page: Page) => page.locator('.barre-titre')

async function echelle(page: Page) {
  const grille = page.locator('.grille')
  return {
    px: Number(await grille.getAttribute('data-px-heure')),
    debut: Number(await grille.getAttribute('data-plage-debut')),
    fin: Number(await grille.getAttribute('data-plage-fin')),
  }
}

const num = (s: string | null | undefined) => parseFloat(s ?? '')

/** Haut et hauteur d'un bloc, en px, depuis son style en ligne. */
async function geometrie(bloc: Locator) {
  const style = await bloc.evaluate((el) => ({ top: (el as HTMLElement).style.top, height: (el as HTMLElement).style.height }))
  return { top: num(style.top), height: num(style.height) }
}

test('les blocs sont dans la bonne colonne, à la bonne place, avec leurs attributs', async ({ page }) => {
  await ouvrir(page)
  await choisirVue(page, 'Semaine')
  await expect(page.locator('.colonne')).toHaveCount(7)
  await expect(page.locator('.colonne').first()).toHaveAttribute('data-jour', '2026-11-02') // lundi

  const { px, debut } = await echelle(page)
  expect(debut).toBe(420) // bornes 07:00–23:00, rien avant

  // Mardi 3 nov. : 300 de 14 h à 16 h 45 (165 min), pas encore exporté.
  const a = colonne(page, '2026-11-03').locator('[data-creneau="cr-a"]')
  await expect(a).toHaveCount(1)
  await expect(a).toHaveAttribute('data-debut', '2026-11-03T14:00')
  expect(await geometrie(a)).toEqual({ top: ((14 * 60 - debut) * px) / 60, height: (165 * px) / 60 })
  await expect(a).toHaveAttribute(
    'aria-label',
    '300 · Tumeurs du col utérin, T1 · 22 p · 2h45, de 14h00 à 16h45, pas encore exporté',
  )
  await expect(a.locator('.bloc-point')).toHaveCount(1)
  await expect(a.locator('.bloc-coche')).toHaveCount(0)

  // Mercredi : une partie « fait » déjà exportée → coche, pas de point.
  const b = colonne(page, '2026-11-04').locator('[data-creneau="cr-b"]')
  await expect(b).toHaveCount(1)
  await expect(b.locator('.bloc-coche')).toHaveCount(1)
  await expect(b.locator('.bloc-point')).toHaveCount(0)
  await expect(b).toHaveAttribute('aria-label', /T2 · 18 p · 1h · 1\/2, de 9h00 à 10h00, fait$/)

  // Les créneaux d'un autre jour ne sont pas dans cette colonne.
  await expect(colonne(page, '2026-11-03').locator('[data-creneau="cr-b"]')).toHaveCount(0)

  // Indisponibilité : lundi 8 h–13 h, hachurée, avec son titre.
  const stage = colonne(page, '2026-11-02').locator('[data-indispo="in-stage"]')
  await expect(stage).toHaveCount(1)
  expect(await geometrie(stage)).toEqual({ top: ((8 * 60 - debut) * px) / 60, height: (5 * px) })
  await expect(stage).toContainText('Stage')
  await expect(stage).toHaveCSS('background-image', /repeating-linear-gradient/)

  // Couleur du collège (Gynécologie = index 1 = rose) et trait d'encre à gauche.
  await expect(a).toHaveCSS('border-left-width', '3px')
  await expect(a).toHaveCSS('--teinte', '#ff9ac8')

  // Une seule ligne « maintenant », dans la colonne du jour, à 10 h 30.
  await expect(page.locator('.maintenant')).toHaveCount(1)
  const ligne = colonne(page, AUJOURDHUI).locator('.maintenant')
  await expect(ligne).toHaveCount(1)
  expect(await geometrie(ligne).then((g) => g.top)).toBe(((10 * 60 + 30 - debut) * px) / 60)
  await expect(colonne(page, AUJOURDHUI)).toHaveAttribute('data-aujourdhui', 'true')
})

test('les blocs lisent « 300 · titre » puis « T1 · 22 p · 2h45 » (iPad)', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad')
  await ouvrir(page)
  const a = colonne(page, '2026-11-03').locator('[data-creneau="cr-a"]')
  await expect(a.locator('.bloc-titre')).toContainText('300 · Tumeurs du col utérin')
  await expect(a.locator('.bloc-meta')).toHaveText('T1 · 22 p · 2h45')
  // Bloc de 30 min (24 px) : une seule ligne, sans détail.
  const court = colonne(page, '2026-11-06').locator('[data-creneau="cr-g"]')
  await expect(court.locator('.bloc-meta')).toHaveCount(0)
  await expect(court.locator('.bloc-titre')).toBeVisible()
})

test('un créneau hors des bornes de la journée reste visible : la grille s\'étend', async ({ page }) => {
  const reglages = {
    rythme: { minutes: 60, pages: 8 },
    dureeMin: 30,
    dureeMax: 180,
    coefsTours: [1, 0.5, 0.35, 0.25],
    pauseMultiple: 10,
    journee: { debut: '09:00', fin: '18:00' }, // rétrécie après coup
    pas: 15,
    rappel: 0,
    theme: 'auto',
  }
  await ouvrir(page, { creneaux: [creneau('cr-tot', 'c1:290', '2026-11-05T06:00', 60)], reglages })
  await choisirVue(page, 'Semaine')
  const { px, debut, fin } = await echelle(page)
  expect(debut).toBe(360) // 06:00 ∪ 09:00
  expect(fin).toBe(1080)
  const tot = colonne(page, '2026-11-05').locator('[data-creneau="cr-tot"]')
  await expect(tot).toBeAttached()
  expect((await geometrie(tot)).top).toBe(0)
  // 08:00 (cr-c, mercredi) est avant les 09:00 : visible, et la zone hors bornes est grisée.
  await expect(colonne(page, AUJOURDHUI).locator('[data-creneau="cr-c"]')).toBeAttached()
  const grise = colonne(page, AUJOURDHUI).locator('.hors-bornes')
  await expect(grise).toHaveCount(1)
  expect((await grise.evaluate((el) => (el as HTMLElement).style.height))).toBe(`${(180 * px) / 60}px`)
})

test('navigation : semaine suivante, précédente, « Aujourd\'hui »', async ({ page }) => {
  await ouvrir(page)
  await choisirVue(page, 'Semaine')
  const periode = page.locator('.calendrier-periode')
  await expect(titre(page)).toHaveText(/Novembre\s*semaine 45/)
  await expect(periode).toHaveText('2 – 8 nov. 2026')

  await page.getByRole('button', { name: 'Semaine suivante' }).click()
  await expect(titre(page)).toHaveText(/Novembre\s*semaine 46/)
  await expect(periode).toHaveText('9 – 15 nov. 2026')
  await expect(page.locator('.colonne').first()).toHaveAttribute('data-jour', '2026-11-09')
  // Lundi 9 : deux créneaux (510 min) ; plus de ligne « maintenant ».
  await expect(colonne(page, '2026-11-09').locator('[data-creneau]')).toHaveCount(2)
  await expect(page.locator('.maintenant')).toHaveCount(0)
  await expect(page.locator('[data-creneau="cr-a"]')).toHaveCount(0) // seuls les jours affichés sont rendus

  await page.getByRole('button', { name: 'Semaine précédente' }).click()
  await page.getByRole('button', { name: 'Semaine précédente' }).click()
  await expect(titre(page)).toHaveText(/Octobre\s*semaine 44/)
  await expect(periode).toHaveText('26 oct. – 1 nov. 2026')

  await page.getByRole('button', { name: 'Aujourd\'hui' }).click()
  await expect(titre(page)).toHaveText(/Novembre\s*semaine 45/)
  await expect(page.locator('.maintenant')).toHaveCount(1)
})

test('le balayage horizontal change de semaine', async ({ page }) => {
  await ouvrir(page)
  await choisirVue(page, 'Semaine')
  await expect(page.locator('.calendrier-defilement')).toHaveCSS('touch-action', 'pan-y')
  const balayer = (de: number, vers: number) =>
    page.locator('.calendrier-defilement').evaluate(
      (el, [x0, x1]) => {
        const evt = (type: string, x: number) =>
          el.dispatchEvent(
            new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 300, bubbles: true }),
          )
        evt('pointerdown', x0)
        evt('pointerup', x1)
      },
      [de, vers],
    )
  await balayer(400, 150) // vers la gauche : semaine suivante
  await expect(titre(page)).toHaveText(/semaine 46/)
  await balayer(150, 400) // vers la droite : semaine précédente
  await expect(titre(page)).toHaveText(/semaine 45/)
  await balayer(300, 280) // trop court : rien
  await expect(titre(page)).toHaveText(/semaine 45/)
})

test('vue Jour : une colonne, jour par jour', async ({ page }) => {
  await ouvrir(page)
  await choisirVue(page, 'Jour')
  await expect(page.locator('.colonne')).toHaveCount(1)
  await expect(page.locator('.colonne')).toHaveAttribute('data-jour', AUJOURDHUI)
  await expect(page.locator('.calendrier-periode')).toHaveText('mercredi 4 novembre')
  await page.getByRole('button', { name: 'Jour suivant' }).click()
  await expect(page.locator('.colonne')).toHaveAttribute('data-jour', '2026-11-05')
  await expect(page.locator('[data-creneau="cr-e"]')).toBeAttached()
})

test('vue Mois : charge par jour, teinte d\'encre, tap ouvre le jour', async ({ page }) => {
  await ouvrir(page)
  await choisirVue(page, 'Mois')
  const cellule = (j: string) => page.locator(`.mois-jour[data-jour="${j}"]`)
  await expect(page.locator('.mois-vue')).toHaveAttribute('data-mois', '2026-11')
  await expect(page.locator('.mois-jour')).toHaveCount(42) // du lun. 26 oct. au dim. 6 déc.

  await expect(cellule('2026-11-03')).toHaveAttribute('data-charge', '165')
  await expect(cellule('2026-11-03')).toContainText('2h45')
  await expect(cellule('2026-11-03')).toHaveAttribute('style', /--charge: 0\.34375/) // 165 / 480
  await expect(cellule('2026-11-09')).toHaveAttribute('data-charge', '510')
  await expect(cellule('2026-11-09')).toHaveAttribute('style', /--charge: 1;/) // plafonnée
  await expect(cellule('2026-11-02')).toHaveAttribute('data-charge', '0')
  await expect(cellule('2026-11-02')).not.toContainText('h')
  await expect(cellule(AUJOURDHUI)).toHaveAttribute('aria-current', 'date')
  await expect(cellule('2026-11-03')).toHaveAttribute('aria-label', 'mardi 3 novembre, 2h45 planifiées')

  // Cibles tactiles ≥ 44 px.
  for (const j of ['2026-11-02', '2026-11-08', '2026-12-06']) {
    const boite = await cellule(j).boundingBox()
    expect(boite!.width).toBeGreaterThanOrEqual(44)
    expect(boite!.height).toBeGreaterThanOrEqual(44)
  }

  // Mois suivant.
  await page.getByRole('button', { name: 'Mois suivant' }).click()
  await expect(page.locator('.calendrier-periode')).toHaveText('Décembre 2026')
  await expect(titre(page)).toHaveText(/Décembre/)
  await page.getByRole('button', { name: 'Aujourd\'hui' }).click()
  await expect(titre(page)).toHaveText(/Novembre/)

  // Un tap ouvre le jour dans la vue Jour.
  await cellule('2026-11-10').click()
  await expect(page.getByRole('button', { name: 'Jour', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.colonne')).toHaveAttribute('data-jour', '2026-11-10')
  await expect(page.locator('[data-creneau="cr-m3"]')).toBeAttached()
})

test('les boutons de navigation font au moins 44 px et prennent le focus', async ({ page }) => {
  await ouvrir(page)
  const boutons = page.locator('.calendrier-barre button')
  // Précédent, Aujourd'hui, suivant, « + Indisponibilité ».
  expect(await boutons.count()).toBe(4)
  for (let i = 0; i < 4; i++) {
    const boite = await boutons.nth(i).boundingBox()
    expect(boite!.width, `largeur ${i}`).toBeGreaterThanOrEqual(44)
    expect(boite!.height, `hauteur ${i}`).toBeGreaterThanOrEqual(44)
  }
  await page.keyboard.press('Tab')
  await boutons.first().focus()
  await expect(boutons.first()).toBeFocused()
})

test('minuit passé : « aujourd\'hui » passent au jour suivant', async ({ page }) => {
  // 23 h 59 min 30 s à Paris ; le minuteur de l'app tourne sur l'horloge simulée.
  await page.clock.install({ time: new Date('2026-11-04T22:59:30Z') })
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
  await choisirVue(page, 'Jour')
  await expect(page.locator('.colonne')).toHaveAttribute('data-jour', '2026-11-04')
  await expect(page.locator('.colonne')).toHaveAttribute('data-aujourdhui', 'true')

  await page.clock.runFor(60_000)
  // Le jour affiché était « aujourd'hui » : il suit.
  await expect(page.locator('.colonne')).toHaveAttribute('data-jour', '2026-11-05')
  await expect(page.locator('.calendrier-periode')).toHaveText('jeudi 5 novembre')
  await expect(page.locator('.jour-tete[data-aujourdhui="true"] b')).toHaveText('5')
  await expect(page.locator('.colonne')).toHaveAttribute('data-aujourdhui', 'true')
})
