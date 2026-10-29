import { expect, test, type Locator, type Page } from '@playwright/test'
import { MAINTENANT, item, semer } from './graine-calendrier'

// Glisser-déposer (tâche 18, spec §9.3–9.6). Données : celles du calendrier (semaine du 2 au 8 nov. 2026, « Stage »
// de 8 h à 13 h lundi, mardi, jeudi et vendredi ; 300 mardi de 14 h à 16 h 45), plus trois items jamais planifiés.
// Les gestes sont des événements de pointeur tactiles (`pointerType: 'touch'`) : `page.touchscreen` ne sait que
// taper, or dnd-kit (PointerSensor, appui long de 150 ms, tolérance 6 px) et la grille écoutent les pointeurs.
// Avant un geste, les boutons sont touchés (`tap`) ou reçoivent un `click` DOM, sans la souris de Playwright : elle
// resterait sur la page, et le moindre `pointermove` de survol qu'elle émet ferait dépasser la tolérance au capteur
// (qui ne trie pas les pointeurs), lequel annulerait le geste.

const MARDI = '2026-11-03'
const SAMEDI = '2026-11-07'
const PX_HEURE = 48

const NOUVEAUX = [
  item('c1', 294, 'Tumeurs de la cavité buccale', 21),
  item('c1', 296, 'Mélanome cutané', 8),
  item('c1', 299, 'Cancer du rein', 12),
]

type Point = { x: number; y: number }
type TypePointeur = 'pointerdown' | 'pointermove' | 'pointerup'

/** Un événement de pointeur tactile au point (x, y), envoyé à l'élément qui s'y trouve. */
async function pointeur(page: Page, type: TypePointeur, p: Point): Promise<void> {
  await page.evaluate(
    ([type, x, y]) => {
      const cible = document.elementFromPoint(x, y) ?? document.body
      cible.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      )
    },
    [type, p.x, p.y] as const,
  )
}

/** Appui long (200 ms > 150 ms) puis déplacement par petits pas, sans lâcher. */
async function saisir(page: Page, de: Point, vers: Point, pas = 8): Promise<void> {
  await pointeur(page, 'pointerdown', de)
  await page.waitForTimeout(200)
  await deplacer(page, de, vers, pas)
}

async function deplacer(page: Page, de: Point, vers: Point, pas = 8): Promise<void> {
  for (let i = 1; i <= pas; i++) {
    await pointeur(page, 'pointermove', { x: de.x + ((vers.x - de.x) * i) / pas, y: de.y + ((vers.y - de.y) * i) / pas })
  }
  await page.waitForTimeout(50) // une image : l'aperçu suit le doigt
}

async function lacher(page: Page, p: Point): Promise<void> {
  await pointeur(page, 'pointerup', p)
  await page.waitForTimeout(50)
}

async function glisser(page: Page, de: Point, vers: Point): Promise<void> {
  await saisir(page, de, vers)
  await lacher(page, vers)
}

async function centre(l: Locator): Promise<Point> {
  await l.scrollIntoViewIfNeeded()
  const b = await l.boundingBox()
  if (!b) throw new Error('élément invisible')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Point d'une colonne de jour à l'heure `hh:mm` (+ `dy` px). */
async function pointGrille(page: Page, jour: string, hh: number, mm = 0, dy = 3): Promise<Point> {
  const col = page.locator(`.colonne[data-jour="${jour}"]`)
  const b = await col.boundingBox()
  if (!b) throw new Error(`colonne ${jour} invisible`)
  const debut = Number(await page.locator('.grille').getAttribute('data-plage-debut'))
  const pxHeure = Number(await page.locator('.grille').getAttribute('data-px-heure'))
  return { x: b.x + b.width / 2, y: b.y + ((hh * 60 + mm - debut) * pxHeure) / 60 + dy }
}

const carte = (page: Page, itemId: string) =>
  page.locator(`#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="${itemId}"]`).first()
const bloc = (page: Page, id: string) => page.locator(`[data-creneau="${id}"]`)
const blocsDu = (page: Page, jour: string) => page.locator(`.colonne[data-jour="${jour}"] .bloc-creneau[data-creneau]`)

async function ouvrir(page: Page, extra: Parameters<typeof semer>[1] = {}): Promise<void> {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, { items: NOUVEAUX, ...extra })
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

/** Note dans `window.__tremble` toute colonne ou tout carreau qui reçoit `.tremble` (la classe ne dure que 200 ms). */
async function guetterTremblement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __tremble: string[] }
    w.__tremble = []
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement
        if (el.classList.contains('tremble')) w.__tremble.push(el.dataset.jour ?? '?')
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })
  })
}

