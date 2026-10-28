import { afterEach, describe, expect, test, vi } from 'vitest'
import { ErreurPdf, lirePdf } from '../../src/import/lirePdf'

/** Faux Worker : enregistre ce qui lui arrive ; `repondre` simule les messages du vrai worker. */
class FauxWorker {
  static instances: FauxWorker[] = []
  static repondre: (w: FauxWorker, message: unknown) => void = () => {}
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = 0
  constructor() {
    FauxWorker.instances.push(this)
  }
  postMessage(message: unknown) {
    FauxWorker.repondre(this, message)
  }
  terminate() {
    this.terminated++
  }
  envoyer(data: unknown) {
    this.onmessage?.({ data })
  }
}

const fichier = () => new File([new Uint8Array([1, 2, 3])], 'x.pdf', { type: 'application/pdf' })
const pasDeReponse = () => {}

afterEach(() => {
  vi.unstubAllGlobals()
  FauxWorker.instances = []
  FauxWorker.repondre = pasDeReponse
})

describe('lirePdf', () => {
  test('annulation en cours de lecture : le worker est arrêté et la lecture rejetée (AbortError)', async () => {
    vi.stubGlobal('Worker', FauxWorker)
    FauxWorker.repondre = pasDeReponse // le worker ne répond jamais
    const ctrl = new AbortController()
    const lecture = lirePdf(fichier(), () => {}, ctrl.signal)
    const resultat = expect(lecture).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((r) => setTimeout(r, 10))
    ctrl.abort()
    await resultat
    expect(FauxWorker.instances).toHaveLength(1)
    expect(FauxWorker.instances[0].terminated).toBeGreaterThanOrEqual(1)
  })

  test('signal déjà abandonné : rejet immédiat, aucun worker créé', async () => {
    vi.stubGlobal('Worker', FauxWorker)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(lirePdf(fichier(), () => {}, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(FauxWorker.instances).toHaveLength(0)
  })

  test('une erreur du worker fait échouer la lecture au lieu de la laisser pendante', async () => {
    vi.stubGlobal('Worker', FauxWorker)
    const lecture = lirePdf(fichier(), () => {})
    FauxWorker.instances[0].onerror?.(new Error('script introuvable')) // avant tout await de lirePdf
    await expect(lecture).rejects.toBeInstanceOf(ErreurPdf)
    expect(FauxWorker.instances[0].terminated).toBe(1)
  })

  test('un rappel de progression qui lève ne bloque pas la lecture', async () => {
    vi.stubGlobal('Worker', FauxWorker)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    FauxWorker.repondre = (w) => {
      w.envoyer({ type: 'progres', fait: 1, total: 1 })
      w.envoyer({ type: 'pages', pages: [], nbPages: 1 })
    }
    const res = await lirePdf(fichier(), () => {
      throw new Error('rappel défectueux')
    })
    expect(res).toMatchObject({ strategie: 'aucune', nbPages: 1 })
  })
})
