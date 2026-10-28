// Ce module n'importe pdf.js que pour ses types : il est partagé par le worker et par les tests (build legacy sous Node).
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api'
import type { Fragment, PageTexte } from './sommaire'

const arrondi = (n: number) => Math.round(n * 10) / 10

/**
 * Éléments de texte pdf.js → fragments en points, origine en haut de la page.
 * `scripts/extraire-fixture.mjs` importe cette fonction : les coordonnées des fixtures et celles du worker sont identiques.
 */
export function fragmentsDe(items: ReadonlyArray<TextItem | TextMarkedContent>, hauteur: number): Fragment[] {
  return items
    .filter((it): it is TextItem => 'str' in it && it.str.trim() !== '')
    .map((it) => ({
      str: it.str,
      x: arrondi(it.transform[4]),
      y: arrondi(hauteur - it.transform[5]),
      h: arrondi(it.height),
    }))
}

/**
 * Lit les pages demandées (numéros à partir de 1), une à la fois, et libère chacune après lecture
 * (`page.cleanup()`) pour que la mémoire reste bornée sur un gros PDF. `onPage` reçoit le numéro de la page terminée.
 */
export async function pagesTexte(
  doc: PDFDocumentProxy,
  numeros: number[],
  onPage?: (n: number) => void,
): Promise<PageTexte[]> {
  const pages: PageTexte[] = []
  for (const n of numeros) {
    const page = await doc.getPage(n)
    try {
      const hauteur = page.getViewport({ scale: 1 }).height
      const contenu = await page.getTextContent()
      pages.push({ page: n, hauteur: arrondi(hauteur), fragments: fragmentsDe(contenu.items, hauteur) })
    } finally {
      page.cleanup()
    }
    onPage?.(n)
  }
  return pages
}
