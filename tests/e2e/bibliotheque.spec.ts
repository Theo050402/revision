import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { MAINTENANT, creneau, item, semer } from './graine-calendrier'

// Bibliothèque d'items (tâche 17). Données : celles du calendrier (collèges Cancérologie c1, Gynécologie c2,
// Hépato-gastro c3, items 290–292, 300, 301, 304) plus des items 293–305 et quelques créneaux (voir EXTRA).

const EXTRA = {
  items: [
    item('c1', 293, "Cancer de l'enfant", 10),
    item('c1', 294, 'Tumeurs de la cavité buccale', 21),
    item('c1', 295, 'Cancer du sein', 20),
    item('c1', 296, 'Mélanome cutané', 8),
    item('c1', 297, 'Cancer du poumon', 15),
    item('c1', 298, 'Cancer de la prostate', 12),
    item('c1', 299, 'Cancer du rein', 12),
    item('c3', 302, 'Tumeurs du pancréas', 12),
    item('c3', 303, "Tumeurs de l'estomac", 16),
    item('c3', 305, "Tumeurs de l'œsophage", 12),
  ],
  creneaux: [
    // Deux items dont le T1 est fait : l'anneau affiche 2 / 367.
    creneau('cr-v1', 'c1:293', '2026-11-02T15:00', 75, { fait: true }),
    creneau('cr-v2', 'c1:295', '2026-11-03T16:00', 150, { fait: true }),
    // Deux créneaux dans le bac « À placer ».
    creneau('cr-b1', 'c1:297', null, 120),
    creneau('cr-b2', 'c1:298', null, 60, { partie: { i: 2, n: 2 } }),
  ],
}

async function ouvrir(page: Page, info: TestInfo): Promise<Locator> {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, EXTRA)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
  if (info.project.name === 'iphone') {
    await page.getByRole('button', { name: 'Items', exact: true }).click()
    const feuille = page.getByRole('dialog', { name: 'Items' })
    await expect(feuille).toBeVisible()
    return feuille
  }
  return page.locator('#panneau-bibliotheque')
}

const liste = (b: Locator) => b.locator('section[aria-label="Tous les items"]')
const ids = (l: Locator) => l.locator('[data-item-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')))

test('anneau de progression, bac « À placer » et « À planifier ensuite »', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  await expect(b.getByTestId('progression')).toHaveText('2 / 367 items')
  await expect(b.getByText('vus au 1er tour')).toBeVisible()

  // Bac : visible parce qu'il n'est pas vide, avec le nombre de créneaux ; « · i/n » pour une partie.
  await expect(b.getByTestId('badge-bac')).toHaveText('2')
  const bac = b.getByRole('region', { name: /À placer/ })
  await expect(bac.locator('[data-creneau-id]')).toHaveCount(2)
  await expect(bac.locator('[data-item-id="c1:298"]')).toContainText('T1 · 2/2 · 1h')

  // Non vus (aucun créneau), par collège puis fusionnés par numéro.
  expect(await ids(b.getByTestId('suivants'))).toEqual([
    'c1:294',
    'c1:296',
    'c1:299',
    'c3:302',
    'c3:303',
    'c3:305',
  ])
  await expect(b.getByTestId('suivants').locator('[data-item-id="c1:294"]')).toContainText('21 p · 2h45')
})

