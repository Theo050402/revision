// Gestes tactiles partagés par les tests e2e (dnd.spec.ts, parcours.spec.ts) : événements de pointeur
// `pointerType: 'touch'` envoyés à l'élément sous le doigt. Voir le commentaire en tête de dnd.spec.ts.
import { expect, type Locator, type Page } from '@playwright/test'

export type Point = { x: number; y: number }
export type TypePointeur = 'pointerdown' | 'pointermove' | 'pointerup'

export type Evenement = { type: TypePointeur; x: number; y: number; id?: number }

/**
 * Événements de pointeur tactiles, envoyés à l'élément sous chaque point, tous dans la même tâche (aucune image ne
 * passe entre eux). `id` : 7 par défaut (le doigt du geste), un autre nombre pour un deuxième doigt.
 */
export async function pointeurs(page: Page, evenements: Evenement[]): Promise<void> {
  await page.evaluate((evs) => {
    for (const { type, x, y, id } of evs) {
      const cible = document.elementFromPoint(x, y) ?? document.body
      cible.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: id ?? 7,
          pointerType: 'touch',
          isPrimary: (id ?? 7) === 7,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      )
    }
  }, evenements)
}

/** Un événement de pointeur tactile au point (x, y), envoyé à l'élément qui s'y trouve. */
export async function pointeur(page: Page, type: TypePointeur, p: Point, id?: number): Promise<void> {
  await pointeurs(page, [{ type, x: p.x, y: p.y, id }])
}

/**
 * Attend deux images : la boucle du glisser (une fois par image) a lu la dernière position du doigt. Le lâcher
 * dépose ce que l'aperçu montrait ; sans cette attente, une machine chargée pourrait lâcher avant l'aperçu.
 */
export async function images(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

/**
 * Après un `pointerdown` : attend que l'appui long ait pris (glisser ou lasso posent `:root[data-geste]`), plutôt
 * qu'une durée comptée côté Node : sous charge, la minuterie de 150 ms de la page peut tirer bien après 200 ms, après
 * le premier `pointermove`, qui annule alors l'appui long. Un appui qui ne saisit rien (cible inerte, appui voulu trop
 * court…) ne pose jamais le drapeau : on repart après `delai` sans échouer, le test vérifie lui-même l'issue.
 */
export async function attendreSaisie(page: Page, delai = 1500): Promise<void> {
  await page
    .waitForFunction(() => document.documentElement.hasAttribute('data-geste'), null, { timeout: delai, polling: 'raf' })
    .catch(() => undefined)
}

/** Appui long (jusqu'à ce que le geste ait pris) puis déplacement par petits pas, sans lâcher. */
export async function saisir(page: Page, de: Point, vers: Point, pas = 8): Promise<void> {
  // Le geste précédent est bien fini (sinon son drapeau passerait pour celui de cet appui).
  await page
    .waitForFunction(() => !document.documentElement.hasAttribute('data-geste'), null, { timeout: 2000 })
    .catch(() => undefined)
  await pointeur(page, 'pointerdown', de)
  await attendreSaisie(page)
  await deplacer(page, de, vers, pas)
}

export async function deplacer(page: Page, de: Point, vers: Point, pas = 8): Promise<void> {
  for (let i = 1; i <= pas; i++) {
    await pointeur(page, 'pointermove', { x: de.x + ((vers.x - de.x) * i) / pas, y: de.y + ((vers.y - de.y) * i) / pas })
  }
  await images(page) // l'aperçu a traité la dernière position
}

export async function lacher(page: Page, p: Point): Promise<void> {
  await pointeur(page, 'pointerup', p)
  await page.waitForTimeout(50)
}

export async function glisser(page: Page, de: Point, vers: Point): Promise<void> {
  await saisir(page, de, vers)
  await lacher(page, vers)
}

/**
 * Attend qu'aucune feuille ne s'anime plus (`[data-anime]`, posé par son ressort jusqu'au repos, copie de sortie
 * comprise). À appeler après avoir ouvert ou fermé une feuille, avant d'y toucher ou d'y mesurer quoi que ce soit : le
 * ressort avance au temps de ses images (pas borné à 50 ms), donc sous charge une entrée dure bien plus que prévu, et
 * `toBeVisible()` est vrai dès la première image (boîtes encore réduites, coordonnées périmées).
 */
export async function feuillePosee(page: Page): Promise<void> {
  await expect(page.locator('[data-anime]')).toHaveCount(0, { timeout: 10_000 })
}

export async function centre(l: Locator, defiler = true): Promise<Point> {
  if (defiler) {
    await l.scrollIntoViewIfNeeded()
    await images(l.page()) // mesure après le défilement
  }
  const b = await l.boundingBox()
  if (!b) throw new Error('élément invisible')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Point d'une colonne de jour à l'heure `hh:mm` (+ `dy` px). */
export async function pointGrille(page: Page, jour: string, hh: number, mm = 0, dy = 3): Promise<Point> {
  const col = page.locator(`.colonne[data-jour="${jour}"]`)
  const b = await col.boundingBox()
  if (!b) throw new Error(`colonne ${jour} invisible`)
  const debut = Number(await page.locator('.grille').getAttribute('data-plage-debut'))
  const pxHeure = Number(await page.locator('.grille').getAttribute('data-px-heure'))
  return { x: b.x + b.width / 2, y: b.y + ((hh * 60 + mm - debut) * pxHeure) / 60 + dy }
}
