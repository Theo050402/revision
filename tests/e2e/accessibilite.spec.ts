import { chromium, expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { MAINTENANT, semer } from './graine-calendrier'
import { centre, deplacer, images, pointGrille, pointeur, saisir } from './gestes'

// Contrôles d'accessibilité (tâche 21, spec §13.5, contraintes globales) : cibles tactiles ≥ 44 px, focus visible,
// `prefers-reduced-motion`. Données : celles du calendrier (semaine du 2 au 8 nov. 2026).

const MARDI = '2026-11-03'
const iphone = (info: TestInfo) => info.project.name === 'iphone'

async function ouvrir(page: Page) {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

type Mesure = { nom: string; largeur: number; hauteur: number }

/**
 * Exceptions assumées au minimum de 44 px (liste fermée, à justifier ici ; contrôlées au doigt, voir recette.md) :
 * - les blocs du calendrier (créneaux et indisponibilités) : leur hauteur est leur durée (§9.2), 24 px pour 30 min ;
 *   leur largeur est celle de la colonne ;
 * - la poignée de durée, zone de glissé de 24 px à cheval sur le bord bas d'un bloc (§9.4).
 * Tout autre contrôle (bouton, champ, ou tout élément focalisable `tabindex` ≥ 0 / glissable) est mesuré.
 */
const EXCEPTIONS_44PX = '.bloc-creneau, .bloc-indispo, .poignee-redim'

/**
 * Taille tactile effective de chaque contrôle visible (bouton, lien, champ, case…) : sa boîte, agrandie de sa zone de
 * toucher prolongée par un pseudo-élément `::after` (voir « Non vus » de la bibliothèque), qui est centrée sur lui.
 * `dans` limite la mesure à un conteneur (la feuille ouverte, le panneau).
 */
async function mesurer(page: Page, dans?: string): Promise<Mesure[]> {
  // Les apparitions (feuille qui monte, fondu) sont terminées : une feuille à demi réduite paraîtrait trop petite.
  // Celles des feuilles passent par un ressort en JavaScript : `data-anime` les signale jusqu'à leur repos.
  await page.waitForFunction(() => document.querySelector('[data-anime]') === null)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  return page.evaluate(([racine, exceptions]) => {
    const portee = racine ? (document.querySelector(racine) ?? document.body) : document.body
    const selecteur =
      'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"], [role="tab"], [tabindex]:not([tabindex="-1"]), [draggable="true"]'
    const sorties: { nom: string; largeur: number; hauteur: number }[] = []
    for (const el of portee.querySelectorAll<HTMLElement>(selecteur)) {
      const style = getComputedStyle(el)
      if (el.closest('[hidden], [inert]') || style.visibility === 'hidden' || style.display === 'none') continue
      if (style.pointerEvents === 'none' || (el as HTMLInputElement).type === 'file') continue
      if (el.matches(exceptions)) continue
      // Les animations d'apparition sont terminées (voir plus haut) : la boîte rendue est la boîte finale.
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const apres = getComputedStyle(el, '::after')
      const zone = apres.content !== 'none' && apres.position === 'absolute'
      let largeur = Math.max(r.width, zone ? parseFloat(apres.width) || 0 : 0)
      let hauteur = Math.max(r.height, zone ? parseFloat(apres.height) || 0 : 0)
      // Une mesure impossible (NaN) ne doit jamais passer pour une réussite : elle est signalée comme trop petite.
      if (!Number.isFinite(largeur) || !Number.isFinite(hauteur)) largeur = hauteur = 0
      const nom = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.className || el.tagName).trim().slice(0, 40)
      sorties.push({ nom: `${el.tagName.toLowerCase()} « ${nom} »`, largeur, hauteur })
    }
    return sorties
  }, [dans ?? null, EXCEPTIONS_44PX] as const)
}

async function verifier(page: Page, ecran: string, dans?: string) {
  const mesures = await mesurer(page, dans)
  expect(mesures.length, `${ecran} : aucun contrôle trouvé`).toBeGreaterThan(0)
  const trop_petits = mesures
    .filter((m) => m.largeur < 43.5 || m.hauteur < 43.5)
    .map((m) => `${m.nom} ${Math.round(m.largeur)}×${Math.round(m.hauteur)}`)
  expect(trop_petits, `${ecran} : cibles de moins de 44 px`).toEqual([])
}

test('cibles tactiles ≥ 44 px sur les écrans principaux', async ({ page }, info) => {
  await ouvrir(page)

  // Calendrier : barre du haut, vues Semaine / Jour / Mois.
  for (const vue of ['Semaine', 'Jour', 'Mois']) {
    await page.getByRole('button', { name: vue, exact: true }).click()
    await verifier(page, `calendrier, vue ${vue}`, '.calendrier')
  }
  await page.getByRole('button', { name: 'Semaine', exact: true }).click()
  await verifier(page, 'barre du haut', 'header, .barre')

  // Bibliothèque : panneau fixe (iPad) ou feuille « Items » (iPhone), puis la fiche d'un item.
  if (iphone(info)) await page.getByRole('button', { name: 'Items', exact: true }).click()
  const biblio = iphone(info) ? page.getByRole('dialog', { name: 'Items' }) : page.locator('#panneau-bibliotheque')
  await expect(biblio).toBeVisible()
  const racine = iphone(info) ? '[role="dialog"]' : '#panneau-bibliotheque'
  await verifier(page, 'bibliothèque', racine)
  await biblio.getByRole('button', { name: 'Plus de filtres' }).click()
  await verifier(page, 'bibliothèque, filtres dépliés', racine)
  await biblio.getByRole('button', { name: 'Sélectionner' }).click()
  await verifier(page, 'bibliothèque, mode sélection', racine)
  await biblio.getByRole('button', { name: 'Terminer' }).click()
  await biblio.locator('section[aria-label="Tous les items"] .carte-corps').first().click()
  await verifier(page, 'fiche d\'un item', racine)
  if (iphone(info)) {
    await biblio.getByRole('button', { name: 'Planifier…' }).click()
    await verifier(page, 'fiche d\'un item, « Planifier… »', racine)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  // Fiche d'un créneau.
  await page.locator('[data-creneau="cr-c"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await verifier(page, 'fiche d\'un créneau', '[role="dialog"]')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Feuille d'export.
  await page.getByRole('button', { name: /^Exporter/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await verifier(page, 'feuille d\'export', '[role="dialog"]')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Réglages, puis choix du PDF à importer.
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await verifier(page, 'réglages')
})

test('cibles tactiles ≥ 44 px : import d\'un collège', async ({ page }, info) => {
  await ouvrir(page)
  if (iphone(info)) await page.getByRole('button', { name: 'Items', exact: true }).click()
  await page.getByRole('button', { name: '+ Collège' }).click()
  await expect(page.getByRole('heading', { name: 'Importer un collège' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0) // la feuille « Items » s'est refermée
  await verifier(page, 'import, choix du PDF', '.import')
})

test('le focus clavier est visible sur chaque contrôle atteint par Tab', async ({ page }, info) => {
  await ouvrir(page)
  if (iphone(info)) await page.getByRole('button', { name: 'Items', exact: true }).click()

  const vus = new Set<string>()
  const sans: string[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const etat = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const nom = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 40)
      return {
        id: `${el.tagName}|${nom}`,
        visible: el.matches(':focus-visible'),
        contour: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2,
        epaisseur: s.outlineWidth,
      }
    })
    if (!etat) continue
    vus.add(etat.id)
    if (!etat.visible || !etat.contour) sans.push(`${etat.id} (${etat.epaisseur})`)
  }
  expect(vus.size, 'Tab doit parcourir plusieurs contrôles').toBeGreaterThan(8)
  expect(sans, 'contrôles sans contour de focus').toEqual([])
})

/**
 * 291 glissé sur la moitié haute du bloc 300 (cr-a) à 14 h 30 : 300 s'écarte de 48 px. Une fois cet aperçu posé, le
 * doigt passe à 14 h 15 (écart de 36 px) et l'on relève chaque valeur de `translateY` que prend 300 pour rejoindre
 * ce nouvel écart : l'aperçu de cascade l'anime par ressort (spec §C.2), image par image, et non par une transition
 * CSS ; en mouvement réduit, il saute d'un coup.
 */
async function decalagesVers1415(page: Page): Promise<string[]> {
  const carte = await centre(page.locator('#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="c1:291"]').first())
  const a = await pointGrille(page, MARDI, 14, 30)
  await saisir(page, carte, a)
  const bloc = page.locator('[data-creneau="cr-a"]')
  await expect(bloc).toHaveAttribute('style', /translateY\(48px\)/)
  expect(await bloc.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  expect(await bloc.evaluate((el) => el.getAnimations().length)).toBe(0)
  await page.evaluate(() => {
    const w = window as unknown as { __decalages: string[] }
    w.__decalages = []
    const el = document.querySelector<HTMLElement>('[data-creneau="cr-a"]')!
    new MutationObserver(() => {
      const t = el.style.transform
      if (t && w.__decalages[w.__decalages.length - 1] !== t) w.__decalages.push(t)
    }).observe(el, { attributes: true, attributeFilter: ['style'] })
  })
  await deplacer(page, a, await pointGrille(page, MARDI, 14, 15), 1)
  await expect(bloc).toHaveAttribute('style', /translateY\(36px\)/)
  await page.waitForTimeout(400)
  return page.evaluate(() => (window as unknown as { __decalages: string[] }).__decalages)
}

test.describe('mouvement réduit', () => {
  test.use({ reducedMotion: 'reduce' })

  test('aucune transition ni animation : un bloc déplacé et la feuille prennent leur place d\'un coup', async ({ page }, info) => {
    await ouvrir(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Les blocs, la barre d'état et les contrôles n'ont aucune durée de transition.
    const durees = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.bloc-creneau, button, .bib-anneau-trait')].map((el) => {
        const s = getComputedStyle(el)
        return [s.transitionDuration, s.animationDuration].join(',')
      }),
    )
    expect(durees.length).toBeGreaterThan(5)
    for (const d of durees) expect(d).toMatch(/^(0s)(, 0s)*,(0s)(, 0s)*$/)

    if (iphone(info)) {
      // La feuille « Items » apparaît sans animation.
      await page.getByRole('button', { name: 'Items', exact: true }).click()
      const feuille = page.locator('.feuille')
      await expect(feuille).toBeVisible()
      expect(await feuille.evaluate((el) => el.getAnimations().length)).toBe(0)
      expect(await feuille.evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0s')
      return
    }

    // iPad : le bloc 300, poussé par 291, change d'écart d'un coup, sans transition ni ressort : une seule valeur.
    expect(await decalagesVers1415(page)).toEqual(['translateY(36px)'])
  })

  test('appui, feuille et balayage : ni échelle, ni ressort, ni glissement ; des fondus de 150 ms', async ({ page }, info) => {
    await ouvrir(page)
    // Appui : le fond se fonce, sans changer d'échelle.
    const bouton = page.getByRole('button', { name: "Aujourd'hui" })
    const avant = await bouton.evaluate((el) => getComputedStyle(el).boxShadow)
    await pointeur(page, 'pointerdown', await centre(bouton))
    await expect.poll(() => bouton.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(avant)
    expect(await bouton.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true })))

    // Feuille : jamais de transformation, seulement l'opacité, de 0 à 1 en ~150 ms.
    await page.evaluate(() => {
      const w = window as unknown as { __ech: { t: string; o: number }[]; __stop: boolean }
      w.__ech = []
      w.__stop = false
      const tour = () => {
        const el = document.querySelector('.feuille')
        if (el) {
          const s = getComputedStyle(el)
          w.__ech.push({ t: s.transform, o: Number(s.opacity) })
        }
        if (!w.__stop) requestAnimationFrame(tour)
      }
      tour()
    })
    if (iphone(info)) await page.getByRole('button', { name: 'Items', exact: true }).click()
    else await page.locator('[data-creneau="cr-c"]').click()
    const feuille = page.getByRole('dialog')
    await expect(feuille).toBeVisible()
    await expect(page.locator('[data-anime]')).toHaveCount(0)
    await expect(feuille).toHaveCSS('opacity', '1')
    const vus = await page.evaluate(() => {
      const w = window as unknown as { __ech: { t: string; o: number }[]; __stop: boolean }
      w.__stop = true
      return w.__ech
    })
    expect(vus.length).toBeGreaterThan(2)
    for (const v of vus) expect(v.t).toBe('none')
    expect(vus.some((v) => v.o > 0 && v.o < 1)).toBe(true)
    expect(vus[vus.length - 1].o).toBe(1)
    expect(await feuille.evaluate((el) => el.getAnimations().length)).toBe(0)
    // Fermée : un fondu, puis plus rien.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Balayage : la grille ne suit pas le doigt (pas de glissement) ; la période change, en fondu.
    const zone = (await page.locator('.calendrier-defilement').boundingBox())!
    const periode = page.locator('.calendrier-periode')
    const avantPeriode = await periode.textContent()
    const y = zone.y + 280
    const x0 = zone.x + zone.width * 0.8
    await pointeur(page, 'pointerdown', { x: x0, y })
    await pointeur(page, 'pointermove', { x: x0 - 30, y })
    await pointeur(page, 'pointermove', { x: x0 - zone.width * 0.4, y })
    await images(page)
    expect(await page.locator('.calendrier-piste').evaluate((el) => getComputedStyle(el).transform)).toBe('none')
    await page.waitForTimeout(200)
    await pointeur(page, 'pointerup', { x: x0 - zone.width * 0.4, y })
    await expect(periode).not.toHaveText(avantPeriode ?? '')
    expect(await page.locator('.calendrier-piste').evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  })

  test('sans le réglage, ce même bloc glisse par ressort (la vérification n\'est pas vide)', async ({ page }, info) => {
    test.skip(iphone(info), 'le déplacement d\'un bloc se fait depuis le panneau iPad')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ouvrir(page)
    // Spec §C.2 : plus de transition CSS ; le ressort passe par des positions intermédiaires, image par image.
    const vus = await decalagesVers1415(page)
    expect(vus.length).toBeGreaterThan(3)
    expect(vus[vus.length - 1]).toBe('translateY(36px)')
  })
})

// ---------- Matériaux et préférences d'affichage (tâche 15, audit de design M3, M5, M10) ----------

const LUNDI = '2026-11-02'
const MERCREDI = '2026-11-04'

/** Fond opaque (alpha 1) et pas de flou d'arrière-plan. */
async function opaque(l: ReturnType<Page['locator']>): Promise<{ flou: string; alpha: number }> {
  return l.evaluate((el) => {
    const cs = getComputedStyle(el)
    const flou = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none'
    // rgb(), rgba() ou color(srgb … / a), selon le navigateur et `color-mix`.
    const fond = cs.backgroundColor
    const barre = fond.match(/\/\s*([\d.]+)\s*\)$/)
    const virgules = fond.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/)
    const alpha = fond === 'transparent' ? 0 : barre ? Number(barre[1]) : virgules ? Number(virgules[1]) : 1
    return { flou, alpha }
  })
}

