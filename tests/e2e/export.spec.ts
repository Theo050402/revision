import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { MAINTENANT, creneau, semer } from './graine-calendrier'

// Export vers Calendrier (tâche 20, spec §12). Livraison par téléchargement (test sur iPad, 28/10/2026) : chaque
// action de la feuille produit un fichier .ics. Les créneaux sont semés dans IndexedDB, tous le mercredi 4 nov. 2026
// (jour courant : visible dans la vue Jour de l'iPhone comme dans la semaine de l'iPad). Seuls les tests de glisser
// (iPad) passent par le panneau de la bibliothèque.

const JOUR = '2026-11-04'
const TOUS_LES_ITEMS = ['c2:300', 'c3:301', 'c1:290', 'c1:291', 'c1:292', 'c3:304']

const bouton = (page: Page) => page.getByRole('button', { name: /^Exporter/ })
const feuille = (page: Page) => page.getByRole('dialog')
const bloc = (page: Page, id: string) => page.locator(`[data-creneau="${id}"]`)

/** Ouvre l'app avec `creneaux` pour seuls créneaux (ceux de la graine de base sont écartés). */
async function ouvrir(page: Page, creneaux: ReturnType<typeof creneau>[]): Promise<void> {
  await page.clock.setFixedTime(MAINTENANT)
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await semer(page, { creneaux, sansCreneaux: TOUS_LES_ITEMS })
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
}

async function ouvrirFeuille(page: Page): Promise<void> {
  await bouton(page).click()
  await expect(feuille(page)).toBeVisible()
}

/** Clique `nom` et lit le fichier téléchargé. */
async function telecharger(page: Page, nom: string): Promise<{ fichier: string; ics: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    feuille(page).getByRole('button', { name: nom }).click(),
  ])
  return { fichier: download.suggestedFilename(), ics: (await readFile(await download.path())).toString('utf8') }
}

/** La question qui suit un téléchargement : rien n'est marqué envoyé avant la réponse d'Emma. */
const question = (page: Page, texte: string) => feuille(page).getByText(texte, { exact: true })
const oui = (page: Page) => feuille(page).getByRole('button', { name: "Oui, c'est fait" })
const non = (page: Page) => feuille(page).getByRole('button', { name: 'Non', exact: true })

const evenements = (ics: string) => ics.match(/BEGIN:VEVENT/g)?.length ?? 0
/** Le texte du badge (la pastille est cachée aux lecteurs d'écran, mais présente dans le DOM). */
const badge = (page: Page) => page.locator('.btn-export .export-badge')

// Deux créneaux jamais exportés.
const DEUX_NOUVEAUX = () => [
  creneau('n-a', 'c1:290', `${JOUR}T09:00`, 60),
  creneau('n-b', 'c1:291', `${JOUR}T11:00`, 60),
]

test('rien de placé : le bouton Exporter est inactif', async ({ page }) => {
  await ouvrir(page, [])
  await expect(bouton(page)).toBeDisabled()
  await expect(badge(page)).toHaveCount(0)
})

