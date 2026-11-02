import { expect, test, type Locator, type Page } from '@playwright/test'
import { MAINTENANT, semer } from './graine-calendrier'
import { centre, images, pointeur } from './gestes'

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

// ---------- Détails natifs (tâche 9, spec §C.6) : appui, feuilles, balayage de semaine ----------

async function ouvrirSemee(page: Page) {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

/** Échelle horizontale (a) et décalages (e, f) du `transform` calculé d'un élément. */
const matrice = (l: Locator) =>
  l.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    return { a: m.a, e: m.e, f: m.f }
  })

type Echantillon = { transform: string; opacite: number }
/** Relève, à chaque image, le `transform` et l'opacité du premier élément qui correspond (jusqu'à `echantillons`). */
async function echantillonner(page: Page, selecteur: string): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __ech: Echantillon[]; __stop: boolean }
    w.__ech = []
    w.__stop = false
    const tour = () => {
      const el = document.querySelector(sel)
      if (el) {
        const s = getComputedStyle(el)
        w.__ech.push({ transform: s.transform, opacite: Number(s.opacity) })
      }
      if (!w.__stop) requestAnimationFrame(tour)
    }
    tour()
  }, selecteur)
}
async function echantillons(page: Page): Promise<Echantillon[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __ech: Echantillon[]; __stop: boolean }
    w.__stop = true
    return w.__ech
  })
}
/** Lit un `transform` calculé (`none`, `matrix(...)` ou `matrix3d(...)`). */
function lire(t: string): { a: number; e: number; f: number } {
  if (t === 'none') return { a: 1, e: 0, f: 0 }
  const n = t.slice(t.indexOf('(') + 1, -1).split(',').map(Number)
  return t.startsWith('matrix3d') ? { a: n[0], e: n[12], f: n[13] } : { a: n[0], e: n[4], f: n[5] }
}
const echelle = (t: string) => lire(t).a
const decalage = (t: string, axe: 'e' | 'f') => lire(t)[axe]

test("appui : un bouton pressé est réduit avant le relâchement, un bloc ou une carte s'assombrit sans changer d'échelle", async ({ page }, info) => {
  await ouvrirSemee(page)
  const bouton = page.getByRole('button', { name: "Aujourd'hui" })
  expect((await matrice(bouton)).a).toBe(1)
  // Souris : l'appui du pointeur.
  const c = await centre(bouton)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await expect.poll(async () => (await matrice(bouton)).a, { timeout: 1000 }).toBeLessThan(1)
  expect((await matrice(bouton)).a).toBeGreaterThan(0.9)
  await page.mouse.up()
  await expect.poll(async () => (await matrice(bouton)).a, { timeout: 1000 }).toBe(1)

  // Doigt : un `pointerdown` tactile maintenu suffit (pas de `:active`), et l'annulation du navigateur relâche.
  const segment = page.getByRole('button', { name: 'Mois', exact: true })
  const s = await centre(segment)
  await pointeur(page, 'pointerdown', s)
  await expect.poll(async () => (await matrice(segment)).a, { timeout: 1000 }).toBeLessThan(1)
  // Un deuxième doigt qui se lève ne relâche pas l'appui du premier.
  await pointeur(page, 'pointerup', s, 9)
  await page.waitForTimeout(200)
  expect((await matrice(segment)).a).toBeLessThan(1)
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true })))
  await expect.poll(async () => (await matrice(segment)).a, { timeout: 1000 }).toBe(1)

  // Un bloc de la grille se fonce au lieu de rétrécir (il se glisse).
  const bloc = page.locator('[data-creneau="cr-c"]')
  const avant = await bloc.evaluate((el) => getComputedStyle(el).boxShadow)
  const b = await centre(bloc)
  await pointeur(page, 'pointerdown', b)
  await expect.poll(() => bloc.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 1000 }).not.toBe(avant)
  expect((await matrice(bloc)).a).toBe(1)
  await pointeur(page, 'pointerup', b)
  await expect.poll(() => bloc.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 1000 }).toBe(avant)

  if (info.project.name === 'ipad') {
    // Une carte de la bibliothèque, glissable elle aussi, se fonce sans rétrécir.
    const carte = page.locator('#panneau-bibliotheque section[aria-label="Tous les items"] .carte-corps').first()
    const k = await centre(carte)
    await pointeur(page, 'pointerdown', k)
    await expect.poll(() => carte.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 1000 }).not.toBe('none')
    expect((await matrice(carte)).a).toBe(1)
    await pointeur(page, 'pointerup', k)
  }
})

