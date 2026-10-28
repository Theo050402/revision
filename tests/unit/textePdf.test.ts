import { describe, expect, test, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pagesTexte } from '../../src/import/textePdf'
import { extraireEntrees } from '../../src/import/sommaire'

const H = 842
const NB_PAGES = 30

/** PDF de 30 pages en mémoire : sommaire de 3 items en page 1, items aux pages 10, 20 et 25. */
async function pdfDeTest(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const police = await pdf.embedFont(StandardFonts.Helvetica)
  for (let p = 1; p <= NB_PAGES; p++) {
    const page = pdf.addPage([595, H])
    const ecrire = (texte: string, x: number, yHaut: number) =>
      page.drawText(texte, { x, y: H - yHaut, size: 10, font: police })
    if (p === 1) {
      ecrire('Sommaire', 125, 60)
      ;[
        ['Premier titre', 10, 'Item 1'],
        ['Deuxieme titre', 20, 'Item 2'],
        ['Troisieme titre', 25, 'Item 3'],
      ].forEach(([titre, numPage, item], i) => {
        const y = 120 + i * 60
        ecrire(String(titre), 125, y)
        ecrire('.........', 400, y)
        ecrire(String(numPage), 515, y)
        ecrire(String(item), 125, y + 12)
      })
    } else if (p === 10 || p === 20 || p === 25) {
      ecrire(`Item ${p === 10 ? 1 : p === 20 ? 2 : 3}`, 125, 60)
      ecrire('Contenu de la page', 125, 100)
    } else {
      ecrire(`Texte courant page ${p}`, 125, 100)
    }
  }
  return pdf.save()
}

/** Charge le PDF avec pdf.js (build legacy, Node) ; `getPage` est espionnée et chaque `cleanup` comptée. */
async function ouvrir() {
  const tache = pdfjs.getDocument({ data: await pdfDeTest(), verbosity: 0 })
  const doc = await tache.promise
  const pagesDemandees: number[] = []
  const nettoyees: number[] = []
  const getPageOrigine = doc.getPage.bind(doc)
  vi.spyOn(doc, 'getPage').mockImplementation(async (n: number) => {
    pagesDemandees.push(n)
    const page = await getPageOrigine(n)
    const cleanupOrigine = page.cleanup.bind(page)
    page.cleanup = (...args: Parameters<typeof page.cleanup>) => {
      nettoyees.push(n)
      return cleanupOrigine(...args)
    }
    return page
  })
  return { doc, pagesDemandees, nettoyees, fermer: () => tache.destroy() }
}

const numeros = (de: number, a: number) => Array.from({ length: a - de + 1 }, (_, i) => de + i)

describe('pagesTexte', () => {
  test('page 1 : fragments avec y croissant de haut en bas, en points', async () => {
    const { doc, fermer } = await ouvrir()
    const [page1] = await pagesTexte(doc, [1])
    expect(page1.page).toBe(1)
    expect(page1.hauteur).toBe(H)
    const sommaire = page1.fragments.find((f) => f.str === 'Sommaire')!
    const item3 = page1.fragments.find((f) => f.str === 'Item 3')!
    expect(sommaire.x).toBe(125)
    expect(sommaire.y).toBeCloseTo(60, 0)
    expect(item3.y).toBeCloseTo(252, 0)
    const ys = page1.fragments.map((f) => f.y)
    expect(ys[0]).toBeLessThan(ys[ys.length - 1])
    expect(sommaire.y).toBeLessThan(item3.y)
    await fermer()
  })

  test('30 pages : cleanup appelé 30 fois et progression signalée page par page', async () => {
    const { doc, nettoyees, fermer } = await ouvrir()
    const progression: number[] = []
    const pages = await pagesTexte(doc, numeros(1, NB_PAGES), (n) => progression.push(n))
    expect(pages).toHaveLength(NB_PAGES)
    expect(pages.map((p) => p.page)).toEqual(numeros(1, NB_PAGES))
    expect(nettoyees).toHaveLength(NB_PAGES)
    expect(progression).toEqual(numeros(1, NB_PAGES))
    await fermer()
  })
})

describe('extraireEntrees sur un PDF généré', () => {
  test('stratégie « sommaire » sans jamais lire au-delà de la page 20', async () => {
    const { doc, pagesDemandees, fermer } = await ouvrir()
    const lireToutes = vi.fn(() => pagesTexte(doc, numeros(1, doc.numPages)))
    const res = await extraireEntrees(await pagesTexte(doc, numeros(1, 20)), lireToutes)
    expect(res.strategie).toBe('sommaire')
    expect(res.entrees).toEqual([
      { numeros: [1], pageDebut: 10 },
      { numeros: [2], pageDebut: 20 },
      { numeros: [3], pageDebut: 25 },
    ])
    expect(lireToutes).not.toHaveBeenCalled()
    expect(pagesDemandees.length).toBeGreaterThan(0)
    expect(pagesDemandees.filter((n) => n > 20)).toEqual([])
    await fermer()
  })
})