test.describe('iPad', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'gestes de la bibliothèque : panneau iPad')

  test('glisser la carte 300 sur mardi 14h : un bloc de 165 min', async ({ page }) => {
    await ouvrir(page, { sansCreneaux: ['c2:300'] })
    await expect(blocsDu(page, MARDI)).toHaveCount(0)
    await glisser(page, await centre(carte(page, 'c2:300')), await pointGrille(page, MARDI, 14))

    const pose = blocsDu(page, MARDI)
    await expect(pose).toHaveCount(1)
    await expect(pose).toHaveAttribute('data-debut', `${MARDI}T14:00`)
    await expect(pose).toHaveAttribute('data-duree', '165')
    const b = await pose.boundingBox()
    expect(b?.height).toBeCloseTo(165 * (PX_HEURE / 60), 0)
    // Annulable en une étape.
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(blocsDu(page, MARDI)).toHaveCount(0)
  })

  test('glisser 291 sur la moitié haute du bloc 300 : 300 descend (aperçu puis lâcher)', async ({ page }) => {
    await ouvrir(page)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
    const vers = await pointGrille(page, MARDI, 14, 30)
    await saisir(page, await centre(carte(page, 'c1:291')), vers)

    // Pendant le geste : le fantôme est posé à 14h30, 300 s'écarte vers le bas (translateY), rien n'est écrit.
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] .fantome`)).toHaveCount(1)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('style', /translateY\(\d+(\.\d+)?px\)/)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)

    await lacher(page, vers)
    // 291 au 4e tour : 30 min, de 14h30 à 15h ; 300 repart de 15h.
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T15:00`)
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] [data-debut="${MARDI}T14:30"]`)).toHaveCount(1)
    await expect(page.locator('.fantome')).toHaveCount(0)
  })

  test('lâcher sur « Stage » : la colonne tremble et rien ne change', async ({ page }) => {
    await ouvrir(page)
    await guetterTremblement(page)
    const avant = await page.locator('.bloc-creneau[data-creneau]').count()
    const vers = await pointGrille(page, '2026-11-02', 10)
    await saisir(page, await centre(carte(page, 'c2:300')), vers)
    // Pendant le geste : fantôme rouge, colonne teintée.
    await expect(page.locator('.fantome[data-refus="true"]')).toHaveCount(1)
    await expect(page.locator('.colonne[data-jour="2026-11-02"]')).toHaveAttribute('data-refus', 'true')
    await lacher(page, vers)

    await expect.poll(() => page.evaluate(() => (window as unknown as { __tremble: string[] }).__tremble)).toContain('2026-11-02')
    await expect(page.locator('.bloc-creneau[data-creneau]')).toHaveCount(avant)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('tirer le bord bas : la durée change et dureePerso est vrai', async ({ page }) => {
    await ouvrir(page)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-duree-perso', 'false')
    const poignee = page.locator('[data-poignee="cr-a"]')
    const de = await centre(poignee)
    await pointeur(page, 'pointerdown', de)
    await deplacer(page, de, { x: de.x, y: de.y + PX_HEURE })
    // Aperçu : la hauteur suit, rien n'est encore écrit.
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-duree', '165')
    await expect.poll(async () => (await bloc(page, 'cr-a').boundingBox())?.height).toBeCloseTo(225 * (PX_HEURE / 60), 0)
    await lacher(page, { x: de.x, y: de.y + PX_HEURE })

    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-duree', '225')
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-duree-perso', 'true')
  })

  test('glisser vers la corbeille : le créneau disparaît ; ↶ le fait revenir', async ({ page }) => {
    await ouvrir(page)
    const corbeille = page.locator('[data-corbeille]')
    await expect(corbeille).toHaveAttribute('data-visible', 'false')
    const de = await centre(bloc(page, 'cr-a'))
    await saisir(page, de, { x: de.x + 10, y: de.y + 10 }, 2)
    // Visible seulement pendant le glisser d'un créneau.
    await expect(corbeille).toHaveAttribute('data-visible', 'true')
    const vers = await centre(corbeille)
    await deplacer(page, { x: de.x + 10, y: de.y + 10 }, vers)
    await expect(corbeille).toHaveAttribute('data-survol', 'true')
    await lacher(page, vers)

    await expect(bloc(page, 'cr-a')).toHaveCount(0)
    await expect(corbeille).toHaveAttribute('data-visible', 'false')
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(bloc(page, 'cr-a')).toHaveCount(1)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
  })

  test('sélectionner 3 items et les déposer : 3 blocs espacés de 10 min', async ({ page }) => {
    await ouvrir(page)
    await page.locator('#panneau-bibliotheque').getByRole('button', { name: 'Sélectionner' }).dispatchEvent('click')
    for (const n of [294, 296, 299]) {
      const cb = page.getByRole('checkbox', { name: new RegExp(`^Sélectionner l'item ${n},`) }).first()
      await cb.dispatchEvent('click')
      await expect(cb).toBeChecked()
    }
    await glisser(page, await centre(carte(page, 'c1:296')), await pointGrille(page, SAMEDI, 9))

    const poses = blocsDu(page, SAMEDI)
    await expect(poses).toHaveCount(3)
    const lus = await poses.evaluateAll((els) =>
      els.map((e) => ({ debut: e.getAttribute('data-debut') as string, duree: Number(e.getAttribute('data-duree')) })),
    )
    const minutes = (d: string) => Number(d.slice(11, 13)) * 60 + Number(d.slice(14, 16))
    lus.sort((a, b) => a.debut.localeCompare(b.debut))
    expect(lus[0].debut).toBe(`${SAMEDI}T09:00`)
    for (let i = 1; i < 3; i++) expect(minutes(lus[i].debut) - (minutes(lus[i - 1].debut) + lus[i - 1].duree)).toBe(10)
  })

  test('déposer sur un jour de la vue Mois : placement à la première heure libre', async ({ page }) => {
    await ouvrir(page)
    await page.getByRole('button', { name: 'Mois' }).tap()
    // Lundi 2 : 7h–8h trop court pour 294 (2h45), « Stage » jusqu'à 13h → 13h.
    const lundi = page.locator('.mois-jour[data-jour="2026-11-02"]')
    await expect(lundi).toHaveAttribute('data-charge', '0')
    const vers = await centre(lundi)
    await saisir(page, await centre(carte(page, 'c1:294')), vers)
    await expect(lundi).toHaveAttribute('data-survol', 'ok')
    await lacher(page, vers)
    await expect(lundi).toHaveAttribute('data-charge', '165')

    await lundi.click()
    await expect(page.locator('[data-debut="2026-11-02T13:00"]')).toHaveCount(1)
  })

  test('appui long sur une zone vide et étirer : titre demandé, bloc hachuré créé', async ({ page }) => {
    await ouvrir(page)
    const de = await pointGrille(page, SAMEDI, 15, 0, 6)
    const vers = await pointGrille(page, SAMEDI, 17, 0, 0)
    await saisir(page, de, vers)
    await expect(page.locator(`.colonne[data-jour="${SAMEDI}"] .trace-indispo`)).toBeVisible()
    await lacher(page, vers)

    const feuille = page.getByRole('dialog', { name: "Titre de l'indisponibilité" })
    await expect(feuille).toBeVisible()
    await expect(feuille).toContainText('15h–17h')
    await feuille.getByRole('textbox', { name: 'Titre' }).fill('Sport')
    await feuille.getByRole('button', { name: 'Créer' }).click()

    const cree = page.locator(`.colonne[data-jour="${SAMEDI}"] .bloc-indispo`)
    await expect(cree).toHaveCount(1)
    await expect(cree).toHaveAttribute('aria-label', 'Sport, indisponible de 15h à 17h')
    await expect(page.locator('.trace-indispo')).toHaveCount(0)
  })

  test('tap sur un emplacement libre : « Pour combler ce trou »', async ({ page }) => {
    await ouvrir(page)
    const p = await pointGrille(page, SAMEDI, 10, 0, 10)
    await pointeur(page, 'pointerdown', p)
    await lacher(page, p)
    const panneau = page.locator('#panneau-bibliotheque')
    await expect(panneau.getByRole('heading', { name: 'Pour combler ce trou' })).toBeVisible()
    await expect(panneau.getByText(/sam\. 7 nov\. à 10h/)).toBeVisible()
  })

  test('déplacer un créneau vers le jour suivant : le balayage ne change pas de semaine', async ({ page }) => {
    await ouvrir(page)
    const periode = page.locator('.calendrier-periode')
    const avant = await periode.textContent()
    const b = (await bloc(page, 'cr-a').boundingBox())!
    // Pris à 10 px du haut du bloc : il garde cette prise, donc 300 commence à 17h mercredi.
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const vers = await pointGrille(page, '2026-11-04', 17, 0, 10)
    await glisser(page, de, vers)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-11-04T17:00')
    await expect(periode).toHaveText(avant ?? '')
  })
})

