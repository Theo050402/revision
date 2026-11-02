import { afterEach, expect, test, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Fonctions JavaScript récentes absentes d'un Safari d'iPad encore en iOS 17.4–18.x.
// La version « moderne » de pdf.js les appelle sans vérifier qu'elles existent (Promise.try, …),
// ce qui faisait échouer l'import sur l'iPad avec « Ce fichier ne s'ouvre pas ».
const RECENTES: [object, string][] = [
  [Promise, 'try'],
  [URL, 'parse'],
  [Math, 'sumPrecise'],
  [Map.prototype, 'getOrInsert'],
  [Map.prototype, 'getOrInsertComputed'],
  [WeakMap.prototype, 'getOrInsert'],
  [WeakMap.prototype, 'getOrInsertComputed'],
  [Uint8Array, 'fromBase64'],
  [Uint8Array.prototype, 'toBase64'],
  [Uint8Array.prototype, 'toHex'],
  [globalThis, 'Float16Array'],
  // Itération asynchrone d'un ReadableStream (`for await … of stream`) : absente de Safari sous iPadOS 26.5,
  // utilisée par page.getTextContent() de pdf.js → « undefined is not a function (near '…e of t…') ».
  [ReadableStream.prototype, Symbol.asyncIterator as unknown as string],
  [ReadableStream.prototype, 'values'],
]

const sauvegardes: [object, string, PropertyDescriptor][] = []

afterEach(() => {
  for (const [cible, nom, desc] of sauvegardes.splice(0)) Object.defineProperty(cible, nom, desc)
})

function retirerApisRecentes() {
  for (const [cible, nom] of RECENTES) {
    const desc = Object.getOwnPropertyDescriptor(cible, nom)
    if (!desc) continue
    sauvegardes.push([cible, nom, desc])
    delete (cible as Record<string, unknown>)[nom]
  }
}

test("l'itération ajoutée d'un ReadableStream lit tout, et annule le flux sur une sortie anticipée", async () => {
  retirerApisRecentes()
  vi.resetModules()
  await import('../../src/import/pdfjs')

  const flux = (annule: () => void) =>
    new ReadableStream<number>({
      start(c) {
        ;[1, 2, 3].forEach((n) => c.enqueue(n))
        c.close()
      },
      cancel: annule,
    })

  const lus: number[] = []
  for await (const n of flux(() => {}) as unknown as AsyncIterable<number>) lus.push(n)
  expect(lus).toEqual([1, 2, 3])

  let annulations = 0
  for await (const n of flux(() => annulations++) as unknown as AsyncIterable<number>) if (n === 1) break
  expect(annulations).toBe(1)
})

test("pdf.js de l'app lit un PDF dans un navigateur sans les API JavaScript récentes", async () => {
  const pdf = await PDFDocument.create()
  const police = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([595, 842]).drawText('Item 290', { x: 125, y: 700, size: 10, font: police })
  const donnees = await pdf.save()

  retirerApisRecentes()
  vi.resetModules()
  const pdfjs = await import('../../src/import/pdfjs')

  const chargement = pdfjs.getDocument({ data: donnees, verbosity: 0 })
  const doc = await chargement.promise
  const contenu = await (await doc.getPage(1)).getTextContent()
  const texte = contenu.items.map((it) => ('str' in it ? it.str : '')).join('')
  expect(texte).toContain('Item 290')
  await chargement.destroy()
})