test('le premier export : encart, fichier à 2 événements, badge à 0', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await expect(badge(page)).toHaveText('2')
  await expect(bouton(page)).toHaveAccessibleName('Exporter, 2 changements en attente')

  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('heading', { name: 'Nouveaux créneaux (2)' })).toBeVisible()
  await expect(feuille(page).getByText('Dans Calendrier, touche « Tout ajouter ».')).toBeVisible()
  await expect(feuille(page).getByText('Crée d\'abord un calendrier « Révisions » dans l\'app Calendrier')).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: /Créneaux modifiés/ })).toHaveCount(0)
  await expect(feuille(page).getByRole('button', { name: 'Exporter tout le planning' })).toBeVisible()

  const { fichier, ics } = await telecharger(page, 'Ajouter au Calendrier')
  expect(fichier).toBe('revisions-nouveaux.ics')
  expect(evenements(ics)).toBe(2)
  expect(ics).toContain('UID:n-a@revisions-emma')
  expect(ics).toContain('UID:n-b@revisions-emma')
  expect(ics).toContain('SEQUENCE:1')
  expect(ics).toContain('DESCRIPTION:Cancérologie · p. 290–304 (14 p)')

  // Télécharger ne marque rien : la question est posée, le badge reste.
  await expect(question(page, 'Calendrier a bien enregistré ces 2 créneaux ?')).toBeVisible()
  await expect(badge(page)).toHaveText('2')
  await oui(page).click()

  // Les deux créneaux sont marqués envoyés : plus de badge, plus d'encart, un message.
  await expect(page.locator('.toast')).toContainText('2 créneaux envoyés au Calendrier')
  await expect(feuille(page).getByRole('heading', { name: 'Nouveaux créneaux (0)' })).toBeVisible()
  await expect(feuille(page).getByText('Crée d\'abord un calendrier')).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
  await expect(bouton(page)).toBeEnabled()
  await expect(bouton(page)).toBeFocused()
  // Le suivi n'est pas annulable : « Annuler » ne le défait pas.
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()
})

test('un seul créneau envoyé : message au singulier', async ({ page }) => {
  await ouvrir(page, [creneau('n-a', 'c1:290', `${JOUR}T09:00`, 60)])
  await ouvrirFeuille(page)
  await telecharger(page, 'Ajouter au Calendrier')
  await expect(question(page, 'Calendrier a bien enregistré ce créneau ?')).toBeVisible()
  await oui(page).click()
  await expect(page.locator('.toast')).toContainText('1 créneau envoyé au Calendrier')
})

test('« Tout le planning » exporte aussi les créneaux déjà envoyés', async ({ page }) => {
  await ouvrir(page, [
    creneau('n-a', 'c1:290', `${JOUR}T09:00`, 60, { versionExportee: 1 }),
    creneau('n-b', 'c1:291', `${JOUR}T11:00`, 60),
  ])
  await ouvrirFeuille(page)
  const { fichier, ics } = await telecharger(page, 'Exporter tout le planning')
  expect(fichier).toBe('revisions-tout.ics')
  expect(evenements(ics)).toBe(2)
  await expect(question(page, 'Calendrier a bien enregistré ces 2 créneaux ?')).toBeVisible()
  await expect(badge(page)).toHaveText('1')
  await oui(page).click()
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
})

test('modifier un créneau exporté : « Créneaux modifiés (1) », SEQUENCE:2, même UID', async ({ page }) => {
  await ouvrir(page, [
    creneau('e-a', 'c1:290', `${JOUR}T09:00`, 60, { versionExportee: 1 }),
    creneau('e-b', 'c1:291', `${JOUR}T11:00`, 60, { versionExportee: 1 }),
  ])
  await expect(badge(page)).toHaveCount(0)

  // Une note change `version` (§12.3).
  await bloc(page, 'e-a').click()
  await page.getByLabel('Note').fill('Revoir le schéma')
  await page.getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveText('1')

  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (1)' })).toBeVisible()
  await expect(
    feuille(page).getByText('Calendrier te demandera de valider chaque mise à jour, une par une.'),
  ).toBeVisible()
  // Moins de 11 modifications : la procédure « Repartir d'un calendrier vide » est là, mais repliée.
  const alternative = feuille(page).locator('details.export-alternative')
  await expect(alternative).toHaveCount(1)
  await expect(alternative).not.toHaveAttribute('open', /.*/)
  await expect(alternative.locator('summary')).toHaveText("Repartir d'un calendrier vide")

  const { fichier, ics } = await telecharger(page, 'Mettre à jour dans Calendrier')
  expect(fichier).toBe('revisions-modifies.ics')
  expect(evenements(ics)).toBe(1)
  expect(ics).toMatch(/UID:e-a@revisions-emma\r\nSEQUENCE:2\r\n/)
  expect(ics).toContain('Revoir le schéma')
  // Rien n'est marqué tant qu'Emma n'a pas répondu : la section reste là, le bouton est remplacé par la question.
  await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (1)' })).toBeVisible()
  await expect(question(page, 'Calendrier a bien enregistré ce créneau ?')).toBeVisible()
  await expect(feuille(page).getByRole('button', { name: 'Mettre à jour dans Calendrier' })).toHaveCount(0)
  await oui(page).click()
  await expect(feuille(page).getByRole('heading', { name: /Créneaux modifiés/ })).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
})

