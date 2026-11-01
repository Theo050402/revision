import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { MAINTENANT, semer } from './graine-calendrier'
import { centre, pointGrille, saisir } from './gestes'

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

    // iPad : 291 glissé sur la moitié haute du bloc 300 le fait descendre (translateY) sans transition.
    const vers = await pointGrille(page, MARDI, 14, 30)
    await saisir(page, await centre(page.locator('#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="c1:291"]').first()), vers)
    const bloc = page.locator('[data-creneau="cr-a"]')
    await expect(bloc).toHaveAttribute('style', /translateY\(\d+(\.\d+)?px\)/)
    expect(await bloc.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
    expect(await bloc.evaluate((el) => el.getAnimations().length)).toBe(0)
  })

  test('sans le réglage, ce même bloc a bien une transition (la vérification n\'est pas vide)', async ({ page }, info) => {
    test.skip(iphone(info), 'le déplacement d\'un bloc se fait depuis le panneau iPad')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ouvrir(page)
    const vers = await pointGrille(page, MARDI, 14, 30)
    await saisir(page, await centre(page.locator('#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="c1:291"]').first()), vers)
    const bloc = page.locator('[data-creneau="cr-a"]')
    await expect(bloc).toHaveAttribute('style', /translateY\(\d+(\.\d+)?px\)/)
    expect(await bloc.evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe('0s')
  })
})
