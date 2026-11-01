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