test('supprimer un créneau exporté : liste à supprimer à la main, « C\'est fait » la vide', async ({ page }) => {
  await ouvrir(page, [
    creneau('e-a', 'c1:290', `${JOUR}T09:00`, 60, { versionExportee: 1 }),
    creneau('e-b', 'c1:291', `${JOUR}T11:00`, 60, { versionExportee: 1 }),
    creneau('n-c', 'c1:292', `${JOUR}T14:00`, 60),
  ])
  await expect(badge(page)).toHaveText('1')

  // Un créneau jamais exporté s'efface sans laisser de trace ; un créneau exporté laisse une suppression.
  await bloc(page, 'n-c').click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(badge(page)).toHaveCount(0)
  await bloc(page, 'e-a').click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(badge(page)).toHaveText('1')

  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toBeVisible()
  await expect(feuille(page).locator('.export-suppressions li')).toHaveCount(1)
  await expect(feuille(page).locator('.export-suppressions li')).toContainText('290')
  // Le badge compte la suppression ; aucun fichier n'est à envoyer.
  await expect(feuille(page).getByRole('heading', { name: 'Nouveaux créneaux (0)' })).toBeVisible()

  await feuille(page).getByRole('button', { name: 'C\'est fait' }).click()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
})

test('plus de 10 créneaux modifiés : procédure « Tout réexporter »', async ({ page }) => {
  const modifies = Array.from({ length: 11 }, (_, i) =>
    creneau(`m-${i}`, 'c1:290', `2026-11-${String(9 + (i % 5)).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:00`, 30, {
      version: 2,
      versionExportee: 1,
    }),
  )
  await ouvrir(page, [...modifies, creneau('e-x', 'c1:292', `${JOUR}T14:00`, 60, { versionExportee: 1 })])
  await expect(badge(page)).toHaveText('11')
  // Un créneau exporté supprimé : une suppression à faire à la main s'ajoute au badge.
  await bloc(page, 'e-x').click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(badge(page)).toHaveText('12')

  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (11)' })).toBeVisible()
  await expect(feuille(page).locator('details.export-alternative')).toHaveAttribute('open', /.*/)
  await expect(feuille(page).locator('details.export-alternative')).toHaveAttribute('data-conseille', 'true')
  await expect(feuille(page).getByText('supprime le calendrier « Révisions »')).toBeVisible()
  await expect(feuille(page).getByText('La liste des suppressions à faire à la main est alors effacée')).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toBeVisible()
  const { fichier, ics } = await telecharger(page, 'Tout réexporter')
  expect(fichier).toBe('revisions-tout.ics')
  expect(evenements(ics)).toBe(11)
  expect(ics).toContain('SEQUENCE:2')
  // Pas de marquage au téléchargement : la liste des suppressions est toujours là.
  await expect(question(page, 'Calendrier contient bien tout le planning ?')).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toBeVisible()
  await oui(page).click()
  // Le calendrier repart de zéro : la liste des suppressions est vidée avec le reste.
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
})

test('télécharger ne marque rien : la question est posée, le badge reste', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await expect(badge(page)).toHaveText('2')
  await ouvrirFeuille(page)
  await expect(feuille(page).getByText(/Calendrier a bien enregistré/)).toHaveCount(0)

  await telecharger(page, 'Ajouter au Calendrier')
  await expect(question(page, 'Calendrier a bien enregistré ces 2 créneaux ?')).toBeVisible()
  // À la place du bouton utilisé.
  await expect(feuille(page).getByRole('button', { name: 'Ajouter au Calendrier' })).toHaveCount(0)
  await expect(page.locator('.toast')).toHaveCount(0)
  await expect(badge(page)).toHaveText('2')
  await expect(feuille(page).getByRole('heading', { name: 'Nouveaux créneaux (2)' })).toBeVisible()
  for (const b of [oui(page), non(page)]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
})