test('feuille : entrée par ressort, tirée vers le bas pour fermer (iPhone) ou popover qui grandit depuis son bouton (iPad)', async ({ page }, info) => {
  await ouvrirSemee(page)
  await echantillonner(page, '.feuille')

  if (estIpad(info.project.name)) {
    const declencheur = page.locator('[data-creneau="cr-c"]')
    const o = await centre(declencheur)
    await declencheur.click()
    const feuille = page.getByRole('dialog')
    await expect(feuille).toBeVisible()
    await expect(page.locator('[data-anime]')).toHaveCount(0)
    // Elle est née plus petite et transparente, puis a atteint sa taille.
    const vus = await echantillons(page)
    expect(Math.min(...vus.map((v) => echelle(v.transform)))).toBeLessThan(0.95)
    expect(Math.min(...vus.map((v) => v.opacite))).toBeLessThan(0.9)
    expect(echelle(await feuille.evaluate((el) => getComputedStyle(el).transform))).toBeCloseTo(1, 3)
    // Elle grandit depuis le bloc qui l'a ouverte : `transform-origin` en est le centre (coordonnées de la feuille).
    const boite = (await feuille.boundingBox())!
    const origine = await feuille.evaluate((el) => getComputedStyle(el).transformOrigin.split(' ').map(parseFloat))
    expect(origine[0]).toBeCloseTo(o.x - boite.x, 0)
    expect(origine[1]).toBeCloseTo(o.y - boite.y, 0)
    // Elle y retourne : en se fermant elle passe par des tailles intermédiaires.
    await echantillonner(page, '.feuille')
    await page.keyboard.press('Escape')
    await expect(feuille).toHaveCount(0)
    const retour = await echantillons(page)
    expect(Math.min(...retour.map((v) => echelle(v.transform)))).toBeLessThan(0.97)
    return
  }

  await page.getByRole('button', { name: 'Items', exact: true }).click()
  const feuille = page.getByRole('dialog', { name: 'Items' })
  await expect(feuille).toBeVisible()
  await expect(page.locator('[data-anime]')).toHaveCount(0)
  const hauteur = (await feuille.boundingBox())!.height
  // Entrée par le bas : d'abord décalée de presque toute sa hauteur, puis posée.
  const vus = await echantillons(page)
  expect(Math.max(...vus.map((v) => decalage(v.transform, 'f')))).toBeGreaterThan(hauteur * 0.5)
  expect((await matrice(feuille)).f).toBeCloseTo(0, 1)

  const prise = await centre(feuille.locator('.feuille-entete h2'), false)
  const fermee = () => expect(page.getByRole('dialog')).toHaveCount(0)

  // Tirée de 20 % seulement, lentement : elle suit le doigt 1:1 puis revient par ressort.
  await pointeur(page, 'pointerdown', prise)
  await page.waitForTimeout(150)
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y + 40 })
  await page.waitForTimeout(150)
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y + hauteur * 0.2 })
  await images(page)
  expect((await matrice(feuille)).f).toBeCloseTo(hauteur * 0.2, 0)
  // Au-dessus du point de départ, la feuille résiste (élastique) : elle bouge, mais moins que le doigt.
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y - 80 })
  await images(page)
  const haut = (await matrice(feuille)).f
  expect(haut).toBeLessThan(0)
  expect(haut).toBeGreaterThan(-80)
  await page.waitForTimeout(150)
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y + hauteur * 0.2 })
  await page.waitForTimeout(200)
  await pointeur(page, 'pointerup', { x: prise.x, y: prise.y + hauteur * 0.2 })
  await expect.poll(async () => (await matrice(feuille)).f, { timeout: 2000 }).toBeCloseTo(0, 1)
  await expect(feuille).toBeVisible()

  // Tirée de plus de 30 % de sa hauteur : elle se ferme.
  await pointeur(page, 'pointerdown', prise)
  await page.waitForTimeout(120)
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y + hauteur * 0.2 })
  await page.waitForTimeout(120)
  await pointeur(page, 'pointermove', { x: prise.x, y: prise.y + hauteur * 0.35 })
  await page.waitForTimeout(200)
  await pointeur(page, 'pointerup', { x: prise.x, y: prise.y + hauteur * 0.35 })
  await fermee()
  await expect(page.getByRole('button', { name: 'Items', exact: true })).toBeFocused()

  // Un coup rapide, même court, la ferme aussi (projection de la vitesse).
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await expect(feuille).toBeVisible()
  await expect(page.locator('[data-anime]')).toHaveCount(0)
  // Cadencé dans la page (16 ms entre deux points) : 120 px en ~50 ms, soit ~2 400 px/s, bien en deçà de 30 % de la feuille.
  await page.evaluate(async ({ x, y }) => {
    const cible = document.elementFromPoint(x, y)!
    const evt = (type: string, dy: number) =>
      cible.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1 }),
      )
    const pause = () => new Promise((r) => setTimeout(r, 16))
    evt('pointerdown', 0)
    for (const dy of [40, 80, 120]) {
      await pause()
      evt('pointermove', dy)
    }
    evt('pointerup', 120)
  }, prise)
  expect(120).toBeLessThan(hauteur * 0.3)
  await fermee()

  // Un simple appui sur « Fermer » (dans la zone de prise) reste un appui : il ferme.
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await expect(feuille).toBeVisible()
  await page.getByRole('button', { name: 'Fermer' }).click()
  await fermee()
})

