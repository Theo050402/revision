import { expect, test, type Page } from '@playwright/test'
import { MAINTENANT, creneau, item, semer } from './graine-calendrier'
import { centre, deplacer, glisser, images, lacher, pointGrille, pointeur, pointeurs, saisir, type Point } from './gestes'

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

const carte = (page: Page, itemId: string) =>
  page.locator(`#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="${itemId}"]`).first()
const bloc = (page: Page, id: string) => page.locator(`[data-creneau="${id}"]`)
const blocsDu = (page: Page, jour: string) => page.locator(`.colonne[data-jour="${jour}"] .bloc-creneau[data-creneau]`)
/** Copie flottante (collée au doigt) et emplacement d'atterrissage (magnétisé), spec §C.2. */
const copie = (page: Page) => page.locator('[data-copie]')
const atterrissage = (page: Page) => page.locator('[data-atterrissage]')

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

    // Pendant le geste : l'emplacement est posé à 14h30, 300 s'écarte vers le bas (translateY), rien n'est écrit.
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] [data-atterrissage]`)).toHaveAttribute('data-atterrissage', `${MARDI}T14:30`)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('style', /translateY\(\d+(\.\d+)?px\)/)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)

    await lacher(page, vers)
    // 291 au 4e tour : 30 min, de 14h30 à 15h ; 300 repart de 15h.
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T15:00`)
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] [data-debut="${MARDI}T14:30"]`)).toHaveCount(1)
    await expect(atterrissage(page)).toHaveCount(0)
  })

  test('lâcher sur « Stage » : la colonne tremble et rien ne change', async ({ page }) => {
    await ouvrir(page)
    await guetterTremblement(page)
    const avant = await page.locator('.bloc-creneau[data-creneau]').count()
    const vers = await pointGrille(page, '2026-11-02', 10)
    await saisir(page, await centre(carte(page, 'c2:300')), vers)
    // Pendant le geste : emplacement rouge, colonne teintée.
    await expect(page.locator('[data-atterrissage][data-refus="true"]')).toHaveCount(1)
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
    await page.waitForTimeout(250) // fin de l'apparition (translateY, 180 ms)
    const vers = await centre(corbeille, false)
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

test.describe('iPad : robustesse', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'panneau iPad')

  /** Rien ne reste de l'aperçu, rien n'est écrit. */
  async function intact(page: Page, avant: number): Promise<void> {
    await expect(atterrissage(page)).toHaveCount(0)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
    await expect(page.locator('.bloc-creneau[style*="translateY"]')).toHaveCount(0)
    await expect(page.locator('.grille')).toHaveAttribute('data-glisse', 'false')
    await expect(page.locator('.bloc-creneau[data-creneau]')).toHaveCount(avant)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  }

  test('le lâcher dépose ce que l’aperçu montrait, même si le doigt a bougé juste avant', async ({ page }) => {
    await ouvrir(page)
    // 15h15 : moitié haute de 300 (14h–16h45) ; 15h30 : moitié basse, dont la cascade serait refusée.
    const haut = await pointGrille(page, MARDI, 15, 15)
    const bas = await pointGrille(page, MARDI, 15, 30)
    await saisir(page, await centre(carte(page, 'c1:296')), haut)
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] [data-atterrissage]`)).toHaveAttribute('data-atterrissage', `${MARDI}T15:15`)
    await expect(copie(page)).toContainText('15h15 → 16h15')
    // Le doigt glisse sur l'autre moitié et se lève dans la même tâche : aucune image n'a montré cette position.
    await pointeurs(page, [
      { type: 'pointermove', ...bas },
      { type: 'pointerup', ...bas },
    ])
    await expect(page.locator(`.colonne[data-jour="${MARDI}"] [data-debut="${MARDI}T15:15"]`)).toHaveCount(1)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T16:15`)
  })

  test('Échap pendant le glisser : rien ne reste, rien n’est écrit', async ({ page }) => {
    await ouvrir(page)
    const avant = await page.locator('.bloc-creneau[data-creneau]').count()
    const vers = await pointGrille(page, MARDI, 14, 30)
    await saisir(page, await centre(carte(page, 'c1:296')), vers)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('style', /translateY/)
    await page.keyboard.press('Escape')
    await lacher(page, vers)
    await intact(page, avant)
  })

  test('lâcher hors de la grille : rien ne reste, rien n’est écrit', async ({ page }) => {
    await ouvrir(page)
    const avant = await page.locator('.bloc-creneau[data-creneau]').count()
    const de = await centre(bloc(page, 'cr-a'))
    const vers = await pointGrille(page, MARDI, 18)
    await saisir(page, de, vers)
    await expect(atterrissage(page)).toHaveCount(1)
    const dehors = { x: 150, y: 400 } // panneau de la bibliothèque
    await deplacer(page, vers, dehors)
    await lacher(page, dehors)
    await intact(page, avant)
  })

  test('grille défilée : la feuille « Nouvelle indisponibilité » couvre tout l’écran', async ({ page }) => {
    await ouvrir(page)
    // La grille (contenue, `contain: strict`) défile : la feuille, rendue en portail, n'en dépend pas.
    await page.locator('.calendrier-defilement').evaluate((el) => {
      el.scrollTop = 300
    })
    await page.getByRole('button', { name: '+ Indisponibilité' }).click()
    await expect(page.getByRole('dialog', { name: 'Nouvelle indisponibilité' })).toBeVisible()

    const fond = await page.locator('.feuille-fond').boundingBox()
    const vue = page.viewportSize()!
    expect(fond).toEqual({ x: 0, y: 0, width: vue.width, height: vue.height })
    // La barre du haut est couverte : le point central de ↶ appartient au fond de la feuille.
    const annuler = await centre(page.locator('.barre button[aria-label="Annuler"]'), false)
    const couvert = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('.feuille-fond') !== null,
      [annuler.x, annuler.y],
    )
    expect(couvert).toBe(true)
  })

  test('un deuxième doigt n’annule ni l’appui long ni le glisser', async ({ page }) => {
    await ouvrir(page)
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    await pointeur(page, 'pointerdown', de)
    // Pendant l'appui long : un autre doigt bouge de 80 px (au-delà de la tolérance de 6 px).
    await pointeurs(page, [
      { type: 'pointerdown', x: 900, y: 600, id: 9 },
      { type: 'pointermove', x: 980, y: 600, id: 9 },
    ])
    await page.waitForTimeout(200)
    await expect(page.locator('.grille')).toHaveAttribute('data-glisse', 'true')
    const vers = await pointGrille(page, MARDI, 18, 0, 10)
    await deplacer(page, de, vers)
    // Pendant le glisser : l'autre doigt se lève ; le glisser continue.
    await pointeur(page, 'pointerup', { x: 980, y: 600 }, 9)
    await expect(page.locator('.grille')).toHaveAttribute('data-glisse', 'true')
    await lacher(page, vers)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T18:00`)
  })

  test('après un glisser, chaque colonne garde sa place et les poignées restent dans leur jour', async ({ page }) => {
    await ouvrir(page)
    // Un glisser annulé qui pose un fantôme mercredi et estompe 300 mardi.
    const de = await centre(bloc(page, 'cr-a'))
    const vers = await pointGrille(page, '2026-11-04', 17)
    await saisir(page, de, vers)
    await page.keyboard.press('Escape')
    await lacher(page, vers)
    const largeurs = await page
      .locator('.colonne')
      .evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().width)))
    expect(new Set(largeurs).size).toBe(1)
    const col = (await page.locator('.colonne[data-jour="2026-11-04"]').boundingBox())!
    const poignee = (await page.locator('[data-poignee="cr-d"]').boundingBox())!
    expect(poignee.x).toBeGreaterThanOrEqual(col.x)
    expect(poignee.x + poignee.width).toBeLessThanOrEqual(col.x + col.width + 0.5)
    // Le centre de 304 (jeudi) est bien 304, et non la poignée d'un bloc de mercredi.
    const c = await centre(bloc(page, 'cr-e'))
    const sous = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-creneau]')?.getAttribute('data-creneau'),
      [c.x, c.y],
    )
    expect(sous).toBe('cr-e')
  })
})