test("« Oui, c'est fait » marque les créneaux envoyés", async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  await telecharger(page, 'Ajouter au Calendrier')
  await oui(page).click()
  await expect(page.locator('.toast')).toContainText('2 créneaux envoyés au Calendrier')
  await expect(feuille(page).getByText(/Calendrier a bien enregistré/)).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveCount(0)
})

test('« Non » ne marque rien et rend le bouton', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  await telecharger(page, 'Ajouter au Calendrier')
  await non(page).click()
  await expect(feuille(page).getByText(/Calendrier a bien enregistré/)).toHaveCount(0)
  await expect(feuille(page).getByRole('button', { name: 'Ajouter au Calendrier' })).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'Nouveaux créneaux (2)' })).toBeVisible()
  await expect(page.locator('.toast')).toHaveCount(0)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveText('2')
})

test("fermer sans répondre : rien n'est marqué, la question ne revient pas, même après un rechargement", async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  await telecharger(page, 'Ajouter au Calendrier')
  await expect(question(page, 'Calendrier a bien enregistré ces 2 créneaux ?')).toBeVisible()
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveText('2')

  await ouvrirFeuille(page)
  await expect(feuille(page).getByText(/Calendrier a bien enregistré/)).toHaveCount(0)
  await expect(feuille(page).getByRole('button', { name: 'Ajouter au Calendrier' })).toBeVisible()
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()

  // Fermer l'app : à la réouverture, rien n'est marqué et l'export reste proposé.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await expect(badge(page)).toHaveText('2')
  await ouvrirFeuille(page)
  await expect(feuille(page).getByText(/Calendrier a bien enregistré/)).toHaveCount(0)
  await expect(feuille(page).getByRole('button', { name: 'Ajouter au Calendrier' })).toBeVisible()
})

test("« Repartir d'un calendrier vide » : la question porte sur tout le planning, « Oui » vide les suppressions", async ({ page }) => {
  await ouvrir(page, [
    creneau('e-a', 'c1:290', `${JOUR}T09:00`, 60, { versionExportee: 1 }),
    creneau('e-b', 'c1:291', `${JOUR}T11:00`, 60, { versionExportee: 1 }),
    creneau('e-x', 'c1:292', `${JOUR}T14:00`, 60, { versionExportee: 1 }),
  ])
  await bloc(page, 'e-x').click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await ouvrirFeuille(page)
  await feuille(page).locator('details.export-alternative > summary').click()

  const { fichier, ics } = await telecharger(page, 'Tout réexporter')
  expect(fichier).toBe('revisions-tout.ics')
  expect(evenements(ics)).toBe(2)
  await expect(question(page, 'Calendrier contient bien tout le planning ?')).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toBeVisible()

  // « Non » : rien ne change.
  await non(page).click()
  await expect(feuille(page).getByRole('button', { name: 'Tout réexporter' })).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toBeVisible()

  await telecharger(page, 'Tout réexporter')
  await oui(page).click()
  await expect(page.locator('.toast', { hasText: '2 créneaux envoyés au Calendrier' })).toBeVisible()
  await expect(feuille(page).getByRole('heading', { name: 'À supprimer à la main dans Calendrier :' })).toHaveCount(0)
})

