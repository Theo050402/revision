import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { MAINTENANT, creneau, item, semer } from './graine-calendrier'

// Fiches (créneau, indisponibilité) et Réglages (tâche 19). Données : celles du calendrier. « Maintenant » figé :
// mercredi 4 novembre 2026, 10 h 30 à Paris.

const MESSAGE_PERSISTANCE = "Pense à sauvegarder régulièrement : iOS peut effacer les données de l'app si l'espace manque."

async function ouvrir(page: Page, extra?: Parameters<typeof semer>[1]) {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, extra)
  await expect(page.locator('.bloc-creneau').first()).toBeAttached()
}

async function versReglages(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible()
}

async function retourCalendrier(page: Page) {
  await page.getByRole('button', { name: 'Retour au calendrier' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
}

const colonne = (page: Page, jour: string) => page.locator(`.colonne[data-jour="${jour}"]`)
const bloc = (page: Page, id: string) => page.locator(`[data-creneau="${id}"]`)

/** Texte de l'anneau : dans le panneau (iPad) ou dans la feuille « Items » (iPhone). */
async function progression(page: Page, info: TestInfo): Promise<string> {
  if (info.project.name === 'iphone') {
    await page.getByRole('button', { name: 'Items', exact: true }).click()
    const feuille = page.getByRole('dialog', { name: 'Items' })
    const texte = (await feuille.getByTestId('progression').textContent()) ?? ''
    await feuille.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    return texte
  }
  return (await page.locator('#panneau-bibliotheque').getByTestId('progression').textContent()) ?? ''
}

async function contenuTelecharge(page: Page, declencheur: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), declencheur()])
  return { nom: download.suggestedFilename(), texte: (await readFile(await download.path())).toString('utf8') }
}

async function lireTable<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    (nom) =>
      new Promise<unknown[]>((resolve, reject) => {
        const ouverture = indexedDB.open('revisions')
        ouverture.onerror = () => reject(ouverture.error)
        ouverture.onsuccess = () => {
          const req = ouverture.result.transaction(nom, 'readonly').objectStore(nom).getAll()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }
      }),
    table,
  ) as Promise<T[]>
}

type Reglages = { rythme: { pages: number }; dureeMax: number; rappel: number; pas: number }

/** Attend que les réglages écrits en base satisfassent `ok` (l'écriture est asynchrone : avant un rechargement). */
async function reglagesEnBase(page: Page, ok: (r: Reglages) => boolean) {
  await expect
    .poll(async () => {
      const [ligne] = (await lireTable<{ cle: string; valeur: Reglages }>(page, 'meta')).filter((m) => m.cle === 'reglages')
      return ligne !== undefined && ok(ligne.valeur)
    })
    .toBe(true)
}

// ───────────────────────────── Fiche créneau ─────────────────────────────

test('un tap sur un créneau ouvre sa fiche ; « ✓ Fait » fait avancer l’anneau', async ({ page }, info) => {
  // Un item dont l'unique créneau est un T1 : le cocher le fait « vu au 1er tour ».
  await ouvrir(page, {
    items: [item('c1', 299, 'Cancer du rein', 12)],
    creneaux: [creneau('cr-solo', 'c1:299', '2026-11-04T16:00', 90)],
  })
  expect(await progression(page, info)).toContain('0 / 367 items')

  await bloc(page, 'cr-solo').click()
  const fiche = page.getByRole('dialog', { name: '299 · Cancer du rein' })
  await expect(fiche).toBeVisible()
  await expect(fiche).toContainText('mercredi 4 nov. · 16h–17h30')
  await expect(fiche).toContainText('Cancérologie')
  await expect(fiche).toContainText('T1')
  await expect(fiche).toContainText('1h30')
  await expect(fiche).not.toContainText('personnalisée')

  const fait = fiche.getByRole('button', { name: '✓ Fait' })
  await expect(fait).toHaveAttribute('aria-pressed', 'false')
  await fait.click()
  await expect(fait).toHaveAttribute('aria-pressed', 'true')
  await expect(bloc(page, 'cr-solo').locator('.bloc-coche')).toHaveCount(1)

  await fiche.getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await progression(page, info)).toContain('1 / 367 items')
})