/** Fait défiler la grille : l'en-tête des jours passe au matériau (`data-bord-haut`). */
async function defilerGrille(page: Page): Promise<void> {
  await page.locator('.calendrier-defilement').evaluate((el) => (el.scrollTop = 120))
  await expect(page.locator('.calendrier-defilement')).toHaveAttribute('data-bord-haut', '')
}

test('matériau : l’en-tête des jours est opaque au repos, translucide et flouté quand la grille défile dessous', async ({ page }, info) => {
  test.skip(iphone(info), 'vue Semaine de l’iPad (en vue Jour, l’en-tête est masqué)')
  await ouvrir(page)
  await page.locator('.calendrier-defilement').evaluate((el) => (el.scrollTop = 0))
  await expect(page.locator('.calendrier-defilement')).not.toHaveAttribute('data-bord-haut', '')
  expect((await opaque(page.locator('.grille-tete'))).alpha).toBe(1)
  await defilerGrille(page)
  const r = await opaque(page.locator('.grille-tete'))
  expect(r.alpha).toBeLessThan(1)
  expect(r.flou).toContain('blur')
})

test('contraste augmenté : bords définis à l’encre, en-têtes et barres opaques', async ({ page }, info) => {
  await page.emulateMedia({ contrast: 'more' })
  await ouvrir(page)
  const encre = await page.evaluate(() => {
    const p = document.createElement('p')
    p.style.color = 'var(--ink)'
    document.body.append(p)
    const c = getComputedStyle(p).color
    p.remove()
    return c
  })
  if (!iphone(info)) {
    const tete = page.locator('.grille-tete')
    await expect(tete).toHaveCSS('border-bottom-style', 'solid')
    await expect(tete).toHaveCSS('border-bottom-width', '1px')
    await expect(tete).toHaveCSS('border-bottom-color', encre)
    await defilerGrille(page)
    expect(await opaque(tete)).toEqual({ flou: 'none', alpha: 1 })
  }
  await page.getByRole('button', { name: /^Exporter/ }).click()
  const feuille = page.locator('.feuille')
  await expect(feuille).toBeVisible()
  await expect(feuille).toHaveCSS('border-left-width', '1px')
  await expect(feuille).toHaveCSS('border-left-color', encre)
  // Sans la préférence, la feuille n'a pas ce bord.
  await page.emulateMedia({ contrast: 'no-preference' })
  await expect(feuille).toHaveCSS('border-left-width', '0px')
})

