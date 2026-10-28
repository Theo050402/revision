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
 * Le worker est terminé dans tous les cas (succès, erreur ou annulation). Si `signal` est abandonné, la lecture
 * est rejetée avec une `DOMException` d'annulation (`name === 'AbortError'`) et le worker est terminé aussitôt.
 */
export async function lirePdf(
  fichier: File,
  onProgres: (fait: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ResultatLecture> {
  if (signal?.aborted) throw new DOMException('Analyse annulée', 'AbortError')
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  // Les gestionnaires d'échec sont posés tout de suite, avant le moindre `await` : un worker qui plante
  // (script introuvable, message non clonable…) fait échouer la lecture au lieu de la laisser pendante.
  let echouer: (e: Error) => void = () => {}
  const echec = new Promise<never>((_, rejeter) => {
    echouer = rejeter
  })
  echec.catch(() => {}) // jamais « non gérée » si l'échec survient hors d'une attente
  worker.onerror = (e) => echouer(new ErreurPdf('illisible', { cause: e }))
  worker.onmessageerror = () => echouer(new ErreurPdf('illisible'))
  // Annulation : le worker est arrêté tout de suite et la lecture échoue avec une AbortError.
  const annuler = () => {
    echouer(new DOMException('Analyse annulée', 'AbortError'))
    worker.terminate()
  }
  signal?.addEventListener('abort', annuler, { once: true })

  // Un rappel de progression qui lève ne doit ni interrompre ni bloquer la lecture.
  const progres = (fait: number, total: number) => {
    try {
      onProgres(fait, total)
    } catch (e) {
      console.warn('lirePdf : le rappel de progression a levé une erreur', e)
    }
  }

  try {
    const demander = (message: MessageVersWorker, transfert: Transferable[] = []) =>
      Promise.race([
        new Promise<Extract<MessageDepuisWorker, { type: 'pages' }>>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<MessageDepuisWorker>) => {
            const m = e.data
            if (m.type === 'progres') progres(m.fait, m.total)
            else if (m.type === 'pages') resolve(m)
            // pdf.js démarre son moteur dans le worker (pas de worker imbriqué) et y poste un message « ready » : on l'ignore.
            else if (m.type === 'erreur') reject(new ErreurPdf('illisible', { cause: new Error(`${m.nom} : ${m.message}`) }))
          }
          worker.postMessage(message, transfert)
        }),
        echec,
      ])

    let buffer: ArrayBuffer
    try {
      buffer = await fichier.arrayBuffer()
    } catch (cause) {
      throw new ErreurPdf('illisible', { cause })
    }
    const debut = await demander({ buffer, pages: 'debut' }, [buffer])
    const resultat = await extraireEntrees(debut.pages, async () => (await demander({ pages: 'toutes' })).pages)
    progres(debut.nbPages, debut.nbPages)
    return { ...resultat, nbPages: debut.nbPages }
  } finally {
    signal?.removeEventListener('abort', annuler)
    worker.terminate()
  }
}