test.describe('iPhone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 900, 'vue Jour du téléphone')

  test('vue Jour : appui long sur un créneau et glisser d’une heure', async ({ page }) => {
    await ouvrir(page)
    // Mercredi 4 (jour courant) : 292 de 13h30 à 15h30.
    const cr = bloc(page, 'cr-d')
    await cr.scrollIntoViewIfNeeded()
    const b = (await cr.boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 8 }
    await glisser(page, de, { x: de.x, y: de.y + 56 })
    await expect(cr).toHaveAttribute('data-debut', '2026-11-04T14:30')
  })

  test('feuille des items : elle s’efface pendant le glisser, le dépôt la ferme', async ({ page }) => {
    await ouvrir(page)
    await page.getByRole('button', { name: 'Items', exact: true }).tap()
    const feuille = page.getByRole('dialog', { name: 'Items' })
    await expect(feuille).toBeVisible()
    const de = await centre(feuille.locator('[data-testid="suivants"] [data-item-id="c1:296"]'))
    await saisir(page, de, { x: 200, y: 400 })
    await expect(page.locator('.racine')).toHaveAttribute('data-glisse-feuille', 'true')
    const vers = await pointGrille(page, '2026-11-04', 17, 0, 3)
    await deplacer(page, { x: 200, y: 400 }, vers, 6)
    await lacher(page, vers)
    await expect(feuille).toHaveCount(0)
    await expect(page.locator('.colonne[data-jour="2026-11-04"] .bloc-creneau[data-creneau]')).toHaveCount(4)
  })
})