test('une feuille ouverte envoie les messages en haut de l’écran, iPhone et barre de sélection compris', async ({ page }) => {
  await ouvrir(page)
  const toasts = page.locator('.toasts')
  const hauteur = page.viewportSize()!.height
  expect((await toasts.boundingBox())!.y).toBeGreaterThan(hauteur / 2)
  await page.getByRole('button', { name: /^Exporter/ }).click()
  await expect(page.locator('.feuille-fond')).toBeVisible()
  expect((await toasts.boundingBox())!.y).toBeLessThan(80)
  // Barre de sélection présente (encore en sortie, par exemple) : la règle de la feuille l'emporte toujours.
  await page.evaluate(() => {
    const b = document.createElement('div')
    b.className = 'barre-selection'
    b.dataset.factice = ''
    document.querySelector('.racine')!.append(b)
  })
  expect((await toasts.boundingBox())!.y).toBeLessThan(80)
  await page.evaluate(() => document.querySelector('[data-factice]')?.remove())
})

test('transparence réduite : barres et feuilles opaques, sans flou (Chromium : WebKit ne l’émule pas)', async ({}, info) => {
  test.skip(iphone(info), 'une fois suffit (iPad)')
  // Le WebKit de Playwright et Safari ignorent `prefers-reduced-transparency` : la règle est vérifiée dans le Chrome
  // ou l'Edge installés (aucun téléchargement), par l'émulation de média du protocole DevTools.
  let navigateur: Browser | null = null
  for (const channel of ['chrome', 'msedge']) {
    try {
      navigateur = await chromium.launch({ channel })
      break
    } catch {
      // canal absent : on essaie le suivant
    }
  }
  test.skip(navigateur === null, 'ni Chrome ni Edge installés')
  const contexte = await navigateur!.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, baseURL: info.project.use.baseURL })
  try {
    const page = await contexte.newPage()
    const cdp = await contexte.newCDPSession(page)
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
    await ouvrir(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true)

    // En-tête des jours, grille défilée dessous.
    await defilerGrille(page)
    expect(await opaque(page.locator('.grille-tete'))).toEqual({ flou: 'none', alpha: 1 })

    // Barre de sélection (lasso de lundi 15 h à mercredi 14 h).
    const de = await pointGrille(page, LUNDI, 15, 0, 6)
    const vers = await pointGrille(page, MERCREDI, 14, 0, 0)
    await saisir(page, de, vers)
    await pointeur(page, 'pointerup', vers)
    const barre = page.getByRole('toolbar', { name: 'Sélection' })
    await expect(barre).toBeVisible()
    expect(await opaque(barre)).toEqual({ flou: 'none', alpha: 1 })
    await page.keyboard.press('Escape')
    await expect(barre).toHaveCount(0)

    // Jetons de matériau : redéfinis à plein et sans flou (ce que lisent les en-têtes, la barre et le pied de vérification).
    const jetons = () =>
      page.evaluate(() => {
        const c = getComputedStyle(document.documentElement)
        return ['--materiau-fin', '--materiau-epais', '--flou-fin', '--flou-epais'].map((k) => c.getPropertyValue(k).trim())
      })
    const [fin, epais, flouFin, flouEpais] = await jetons()
    expect(fin).not.toContain('transparent')
    expect(epais).not.toContain('transparent')
    expect([flouFin, flouEpais]).toEqual(['none', 'none'])

    // Feuille : opaque par construction (surface haute), jamais translucide ni floutée dans ce mode.
    await page.getByRole('button', { name: /^Exporter/ }).click()
    await expect(page.locator('.feuille')).toBeVisible()
    expect(await opaque(page.locator('.feuille'))).toEqual({ flou: 'none', alpha: 1 })

    // Contrôle : sans la préférence, l'en-tête défilé est bien translucide (la règle fait la différence).
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] })
    await page.keyboard.press('Escape')
    await expect(page.locator('.feuille')).toHaveCount(0)
    const r = await opaque(page.locator('.grille-tete'))
    expect(r.alpha).toBeLessThan(1)
    expect(r.flou).toContain('blur')
    expect((await jetons())[0]).toContain('transparent')
  } finally {
    await contexte.close()
    await navigateur!.close()
  }
})
