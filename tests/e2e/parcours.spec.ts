import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { MAINTENANT } from './graine-calendrier'
import { centre, glisser, pointGrille } from './gestes'
import { pdfSommaire } from './pdfs'

// Recette automatisée (tâche 21, spec §1) : le parcours complet d'Emma, sur les deux appareils.
// Importer un collège (PDF fabriqué) → valider → placer 3 items (iPad : glisser-déposer ; iPhone : « Planifier… »)
// → marquer un créneau « Fait » → exporter vers Calendrier → recharger : tout est conservé.
// « Maintenant » est figé au mercredi 4 nov. 2026, 10 h 30 : les créneaux sont placés l'après-midi du jour même,
// visible dans la semaine de l'iPad comme dans la vue Jour de l'iPhone.

const JOUR = '2026-11-04'
const HEURES = [14, 16, 18]
const ITEMS = [290, 291, 292]

const calendrier = (page: Page) => page.getByRole('region', { name: 'Calendrier' })
const blocs = (page: Page) => page.locator(`.colonne[data-jour="${JOUR}"] .bloc-creneau[data-creneau]`)
const badge = (page: Page) => page.locator('.btn-export .export-badge')

/** Ouvre la bibliothèque : le panneau fixe (iPad) ou la feuille « Items » (iPhone). */
async function bibliotheque(page: Page, info: TestInfo) {
  if (info.project.name === 'ipad') return page.locator('#panneau-bibliotheque')
  if ((await page.getByRole('dialog', { name: 'Items' }).count()) === 0) {
    await page.getByRole('button', { name: 'Items', exact: true }).click()
  }
  const feuille = page.getByRole('dialog', { name: 'Items' })
  await expect(feuille).toBeVisible()
  return feuille
}

