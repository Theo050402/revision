import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { pdfCorrompu, pdfSansTexte, pdfSommaire, type FichierTest } from './pdfs'

const MESSAGE_AUCUN_ITEM = 'Aucun item trouvé dans ce PDF. Ajoute-les à la main depuis la liste officielle.'
const MESSAGE_ILLISIBLE = "Ce fichier ne s'ouvre pas. Vérifie qu'il s'agit bien d'un PDF non protégé."

/** Ouvre « + Collège » : dans le panneau (iPad) ou dans la feuille « Items » (iPhone). */
async function ouvrirImport(page: Page, info: TestInfo) {
  await page.goto('./')
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  if (info.project.name === 'iphone') await page.getByRole('button', { name: 'Items', exact: true }).click()
  await page.getByRole('button', { name: '+ Collège' }).click()
  await expect(page.getByRole('heading', { name: 'Importer un collège' })).toBeVisible()
  // La feuille de la bibliothèque s'est refermée.
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function choisir(page: Page, fichier: FichierTest) {
  await page.locator('input[type="file"]').setInputFiles(fichier)
}

/** Contenu d'une table IndexedDB (Dexie n'est pas exposé : API native). */
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

type ItemBase = { id: string; numero: number; pages: number; aVerifier: boolean }

const ligne = (page: Page, numero: number) => page.locator(`.ligne[data-numero="${numero}"]`)

test('import d\'un sommaire : progression, 4 lignes, correction des pages, enregistrement', async ({ page }, info) => {
  await ouvrirImport(page, info)
  await choisir(page, await pdfSommaire())

  // Barre de progression, puis écran de vérification.
  await expect(page.getByRole('progressbar', { name: 'Analyse du PDF' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vérifier les items' })).toBeVisible()

  // Nom proposé d'après le fichier (« CANCERO » → Cancérologie), modifiable.
  const nom = page.getByLabel('Nom du collège')
  await expect(nom).toHaveValue('Cancérologie')

  // 4 lignes ; seule la dernière est orange, avec sa raison.
  await expect(page.locator('.ligne')).toHaveCount(4)
  await expect(page.locator('.ligne[data-a-verifier="true"]')).toHaveCount(1)
  await expect(ligne(page, 293)).toHaveAttribute('data-a-verifier', 'true')
  await expect(ligne(page, 293)).toContainText('dernier item')
  await expect(ligne(page, 290)).toHaveAttribute('data-a-verifier', 'false')
  await expect(ligne(page, 290).locator('.ligne-raison')).toHaveCount(0)

  // Pages et durée du 1er tour (60 min pour 8 pages, pas de 15).
  await expect(page.getByLabel("Pages de l'item 290")).toHaveValue('8')
  await expect(ligne(page, 290).locator('.ligne-duree')).toHaveAttribute('data-duree', '1h')
  await expect(ligne(page, 291).locator('.ligne-duree')).toHaveAttribute('data-duree', '1h30')
  await expect(ligne(page, 293).locator('.ligne-duree')).toHaveAttribute('data-duree', '1h15')

  // Le champ des pages ouvre le clavier numérique.
  await expect(page.getByLabel("Pages de l'item 293")).toHaveAttribute('inputmode', 'numeric')

  // Corriger les pages met la durée à jour ; la ligne corrigée n'est plus orange.
  await page.getByLabel("Pages de l'item 293").fill('16')
  await expect(ligne(page, 293).locator('.ligne-duree')).toHaveAttribute('data-duree', '2h')
  await expect(ligne(page, 293)).toHaveAttribute('data-a-verifier', 'false')
  await page.getByLabel("Pages de l'item 291").fill('24')
  await expect(ligne(page, 291).locator('.ligne-duree')).toHaveAttribute('data-duree', '3h')

  // Une saisie invalide désactive « Valider » et revient à la dernière valeur à la sortie du champ.
  await page.getByLabel("Pages de l'item 290").fill('abc')
  await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled()
  await page.getByLabel("Pages de l'item 290").blur()
  await expect(page.getByLabel("Pages de l'item 290")).toHaveValue('8')
  await expect(page.getByRole('button', { name: 'Valider' })).toBeEnabled()

  // Supprimer par le bouton visible, puis rajouter l'item depuis la liste officielle.
  await page.getByRole('button', { name: "Supprimer l'item 292" }).click()
  await expect(page.locator('.ligne')).toHaveCount(3)
  await page.getByRole('button', { name: '+ Ajouter un item' }).click()
  const recherche = page.getByRole('dialog', { name: 'Ajouter un item' })
  await expect(recherche).toBeVisible()
  await page.getByLabel('Rechercher un item').fill('292')
  await recherche.getByRole('button', { name: /^292/ }).click()
  await page.getByLabel('Nombre de pages').fill('7')
  await recherche.getByRole('button', { name: 'Ajouter' }).click()
  await expect(recherche).toHaveCount(0)
  await expect(page.locator('.ligne')).toHaveCount(4)
  await expect(ligne(page, 292)).toHaveAttribute('data-a-verifier', 'false')
  await expect(ligne(page, 292).locator('.ligne-duree')).toHaveAttribute('data-duree', '1h')
  await expect(page.getByRole('button', { name: '+ Ajouter un item' })).toBeFocused()

  // Le nom reste modifiable.
  await nom.fill('Cancéro 4e année')

  // Cibles tactiles ≥ 44 px.
  for (const cible of [
    page.getByLabel("Pages de l'item 290"),
    page.getByRole('button', { name: "Supprimer l'item 290" }),
    page.getByRole('button', { name: '+ Ajouter un item' }),
    page.locator('.verif-pied').getByRole('button', { name: 'Annuler' }),
    page.getByRole('button', { name: 'Valider' }),
    nom,
  ]) {
    const boite = await cible.boundingBox()
    expect(boite!.height).toBeGreaterThanOrEqual(44)
    expect(boite!.width).toBeGreaterThanOrEqual(44)
  }

  // Valider : retour au calendrier, confirmation, items enregistrés.
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await expect(page.getByText('Collège ajouté : Cancéro 4e année (4 items)')).toBeVisible()
  // L'ajout d'un collège n'entre pas dans l'historique d'annulation (§9.6).
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled()

  await expect.poll(async () => (await lireTable<ItemBase>(page, 'items')).length).toBe(4)
  const colleges = await lireTable<{ id: string; nom: string; couleur: number }>(page, 'colleges')
  expect(colleges).toHaveLength(1)
  expect(colleges[0]).toMatchObject({ nom: 'Cancéro 4e année', couleur: 0 })
  const items = (await lireTable<ItemBase>(page, 'items')).sort((a, b) => a.numero - b.numero)
  expect(items.map((i) => [i.numero, i.pages, i.aVerifier])).toEqual([
    [290, 8, false],
    [291, 24, false],
    [292, 7, false],
    [293, 16, false],
  ])
  expect(items[0].id).toBe(`${colleges[0].id}:290`)
})

test('glisser une ligne vers la gauche découvre « Supprimer » ; Annuler n\'enregistre rien', async ({ page }, info) => {
  await ouvrirImport(page, info)
  await choisir(page, await pdfSommaire())
  await expect(page.locator('.ligne')).toHaveCount(4)

  const contenu = ligne(page, 290).locator('.ligne-contenu')
  const boite = (await contenu.boundingBox())!
  // On saisit la ligne sur son titre (pas sur le champ des pages) et on la tire vers la gauche.
  const y = boite.y + 20
  const x = boite.x + 90
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 40, y, { steps: 6 })
  await page.mouse.move(x - 80, y, { steps: 6 })
  await page.mouse.up()
  await expect(contenu).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -96, 0)')

  await ligne(page, 290).locator('.ligne-glisse').click()
  await expect(page.locator('.ligne')).toHaveCount(3)
  await expect(ligne(page, 290)).toHaveCount(0)

  // Un petit glissement ne supprime rien et la ligne revient.
  const contenu2 = ligne(page, 291).locator('.ligne-contenu')
  const b2 = (await contenu2.boundingBox())!
  const y2 = b2.y + 20
  await page.mouse.move(b2.x + 90, y2)
  await page.mouse.down()
  await page.mouse.move(b2.x + 60, y2, { steps: 4 })
  await page.mouse.up()
  await expect(contenu2).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, -96, 0)')

  // Annuler : retour au calendrier, rien n'est écrit.
  await page.locator('.verif-pied').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  expect(await lireTable(page, 'colleges')).toHaveLength(0)
  expect(await lireTable(page, 'items')).toHaveLength(0)
})

test('PDF sans texte : message de la §14, liste vide, ajout à la main', async ({ page }, info) => {
  await ouvrirImport(page, info)
  await choisir(page, await pdfSansTexte())

  await expect(page.getByText(MESSAGE_AUCUN_ITEM, { exact: true })).toBeVisible()
  await expect(page.locator('.ligne')).toHaveCount(0)
  // « + Ajouter un item » est mis en avant (bouton principal) et « Valider » attend au moins un item.
  const ajout = page.getByRole('button', { name: '+ Ajouter un item' })
  await expect(ajout).toHaveClass(/btn-principal/)
  await expect(page.getByRole('button', { name: 'Valider' })).toBeDisabled()

  await ajout.click()
  await page.getByLabel('Rechercher un item').fill('290')
  await page.getByRole('dialog', { name: 'Ajouter un item' }).getByRole('button', { name: /^290/ }).click()
  await page.getByLabel('Nombre de pages').fill('12')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ligne')).toHaveCount(1)
  await expect(page.getByText(MESSAGE_AUCUN_ITEM, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Valider' })).toBeEnabled()
})

test('fichier corrompu : message « illisible » de la §14, on peut en choisir un autre', async ({ page }, info) => {
  await ouvrirImport(page, info)
  await choisir(page, pdfCorrompu())

  await expect(page.getByRole('alert')).toHaveText(MESSAGE_ILLISIBLE)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Choisir un autre PDF' })).toBeVisible()

  // Le même champ accepte un autre fichier.
  await choisir(page, await pdfSansTexte())
  await expect(page.getByText(MESSAGE_AUCUN_ITEM, { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('annuler depuis le choix du fichier revient au calendrier', async ({ page }, info) => {
  await ouvrirImport(page, info)
  await page.locator('.import-actions').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
})

/**
 * Retient les messages du worker d'analyse tant que le test ne les libère pas : l'analyse reste « en cours » aussi
 * longtemps que nécessaire, quelle que soit la charge de la machine (un PDF léger se lit en moins de 450 ms, délai
 * minimum de l'écran d'analyse, et le bouton disparaissait pendant que Playwright attendait qu'il soit stable).
 * `window.__worker` compte les workers créés, ceux arrêtés (`terminate`) et garde les messages retenus.
 */
type EtatWorker = { crees: number; termines: number; retenus: (() => void)[]; liberer: () => void }
const etatWorker = (page: Page) => page.evaluate(() => (window as unknown as { __worker: EtatWorker }).__worker)

async function retenirLeWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Natif = window.Worker
    const etat: EtatWorker = { crees: 0, termines: 0, retenus: [], liberer: () => etat.retenus.splice(0).forEach((f) => f()) }
    ;(window as unknown as { __worker: EtatWorker }).__worker = etat
    const reprise = Object.getOwnPropertyDescriptor(Natif.prototype, 'onmessage')!
    window.Worker = class extends Natif {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        etat.crees++
        let gestionnaire: ((e: MessageEvent) => void) | null = null
        Object.defineProperty(this, 'onmessage', {
          configurable: true,
          get: () => gestionnaire,
          set: (f: ((e: MessageEvent) => void) | null) => {
            gestionnaire = f
            reprise.set!.call(this, f && ((e: MessageEvent) => etat.retenus.push(() => f.call(this, e))))
          },
        })
      }
      terminate() {
        etat.termines++
        super.terminate()
      }
    }
  })
}

test('annuler pendant l\'analyse revient tout de suite au calendrier, sans rien ouvrir ensuite', async ({ page }, info) => {
  await retenirLeWorker(page)
  await ouvrirImport(page, info)
  await choisir(page, await pdfSommaire())
  await expect(page.getByRole('progressbar', { name: 'Analyse du PDF' })).toBeVisible()
  // Le worker est lancé et ses messages sont retenus : l'analyse est en cours aussi longtemps qu'il le faut.
  await expect.poll(async () => (await etatWorker(page)).crees).toBe(1)

  await page.locator('.import-actions').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  // L'annulation arrête le worker.
  await expect.poll(async () => (await etatWorker(page)).termines).toBeGreaterThan(0)

  // On libère ce que le worker avait déjà posté, puis on laisse passer le délai minimum de l'écran d'analyse
  // (450 ms, attendues dans la page : seul moment où un écran fantôme pourrait encore apparaître).
  await page.evaluate(
    () =>
      new Promise<void>((fini) => {
        ;(window as unknown as { __worker: EtatWorker }).__worker.liberer()
        setTimeout(fini, 700)
      }),
  )
  await expect(page.getByRole('region', { name: 'Calendrier' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vérifier les items' })).toHaveCount(0)
  expect(await lireTable(page, 'colleges')).toHaveLength(0)
})

test('un second « + Collège » est impossible tant que l\'import est ouvert', async ({ page }, info) => {
  await ouvrirImport(page, info)
  const plusCollege = () => page.getByRole('button', { name: '+ Collège' })

  // Au choix du fichier : sur iPad le bouton du panneau reste visible mais inactif.
  if (info.project.name === 'ipad') await expect(plusCollege()).toBeDisabled()

  // Pendant la vérification aussi ; sur iPhone, on le cherche dans la feuille « Items ».
  await choisir(page, await pdfSommaire())
  await expect(page.getByRole('heading', { name: 'Vérifier les items' })).toBeVisible()
  if (info.project.name === 'iphone') await page.getByRole('button', { name: 'Items', exact: true }).click()
  await expect(plusCollege()).toBeDisabled()
  if (info.project.name === 'iphone') await page.getByRole('button', { name: 'Fermer' }).click()

  // Rien n'a changé : même liste, aucun collège créé.
  await expect(page.locator('.ligne')).toHaveCount(4)
  expect(await lireTable(page, 'colleges')).toHaveLength(0)

  // Après Annuler, « + Collège » redevient actif et repart d'un écran de choix vierge.
  await page.locator('.verif-pied').getByRole('button', { name: 'Annuler' }).click()
  if (info.project.name === 'iphone') await page.getByRole('button', { name: 'Items', exact: true }).click()
  await expect(plusCollege()).toBeEnabled()
  await plusCollege().click()
  await expect(page.getByRole('heading', { name: 'Importer un collège' })).toBeVisible()
  await expect(page.locator('.ligne')).toHaveCount(0)
})
