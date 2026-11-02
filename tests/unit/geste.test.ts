import { afterEach, describe, expect, it, vi } from 'vitest'
import { creerSuiviVitesse, doitFermer, elastique, fondu } from '../../src/ui/mouvement/geste'

describe('elastique', () => {
  it('est nulle sans dépassement et garde le signe', () => {
    expect(elastique(0, 700)).toBe(0)
    expect(elastique(50, 700)).toBeGreaterThan(0)
    expect(elastique(-50, 700)).toBeLessThan(0)
    expect(elastique(-50, 700)).toBeCloseTo(-elastique(50, 700), 10)
  })

  it('suit le doigt à 55 % près de la limite, de moins en moins ensuite, sans jamais dépasser la dimension', () => {
    const petit = elastique(1, 700)
    expect(petit).toBeCloseTo(0.55, 2)
    // Plus on tire, plus la part suivie diminue.
    expect(elastique(200, 700) / 200).toBeLessThan(elastique(50, 700) / 50)
    expect(elastique(1e6, 700)).toBeLessThan(700)
    // Croissante.
    let avant = 0
    for (let d = 10; d <= 2000; d += 10) {
      const v = elastique(d, 700)
      expect(v).toBeGreaterThan(avant)
      avant = v
    }
  })
})

describe('creerSuiviVitesse', () => {
  it('donne la vitesse (unités/s) sur la fenêtre récente', () => {
    const s = creerSuiviVitesse()
    s.ajouter(0, 1000)
    s.ajouter(30, 1030)
    s.ajouter(90, 1060)
    // 90 unités en 60 ms.
    expect(s.vitesse(1060)).toBeCloseTo(1500, 5)
  })

  it('ignore ce qui est plus ancien que la fenêtre (100 ms)', () => {
    const s = creerSuiviVitesse()
    s.ajouter(0, 0)
    s.ajouter(500, 50) // trop ancien à t = 200
    s.ajouter(510, 150)
    s.ajouter(530, 200)
    expect(s.vitesse(200)).toBeCloseTo(((530 - 510) / 50) * 1000, 5)
  })

  it('est nulle quand le doigt s\'est arrêté avant de se lever', () => {
    const s = creerSuiviVitesse()
    s.ajouter(0, 0)
    s.ajouter(200, 40)
    expect(s.vitesse(40)).toBeGreaterThan(0)
    expect(s.vitesse(400)).toBe(0)
    expect(creerSuiviVitesse().vitesse(10)).toBe(0)
  })

  it('borne la durée : des échantillons simultanés ne donnent pas une vitesse infinie', () => {
    const s = creerSuiviVitesse(100, 16)
    s.ajouter(0, 500)
    s.ajouter(100, 500)
    expect(s.vitesse(500)).toBeCloseTo(100 / 0.016, 5)
  })

  it('effacer repart de zéro', () => {
    const s = creerSuiviVitesse()
    s.ajouter(0, 0)
    s.ajouter(50, 20)
    s.effacer()
    expect(s.vitesse(20)).toBe(0)
  })
})

describe('doitFermer', () => {
  const H = 700

  it('ferme au-delà de 30 % de la hauteur, doigt immobile', () => {
    expect(doitFermer(H * 0.31, 0, H)).toBe(true)
    expect(doitFermer(H * 0.29, 0, H)).toBe(false)
    expect(doitFermer(0, 0, H)).toBe(false)
  })

  it('un coup vif vers le bas ferme même court (position projetée)', () => {
    expect(doitFermer(60, 2000, H)).toBe(true)
    expect(doitFermer(60, 100, H)).toBe(false)
  })

  it('un coup vers le haut ramène la feuille même très tirée', () => {
    expect(doitFermer(H * 0.4, -2500, H)).toBe(false)
  })
})

describe('fondu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** rAF piloté à la main + horloge fausse. */
  function horloge() {
    let t = 0
    let n = 0
    const file = new Map<number, () => void>()
    vi.spyOn(performance, 'now').mockImplementation(() => t)
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      file.set(++n, cb)
      return n
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => file.delete(id))
    return {
      avancer(ms: number) {
        t += ms
        const courantes = [...file.entries()]
        file.clear()
        for (const [, cb] of courantes) cb()
      },
    }
  }

  it('monte linéairement de 0 à 1 en 150 ms puis appelle fin une fois', () => {
    const h = horloge()
    const vus: number[] = []
    const fin = vi.fn()
    fondu((o) => vus.push(o), 0, 1, 150, fin)
    expect(vus).toEqual([0])
    h.avancer(75)
    expect(vus[vus.length - 1]).toBeCloseTo(0.5, 5)
    expect(fin).not.toHaveBeenCalled()
    h.avancer(100)
    expect(vus[vus.length - 1]).toBe(1)
    expect(fin).toHaveBeenCalledTimes(1)
    h.avancer(100)
    expect(fin).toHaveBeenCalledTimes(1)
  })

  it('arreter l\'annule sans appeler fin', () => {
    const h = horloge()
    const fin = vi.fn()
    const f = fondu(() => {}, 1, 0, 150, fin)
    h.avancer(50)
    f.arreter()
    h.avancer(500)
    expect(fin).not.toHaveBeenCalled()
  })
})