// Glisser fluide (spec §C.1–C.3) : copie libre collée au doigt, emplacement d'atterrissage magnétisé, colonne visée
// éclairée, étiquette d'heure, refus et retour à l'origine, mouvement réduit.
test.describe('iPad : glisser fluide', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'semaine de l’iPad')

  const MERCREDI = '2026-11-04'
  /** Un créneau d'une heure le lundi à 15 h (le lundi n'a que « Stage » le matin). */
  const LUNDI_15H = creneau('cr-l', 'c1:294', '2026-11-02T15:00', 60)

  /** Rectangle (écran) d'un élément, sans attendre ni faire défiler. */
  const rect = (page: Page, sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    })

  type Rect = { x: number; y: number; w: number; h: number }
  const proche = (a: Rect, b: { x: number; y: number; width: number; height: number }, tol = 1) =>
    Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.width) <= tol && Math.abs(a.h - b.height) <= tol

  /**
   * Appui (pointerdown) au point `de`, puis rectangle de la couche `couche` de la copie à la première image où elle
   * est visible (saisie de l'appui long) : elle doit recouvrir exactement l'objet saisi.
   */
  const premiereImage = (page: Page, de: Point, couche: string) =>
    page.evaluate(
      ({ x, y, couche }) =>
        new Promise<Rect | null>((fini) => {
          const sous = document.elementFromPoint(x, y) ?? document.body
          sous.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              button: 0,
              buttons: 1,
            }),
          )
          const debut = performance.now()
          const image = () => {
            const boite = document.querySelector<HTMLElement>('[data-copie]')
            const el = boite?.querySelector<HTMLElement>(couche)
            if (boite?.dataset.visible === 'true' && el) {
              const r = el.getBoundingClientRect()
              return fini({ x: r.left, y: r.top, w: r.width, h: r.height })
            }
            if (performance.now() - debut > 2000) return fini(null)
            requestAnimationFrame(image)
          }
          requestAnimationFrame(image)
        }),
      { x: de.x, y: de.y, couche },
    )

  /** Lâche en `p` et relève, image par image, la copie, sa couche `couche` et l'élément `cible`, jusqu'à disparition. */
  type Image = { phase: string; visible: boolean; copie: number; couche: Rect; cible: number | null; rectCible: Rect | null }
  const lacherEtSuivre = (page: Page, p: Point, couche: string, cible: string) =>
    page.evaluate(
      ({ x, y, couche, cible }) =>
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
            const el = boite.querySelector<HTMLElement>(couche)
            const c = document.querySelector<HTMLElement>(cible)
            const r = el?.getBoundingClientRect()
            const rc = c?.getBoundingClientRect()
            const visible = boite.dataset.visible === 'true'
            vu.push({
              phase: boite.dataset.phase ?? '',
              visible,
              copie: visible && el ? Number(getComputedStyle(boite).opacity) * Number(getComputedStyle(el).opacity) : 0,
              couche: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 },
              cible: c ? Number(getComputedStyle(c).opacity) : null,
              rectCible: rc ? { x: rc.left, y: rc.top, w: rc.width, h: rc.height } : null,
            })
            if (!visible || performance.now() - debut > 3000) return fini(vu)
            requestAnimationFrame(image)
          }
          image()
        }),
      { x: p.x, y: p.y, couche, cible },
    )

  test('copie continue : elle glisse librement d’un jour à l’autre, collée au doigt', async ({ page }) => {
    await ouvrir(page, { creneaux: [LUNDI_15H] })
    const b = (await bloc(page, 'cr-l').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const vers = await pointGrille(page, MERCREDI, 15, 0, 10)
    // Saisie : la copie recouvre exactement le bloc (même place, même taille), sans saut.
    const leve = await premiereImage(page, de, '.copie-bloc')
    expect(leve).not.toBeNull()
    expect(proche(leve!, b)).toBe(true)
    await page.waitForTimeout(400) // soulèvement et frémissement terminés
    const gauches = await page.locator('.colonne').evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().left))

    const ecarts: number[] = []
    const libres: number[] = []
    for (let i = 1; i <= 12; i++) {
      const p = { x: de.x + ((vers.x - de.x) * i) / 12, y: de.y }
      await pointeur(page, 'pointermove', p)
      await images(page)
      const c = await rect(page, '[data-copie] .copie-bloc')
      expect(Number(await copie(page).evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5)
      ecarts.push(c.x - p.x)
      // Position entre deux colonnes : loin du bord gauche de toute colonne (un bloc magnétisé y serait calé).
      if (gauches.every((g) => Math.abs(c.x - (g + 3)) > 12)) libres.push(c.x)
    }
    expect(libres.length).toBeGreaterThan(0)
    // 1:1 : l'écart entre le doigt et la copie ne change jamais (aucun saut, aucun recentrage).
    for (const e of ecarts) expect(Math.abs(e - ecarts[0])).toBeLessThan(0.5)
    await lacher(page, vers)
    await expect(bloc(page, 'cr-l')).toHaveAttribute('data-debut', `${MERCREDI}T15:00`)
  })

  test('emplacement d’atterrissage : dans la colonne visée, à l’heure magnétisée, identique au lâcher', async ({ page }) => {
    await ouvrir(page)
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const vers = await pointGrille(page, MERCREDI, 17, 0, 10)
    await saisir(page, de, vers)

    const dansMercredi = page.locator(`.colonne[data-jour="${MERCREDI}"] [data-atterrissage]`)
    await expect(atterrissage(page)).toHaveCount(1)
    await expect(dansMercredi).toHaveAttribute('data-atterrissage', `${MERCREDI}T17:00`)
    // Une fois posé par son ressort : dans la colonne, son haut à 17 h.
    const col = await rect(page, `.colonne[data-jour="${MERCREDI}"]`)
    const haut = (await pointGrille(page, MERCREDI, 17, 0, 0)).y
    await expect
      .poll(async () => {
        const s = await rect(page, '[data-atterrissage]')
        return Math.abs(s.y - haut) < 1 && s.x >= col.x && s.x + s.w <= col.x + col.w + 0.5
      })
      .toBe(true)
    const prevu = await dansMercredi.getAttribute('data-atterrissage')
    await lacher(page, vers)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', prevu ?? '')
  })

  test('colonne éclairée : la colonne visée et son en-tête, aucune autre', async ({ page }) => {
    await ouvrir(page)
    const de = await centre(bloc(page, 'cr-a'))
    const mercredi = await pointGrille(page, MERCREDI, 17)
    await saisir(page, de, mercredi)
    await expect(page.locator('.colonne[data-visee]')).toHaveCount(1)
    await expect(page.locator('.colonne[data-visee]')).toHaveAttribute('data-jour', MERCREDI)
    await expect(page.locator('.jour-tete[data-visee]')).toHaveCount(1)
    await expect(page.locator('.jour-tete').nth(2)).toHaveAttribute('data-visee', 'true')

    const jeudi = await pointGrille(page, '2026-11-05', 18)
    await deplacer(page, mercredi, jeudi)
    await expect(page.locator('.colonne[data-visee]')).toHaveCount(1)
    await expect(page.locator('.colonne[data-visee]')).toHaveAttribute('data-jour', '2026-11-05')
    await expect(page.locator('.jour-tete[data-visee]')).toHaveCount(1)
    await expect(page.locator('.jour-tete').nth(3)).toHaveAttribute('data-visee', 'true')

    await page.keyboard.press('Escape')
    await lacher(page, jeudi)
    await expect(page.locator('[data-visee]')).toHaveCount(0)
  })

  test('étiquette d’heure accrochée à la copie : « mer. 4 · 14h30 → 15h30 »', async ({ page }) => {
    await ouvrir(page, { creneaux: [LUNDI_15H], sansCreneaux: ['c1:292'] })
    const b = (await bloc(page, 'cr-l').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    await saisir(page, de, await pointGrille(page, MERCREDI, 14, 30, 10))
    const etiquette = copie(page).locator('[data-etiquette-heure]')
    await expect(etiquette).toBeVisible()
    await expect(etiquette).toHaveText('mer. 4 · 14h30 → 15h30')
  })

  test('refus : emplacement rouge ; au lâcher, la copie revient à son origine et rien ne change', async ({ page }) => {
    await ouvrir(page)
    const avant = await page.locator('.bloc-creneau[data-creneau]').count()
    const c = carte(page, 'c2:300')
    const origine = await centre(c)
    const boite = (await c.boundingBox())!
    const vers = await pointGrille(page, '2026-11-02', 10)
    await saisir(page, origine, vers)
    await expect(page.locator('[data-atterrissage][data-refus="true"]')).toHaveCount(1)

    // Lâcher puis suivre la copie (sa forme de carte) image par image jusqu'à ce qu'elle disparaisse.
    const trace = (await lacherEtSuivre(page, vers, '.copie-carte', '#__aucun')).filter((i) => i.visible)
    expect(trace.length).toBeGreaterThan(3) // animée, et non effacée sur place
    const loin = (p: Rect) => Math.hypot(p.x - boite.x, p.y - boite.y)
    expect(loin(trace[0].couche)).toBeGreaterThan(100)
    // Elle reprend la forme et la place exactes de la carte, puis s'efface par-dessus.
    const arrivee = trace.find((i) => i.phase === 'relais')
    expect(arrivee).toBeDefined()
    expect(proche(arrivee!.couche, boite)).toBe(true)
    expect(loin(trace[trace.length - 1].couche)).toBeLessThan(2)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
    await expect(page.locator('.bloc-creneau[data-creneau]')).toHaveCount(avant)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })

  test('saisie d’une carte sur sa moitié droite : la copie apparaît sur la carte, sans saut, et suit le doigt 1:1', async ({ page }) => {
    await ouvrir(page)
    const c = carte(page, 'c1:296')
    await c.scrollIntoViewIfNeeded()
    await images(page)
    const boite = (await c.boundingBox())!
    const de = { x: boite.x + boite.width * 0.8, y: boite.y + boite.height / 2 }
    const leve = await premiereImage(page, de, '.copie-carte')
    expect(leve).not.toBeNull()
    expect(proche(leve!, boite)).toBe(true)
    await page.waitForTimeout(400) // soulèvement et frémissement terminés
    // Le doigt reste au-dessus de la bibliothèque : la copie garde sa forme de carte et l'écart au doigt.
    const ecarts: { x: number; y: number }[] = []
    for (let i = 1; i <= 6; i++) {
      const p = { x: de.x - 10 * i, y: de.y + 12 * i }
      await pointeur(page, 'pointermove', p)
      await images(page)
      const r = await rect(page, '[data-copie] .copie-carte')
      ecarts.push({ x: r.x - p.x, y: r.y - p.y })
    }
    for (const e of ecarts) {
      expect(Math.abs(e.x - ecarts[0].x)).toBeLessThan(0.5)
      expect(Math.abs(e.y - ecarts[0].y)).toBeLessThan(0.5)
    }
    await page.keyboard.press('Escape')
    await lacher(page, de)
  })

  test('atterrissage d’une carte : la copie prend la forme exacte de l’emplacement, puis cède la place au créneau', async ({ page }) => {
    await ouvrir(page)
    const vers = await pointGrille(page, SAMEDI, 15)
    await saisir(page, await centre(carte(page, 'c1:296')), vers)
    // L'emplacement posé par son ressort : son rectangle est la cible.
    let emplacement: Rect = { x: 0, y: 0, w: 0, h: 0 }
    await expect
      .poll(async () => {
        const a = await rect(page, '[data-atterrissage]')
        const stable = proche(a, { x: emplacement.x, y: emplacement.y, width: emplacement.w, height: emplacement.h }, 0.01)
        emplacement = a
        return stable
      })
      .toBe(true)
    const posee = `.colonne[data-jour="${SAMEDI}"] .bloc-creneau[data-creneau]`
    const trace = await lacherEtSuivre(page, vers, '.copie-bloc', posee)
    // À l'arrivée (début du relais), la copie a exactement le rectangle de l'emplacement.
    const arrivee = trace.find((i) => i.phase === 'relais')
    expect(arrivee).toBeDefined()
    const cible = { x: emplacement.x, y: emplacement.y, width: emplacement.w, height: emplacement.h }
    expect(proche(arrivee!.couche, cible)).toBe(true)
    // Le créneau posé est exactement là.
    expect(proche(arrivee!.rectCible!, cible)).toBe(true)
    // Aucune image où ni la copie ni le créneau ne se voient ; le créneau est plein avant que la copie ne s'efface.
    for (const i of trace) expect(Math.max(i.copie, i.cible ?? 0)).toBeGreaterThanOrEqual(0.3)
    const relais = trace.filter((i) => i.phase === 'relais')
    expect(relais.length).toBeGreaterThan(1) // fondu enchaîné, pas une disparition sèche
    for (const i of relais) expect(i.cible).toBe(1)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
    await expect(page.locator(posee)).toHaveCSS('opacity', '1')
  })

  test('origine atténuée : le bloc saisi reste en place à 35 %', async ({ page }) => {
    await ouvrir(page)
    const de = await centre(bloc(page, 'cr-a'))
    await saisir(page, de, await pointGrille(page, MERCREDI, 17))
    await expect(bloc(page, 'cr-a')).toHaveCSS('opacity', '0.35')
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MARDI}T14:00`)
  })

  test('mouvement réduit : aucune animation sur la copie ni sur l’emplacement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ouvrir(page)
    // Pris à 10 px du haut du bloc : le haut du créneau suit le doigt à 10 px au-dessus.
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const v1 = await pointGrille(page, MERCREDI, 17, 0, 10)
    await saisir(page, de, v1)
    await expect(copie(page)).toHaveAttribute('data-visible', 'true')
    const v2 = await pointGrille(page, MERCREDI, 18, 0, 10)
    await deplacer(page, v1, v2)
    // Dès l'image suivante, l'emplacement est à 18 h ; rien ne bouge ensuite, aucune animation CSS.
    const haut = (await pointGrille(page, MERCREDI, 18, 0, 0)).y
    const etat = () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('[data-copie]')!
        const a = document.querySelector<HTMLElement>('[data-atterrissage]')!
        const anims = [c, a].flatMap((el) => el.getAnimations({ subtree: true })).length
        const tr = [c, a, ...c.querySelectorAll<HTMLElement>('*')].map((el) => getComputedStyle(el).transform).join('|')
        return { anims, tr, haut: a.getBoundingClientRect().top }
      })
    const e1 = await etat()
    expect(Math.abs(e1.haut - haut)).toBeLessThan(1)
    expect(e1.anims).toBe(0)
    await images(page)
    await images(page)
    const e2 = await etat()
    expect(e2.tr).toBe(e1.tr)
    expect(e2.anims).toBe(0)
    await lacher(page, v2)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', `${MERCREDI}T18:00`)
    await expect(copie(page)).toHaveAttribute('data-visible', 'false')
  })
})

// Bords de la grille pendant un glisser (spec §C.2) : défilement progressif en haut et en bas, 600 ms contre le bord
// gauche ou droit pour changer de semaine (de jour en vue Jour) sans interrompre le glisser.
test.describe('iPad : bords de la grille', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'semaine de l’iPad')

  const defil = (page: Page) =>
    page.locator('.calendrier-defilement').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom, scroll: el.scrollTop }
    })
  const periode = (page: Page) => page.locator('.calendrier-periode')

  test('600 ms contre le bord droit : semaine suivante, le glisser continue et le dépôt est possible', async ({ page }) => {
    await ouvrir(page)
    const avant = await periode(page).textContent()
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const d = await defil(page)
    const bord = { x: d.droite - 8, y: (await pointGrille(page, MARDI, 14, 0, 10)).y }
    await saisir(page, de, bord)
    await expect(periode(page)).not.toHaveText(avant ?? '', { timeout: 3000 })
    // Le glisser continue : la copie est toujours là, la grille est toujours en mode glisser.
    await expect(copie(page)).toHaveAttribute('data-visible', 'true')
    await expect(page.locator('.grille')).toHaveAttribute('data-glisse', 'true')
    await expect(page.locator('.colonne[data-jour="2026-11-09"]')).toHaveCount(1)
    // Le doigt est sur la dernière colonne de la nouvelle semaine : l'emplacement y est posé, à la même heure.
    await expect(page.locator('[data-atterrissage]')).toHaveAttribute('data-atterrissage', '2026-11-15T14:00')
    await lacher(page, bord)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-11-15T14:00')
  })

  test('600 ms contre le bord gauche : semaine précédente, dépôt possible', async ({ page }) => {
    await ouvrir(page)
    const avant = await periode(page).textContent()
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const premiere = (await page.locator('.jour-tete').first().boundingBox())!
    const bord = { x: premiere.x + 8, y: (await pointGrille(page, MARDI, 14, 0, 10)).y }
    await saisir(page, de, bord)
    await expect(periode(page)).not.toHaveText(avant ?? '', { timeout: 3000 })
    await expect(page.locator('.colonne[data-jour="2026-10-26"]')).toHaveCount(1)
    await lacher(page, bord)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', '2026-10-26T14:00')
  })

  test('une bande lumineuse se remplit pendant les 600 ms contre le bord, et disparaît en le quittant', async ({ page }) => {
    await ouvrir(page)
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const d = await defil(page)
    const y = (await pointGrille(page, MARDI, 14, 0, 10)).y
    const halo = page.locator('[data-bord-halo]')
    await expect(halo).toHaveCount(0)
    await saisir(page, de, { x: d.droite - 8, y })
    await expect(halo).toHaveCount(1)
    await expect(halo).toHaveAttribute('data-bord-halo', 'droite')
    // Remplissage : l'échelle croît de 0 vers 1 (transform et opacité seulement), sans toucher à la mise en page.
    const echelles: number[] = []
    for (let i = 0; i < 4; i++) {
      echelles.push(await halo.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a))
      await page.waitForTimeout(90)
    }
    expect(echelles[0]).toBeLessThan(0.9)
    expect(echelles[echelles.length - 1]).toBeGreaterThan(echelles[0])
    await deplacer(page, { x: d.droite - 8, y }, de)
    await expect(halo).toHaveCount(0)
    await lacher(page, de)
  })

  test('moins de 600 ms contre le bord : la semaine ne change pas', async ({ page }) => {
    await ouvrir(page)
    const avant = await periode(page).textContent()
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const d = await defil(page)
    const y = (await pointGrille(page, MARDI, 14, 0, 10)).y
    await saisir(page, de, { x: d.droite - 8, y })
    await page.waitForTimeout(300)
    await deplacer(page, { x: d.droite - 8, y }, de)
    await page.waitForTimeout(500)
    await expect(periode(page)).toHaveText(avant ?? '')
    await lacher(page, de)
  })

  test('contre le bas : la grille défile et l’emplacement suit, le lâcher dépose ce qu’il montrait', async ({ page }) => {
    await ouvrir(page)
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const d = await defil(page)
    expect(d.scroll).toBe(0)
    const bas = { x: de.x, y: d.bas - 6 }
    await saisir(page, de, bas)
    // La grille ne déborde que de ~120 px à 820 px de haut : elle va jusqu'en bas.
    await expect.poll(async () => (await defil(page)).scroll, { timeout: 3000 }).toBeGreaterThan(100)
    // L'emplacement est réévalué à mesure que la grille défile, sans que le doigt bouge : il a quitté 14 h.
    const lieu = page.locator('[data-atterrissage]')
    await expect(lieu).not.toHaveAttribute('data-atterrissage', `${MARDI}T14:00`)
    const milieu = { x: bas.x, y: (d.haut + d.bas) / 2 }
    await deplacer(page, bas, milieu) // quitte la zone : le défilement s'arrête
    const prevu = await lieu.getAttribute('data-atterrissage')
    await lacher(page, milieu)
    await expect(bloc(page, 'cr-a')).toHaveAttribute('data-debut', prevu ?? '')
  })

  test('mouvement réduit : le défilement fonctionne toujours', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ouvrir(page)
    const b = (await bloc(page, 'cr-a').boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 10 }
    const d = await defil(page)
    await saisir(page, de, { x: de.x, y: d.bas - 6 })
    await expect.poll(async () => (await defil(page)).scroll, { timeout: 3000 }).toBeGreaterThan(100)
    await page.keyboard.press('Escape')
    await lacher(page, de)
  })
})

test.describe('iPhone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 900, 'vue Jour du téléphone')

  test('vue Jour : 600 ms contre le bord droit, le jour suivant s’affiche et le glisser continue', async ({ page }) => {
    await ouvrir(page)
    const cr = bloc(page, 'cr-d')
    await cr.scrollIntoViewIfNeeded()
    const b = (await cr.boundingBox())!
    const de = { x: b.x + b.width / 2, y: b.y + 8 }
    const avant = await page.locator('.calendrier-periode').textContent()
    const droite = await page.locator('.calendrier-defilement').evaluate((el) => el.getBoundingClientRect().right)
    await saisir(page, de, { x: droite - 8, y: de.y })
    await expect(page.locator('.calendrier-periode')).not.toHaveText(avant ?? '', { timeout: 3000 })
    await expect(page.locator('.colonne[data-jour="2026-11-05"]')).toHaveCount(1)
    await expect(copie(page)).toHaveAttribute('data-visible', 'true')
    await page.keyboard.press('Escape')
    await lacher(page, { x: droite - 8, y: de.y })
  })

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
    await expect(page.locator('.feuille-fond')).toHaveAttribute('data-efface', 'true')
    const vers = await pointGrille(page, '2026-11-04', 17, 0, 3)
    await deplacer(page, { x: 200, y: 400 }, vers, 6)
    await lacher(page, vers)
    await expect(feuille).toHaveCount(0)
    await expect(page.locator('.colonne[data-jour="2026-11-04"] .bloc-creneau[data-creneau]')).toHaveCount(4)
  })
})

// Vue Jour (audit de design M4) : l'en-tête de colonne est masqué, sa boîte reste en place (hauteur nulle). Le glisser
// lit toujours la largeur des colonnes sur `.jour-tete` et le haut de la zone sur `.grille-tete` : il doit marcher.
test.describe('vue Jour, en-tête masqué', () => {
  test('appui long sur un créneau et glisser d’une heure, iPad et iPhone', async ({ page }) => {
    await ouvrir(page)
    await page.locator('.barre-vues').getByRole('button', { name: 'Jour' }).dispatchEvent('click')
    await expect(page.locator('.grille')).toHaveAttribute('data-nb-jours', '1')
    const tete = page.locator('.grille-tete')
    await expect(tete).toHaveCSS('visibility', 'hidden')
    expect((await tete.boundingBox())?.height ?? 0).toBe(0)
    // Les colonnes gardent une largeur lisible par le glisser.
    expect((await page.locator('.jour-tete').first().boundingBox())?.width ?? 0).toBeGreaterThan(100)

    // Mercredi 4 (jour courant) : 292 de 13h30 à 15h30, glissé d'une heure.
    const cr = bloc(page, 'cr-d')
    await cr.scrollIntoViewIfNeeded()
    const b = (await cr.boundingBox())!
    const pxHeure = Number(await page.locator('.grille').getAttribute('data-px-heure'))
    const de = { x: b.x + b.width / 2, y: b.y + 8 }
    await glisser(page, de, { x: de.x, y: de.y + pxHeure })
    await expect(cr).toHaveAttribute('data-debut', '2026-11-04T14:30')
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
      // Sans scrollIntoView : la pilule glisse encore depuis le bas pendant son apparition.
      await page.waitForTimeout(250)
      const vers = await centre(page.locator('[data-corbeille]'), false)
      await deplacer(page, { x: de.x + 10, y: de.y }, { x: vers.x + 30, y: vers.y - 20 })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dossier}/task-18-ipad-${theme}-corbeille.png` })
      await page.keyboard.press('Escape') // annule le geste : rien n'est déposé
      await lacher(page, { x: 5, y: 5 })
    })
  }
})