test('la fiche enregistre la note, rend le focus au bloc et supprime (annulable)', async ({ page }) => {
  await ouvrir(page)
  await bloc(page, 'cr-d').click()
  const fiche = page.getByRole('dialog')
  await fiche.getByLabel('Note').fill('Revoir le schéma de stadification')
  // Fermer sans quitter le champ : la note est quand même enregistrée.
  await fiche.getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(bloc(page, 'cr-d')).toBeFocused()

  await bloc(page, 'cr-d').click()
  await expect(page.getByRole('dialog').getByLabel('Note')).toHaveValue('Revoir le schéma de stadification')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Au clavier : Entrée ouvre la fiche.
  await bloc(page, 'cr-d').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(bloc(page, 'cr-d')).toHaveCount(0)
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(bloc(page, 'cr-d')).toHaveCount(1)
})

test('un créneau redimensionné est signalé « personnalisée »', async ({ page }) => {
  await ouvrir(page)
  await semerPerso(page)
  await bloc(page, 'cr-d').click()
  await expect(page.getByRole('dialog')).toContainText('personnalisée')
})

/** Marque cr-d « durée personnalisée » directement en base, puis recharge. */
async function semerPerso(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const o = indexedDB.open('revisions')
        o.onerror = () => reject(o.error)
        o.onsuccess = () => {
          const db = o.result
          const tx = db.transaction('creneaux', 'readwrite')
          const st = tx.objectStore('creneaux')
          const g = st.get('cr-d')
          g.onsuccess = () => st.put({ ...g.result, dureePerso: true })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.reload()
  await expect(bloc(page, 'cr-d')).toBeAttached()
}

// ───────────────────────────── Fiche indisponibilité ─────────────────────────────

test('la fiche d’une indisponibilité se modifie et se supprime', async ({ page }, info) => {
  await ouvrir(page)
  if (info.project.name === 'iphone') {
    await page.getByRole('button', { name: 'Jour précédent' }).click()
    await page.getByRole('button', { name: 'Jour précédent' }).click()
  }
  const stage = colonne(page, '2026-11-02').locator('[data-indispo="in-stage"]')
  await stage.click()
  const fiche = page.getByRole('dialog', { name: 'Stage' })
  await expect(fiche).toBeVisible()
  await expect(fiche.getByLabel('Début')).toHaveValue('08:00')
  await expect(fiche.getByLabel('Fin')).toHaveValue('13:00')
  await expect(fiche).toContainText('Ponctuelle')

  // Fin avant début : refusé, rien n'est enregistrable.
  await fiche.getByLabel('Fin').fill('07:00')
  await expect(fiche.getByText('La fin doit suivre le début.')).toBeVisible()
  await expect(fiche.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await fiche.getByLabel('Fin').fill('12:00')

  await fiche.getByLabel('Titre').fill('Stage hôpital')
  await fiche.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(stage).toContainText('Stage hôpital')
  await expect(stage).toContainText('8h–12h')
  await expect(stage).toBeFocused()

  await stage.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(stage).toHaveCount(0)
})

// ───────────────────────────── Durées ─────────────────────────────

test('Réglages › Durées : l’aperçu suit le rythme, les créneaux existants gardent leur durée', async ({ page }) => {
  await ouvrir(page)
  const labelA = await bloc(page, 'cr-d').getAttribute('aria-label')
  await versReglages(page)
  const apercu = page.getByTestId('apercu-durees')
  await expect(apercu).toHaveText('Item de 18 p → T1 : 2h15 · T2 : 1h15 · T3 : 45 min')

  await page.getByLabel('Pages du rythme').fill('6')
  await expect(apercu).toHaveText('Item de 18 p → T1 : 3h00 · T2 : 1h30 · T3 : 1h00')
  await page.getByRole('button', { name: 'Enregistrer les durées' }).click()
  await expect(page.getByRole('button', { name: 'Enregistrer les durées' })).toBeDisabled()
  await reglagesEnBase(page, (r) => r.rythme.pages === 6)

  // Persisté (rechargement) ; les créneaux déjà posés n'ont pas bougé.
  await page.reload()
  await versReglages(page)
  await expect(page.getByLabel('Pages du rythme')).toHaveValue('6')
  await expect(page.getByTestId('apercu-durees')).toHaveText('Item de 18 p → T1 : 3h00 · T2 : 1h30 · T3 : 1h00')
  await retourCalendrier(page)
  await expect(bloc(page, 'cr-d')).toHaveAttribute('aria-label', labelA as string)
})

test('Réglages › Durées : une durée max invalide bloque l’enregistrement', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const enregistrer = page.getByRole('button', { name: 'Enregistrer les durées' })
  await page.getByLabel('Durée maximale').fill('170')
  await expect(page.getByText('Doit être un multiple de 15 min.')).toBeVisible()
  await expect(page.getByLabel('Durée maximale')).toHaveAttribute('aria-invalid', 'true')
  await expect(enregistrer).toBeDisabled()

  await page.getByLabel('Durée maximale').fill('15')
  await page.getByLabel('Durée minimale').fill('30')
  await expect(page.getByText('Au moins égale à la durée minimale.')).toBeVisible()
  await expect(enregistrer).toBeDisabled()

  await page.getByLabel('Durée maximale').fill('240')
  await expect(enregistrer).toBeEnabled()
  await enregistrer.click()
  await reglagesEnBase(page, (r) => r.dureeMax === 240)
  await page.reload()
  await versReglages(page)
  await expect(page.getByLabel('Durée maximale')).toHaveValue('240')
})

test('Réglages › Journée : bornes inversées refusées ; changer le pas recale les durées', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const enregistrer = page.getByRole('button', { name: 'Enregistrer la journée' })
  await page.getByLabel('Début de journée').fill('23:30')
  await expect(page.getByText('Le début doit précéder la fin.')).toBeVisible()
  await expect(enregistrer).toBeDisabled()
  await page.getByLabel('Début de journée').fill('08:00')
  const pas = page.getByRole('group', { name: 'Pas de la grille' })
  await pas.getByRole('button', { name: '10 min' }).click()
  await expect(page.getByText('Les durées minimale et maximale passeront à 30 et 180 min')).toHaveCount(0)
  await pas.getByRole('button', { name: '5 min', exact: true }).click()
  await enregistrer.click()
  await expect(pas.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await retourCalendrier(page)
  await expect(page.locator('.grille')).toHaveAttribute('data-plage-debut', '480')
})

// ───────────────────────────── Récurrence ─────────────────────────────

test('créer « Stage » lun→ven 8h–13h : blocs hachurés et conflit signalé', async ({ page }) => {
  // Sans 290, un seul créneau chevauche le stage (291, mercredi 9 h).
  await ouvrir(page, { sansCreneaux: ['c1:290'] })
  await versReglages(page)
  await page.getByRole('button', { name: '+ Récurrence' }).click()
  const form = page.getByRole('dialog', { name: 'Nouvelle récurrence' })

  // Formulaire invalide : enregistrer est désactivé et la raison est affichée.
  await expect(form.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await form.getByLabel('Titre', { exact: true }).fill('Stage')
  await form.getByLabel('Du', { exact: true }).fill('2026-11-02')
  await form.getByLabel('Au', { exact: true }).fill('2026-11-06')
  await form.getByLabel('De', { exact: true }).fill('08:00')
  await form.getByLabel('À', { exact: true }).fill('07:00')
  await expect(form.getByText('La fin doit suivre le début.')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await form.getByLabel('À', { exact: true }).fill('13:00')
  await expect(form.getByRole('button', { name: 'lundi' })).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByRole('button', { name: 'samedi' })).toHaveAttribute('aria-pressed', 'false')
  await form.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByRole('list', { name: 'Récurrences' })).toContainText('Stage')
  await expect(page.getByRole('list', { name: 'Récurrences' })).toContainText('lun. → ven. · 8h–13h')
  await expect(page.getByTestId('conflits')).toContainText('1 créneau chevauche “Stage”')

  await retourCalendrier(page)
  const mercredi = colonne(page, '2026-11-04').locator('.bloc-indispo')
  await expect(mercredi).toHaveCount(1)
  await expect(mercredi).toHaveCSS('background-image', /repeating-linear-gradient/)

  // Le bloc récurrent renvoie vers sa récurrence.
  await mercredi.click({ position: { x: 10, y: 200 } })
  const fiche = page.getByRole('dialog', { name: 'Stage' })
  await expect(fiche).toContainText('Fait partie de “Stage”')
  await fiche.getByRole('button', { name: 'modifier la récurrence' }).click()
  await expect(page.getByRole('dialog', { name: 'Modifier la récurrence' })).toBeVisible()
  await expect(page.getByRole('dialog').getByLabel('Titre', { exact: true })).toHaveValue('Stage')
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()

  // Supprimer la récurrence retire ses blocs (annulable).
  await page.getByRole('button', { name: 'Supprimer Stage' }).click()
  await retourCalendrier(page)
  await expect(colonne(page, '2026-11-04').locator('.bloc-indispo')).toHaveCount(0)
})

test('une récurrence de plus de 366 jours est refusée', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  await page.getByRole('button', { name: '+ Récurrence' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Titre', { exact: true }).fill('Cours')
  await form.getByLabel('Du', { exact: true }).fill('2026-01-01')
  await form.getByLabel('Au', { exact: true }).fill('2027-01-02')
  await expect(form.getByText('Au plus 366 jours.')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await form.getByLabel('Au', { exact: true }).fill('2026-12-31')
  await expect(form.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
})

// ───────────────────────────── Modifier une récurrence ─────────────────────────────

test('modifier une récurrence régénère ses blocs : jours retirés supprimés, horaires changés, conflits mis à jour', async ({ page }) => {
  await ouvrir(page, { sansCreneaux: ['c1:290'] })
  await versReglages(page)
  await page.getByRole('button', { name: '+ Récurrence' }).click()
  let form = page.getByRole('dialog', { name: 'Nouvelle récurrence' })
  await form.getByLabel('Titre', { exact: true }).fill('Stage')
  await form.getByLabel('Du', { exact: true }).fill('2026-11-02')
  await form.getByLabel('Au', { exact: true }).fill('2026-11-06')
  await form.getByLabel('De', { exact: true }).fill('08:00')
  await form.getByLabel('À', { exact: true }).fill('13:00')
  await form.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByTestId('conflits')).toContainText('1 créneau chevauche “Stage”')

  type Indispo = { id: string; source: string; debut: string; fin: string }
  const recurrentes = async () => {
    const toutes = await lireTable<Indispo>(page, 'indispos')
    return toutes.filter((i) => i.source === 'recurrente').sort((a, b) => a.debut.localeCompare(b.debut))
  }
  await expect.poll(async () => (await recurrentes()).length).toBe(5)

  // Modification : plus de mercredi (où se trouve le créneau en conflit), et de 9 h à 12 h.
  await page.getByRole('button', { name: 'Modifier Stage' }).click()
  form = page.getByRole('dialog', { name: 'Modifier la récurrence' })
  await form.getByRole('button', { name: 'mercredi' }).click()
  await form.getByLabel('De', { exact: true }).fill('09:00')
  await form.getByLabel('À', { exact: true }).fill('12:00')
  await form.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByTestId('conflits')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Récurrences' })).toContainText('lun., mar., jeu., ven. · 9h–12h')
  await expect
    .poll(async () => (await recurrentes()).map((i) => `${i.debut}>${i.fin.slice(11)}`))
    .toEqual(['2026-11-02T09:00>12:00', '2026-11-03T09:00>12:00', '2026-11-05T09:00>12:00', '2026-11-06T09:00>12:00'])
  expect(await lireTable(page, 'recurrences')).toHaveLength(1)

  await retourCalendrier(page)
  await expect(colonne(page, '2026-11-04').locator('.bloc-indispo')).toHaveCount(0)
})

// ───────────────────────────── Historique d'annulation ─────────────────────────────

const annuler = (page: Page) => page.getByRole('button', { name: 'Annuler', exact: true })

test('quitter une note inchangée ne crée aucune étape d’annulation', async ({ page }) => {
  await ouvrir(page)
  await expect(annuler(page)).toBeDisabled()
  await bloc(page, 'cr-d').click()
  const note = page.getByRole('dialog').getByLabel('Note')
  await note.focus()
  await note.blur()
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(annuler(page)).toBeDisabled()

  // Une note modifiée, elle, est annulable.
  await bloc(page, 'cr-d').click()
  await page.getByRole('dialog').getByLabel('Note').fill('à revoir')
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
  await expect(annuler(page)).toBeEnabled()
})

test('une restauration invalide laisse données et historique intacts ; une valide vide l’historique', async ({ page }) => {
  await ouvrir(page)
  await bloc(page, 'cr-d').click()
  await page.getByRole('dialog').getByRole('button', { name: '✓ Fait' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
  await expect(annuler(page)).toBeEnabled()

  await versReglages(page)
  const champ = page.locator('input[data-champ="restauration"]')
  await champ.setInputFiles({ name: 'faux.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') })
  await expect(page.getByText(/^Ce fichier n'est pas une sauvegarde de Révisions \(.+\)\./)).toBeVisible()
  await expect(annuler(page)).toBeEnabled()
  const creneaux = await lireTable<{ id: string; fait: boolean }>(page, 'creneaux')
  expect(creneaux.find((c) => c.id === 'cr-d')?.fait).toBe(true)

  // Valide : le remplacement vide l'historique (↶ désactivé).
  const { texte } = await contenuTelecharge(page, () => page.getByRole('button', { name: 'Sauvegarder' }).click())
  await champ.setInputFiles({ name: 'revisions.json', mimeType: 'application/json', buffer: Buffer.from(texte) })
  await page.getByRole('dialog').getByRole('button', { name: 'Remplacer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(annuler(page)).toBeDisabled()
})

test('renommer un collège puis annuler une opération sur un créneau garde le nom ; supprimer un collège vide l’historique', async ({ page }) => {
  await ouvrir(page)
  await bloc(page, 'cr-d').click()
  await page.getByRole('dialog').getByRole('button', { name: '✓ Fait' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
  await versReglages(page)
  const ligne = page.locator('.ligne-college[data-college="c1"]')
  await ligne.getByLabel('Nom du collège').fill('Cancéro')
  await ligne.getByLabel('Coefficient').click() // quitte le champ : le nom est enregistré
  await annuler(page).click() // annule « Fait »
  await expect(ligne.getByLabel('Nom du collège')).toHaveValue('Cancéro')
  await expect
    .poll(async () => (await lireTable<{ id: string; nom: string }>(page, 'colleges')).find((c) => c.id === 'c1')?.nom)
    .toBe('Cancéro')

  await ligne.getByRole('button', { name: 'Supprimer Cancéro' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(ligne).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Rétablir' })).toBeDisabled()
})

// ───────────────────────────── Journée et pas ─────────────────────────────

test('réduire la journée et changer le pas avec des créneaux hors bornes ou hors grille : rien ne casse', async ({ page }) => {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  // cr-odd : hors grille de 10 min (16 h 05, 55 min) ; cr-d (13 h 30) sera hors des nouvelles bornes.
  await ouvrir(page, { creneaux: [creneau('cr-odd', 'c3:304', '2026-11-04T16:05', 55)] })
  await versReglages(page)
  await page.getByLabel('Début de journée').fill('09:00')
  await page.getByLabel('Fin de journée').fill('12:00')
  await page.getByRole('group', { name: 'Pas de la grille' }).getByRole('button', { name: '10 min' }).click()
  await page.getByRole('button', { name: 'Enregistrer la journée' }).click()
  await reglagesEnBase(page, (r) => r.pas === 10)

  await retourCalendrier(page)
  for (const [id, debut, duree] of [
    ['cr-odd', '2026-11-04T16:05', '55'],
    ['cr-d', '2026-11-04T13:30', '120'],
  ]) {
    const b = bloc(page, id)
    await expect(b).toBeVisible()
    await expect(b).toHaveAttribute('data-debut', debut)
    await expect(b).toHaveAttribute('data-duree', duree)
    const boite = await b.boundingBox()
    expect(boite?.height ?? 0).toBeGreaterThan(10)
  }
  const creneaux = await lireTable<{ id: string; debut: string; duree: number }>(page, 'creneaux')
  expect(creneaux.find((c) => c.id === 'cr-odd')).toMatchObject({ debut: '2026-11-04T16:05', duree: 55 })
  expect(creneaux.find((c) => c.id === 'cr-d')).toMatchObject({ debut: '2026-11-04T13:30', duree: 120 })
  expect(erreurs).toEqual([])
})

test('enregistrer une section ne fait pas perdre la saisie d’une autre', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  // Saisie en cours (non enregistrée) dans Durées…
  await page.getByLabel('Pages du rythme').fill('7')
  // …pendant qu'on enregistre la Journée, pas compris.
  await page.getByRole('group', { name: 'Pas de la grille' }).getByRole('button', { name: '10 min' }).click()
  await page.getByRole('button', { name: 'Enregistrer la journée' }).click()
  await reglagesEnBase(page, (r) => r.pas === 10)
  await expect(page.getByLabel('Pages du rythme')).toHaveValue('7')
  await expect(page.getByRole('button', { name: 'Enregistrer les durées' })).toBeEnabled()

  // Et l'inverse : saisie dans Journée, enregistrement des Durées.
  await page.getByLabel('Début de journée').fill('08:30')
  await page.getByRole('button', { name: 'Enregistrer les durées' }).click()
  await reglagesEnBase(page, (r) => r.rythme.pages === 7)
  await expect(page.getByLabel('Début de journée')).toHaveValue('08:30')
})

// ───────────────────────────── Import .ics ─────────────────────────────

const ics = (...evts: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...evts, 'END:VCALENDAR'].join('\r\n')
const evt = (extra: string[]) =>
  ['BEGIN:VEVENT', 'DTSTART:20261110T080000', 'DTEND:20261110T100000', 'SUMMARY:Cours', ...extra, 'END:VEVENT'].join('\r\n')

test('import .ics : fichier illisible', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  await page.locator('input[data-champ="ics"]').setInputFiles({
    name: 'casse.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from('ceci n’est pas un calendrier'),
  })
  await expect(page.getByText("Ce fichier de calendrier n'a pas pu être lu.")).toBeVisible()
})

test('import .ics : une règle mensuelle est ignorée et comptée', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  await page.locator('input[data-champ="ics"]').setInputFiles({
    name: 'fac.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(ics(evt([]), evt(['RRULE:FREQ=MONTHLY']))),
  })
  await expect(page.getByText('1 règle de répétition non prise en charge, ignorée')).toBeVisible()
  await expect(page.getByText('1 indisponibilité importée.')).toBeVisible()
  await retourCalendrier(page)
  // Mardi 10 nov. est la semaine suivante (iPad) ou à deux jours (iPhone) : on le vérifie en base.
  const indispos = await lireTable<{ source: string; sourceId: string }>(page, 'indispos')
  expect(indispos.filter((i) => i.source === 'ics' && i.sourceId === 'fac.ics')).toHaveLength(1)
})

// ───────────────────────────── Collèges ─────────────────────────────

test('Réglages › Collèges : renommer, colorer, et supprimer avec confirmation', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const ligne = page.locator('.ligne-college[data-college="c1"]')
  await ligne.getByLabel('Nom du collège').fill('Cancéro')
  await ligne.getByLabel('Coefficient').fill('1,2')
  await ligne.getByRole('button', { name: 'violet' }).click()
  await expect(ligne.getByRole('button', { name: 'violet' })).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => (await lireTable<{ id: string; couleur: number }>(page, 'colleges')).find((c) => c.id === 'c1')?.couleur)
    .toBe(5)
  await page.reload()
  await versReglages(page)
  await expect(ligne.getByLabel('Nom du collège')).toHaveValue('Cancéro')
  await expect(ligne.getByLabel('Coefficient')).toHaveValue('1,2')
  const colleges = await lireTable<{ id: string; nom: string; couleur: number; coefficient: number }>(page, 'colleges')
  expect(colleges.find((c) => c.id === 'c1')).toMatchObject({ nom: 'Cancéro', couleur: 5, coefficient: 1.2 })

  // Un coefficient invalide n'est pas enregistré.
  await ligne.getByLabel('Coefficient').fill('0')
  await ligne.getByLabel('Nom du collège').click()
  await expect(ligne.getByText('Entre 0,1 et 5.')).toBeVisible()

  // Suppression : confirmation nommant le collège et ses créneaux ; annuler ne change rien.
  await ligne.getByRole('button', { name: 'Supprimer Cancéro' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Supprimer « Cancéro » ?' })
  await expect(confirmation).toContainText('7 créneaux')
  await confirmation.getByRole('button', { name: 'Annuler' }).click()
  await expect(ligne).toHaveCount(1)

  await ligne.getByRole('button', { name: 'Supprimer Cancéro' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(ligne).toHaveCount(0)
  expect((await lireTable<{ itemId: string }>(page, 'creneaux')).filter((c) => c.itemId.startsWith('c1:'))).toHaveLength(0)
})

test('Réglages › Collèges : « Réimporter » ouvre l’import du collège', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  await page.getByRole('button', { name: 'Réimporter Gynécologie' }).click()
  await expect(page.getByRole('heading', { name: /Importer|Réimporter/ })).toBeVisible()
})

// ───────────────────────────── Export, apparence ─────────────────────────────

test('Réglages › Export : le rappel se choisit et persiste', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const groupe = page.getByRole('group', { name: 'Export' })
  await expect(groupe.getByRole('button', { name: 'Aucun' })).toHaveAttribute('aria-pressed', 'true')
  await groupe.getByRole('button', { name: '15 min' }).click()
  await reglagesEnBase(page, (r) => r.rappel === 15)
  await page.reload()
  await versReglages(page)
  await expect(page.getByRole('group', { name: 'Export' }).getByRole('button', { name: '15 min' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

// ───────────────────────────── Données ─────────────────────────────

test('Réglages › Données : la sauvegarde est un JSON nommé revisions-AAAA-MM-JJ.json', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const { nom, texte } = await contenuTelecharge(page, () => page.getByRole('button', { name: 'Sauvegarder' }).click())
  expect(nom).toBe('revisions-2026-11-04.json')
  const json = JSON.parse(texte)
  expect(json.schemaVersion).toBe(1)
  expect(json.colleges).toHaveLength(3)
  expect(json.creneaux.length).toBeGreaterThan(10)
})

test('restauration : un fichier invalide est refusé, un fichier valide remplace tout', async ({ page }) => {
  await ouvrir(page)
  await versReglages(page)
  const champ = page.locator('input[data-champ="restauration"]')

  // Invalide : message de la §14 avec la raison ; les données ne bougent pas.
  await champ.setInputFiles({ name: 'faux.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') })
  await expect(
    page.getByText(
      /^Ce fichier n'est pas une sauvegarde de Révisions \(.+\)\. Tes données n'ont pas été modifiées\.$/,
    ),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await lireTable(page, 'colleges')).toHaveLength(3)
  expect((await lireTable(page, 'creneaux')).length).toBeGreaterThan(10)

  // Valide : confirmation, puis remplacement complet.
  const { texte } = await contenuTelecharge(page, () => page.getByRole('button', { name: 'Sauvegarder' }).click())
  const sauvegarde = JSON.parse(texte)
  sauvegarde.colleges = [{ ...sauvegarde.colleges[0], nom: 'Restauré' }]
  sauvegarde.items = sauvegarde.items.filter((i: { collegeId: string }) => i.collegeId === sauvegarde.colleges[0].id)
  sauvegarde.creneaux = []
  sauvegarde.indispos = []
  await champ.setInputFiles({
    name: 'revisions-2026-11-04.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sauvegarde)),
  })
  const confirmation = page.getByRole('dialog', { name: 'Remplacer toutes les données ?' })
  await expect(confirmation).toBeVisible()

  // Annuler ne change rien.
  await confirmation.getByRole('button', { name: 'Annuler' }).click()
  expect(await lireTable(page, 'colleges')).toHaveLength(3)

  await champ.setInputFiles({
    name: 'revisions-2026-11-04.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sauvegarde)),
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Remplacer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.toast', { hasText: "Si ton Calendrier ne correspond plus, utilise « Repartir d'un calendrier vide » dans Exporter." })).toBeVisible()
  await expect(page.locator('.ligne-college')).toHaveCount(1)
  await expect(page.getByLabel('Nom du collège')).toHaveValue('Restauré')
  await expect.poll(async () => (await lireTable(page, 'colleges')).length).toBe(1)
  expect(await lireTable(page, 'creneaux')).toHaveLength(0)
  await retourCalendrier(page)
  await expect(page.locator('.bloc-creneau')).toHaveCount(0)
})

test('si le navigateur refuse la persistance, Réglages › Données rappelle de sauvegarder', async ({ page }) => {
  await page.addInitScript(() => {
    StorageManager.prototype.persist = async () => false
  })
  await ouvrir(page)
  await versReglages(page)
  await expect(page.getByText(MESSAGE_PERSISTANCE)).toBeVisible()
})

test('si la persistance est accordée, aucun rappel', async ({ page }) => {
  await page.addInitScript(() => {
    StorageManager.prototype.persist = async () => true
  })
  await ouvrir(page)
  await versReglages(page)
  await expect(page.getByRole('heading', { name: 'Données' })).toBeVisible()
  await expect(page.getByText(MESSAGE_PERSISTANCE)).toHaveCount(0)
})

test('échec d’écriture (quota) : le bandeau propose « Sauvegarder »', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...a: Parameters<typeof put>) {
      if ((window as unknown as { __quota?: boolean }).__quota) throw new DOMException('quota', 'QuotaExceededError')
      return put.apply(this, a)
    }
  })
  await ouvrir(page)
  await page.evaluate(() => ((window as unknown as { __quota: boolean }).__quota = true))
  await bloc(page, 'cr-d').click()
  await page.getByRole('dialog').getByRole('button', { name: '✓ Fait' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()

  const bandeau = page.getByRole('alert').filter({ hasText: 'Plus d' })
  await expect(bandeau).toContainText("Plus d'espace pour enregistrer. Sauvegarde tes données puis libère de la place.")
  const { nom } = await contenuTelecharge(page, () => bandeau.getByRole('button', { name: 'Sauvegarder' }).click())
  expect(nom).toBe('revisions-2026-11-04.json')
})

test('lecture impossible : la restauration est le chemin de récupération', async ({ page }) => {
  await page.addInitScript(() => {
    // Seule la première ouverture de la base échoue : la lecture initiale, pas la restauration qui suit.
    const ouvrir = IDBFactory.prototype.open
    let n = 0
    IDBFactory.prototype.open = function (...a: Parameters<typeof ouvrir>) {
      if (n++ === 0) throw new DOMException('lecture refusée', 'SecurityError')
      return ouvrir.apply(this, a)
    }
  })
  await page.goto('./')
  await expect(page.getByText('Lecture impossible', { exact: false })).toBeVisible()
  await expect(page.getByText("Tes données n'ont pas été modifiées.").first()).toBeVisible()

  const base = {
    schemaVersion: 1,
    exporteLe: '2026-11-04T09:30:00.000Z',
    colleges: [{ id: 'c9', nom: 'Récupéré', couleur: 0, coefficient: 1, importeLe: '2026-10-01T10:00' }],
    items: [],
    creneaux: [],
    indispos: [],
    recurrences: [],
    suppressions: [],
    reglages: {
      rythme: { minutes: 60, pages: 8 },
      dureeMin: 30,
      dureeMax: 180,
      coefsTours: [1, 0.5, 0.35, 0.25],
      pauseMultiple: 10,
      journee: { debut: '07:00', fin: '23:00' },
      pas: 15,
      rappel: 0,
      theme: 'auto',
    },
    premierExportFait: false,
  }
  await page.locator('input[data-champ="restauration"]').setInputFiles({
    name: 'revisions.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(base)),
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Remplacer' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await expect(page.locator('.toast', { hasText: "utilise « Repartir d'un calendrier vide » dans Exporter." })).toBeVisible()
  await expect.poll(async () => (await lireTable<{ nom: string }>(page, 'colleges')).map((c) => c.nom)).toEqual(['Récupéré'])
})