test('recherche : numéro, « oesophage », faute de frappe, filtres', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  const recherche = b.getByRole('searchbox')
  const l = liste(b)

  await recherche.fill('30')
  expect(await ids(l)).toEqual(['c2:300', 'c3:301', 'c3:302', 'c3:303', 'c3:304', 'c3:305'])
  await expect(l.getByRole('status')).toContainText('6 items')
  // Les suggestions s'effacent pendant une recherche ; le bac reste.
  await expect(b.getByTestId('suivants')).toHaveCount(0)
  await expect(b.getByTestId('badge-bac')).toBeVisible()

  await recherche.fill('oesophage')
  expect(await ids(l)).toEqual(['c3:305'])
  await recherche.fill('estomca')
  expect(await ids(l)).toEqual(['c3:303'])
  await recherche.fill('colon')
  expect(await ids(l)).toEqual(['c3:301'])
  await recherche.fill('zzzz')
  await expect(l).toContainText('Aucun item ne correspond.')

  // Filtres combinés : collège Hépato-gastro + non vus.
  await b.getByRole('button', { name: 'Effacer la recherche et les filtres' }).click()
  await expect(recherche).toHaveValue('')
  await b.getByRole('button', { name: 'Hépato-gastro', exact: true }).click()
  await expect(b.getByRole('button', { name: 'Hépato-gastro', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await ids(l)).toEqual(['c3:301', 'c3:302', 'c3:303', 'c3:304', 'c3:305'])
  const plus = b.getByRole('button', { name: /Plus de filtres/ })
  await expect(b.getByRole('button', { name: 'Non vus', exact: true })).toHaveCount(0) // repliés par défaut
  await plus.click()
  await expect(plus).toHaveAttribute('aria-expanded', 'true')
  await b.getByRole('button', { name: 'Non vus', exact: true }).click()
  expect(await ids(l)).toEqual(['c3:302', 'c3:303', 'c3:305'])
  await b.getByRole('button', { name: 'Court < 10 p' }).click()
  await expect(l).toContainText('Aucun item ne correspond.')
  await b.getByRole('button', { name: 'Court < 10 p' }).click()
  await b.getByRole('button', { name: 'Moyen 10–20 p' }).click()
  expect(await ids(l)).toEqual(['c3:302', 'c3:303', 'c3:305'])
})

test('liste : sections repliables par collège, ou triée par numéro', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  const l = liste(b)
  const tete = l.getByRole('button', { name: /Gynécologie/ })
  await expect(tete).toHaveAttribute('aria-expanded', 'true')
  expect(await ids(l)).toContain('c2:300')
  await tete.click()
  await expect(tete).toHaveAttribute('aria-expanded', 'false')
  expect(await ids(l)).not.toContain('c2:300')

  await b.getByRole('button', { name: 'Par numéro' }).click()
  const numeros = (await ids(l)).map((i) => Number(i!.split(':')[1]))
  expect(numeros).toEqual([...numeros].sort((x, y) => x - y))
  expect(numeros).toHaveLength(16) // 6 d'origine + 10 ajoutés, y compris le collège replié
  await expect(l.getByRole('button', { name: /Gynécologie/ })).toHaveCount(0)
})

test('fiche d\'item : pages, collège, créneaux datés, retour', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  await liste(b).locator('[data-item-id="c2:300"] .carte-corps').click()

  await expect(b.getByRole('heading', { name: /Tumeurs du col utérin/ })).toBeVisible()
  await expect(b.locator('.fiche-infos')).toContainText('Gynécologie')
  await expect(b.locator('.fiche-infos')).toContainText('22 p')
  await expect(b.locator('.fiche-infos')).toContainText('T2 · 1h30') // T1 : 165 min, T2 : 165 × 0,5 arrondi au pas
  await expect(b.locator('.fiche-creneaux li')).toHaveCount(3) // trois créneaux T1 dans la graine
  await expect(b.locator('.fiche-creneaux li', { hasText: 'T1 · mardi 3 nov. 14h' })).toHaveCount(1)
  // Retour : la liste revient, le focus est sur la carte ouverte.
  await b.getByRole('button', { name: /Retour/ }).click()
  await expect(b.getByTestId('progression')).toBeVisible()
  await expect(liste(b).locator('[data-item-id="c2:300"] .carte-corps')).toBeFocused()

  // Un item du bac : « À placer ».
  await b.getByRole('region', { name: /À placer/ }).locator('[data-item-id="c1:298"] .carte-corps').click()
  await expect(b.locator('.fiche-creneaux li')).toContainText('T1 · 2/2 · À placer')
})

test('sélection : cases à cocher sur les cartes', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  const l = liste(b)
  await expect(l.getByRole('checkbox')).toHaveCount(0)
  await l.getByRole('button', { name: 'Sélectionner' }).click()
  await expect(l.getByRole('button', { name: 'Terminer' })).toHaveAttribute('aria-pressed', 'true')
  await expect(l.getByRole('checkbox').first()).toBeVisible()

  await l.getByRole('checkbox', { name: /item 290,/ }).check()
  await l.getByRole('checkbox', { name: /item 291,/ }).check()
  await expect(l.locator('[data-item-id="c1:290"]')).toHaveAttribute('data-selectionnee', 'true')
  await expect(l.getByRole('status')).toContainText('2 sélectionnés')

  // En mode sélection, un tap sur la carte coche (il n'ouvre pas la fiche).
  await l.locator('[data-item-id="c1:292"] .carte-corps').click()
  await expect(l.getByRole('status')).toContainText('3 sélectionnés')
  await l.getByRole('checkbox', { name: /item 290,/ }).uncheck()
  await expect(l.getByRole('status')).toContainText('2 sélectionnés')

  await l.getByRole('button', { name: 'Terminer' }).click()
  await expect(l.getByRole('checkbox')).toHaveCount(0)
  await expect(l.locator('[data-selectionnee="true"]')).toHaveCount(0)
})