test('balayage de semaine : la grille suit le doigt puis se pose par ressort', async ({ page }) => {
  await ouvrirSemee(page)
  const zone = (await page.locator('.calendrier-defilement').boundingBox())!
  const periode = page.locator('.calendrier-periode')
  const avant = await periode.textContent()
  const piste = page.locator('.calendrier-piste')
  const y = zone.y + 280
  const x0 = zone.x + zone.width * 0.8

  // Trop court et lent : la grille suit le doigt (positions intermédiaires), puis revient.
  await pointeur(page, 'pointerdown', { x: x0, y })
  await pointeur(page, 'pointermove', { x: x0 - 20, y })
  await pointeur(page, 'pointermove', { x: x0 - zone.width * 0.1, y })
  await images(page)
  expect((await matrice(piste)).e).toBeCloseTo(-zone.width * 0.1, 0)
  await page.waitForTimeout(200)
  await pointeur(page, 'pointerup', { x: x0 - zone.width * 0.1, y })
  await expect.poll(async () => (await matrice(piste)).e, { timeout: 2000 }).toBeCloseTo(0, 0)
  await expect(periode).toHaveText(avant ?? '')

  // Plus de 25 % de la largeur : la semaine sort, la suivante entre par la droite et se pose.
  await pointeur(page, 'pointerdown', { x: x0, y })
  await pointeur(page, 'pointermove', { x: x0 - 30, y })
  await pointeur(page, 'pointermove', { x: x0 - zone.width * 0.4, y })
  await images(page)
  expect((await matrice(piste)).e).toBeCloseTo(-zone.width * 0.4, 0)
  await page.waitForTimeout(200)
  await echantillonner(page, '.calendrier-piste')
  await pointeur(page, 'pointerup', { x: x0 - zone.width * 0.4, y })
  await expect(periode).not.toHaveText(avant ?? '')
  await expect.poll(async () => (await matrice(piste)).e, { timeout: 2000 }).toBeCloseTo(0, 0)
  const vus = (await echantillons(page)).map((v) => decalage(v.transform, 'e'))
  // Elle est sortie à gauche (au-delà du doigt), puis la nouvelle est entrée par la droite.
  expect(Math.min(...vus)).toBeLessThan(-zone.width * 0.6)
  expect(Math.max(...vus)).toBeGreaterThan(zone.width * 0.3)
  expect(vus.filter((e) => e > 1 && e < zone.width * 0.9).length).toBeGreaterThan(2)
})

/** Valeurs d'un axe du `transform` relevées image par image (voir `echantillonner`) : croissantes ou décroissantes ? */
const monotone = (valeurs: number[], sens: 1 | -1) => valeurs.every((v, i) => i === 0 || (v - valeurs[i - 1]) * sens >= -0.01)