test('une mise à jour partielle : « Non » laisse le créneau modifié, un nouvel export le renvoie', async ({ page }) => {
  await ouvrir(page, [
    creneau('e-a', 'c1:290', `${JOUR}T09:00`, 60, { version: 2, versionExportee: 1 }),
    creneau('e-b', 'c1:291', `${JOUR}T11:00`, 60, { versionExportee: 1 }),
  ])
  await ouvrirFeuille(page)
  await telecharger(page, 'Mettre à jour dans Calendrier')
  await non(page).click()
  await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (1)' })).toBeVisible()
  const { ics } = await telecharger(page, 'Mettre à jour dans Calendrier')
  expect(ics).toMatch(/UID:e-a@revisions-emma\r\nSEQUENCE:2\r\n/)
  await feuille(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(badge(page)).toHaveText('1')
})

test("le bouton qui ferme la feuille s'appelle « Fermer » (jamais une icône de validation)", async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  const fermer = feuille(page).getByRole('button', { name: 'Fermer', exact: true })
  await expect(fermer).toHaveCount(1)
  await expect(fermer).toHaveText('Fermer')
  await expect(feuille(page).getByRole('button', { name: /^(✓|OK|Terminé)$/ })).toHaveCount(0)
})

test('exactement 10 créneaux modifiés : pas de procédure', async ({ page }) => {
  const modifies = Array.from({ length: 10 }, (_, i) =>
    creneau(`m-${i}`, 'c1:290', `2026-11-${String(9 + (i % 5)).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:00`, 30, {
      version: 2,
      versionExportee: 1,
    }),
  )
  await ouvrir(page, modifies)
  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (10)' })).toBeVisible()
  // Pas de mise en avant : la procédure reste repliée.
  await expect(feuille(page).locator('details.export-alternative')).not.toHaveAttribute('open', /.*/)
  await expect(feuille(page).locator('details.export-alternative')).not.toHaveAttribute('data-conseille', /.*/)
})