test('tailles d\'appui d\'au moins 44 px', async ({ page }, info) => {
  const b = await ouvrir(page, info)
  for (const c of [
    b.getByRole('searchbox'),
    b.getByRole('button', { name: 'Sélectionner' }),
    b.getByRole('button', { name: 'Par numéro' }),
    liste(b).getByRole('button', { name: /Gynécologie/ }),
    liste(b).locator('.carte-corps').first(),
  ]) {
    expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  // La pastille de filtre mesure 32 px et étend sa zone d'appui à 44 px (pseudo-élément).
  await b.getByRole('button', { name: /Plus de filtres/ }).click()
  const zone = await b
    .getByRole('button', { name: 'Non vus', exact: true })
    .evaluate((el) => parseFloat(getComputedStyle(el, '::after').height))
  expect(zone).toBeGreaterThanOrEqual(44)
})

test('iPhone : « Planifier… » crée un créneau, ou refuse faute de place', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'Planifier… n\'existe que sur iPhone')
  const b = await ouvrir(page, info)

  // Jeudi 5 nov. 8h–13h : indisponible (stage) ; 294 (21 p, 2h45) ne tient pas à 9h.
  await liste(b).locator('[data-item-id="c1:294"] .carte-corps').click()
  await b.getByRole('button', { name: 'Planifier…' }).click()
  await b.getByLabel('Jour', { exact: true }).fill('2026-11-05')
  await b.locator('.fiche-form select').selectOption({ label: '9h' })
  await b.getByRole('button', { name: 'Placer' }).click()
  await expect(page.locator('.toast', { hasText: 'Pas de place à cette heure' })).toBeVisible()
  await expect(b.locator('.fiche-creneaux')).toHaveCount(0) // rien n'a été créé

  // Mercredi 4 nov. à 14h : libre, le créneau apparaît dans la fiche.
  await b.getByLabel('Jour', { exact: true }).fill('2026-11-04')
  await b.locator('.fiche-form select').selectOption({ label: '14h' })
  await b.getByRole('button', { name: 'Placer' }).click()
  await expect(b.locator('.fiche-creneaux li')).toHaveCount(1)
  await expect(b.locator('.fiche-creneaux li')).toContainText('T1 · mercredi 4 nov. 14h')
})

test('iPad : pas de « Planifier… » (le glisser-déposer le remplacera)', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad', 'iPad seulement')
  const b = await ouvrir(page, info)
  await liste(b).locator('[data-item-id="c1:294"] .carte-corps').click()
  await expect(b.getByRole('heading', { name: /Tumeurs de la cavité buccale/ })).toBeVisible()
  await expect(b.getByRole('button', { name: 'Planifier…' })).toHaveCount(0)
})

test('thème sombre : cartes, titres et pastilles prennent les jetons de « Garde de nuit »', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const b = await ouvrir(page, info)
  /** Valeur calculée d'un jeton de couleur, lue sur un élément témoin (le jeton lui-même est une chaîne brute). */
  const jeton = (propriete: 'background-color' | 'color', nom: string) =>
    page.evaluate(
      ([p, n]) => {
        const temoin = document.createElement('div')
        temoin.style.setProperty(p, `var(${n})`)
        document.body.append(temoin)
        const v = getComputedStyle(temoin).getPropertyValue(p)
        temoin.remove()
        return v
      },
      [propriete, nom] as const,
    )

  // §13.2 : cartes #33264A, texte #E6E6FA. Les couleurs s'animent en 120 ms : on attend qu'elles aient fini.
  expect(await jeton('background-color', '--card')).toBe('rgb(51, 38, 74)')
  expect(await jeton('color', '--ink')).toBe('rgb(230, 230, 250)')
  const carte = liste(b).locator('.carte-item').first()
  await expect.poll(() => carte.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(51, 38, 74)')
  await expect(carte.locator('.carte-titre')).toHaveCSS('color', 'rgb(230, 230, 250)')
  await expect(b.getByRole('button', { name: 'Hépato-gastro', exact: true })).toHaveCSS('color', 'rgb(230, 230, 250)')
  // La pastille de numéro garde l'encre sombre sur le surligneur, dans les deux thèmes.
  await expect(carte.locator('.carte-pastille')).toHaveCSS('color', 'rgb(30, 42, 90)')

  // iPhone : les champs de « Planifier… » sont aussi thémés (fond des champs, texte).
  if (info.project.name === 'iphone') {
    await carte.locator('.carte-corps').click()
    await b.getByRole('button', { name: 'Planifier…' }).click()
    for (const champ of [b.getByLabel('Jour', { exact: true }), b.locator('.fiche-form select')]) {
      await expect(champ).toHaveCSS('background-color', await jeton('background-color', '--field'))
      await expect(champ).toHaveCSS('color', 'rgb(230, 230, 250)')
    }
  }
})