// Captures d'écran pendant le geste (rapport de la tâche 18) : `CAPTURES=1 npx playwright test dnd --project=ipad`.
test.describe('captures', () => {
  test.skip(!process.env.CAPTURES, 'captures à la demande')
  const dossier = '.superpowers/sdd/2026-10-28-planning-revisions/shots'

  for (const theme of ['clair', 'sombre'] as const) {
    test(`captures ${theme}`, async ({ page }) => {
      await ouvrir(page, theme === 'sombre' ? { reglages: { theme: 'sombre' } } : {})
      // Aperçu de cascade : 296 sur la moitié haute de 300.
      const v1 = await pointGrille(page, MARDI, 14, 30)
      await saisir(page, await centre(carte(page, 'c1:296')), v1)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dossier}/task-18-ipad-${theme}-cascade.png` })
      await page.keyboard.press('Escape') // annule le geste : rien n'est déposé
      await lacher(page, { x: 5, y: 5 })

      // Refus : au-dessus de « Stage ».
      const v2 = await pointGrille(page, '2026-11-05', 10)
      await saisir(page, await centre(carte(page, 'c2:300')), v2)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dossier}/task-18-ipad-${theme}-refus.png` })
      await page.keyboard.press('Escape') // annule le geste : rien n'est déposé
      await lacher(page, { x: 5, y: 5 })

      // Corbeille : un créneau saisi, au-dessus de la corbeille.
      const de = await centre(bloc(page, 'cr-e'))
      await saisir(page, de, { x: de.x + 10, y: de.y }, 2)
      const vers = await centre(page.locator('[data-corbeille]'))
      await deplacer(page, { x: de.x + 10, y: de.y }, { x: vers.x + 30, y: vers.y - 20 })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dossier}/task-18-ipad-${theme}-corbeille.png` })
      await page.keyboard.press('Escape') // annule le geste : rien n'est déposé
      await lacher(page, { x: 5, y: 5 })
    })
  }
})