// Captures pendant le glisser fluide (rapport de la tâche 7 des améliorations) :
// `CAPTURES=1 npx playwright test dnd --project=ipad -g "glisser fluide"`.
test.describe('captures : glisser fluide', () => {
  test.skip(!process.env.CAPTURES, 'captures à la demande')
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'iPad')
  const dossier = '.superpowers/sdd/2026-11-02-ameliorations/shots'

  for (const theme of ['clair', 'sombre'] as const) {
    test(`captures glisser fluide ${theme}`, async ({ page }) => {
      await ouvrir(page, theme === 'sombre' ? { reglages: { theme: 'sombre' } } : {})
      // 300 (mardi 14h) saisi à 10 px du haut, le doigt entre mercredi et jeudi : copie libre, emplacement mercredi.
      const b = (await bloc(page, 'cr-a').boundingBox())!
      const de = { x: b.x + b.width / 2, y: b.y + 10 }
      const mer = await pointGrille(page, '2026-11-04', 16, 30, 10)
      const jeu = await pointGrille(page, '2026-11-05', 16, 30, 10)
      await saisir(page, de, { x: mer.x + (jeu.x - mer.x) * 0.4, y: mer.y })
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${dossier}/task-7-ipad-${theme}-glisser.png` })
      await page.keyboard.press('Escape')
      await lacher(page, { x: 5, y: 5 })
      await page.waitForTimeout(800)

      // Aperçu de cascade : 296 sur la moitié haute de 300.
      const v1 = await pointGrille(page, MARDI, 14, 30)
      await saisir(page, await centre(carte(page, 'c1:296')), v1)
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${dossier}/task-7-ipad-${theme}-cascade.png` })
      await page.keyboard.press('Escape')
      await lacher(page, { x: 5, y: 5 })
      await page.waitForTimeout(800)

      // Refus : au-dessus de « Stage ».
      const v2 = await pointGrille(page, '2026-11-05', 10)
      await saisir(page, await centre(carte(page, 'c2:300')), v2)
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${dossier}/task-7-ipad-${theme}-refus.png` })
      await page.keyboard.press('Escape')
      await lacher(page, { x: 5, y: 5 })
    })
  }
})