test('la feuille se ferme avec Échap et rend le focus au bouton', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  await expect(feuille(page).getByRole('button', { name: 'Fermer' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(feuille(page)).toHaveCount(0)
  await expect(bouton(page)).toBeFocused()
})

test('un changement du store pendant que la feuille est ouverte ne ramène pas le focus sur « Fermer »', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  await ouvrirFeuille(page)
  const fermer = feuille(page).getByRole('button', { name: 'Fermer' })
  await expect(fermer).toBeFocused()
  const ajouter = feuille(page).getByRole('button', { name: 'Ajouter au Calendrier' })
  await ajouter.focus()
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
  expect(download.suggestedFilename()).toBe('revisions-nouveaux.ics')
  await expect(question(page, 'Calendrier a bien enregistré ces 2 créneaux ?')).toBeVisible()
  // « Oui » modifie le store : le bouton Exporter se redessine et passe une nouvelle fermeture à la feuille.
  await oui(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast')).toContainText('2 créneaux envoyés au Calendrier')
  await expect(fermer).not.toBeFocused()
  // Le titre de la feuille est bien relié à la boîte de dialogue (identifiant unique).
  await expect(page.getByRole('dialog', { name: 'Exporter vers Calendrier' })).toBeVisible()
})

test('cibles de 44 px et contraste du bouton ≥ 4,5:1 en clair comme en sombre', async ({ page }) => {
  await ouvrir(page, DEUX_NOUVEAUX())
  const taille = await bouton(page).boundingBox()
  expect(taille!.height).toBeGreaterThanOrEqual(44)

  // Rapport de contraste WCAG entre la couleur du texte et le fond du bouton (couleurs calculées du navigateur).
  async function contraste(l: Locator): Promise<number> {
    return l.evaluate((el) => {
      const lum = (css: string): number => {
        const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
          const c = Number(v) / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const s = getComputedStyle(el)
      const [a, b] = [lum(s.color), lum(s.backgroundColor)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
  }
  for (const theme of ['clair', 'sombre']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await page.waitForTimeout(400) // les transitions de couleur sont terminées
    expect(await contraste(bouton(page)), `bouton, thème ${theme}`).toBeGreaterThanOrEqual(4.5)
    expect(await contraste(badge(page)), `badge, thème ${theme}`).toBeGreaterThanOrEqual(4.5)
  }
})

// ───────────────────────── Glisser (iPad : panneau de la bibliothèque) ─────────────────────────

type Point = { x: number; y: number }
type TypePointeur = 'pointerdown' | 'pointermove' | 'pointerup'

/** Événement de pointeur tactile envoyé à l'élément qui se trouve au point (voir dnd.spec.ts). */
async function pointeur(page: Page, type: TypePointeur, p: Point): Promise<void> {
  await page.evaluate(
    ([t, x, y]) => {
      const cible = document.elementFromPoint(x as number, y as number) ?? document.body
      cible.dispatchEvent(
        new PointerEvent(t as string, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x as number,
          clientY: y as number,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: t === 'pointermove' ? -1 : 0,
          buttons: t === 'pointerup' ? 0 : 1,
        }),
      )
    },
    [type, p.x, p.y] as const,
  )
}

const images = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

async function glisser(page: Page, de: Point, vers: Point): Promise<void> {
  await pointeur(page, 'pointerdown', de)
  await page.waitForTimeout(200) // appui long (150 ms)
  for (let i = 1; i <= 8; i++) {
    await pointeur(page, 'pointermove', { x: de.x + ((vers.x - de.x) * i) / 8, y: de.y + ((vers.y - de.y) * i) / 8 })
  }
  await images(page)
  await pointeur(page, 'pointerup', vers)
  await page.waitForTimeout(50)
}

async function centre(l: Locator, hauteur?: number): Promise<Point> {
  await l.scrollIntoViewIfNeeded()
  await images(l.page())
  const b = await l.boundingBox()
  if (!b) throw new Error('élément invisible')
  return { x: b.x + b.width / 2, y: hauteur === undefined ? b.y + b.height / 2 : b.y + hauteur }
}

async function pointGrille(page: Page, jour: string, hh: number, mm = 0): Promise<Point> {
  const b = await page.locator(`.colonne[data-jour="${jour}"]`).boundingBox()
  const debut = Number(await page.locator('.grille').getAttribute('data-plage-debut'))
  const pxHeure = Number(await page.locator('.grille').getAttribute('data-px-heure'))
  return { x: b!.x + b!.width / 2, y: b!.y + ((hh * 60 + mm - debut) * pxHeure) / 60 + 10 }
}

test.describe('iPad', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'gestes de la bibliothèque : panneau iPad')

  test('deux dépôts : le badge vaut 2', async ({ page }) => {
    await ouvrir(page, [])
    await expect(bouton(page)).toBeDisabled()
    const carte = (id: string) =>
      page.locator(`#panneau-bibliotheque section[aria-label="Tous les items"] [data-item-id="${id}"]`).first()
    await glisser(page, await centre(carte('c1:290')), await pointGrille(page, '2026-11-03', 14))
    await expect(badge(page)).toHaveText('1')
    await glisser(page, await centre(carte('c1:291')), await pointGrille(page, '2026-11-05', 14))
    await expect(badge(page)).toHaveText('2')
    await expect(bouton(page)).toBeEnabled()
  })

  test('déplacer un créneau exporté : SEQUENCE:2, même UID, nouvelle heure', async ({ page }) => {
    await ouvrir(page, [
      creneau('e-a', 'c1:290', `${JOUR}T09:00`, 60, { versionExportee: 1 }),
      creneau('e-b', 'c1:291', `${JOUR}T11:00`, 60, { versionExportee: 1 }),
    ])
    await expect(badge(page)).toHaveCount(0)
    await glisser(page, await centre(bloc(page, 'e-a'), 10), await pointGrille(page, '2026-11-05', 15))
    await expect(bloc(page, 'e-a')).toHaveAttribute('data-debut', '2026-11-05T15:00')
    await expect(badge(page)).toHaveText('1')

    await ouvrirFeuille(page)
    await expect(feuille(page).getByRole('heading', { name: 'Créneaux modifiés (1)' })).toBeVisible()
    const { ics } = await telecharger(page, 'Mettre à jour dans Calendrier')
    expect(evenements(ics)).toBe(1)
    expect(ics).toMatch(/UID:e-a@revisions-emma\r\nSEQUENCE:2\r\nDTSTAMP:\S+\r\nDTSTART;TZID=Europe\/Paris:20261105T150000/)
  })
})
