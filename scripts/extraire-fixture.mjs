// Usage : node scripts/extraire-fixture.mjs <chemin.pdf> <sortie.json>
// Extrait les fragments de texte (coordonnées en points, origine en haut) de chaque page.
import { readFileSync, writeFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const [entree, sortie] = process.argv.slice(2)
if (!entree || !sortie) {
  console.error('Usage : node scripts/extraire-fixture.mjs <chemin.pdf> <sortie.json>')
  process.exit(1)
}

const arrondi = (n) => Math.round(n * 10) / 10

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(entree)) }).promise
const pages = []
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const hauteur = page.getViewport({ scale: 1 }).height
  const contenu = await page.getTextContent()
  const fragments = contenu.items
    .filter((it) => 'str' in it && it.str.trim() !== '')
    // Pied de page publicitaire (filigrane du PDF source) : retiré pour ne pas publier d'URL tierces dans le dépôt public.
    .filter((it) => !/amis-med|t\.me\/|Pour avoir plus d/i.test(it.str))
    .map((it) => ({
      str: it.str,
      x: arrondi(it.transform[4]),
      y: arrondi(hauteur - it.transform[5]),
      h: arrondi(it.height),
    }))
  pages.push({ page: p, hauteur: arrondi(hauteur), fragments })
}
writeFileSync(sortie, JSON.stringify(pages))
console.log(`${pages.length} page(s), ${pages.reduce((n, p) => n + p.fragments.length, 0)} fragments -> ${sortie}`)
