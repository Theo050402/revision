// Seul fichier (avec textePdf pour les types) à importer pdf.js : il vit dans un chunk de worker à part,
// donc le JavaScript initial de l'app n'en contient rien.
import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pagesTexte } from './textePdf'
import type { PageTexte } from './sommaire'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

/** Même nombre de pages de début que `extraireEntrees` (stratégie A). */
const PAGES_DEBUT = 20

export type MessageVersWorker = {
  /** Premier message : le contenu du PDF (transféré, non copié). Les suivants réutilisent le document déjà ouvert. */
  buffer?: ArrayBuffer
  pages: 'debut' | 'toutes'
}
export type MessageDepuisWorker =
  | { type: 'progres'; fait: number; total: number }
  | { type: 'pages'; pages: PageTexte[]; nbPages: number }
  | { type: 'erreur'; nom: string; message: string }

const envoyer = (m: MessageDepuisWorker) => self.postMessage(m)

let doc: pdfjs.PDFDocumentProxy | undefined
/** Pages déjà lues : la lecture « toutes » ne relit pas les pages de début. */
const lues: PageTexte[] = []

self.onmessage = async (e: MessageEvent<MessageVersWorker>) => {
  // pdf.js écoute aussi sur `self` : on ne traite que nos propres messages.
  if (e.data?.pages !== 'debut' && e.data?.pages !== 'toutes') return
  try {
    if (e.data.buffer) {
      // PasswordException, InvalidPDFException et toute autre erreur d'ouverture sortent par le catch.
      doc = await pdfjs.getDocument({ data: new Uint8Array(e.data.buffer), verbosity: 0 }).promise
    }
    if (!doc) throw new Error('Aucun document ouvert')
    const nbPages = doc.numPages
    const jusqua = e.data.pages === 'debut' ? Math.min(PAGES_DEBUT, nbPages) : nbPages
    const restantes: number[] = []
    for (let n = lues.length + 1; n <= jusqua; n++) restantes.push(n)
    const nouvelles = await pagesTexte(doc, restantes, (fait) => envoyer({ type: 'progres', fait, total: nbPages }))
    lues.push(...nouvelles)
    envoyer({ type: 'pages', pages: lues.slice(0, jusqua), nbPages })
  } catch (err) {
    const erreur = err instanceof Error ? err : new Error(String(err))
    envoyer({ type: 'erreur', nom: erreur.name, message: erreur.message })
  }
}
