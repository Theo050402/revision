import { extraireEntrees } from './sommaire'
import type { EntreeSommaire } from './catalog'
import type { MessageDepuisWorker, MessageVersWorker } from './pdf.worker'

/** Fichier qui ne s'ouvre pas : chiffré, corrompu ou pas un PDF. */
export class ErreurPdf extends Error {
  readonly code: 'illisible'
  constructor(code: 'illisible', options?: ErrorOptions) {
    super(code, options)
    this.name = 'ErreurPdf'
    this.code = code
  }
}

export type ResultatLecture = {
  entrees: EntreeSommaire[]
  strategie: 'sommaire' | 'titres' | 'aucune'
  nbPages: number
}

/**
 * Lit un PDF dans un Web Worker : les 20 premières pages d'abord, toutes les pages seulement si le sommaire ne suffit pas.
 * Ce module n'importe pas pdf.js (c'est le worker qui le fait), il reste donc léger dans le bundle initial.
 * Le worker est terminé dans tous les cas (succès ou erreur).
 */
export async function lirePdf(
  fichier: File,
  onProgres: (fait: number, total: number) => void,
): Promise<ResultatLecture> {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  try {
    const demander = (message: MessageVersWorker, transfert: Transferable[] = []) =>
      new Promise<Extract<MessageDepuisWorker, { type: 'pages' }>>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<MessageDepuisWorker>) => {
          const m = e.data
          if (m.type === 'progres') onProgres(m.fait, m.total)
          else if (m.type === 'pages') resolve(m)
          // pdf.js démarre son moteur dans le worker (pas de worker imbriqué) et y poste un message « ready » : on l'ignore.
          else if (m.type === 'erreur') reject(new ErreurPdf('illisible', { cause: new Error(`${m.nom} : ${m.message}`) }))
        }
        worker.onerror = (e) => reject(new ErreurPdf('illisible', { cause: e }))
        worker.onmessageerror = () => reject(new ErreurPdf('illisible'))
        worker.postMessage(message, transfert)
      })

    let buffer: ArrayBuffer
    try {
      buffer = await fichier.arrayBuffer()
    } catch (cause) {
      throw new ErreurPdf('illisible', { cause })
    }
    const debut = await demander({ buffer, pages: 'debut' }, [buffer])
    const resultat = await extraireEntrees(debut.pages, async () => (await demander({ pages: 'toutes' })).pages)
    onProgres(debut.nbPages, debut.nbPages)
    return { ...resultat, nbPages: debut.nbPages }
  } finally {
    worker.terminate()
  }
}