test('sortie : le corps de la feuille est inerte et un appui sur Fermer ne fait pas hoqueter la sortie', async ({ page }, info) => {
  await ouvrirSemee(page)
  const bloc = page.locator('[data-creneau="cr-c"]')
  await bloc.click()
  const feuille = page.getByRole('dialog')
  await expect(feuille).toBeVisible()
  await expect(page.locator('[data-anime]')).toHaveCount(0)
  const supprimer = await centre(feuille.getByRole('button', { name: 'Supprimer' }), false)
  const fermer = await centre(feuille.getByRole('button', { name: 'Fermer' }), false)

  await echantillonner(page, '.feuille')
  await page.keyboard.press('Escape')
  // Pendant la sortie : le corps est inerte (clavier, lecteur d'écran) et ne reçoit plus le doigt ; la tête reste active.
  await expect(page.locator('.feuille[data-sortie] .feuille-corps[inert]')).toHaveCount(1)
  expect(await page.locator('.feuille .feuille-corps').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  await page.mouse.click(supprimer.x, supprimer.y)
  // Un appui sur « Fermer » en pleine sortie : elle ne s'arrête pas, ne repart pas en arrière, ne se ferme pas deux fois.
  await page.mouse.click(fermer.x, fermer.y)
  await expect(page.locator('.feuille')).toHaveCount(0)
  const vus = await echantillons(page)
  const axe = estIpad(info.project.name) ? vus.map((v) => -echelle(v.transform)) : vus.map((v) => decalage(v.transform, 'f'))
  expect(axe.length).toBeGreaterThan(3)
  expect(monotone(axe, 1)).toBe(true)
  // « Supprimer » n'a rien déclenché : le créneau est toujours là.
  await expect(bloc).toHaveCount(1)
  await expect(page.locator('.toast')).toHaveCount(0)
})

test('fermeture par le parent (Enregistrer) : la même sortie animée, puis le focus revient au bloc', async ({ page }, info) => {
  await ouvrirSemee(page)
  await page.getByRole('button', { name: 'Semaine', exact: true }).click()
  const stage = page.locator('[data-indispo="in-stage"]')
  await stage.click()
  const feuille = page.getByRole('dialog')
  await expect(feuille).toBeVisible()
  await expect(page.locator('[data-anime]')).toHaveCount(0)
  await feuille.getByRole('textbox', { name: 'Titre' }).fill('Stage de nuit')
  await echantillonner(page, '.feuille')
  await feuille.getByRole('button', { name: 'Enregistrer' }).click()
  // La fiche est retirée tout de suite (plus de dialogue), mais sa sortie se joue sur une copie sans effet.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.feuille')).toHaveCount(0)
  const vus = await echantillons(page)
  if (estIpad(info.project.name)) {
    const e = vus.map((v) => echelle(v.transform))
    expect(Math.min(...e)).toBeLessThan(0.97)
    expect(monotone(e.map((v) => -v), 1)).toBe(true)
  } else {
    const f = vus.map((v) => decalage(v.transform, 'f'))
    expect(Math.max(...f)).toBeGreaterThan(100)
    expect(monotone(f, 1)).toBe(true)
  }
  expect(vus.some((v) => v.opacite < 1) || !estIpad(info.project.name)).toBe(true)
  // Enregistré, et le focus est revenu au bloc qui avait ouvert la fiche.
  await expect(stage).toContainText('Stage de nuit')
  await expect(stage).toBeFocused()
})

test('balayage : une piste saisie en plein mouvement puis relâchée sur place se pose, sans rechanger de semaine', async ({ page }) => {
  await ouvrirSemee(page)
  const zone = (await page.locator('.calendrier-defilement').boundingBox())!
  const periode = page.locator('.calendrier-periode')
  const piste = page.locator('.calendrier-piste')
  const y = zone.y + 280
  const x0 = zone.x + zone.width * 0.8
  const avant = await periode.textContent()
  await pointeur(page, 'pointerdown', { x: x0, y })
  await pointeur(page, 'pointermove', { x: x0 - 30, y })
  await pointeur(page, 'pointermove', { x: x0 - zone.width * 0.4, y })
  await page.waitForTimeout(200)
  await pointeur(page, 'pointerup', { x: x0 - zone.width * 0.4, y })
  await expect(periode).not.toHaveText(avant ?? '')
  const apres = await periode.textContent()
  // La nouvelle semaine entre par la droite : on la saisit en route et on la relâche sans bouger.
  await expect.poll(async () => (await matrice(piste)).e, { timeout: 2000 }).toBeGreaterThan(5)
  const e0 = (await matrice(piste)).e
  expect(e0).toBeLessThan(zone.width)
  await pointeur(page, 'pointerdown', { x: x0, y })
  await page.waitForTimeout(150)
  await pointeur(page, 'pointerup', { x: x0, y })
  await expect.poll(async () => (await matrice(piste)).e, { timeout: 2000 }).toBeCloseTo(0, 0)
  await expect(periode).toHaveText(apres ?? '')
  // Rien ne reste d'inline sur la piste au repos.
  await expect.poll(() => piste.evaluate((el) => [el.style.transform, el.style.willChange])).toEqual(['', ''])
  // Un geste trop court, ou annulé, ne laisse pas will-change non plus.
  await pointeur(page, 'pointerdown', { x: x0, y })
  await pointeur(page, 'pointermove', { x: x0 - 20, y })
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true })))
  await page.evaluate(() => document.querySelector('.calendrier-defilement')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true })))
  await expect.poll(() => piste.evaluate((el) => [el.style.transform, el.style.willChange])).toEqual(['', ''])
})
