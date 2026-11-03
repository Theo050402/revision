import { expect, test, type Page } from '@playwright/test'
import { MAINTENANT, creneau, semer } from './graine-calendrier'
import { deplacer, images, lacher, pointGrille, pointeur, saisir, type Point } from './gestes'

// Sélection par zone (spec §D.1, §D.2, §D.4) : appui long sur un emplacement vide puis glisser trace un lasso sur
// plusieurs jours et plusieurs heures ; au lâcher avec au moins un créneau touché, le mode sélection s'ouvre (barre
// flottante « N sélectionnés », Supprimer, ✕). Données : celles du calendrier (semaine du 2 au 8 nov. 2026, « Stage »
// de 8 h à 13 h lundi, mardi, jeudi et vendredi ; 300 mardi de 14 h à 16 h 45 ; mercredi 290 à 8 h, 291 à 9 h,
// 292 de 13 h 30 à 15 h 30 ; vendredi 301 à 14 h et 291 à 17 h). Gestes : pointeurs tactiles (voir gestes.ts).

const LUNDI = '2026-11-02'
const MARDI = '2026-11-03'
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

/** Attend que les colonnes ne bougent plus (le panneau des items se replie avec une animation). */
async function colonnesPosees(page: Page): Promise<void> {
  const x = () => page.locator(`.colonne[data-jour="${SAMEDI}"]`).evaluate((el) => el.getBoundingClientRect().left)
  let avant = await x()
  await expect
    .poll(async () => {
      await images(page)
      const maintenant = await x()
      const pose = maintenant === avant
      avant = maintenant
      return pose
    })
    .toBe(true)
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

  test('toucher le vide pour quitter garde l’emplacement (préremplissage) sans ouvrir la bibliothèque', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    // Panneau des items replié (le replier ne quitte pas le mode) : le toucher ne doit pas le rouvrir.
    await page.getByRole('button', { name: 'Items' }).tap()
    await expect(page.locator('.coque')).toHaveAttribute('data-replie', 'true')
    await expect(barre(page)).toBeVisible()
    await colonnesPosees(page)
    const vide = await pointGrille(page, SAMEDI, 10, 0, 10)
    await pointeur(page, 'pointerdown', vide)
    await lacher(page, vide)
    await expect(barre(page)).toHaveCount(0)
    await expect(page.locator('.coque')).toHaveAttribute('data-replie', 'true')
    // « + Indisponibilité » part de l'emplacement touché : samedi 10 h, pendant 1 h.
    await page.getByRole('button', { name: '+ Indisponibilité' }).tap()
    const f = page.getByRole('dialog', { name: 'Nouvelle indisponibilité' })
    await expect(f).toBeVisible()
    await expect(f.getByLabel('Jour')).toHaveValue(SAMEDI)
    await expect(f.getByLabel('Début')).toHaveValue('10:00')
    await expect(f.getByLabel('Fin')).toHaveValue('11:00')
  })

  test('hors de la vue : la sélection survit à la semaine suivante, la barre le dit, Supprimer et ↶ portent sur tout', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    await expect(barre(page)).not.toContainText('hors de la vue')
    await page.getByRole('button', { name: 'Semaine suivante' }).tap()
    await expect(page.locator('.calendrier-periode')).toContainText('9')
    await expect(barre(page)).toContainText('2 sélectionnés · 2 hors de la vue')

    await barre(page).getByRole('button', { name: 'Supprimer' }).tap()
    await expect(page.getByText('2 créneaux supprimés')).toBeVisible()
    await expect(barre(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Semaine précédente' }).tap()
    await expect(bloc(page, 'cr-a')).toHaveCount(0)
    await expect(bloc(page, 'cr-d')).toHaveCount(0)

    await page.getByRole('button', { name: 'Annuler' }).tap()
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-11-03T14:00')
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', '2026-11-04T13:30')
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
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

// Déplacer le groupe (spec §D.3) : appui long sur un créneau sélectionné puis glisser ; tout le groupe se soulève et
// suit le doigt avec ses écarts, un emplacement par créneau ; il se pose seulement si chacun tient librement.
test.describe('Déplacer une sélection en groupe', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'sélection au lasso : vue Semaine (iPad)')

  const copie = (page: Page) => page.locator('[data-copie]')
  const membre = (page: Page, id: string) => page.locator(`[data-copie-membre="${id}"]`)
  const atterrissages = (page: Page) => page.locator('[data-atterrissage]')
  const dans = (page: Page, jour: string) => page.locator(`.colonne[data-jour="${jour}"] [data-atterrissage]`)
  const badge = (page: Page) => page.locator('.btn-export .export-badge')

  /** Retours haptiques : `navigator.vibrate` (absent du WebKit de bureau) est ajouté et relevé. */
  async function guetterHaptique(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const w = window as unknown as { __vibrations: unknown[] }
      w.__vibrations = []
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (motif: unknown) => {
          w.__vibrations.push(motif)
          return true
        },
      })
    })
  }
  const vibrations = (page: Page) => page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations)

  /** Point de prise d'un créneau : 10 px sous son haut. */
  async function prise(page: Page, id: string): Promise<Point> {
    const b = (await bloc(page, id).boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + 10 }
  }

  type Image = { phase: string; r: { x: number; y: number; w: number; h: number } | null }
  /** Lâche en `p` et relève, image par image, la copie du membre `id` et la phase de la copie, jusqu'à disparition. */
  const lacherEtSuivre = (page: Page, p: Point, id: string) =>
    page.evaluate(
      ({ x, y, id }) =>
        new Promise<Image[]>((fini) => {
          const sous = document.elementFromPoint(x, y) ?? document.body
          sous.dispatchEvent(
            new PointerEvent('pointerup', {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              button: 0,
              buttons: 0,
            }),
          )
          const vu: Image[] = []
          const debut = performance.now()
          const image = () => {
            const boite = document.querySelector<HTMLElement>('[data-copie]')!
            const el = document.querySelector<HTMLElement>(`[data-copie-membre="${id}"]`)
            const r = el?.getBoundingClientRect()
            vu.push({ phase: boite.dataset.phase ?? '', r: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null })
            if (boite.dataset.visible !== 'true' || performance.now() - debut > 3000) return fini(vu)
            requestAnimationFrame(image)
          }
          image()
        }),
      { x: p.x, y: p.y, id },
    )

  test('appui long sur un sélectionné, +1 jour : tout le groupe suit, un emplacement par créneau ; lâcher, ↶ en un pas', async ({ page }) => {
    await guetterHaptique(page)
    // Sans 304 (jeudi 14 h) : 292 (mer. 13 h 30 – 15 h 30) tient le jeudi.
    await ouvrir(page, { sansCreneaux: ['c3:304'] })
    await lassoLundiMercredi(page)
    const origineD = (await bloc(page, 'cr-d').boundingBox())!
    const de = await prise(page, 'cr-a')
    const vers = await pointGrille(page, MERCREDI, 14, 0, 10)
    await saisir(page, de, vers)

    // Tout le groupe se soulève : la copie de l'ancre et celle de l'autre membre ; les originaux restent, estompés.
    await expect(copie(page)).toHaveAttribute('data-visible', 'true')
    await expect(page.locator('[data-copie-membre]')).toHaveCount(1)
    await expect(membre(page, 'cr-d')).toBeVisible()
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-source', 'true')
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-source', 'true')
    await expect(bloc(page, 'cr-d')).toHaveCSS('opacity', '0.35')

    // Un emplacement par créneau, à sa nouvelle place (écarts de jours et d'heures gardés).
    await expect(atterrissages(page)).toHaveCount(2)
    await expect(dans(page, MERCREDI)).toHaveAttribute('data-atterrissage', `${MERCREDI}T14:00`)
    await expect(dans(page, JEUDI)).toHaveAttribute('data-atterrissage', `${JEUDI}T13:30`)
    await expect(page.locator('[data-atterrissage][data-refus]')).toHaveCount(0)

    // La copie du membre suit le doigt 1:1, à son écart d'origine (son centre : ni l'échelle ni l'angle ne le déplacent).
    await page.waitForTimeout(400) // soulèvement et frémissement terminés
    const centreMembre = async () => {
      const r = (await membre(page, 'cr-d').boundingBox())!
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    const c1 = await centreMembre()
    expect(Math.abs(c1.x - (origineD.x + origineD.width / 2) - (vers.x - de.x))).toBeLessThan(1)
    expect(Math.abs(c1.y - (origineD.y + origineD.height / 2) - (vers.y - de.y))).toBeLessThan(1)
    const ailleurs = { x: vers.x + 9, y: vers.y + 4 }
    await deplacer(page, vers, ailleurs, 2)
    const c2 = await centreMembre()
    expect(Math.abs(c2.x - c1.x - 9)).toBeLessThan(0.5)
    expect(Math.abs(c2.y - c1.y - 4)).toBeLessThan(0.5)
    await deplacer(page, ailleurs, vers, 2)

    // Au lâcher, la copie du membre arrive exactement sur son emplacement, où le créneau est posé, puis s'efface.
    const trace = await lacherEtSuivre(page, vers, 'cr-d')
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MERCREDI}T14:00`)
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${JEUDI}T13:30`)
    const arrivee = trace.find((i) => i.phase === 'relais' && i.r !== null)
    expect(arrivee).toBeDefined()
    const pose = (await bloc(page, 'cr-d').boundingBox())!
    expect(Math.abs(arrivee!.r!.x - pose.x)).toBeLessThan(1.5)
    expect(Math.abs(arrivee!.r!.y - pose.y)).toBeLessThan(1.5)
    expect(Math.abs(arrivee!.r!.h - pose.height)).toBeLessThan(1.5)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
    await expect(page.locator('[data-copie-membre]')).toHaveCount(0)
    expect(await vibrations(page)).toContainEqual([10, 40, 10]) // succès
    // La sélection est gardée.
    await expect(barre(page)).toContainText('2 sélectionnés')
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-selectionne', '')
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-selectionne', '')

    // Un seul pas d'annulation pour tout le groupe.
    await page.getByRole('button', { name: 'Annuler' }).tap()
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${MERCREDI}T13:30`)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('un groupe qui tomberait sur le stage est refusé : emplacements rouges, retour à l’origine, rien d’écrit', async ({ page }) => {
    await guetterHaptique(page)
    await ouvrir(page)
    await lassoLundiMercredi(page)
    const origineD = (await bloc(page, 'cr-d').boundingBox())!
    const de = await prise(page, 'cr-a')
    // 2 h plus haut : 300 à mardi 12 h, dans le stage (8 h – 13 h) ; 292 irait mercredi 11 h 30, libre.
    const vers = await pointGrille(page, MARDI, 12, 0, 10)
    await saisir(page, de, vers)
    await expect(dans(page, MARDI)).toHaveAttribute('data-refus', 'true')
    await expect(page.locator(`.colonne[data-jour="${MARDI}"]`)).toHaveAttribute('data-refus', 'true')
    await expect(dans(page, MERCREDI)).toHaveAttribute('data-atterrissage', `${MERCREDI}T11:30`)
    await expect(dans(page, MERCREDI)).toHaveAttribute('data-refus', 'true')
    await expect(copie(page)).toHaveAttribute('data-refus', 'true')
    await expect(page.locator('[data-copie-groupe]')).toHaveAttribute('data-refus', 'true')

    // Au lâcher, la copie du membre revient exactement sur son créneau d'origine, puis tout s'efface.
    const trace = await lacherEtSuivre(page, vers, 'cr-d')
    const arrivee = trace.find((i) => i.phase === 'relais' && i.r !== null)
    expect(arrivee).toBeDefined()
    expect(Math.abs(arrivee!.r!.x - origineD.x)).toBeLessThan(1.5)
    expect(Math.abs(arrivee!.r!.y - origineD.y)).toBeLessThan(1.5)
    expect(Math.abs(arrivee!.r!.w - origineD.width)).toBeLessThan(1.5)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
    expect(await vibrations(page)).toContainEqual([20, 60, 20]) // erreur
    expect(await vibrations(page)).not.toContainEqual([10, 40, 10])

    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${MERCREDI}T13:30`)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    await expect(barre(page)).toContainText('2 sélectionnés')
  })

  test('vigilance 4 : un créneau exporté du groupe, ↶ après le déplacement le remet « non modifié »', async ({ page }) => {
    await ouvrir(page, { sansCreneaux: ['c3:304'] })
    const avant = Number(await badge(page).textContent())
    await lassoLundiMercredi(page)
    // 292 (cr-d) est exporté : pas de point « non exporté ».
    await expect(bloc(page, 'cr-d').locator('[data-marque="non-exporte"]')).toHaveCount(0)
    const vers = await pointGrille(page, MERCREDI, 14, 0, 10)
    await saisir(page, await prise(page, 'cr-a'), vers)
    await lacher(page, vers)
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${JEUDI}T13:30`)
    // Déplacé : modifié depuis l'export.
    await expect(bloc(page, 'cr-d').locator('[data-marque="non-exporte"]')).toHaveCount(1)
    await expect(badge(page)).toHaveText(String(avant + 1))

    await page.getByRole('button', { name: 'Annuler' }).tap()
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${MERCREDI}T13:30`)
    await expect(bloc(page, 'cr-d').locator('[data-marque="non-exporte"]')).toHaveCount(0)
    await expect(badge(page)).toHaveText(String(avant))
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('appui long sur un créneau non sélectionné : il se déplace seul, la sélection ne change pas', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    // 301 (vendredi 14 h) → samedi 14 h.
    const vers = await pointGrille(page, SAMEDI, 14, 0, 10)
    await saisir(page, await prise(page, 'cr-f'), vers)
    await expect(atterrissages(page)).toHaveCount(1)
    await expect(page.locator('[data-copie-membre]')).toHaveCount(0)
    await expect(bloc(page, 'cr-a')).not.toHaveAttribute('data-source', 'true')
    await lacher(page, vers)
    await expect(bloc(page, 'cr-f')).toHaveAttribute('data-debut', `${SAMEDI}T14:00`)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', `${MERCREDI}T13:30`)
    await expect(barre(page)).toContainText('2 sélectionnés')
    await expect(bloc(page, 'cr-f')).not.toHaveAttribute('data-selectionne', '')
  })

  test('600 ms contre le bord droit : semaine suivante, le groupe continue et se pose ; la barre compte le hors-vue', async ({ page }) => {
    await ouvrir(page)
    await lassoLundiMercredi(page)
    const d = (await page.locator('.calendrier-defilement').boundingBox())!
    const bord = { x: d.x + d.width - 8, y: (await pointGrille(page, MARDI, 14, 0, 10)).y }
    await saisir(page, await prise(page, 'cr-a'), bord)
    await expect(page.locator('.colonne[data-jour="2026-11-15"]')).toHaveCount(1, { timeout: 3000 })
    await expect(copie(page)).toHaveAttribute('data-visible', 'true')
    // L'ancre vise dimanche 15 (+12 jours) ; 292 irait lundi 16, hors de la vue : un seul emplacement visible.
    await expect(dans(page, '2026-11-15')).toHaveAttribute('data-atterrissage', '2026-11-15T14:00')
    await expect(atterrissages(page)).toHaveCount(1)
    await lacher(page, bord)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-11-15T14:00')
    await expect(barre(page)).toContainText('2 sélectionnés · 1 hors de la vue')
    await page.getByRole('button', { name: 'Semaine suivante' }).tap()
    await expect(bloc(page, 'cr-d')).toHaveAttribute('data-debut', '2026-11-16T13:30')
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

    // Tâche 12 : groupe soulevé (+1 jour, accepté) puis visé sur le stage (refus).
    test(`captures groupe ${theme}`, async ({ page }) => {
      await ouvrir(page, { sansCreneaux: ['c3:304'], ...(theme === 'sombre' ? { reglages: { theme: 'sombre' } } : {}) })
      await lassoLundiMercredi(page)
      const b = (await bloc(page, 'cr-a').boundingBox())!
      const de = { x: b.x + b.width / 2, y: b.y + 10 }
      const vers = await pointGrille(page, MERCREDI, 14, 0, 10)
      await saisir(page, de, { x: vers.x - 30, y: vers.y })
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${dossier}/task-12-ipad-${theme}-groupe.png` })
      const stage = await pointGrille(page, MARDI, 12, 0, 10)
      await deplacer(page, { x: vers.x - 30, y: vers.y }, stage)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dossier}/task-12-ipad-${theme}-refus.png` })
      await lacher(page, stage)
    })
  }
})