async function fermerFeuilleItems(page: Page, info: TestInfo) {
  if (info.project.name !== 'iphone') return
  await page.getByRole('dialog', { name: 'Items' }).getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('parcours complet : importer, placer 3 items, marquer fait, exporter, recharger', async ({ page }, info) => {
  const iphone = info.project.name === 'iphone'
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(calendrier(page)).toBeVisible()

  // ── iPhone : la vue par défaut est Jour (une seule colonne : aujourd'hui).
  if (iphone) {
    await expect(page.getByRole('button', { name: 'Jour', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.colonne')).toHaveCount(1)
    await expect(page.locator(`.colonne[data-jour="${JOUR}"]`)).toBeVisible()
  }

  // ── Importer : la bibliothèque (feuille sur iPhone) mène à « + Collège ».
  let biblio = await bibliotheque(page, info)
  if (iphone) await expect(biblio).toHaveAttribute('role', 'dialog')
  await biblio.getByRole('button', { name: '+ Collège' }).click()
  await expect(page.getByRole('heading', { name: 'Importer un collège' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(await pdfSommaire())
  await expect(page.getByRole('heading', { name: 'Vérifier les items' })).toBeVisible()
  await expect(page.locator('.ligne')).toHaveCount(4)
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(calendrier(page)).toBeVisible()
  await expect(page.getByText('Collège ajouté : Cancérologie (4 items)')).toBeVisible()

  // ── Placer 3 items.
  if (iphone) {
    for (const [i, numero] of ITEMS.entries()) {
      biblio = await bibliotheque(page, info)
      await biblio.locator(`section[aria-label="Tous les items"] [data-item-id$=":${numero}"] .carte-corps`).click()
      await biblio.getByRole('button', { name: 'Planifier…' }).click()
      await biblio.getByLabel('Jour', { exact: true }).fill(JOUR)
      await biblio.locator('.fiche-form select').selectOption({ label: `${HEURES[i]}h` })
      await biblio.getByRole('button', { name: 'Placer' }).click()
      await expect(biblio.locator('.fiche-creneaux li')).toHaveCount(1)
      await biblio.getByRole('button', { name: /Retour/ }).click()
    }
    await fermerFeuilleItems(page, info)
  } else {
    for (const [i, numero] of ITEMS.entries()) {
      const carte = page.locator(
        `#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id$=":${numero}"]`,
      )
      await glisser(page, await centre(carte.first()), await pointGrille(page, JOUR, HEURES[i]))
      await expect(blocs(page)).toHaveCount(i + 1)
    }
  }

  // Trois blocs, aux heures choisies, sans chevauchement.
  await expect(blocs(page)).toHaveCount(3)
  const poses = await blocs(page).evaluateAll((els) =>
    els
      .map((e) => ({ id: e.getAttribute('data-creneau')!, debut: e.getAttribute('data-debut')!, duree: Number(e.getAttribute('data-duree')) }))
      .sort((a, b) => a.debut.localeCompare(b.debut)),
  )
  expect(poses.map((p) => p.debut)).toEqual(HEURES.map((h) => `${JOUR}T${h}:00`))
  for (const p of poses) expect(p.duree).toBeGreaterThan(0)
  // Pages 8, 12 et 10 d'après le sommaire : 60, 90 et 75 minutes au 1er tour.
  expect(poses.map((p) => p.duree)).toEqual([60, 90, 75])

  // ── Marquer le 2e créneau « Fait ».
  const fait = poses[1].id
  await page.locator(`[data-creneau="${fait}"]`).click()
  const fiche = page.getByRole('dialog')
  await fiche.getByRole('button', { name: /Fait/ }).click()
  await expect(fiche.getByRole('button', { name: /Fait/ })).toHaveAttribute('aria-pressed', 'true')
  await fiche.getByRole('button', { name: 'Fermer' }).click()
  await expect(page.locator(`[data-creneau="${fait}"]`)).toHaveAttribute('data-fait', 'true')

  // ── Exporter vers Calendrier : 3 nouveaux créneaux, un fichier .ics de 3 événements.
  await expect(badge(page)).toHaveText('3')
  await page.getByRole('button', { name: /^Exporter/ }).click()
  const feuille = page.getByRole('dialog')
  await expect(feuille.getByRole('heading', { name: 'Nouveaux créneaux (3)' })).toBeVisible()
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    feuille.getByRole('button', { name: 'Ajouter au Calendrier' }).click(),
  ])
  expect(telechargement.suggestedFilename()).toBe('revisions-nouveaux.ics')
  const ics = (await readFile(await telechargement.path())).toString('utf8')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  for (const p of poses) expect(ics).toContain(`UID:${p.id}@revisions-emma`)
  await expect(feuille.getByText('Calendrier a bien enregistré ces 3 créneaux ?', { exact: true })).toBeVisible()
  await feuille.getByRole('button', { name: "Oui, c'est fait" }).click()
  await expect(page.locator('.toast', { hasText: '3 créneaux envoyés au Calendrier' })).toBeVisible()
  await feuille.getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)

  // ── Recharger : tout a été conservé.
  await page.reload()
  await expect(calendrier(page)).toBeVisible()
  await expect(blocs(page)).toHaveCount(3)
  const apres = await blocs(page).evaluateAll((els) =>
    els
      .map((e) => ({ id: e.getAttribute('data-creneau')!, debut: e.getAttribute('data-debut')!, duree: Number(e.getAttribute('data-duree')), fait: e.getAttribute('data-fait') }))
      .sort((a, b) => a.debut.localeCompare(b.debut)),
  )
  expect(apres).toEqual(poses.map((p) => ({ ...p, fait: p.id === fait ? 'true' : 'false' })))
  // Badge d'export à 0 : les trois créneaux restent marqués envoyés.
  await expect(page.getByRole('button', { name: /^Exporter/ })).toBeEnabled()
  await expect(badge(page)).toHaveCount(0)
  // L'anneau de progression : un item vu au 1er tour sur les 367 de la liste officielle.
  biblio = await bibliotheque(page, info)
  await expect(biblio.getByTestId('progression')).toHaveText('1 / 367 items')
  await expect(biblio.locator('.bib-progres svg text')).toHaveText('0%')
  // Les items du collège importé sont toujours là.
  await expect(biblio.locator('section[aria-label="Tous les items"] [data-item-id$=":293"]').first()).toBeAttached()
})
