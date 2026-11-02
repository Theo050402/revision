import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RESSORT_DOUX,
  RESSORT_FEUILLE,
  RESSORT_RAPIDE,
  animerValeur,
  mouvementReduit,
  pasRessort,
  projeter,
  type Horloge,
  type ParamsRessort,
} from '../../src/ui/mouvement/ressort'

const DT = 1 / 120

/** Simule le ressort à pas fixe ; renvoie la trajectoire (une entrée par pas). */
function simuler(x0: number, v0: number, cible: number, p: ParamsRessort, secondes: number) {
  const trace: { t: number; x: number; v: number }[] = []
  let x = x0
  let v = v0
  const pas = Math.round(secondes / DT)
  for (let i = 1; i <= pas; i++) {
    ;({ x, v } = pasRessort(x, v, cible, p, DT))
    trace.push({ t: i * DT, x, v })
  }
  return trace
}

/** Horloge manuelle : `avancer(ms)` exécute les images demandées, une par appel de rAF en attente. */
function horlogeManuelle() {
  let t = 0
  let id = 0
  const file = new Map<number, (ts: number) => void>()
  const horloge: Horloge = {
    requestAnimationFrame: (cb) => {
      file.set(++id, cb)
      return id
    },
    cancelAnimationFrame: (i) => {
      file.delete(i)
    },
    maintenant: () => t,
  }
  return {
    horloge,
    enAttente: () => file.size,
    /** Fait avancer le temps par images de ~16,7 ms. */
    avancer(ms: number, image = 1000 / 60) {
      const fin = t + ms
      while (t < fin - 1e-9) {
        t = Math.min(t + image, fin)
        const cbs = [...file.values()]
        file.clear()
        for (const cb of cbs) cb(t)
      }
    },
  }
}

describe('constantes de ressort', () => {
  it('reprennent les valeurs de la spec', () => {
    expect(RESSORT_DOUX).toEqual({ amortissement: 1, reponse: 0.25 })
    expect(RESSORT_RAPIDE).toEqual({ amortissement: 1, reponse: 0.18 })
    expect(RESSORT_FEUILLE).toEqual({ amortissement: 0.8, reponse: 0.3 })
  })
})

describe('pasRessort', () => {
  it.each([RESSORT_DOUX, RESSORT_RAPIDE, RESSORT_FEUILLE])(
    'converge à ±0,5 en moins de 4×réponse (%o)',
    (p) => {
      const trace = simuler(0, 0, 100, p, 4 * p.reponse)
      const dernier = trace[trace.length - 1]
      expect(Math.abs(dernier.x - 100)).toBeLessThan(0.5)
    },
  )

  it("n'a aucun effet à l'équilibre", () => {
    expect(pasRessort(100, 0, 100, RESSORT_DOUX, DT)).toEqual({ x: 100, v: 0 })
  })

  it('amortissement 1 : aucun dépassement', () => {
    const max = Math.max(...simuler(0, 0, 100, RESSORT_DOUX, 2).map((s) => s.x))
    expect(max).toBeLessThanOrEqual(100)
  })

  it('amortissement 0,8 : dépasse la cible', () => {
    const max = Math.max(...simuler(0, 0, 100, RESSORT_FEUILLE, 2).map((s) => s.x))
    expect(max).toBeGreaterThan(100)
  })

  it('une vitesse initiale de 2000 px/s fait dépasser l’arrivée, et la pose plus tard qu’à 0', () => {
    // Amortissement critique : l'élan dépasse la cible dès que v0 > (2π/réponse)·distance (≈ 250 px/s pour 10 px).
    const sans = simuler(0, 0, 10, RESSORT_DOUX, 2)
    const avec = simuler(0, 2000, 10, RESSORT_DOUX, 2)
    expect(Math.max(...sans.map((s) => s.x))).toBeLessThanOrEqual(10)
    expect(Math.max(...avec.map((s) => s.x))).toBeGreaterThan(10)
    const pose = (trace: typeof sans) => {
      let dernier = 0
      trace.forEach((s, i) => {
        if (Math.abs(s.x - 10) >= 0.5) dernier = i
      })
      return trace[dernier].t
    }
    expect(pose(avec)).toBeGreaterThan(pose(sans))
  })

  it('un pas plus long que 1/120 s reste stable (sous-pas internes)', () => {
    let x = 0
    let v = 0
    for (let i = 0; i < 20; i++) ({ x, v } = pasRessort(x, v, 100, RESSORT_RAPIDE, 1 / 30))
    expect(Math.abs(x - 100)).toBeLessThan(0.5)
  })
})

describe('projeter', () => {
  it('projeter(1000) ≈ 499', () => {
    expect(projeter(1000)).toBeCloseTo(499, 0)
  })

  it('est nul sans vitesse, signé, et dépend du taux de décélération', () => {
    expect(projeter(0)).toBe(0)
    expect(projeter(-1000)).toBeCloseTo(-499, 0)
    expect(projeter(1000, 0.99)).toBeCloseTo(99, 0)
  })
})

describe('animerValeur', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejoint la cible et appelle appliquer à chaque image', () => {
    const h = horlogeManuelle()
    const vu: number[] = []
    const anim = animerValeur(0, RESSORT_DOUX, (x) => vu.push(x), h.horloge)
    anim.vers(100)
    h.avancer(1500)
    expect(vu.length).toBeGreaterThan(5)
    expect(vu[vu.length - 1]).toBe(100)
    expect(anim.valeur()).toBe(100)
    expect(h.enAttente()).toBe(0) // la boucle s'arrête une fois posée
  })

  it('valeur() renvoie le départ avant tout mouvement', () => {
    const h = horlogeManuelle()
    expect(animerValeur(42, RESSORT_DOUX, () => {}, h.horloge).valeur()).toBe(42)
  })

  it('changer de cible en cours repart de la valeur courante, sans saut', () => {
    const h = horlogeManuelle()
    const vu: number[] = []
    const anim = animerValeur(0, RESSORT_DOUX, (x) => vu.push(x), h.horloge)
    anim.vers(100)
    h.avancer(120)
    const avant = anim.valeur()
    expect(avant).toBeGreaterThan(0)
    expect(avant).toBeLessThan(100)
    const n = vu.length
    anim.vers(-50)
    h.avancer(1000 / 60)
    // pas de saut : la première image après le changement n'avance que d'un pas de mouvement
    // (l'écart avec la nouvelle cible, -50, est de ~150 ; avec l'ancienne, de ~100)
    expect(Math.abs(vu[n] - avant)).toBeLessThan(20)
    h.avancer(2000)
    expect(anim.valeur()).toBe(-50)
  })

  it('vers(cible, vitesse) injecte la vitesse initiale', () => {
    const lent = horlogeManuelle()
    const rapide = horlogeManuelle()
    const a = animerValeur(0, RESSORT_DOUX, () => {}, lent.horloge)
    const b = animerValeur(0, RESSORT_DOUX, () => {}, rapide.horloge)
    a.vers(100)
    b.vers(100, 2000)
    lent.avancer(50)
    rapide.avancer(50)
    expect(b.valeur()).toBeGreaterThan(a.valeur())
  })

  it('arreter() fige la valeur courante et stoppe la boucle', () => {
    const h = horlogeManuelle()
    const anim = animerValeur(0, RESSORT_DOUX, () => {}, h.horloge)
    anim.vers(100)
    h.avancer(100)
    const figee = anim.valeur()
    anim.arreter()
    expect(h.enAttente()).toBe(0)
    h.avancer(500)
    expect(anim.valeur()).toBe(figee)
  })

  it('en mouvement réduit, vers() saute directement à la cible', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    const h = horlogeManuelle()
    const vu: number[] = []
    const anim = animerValeur(0, RESSORT_DOUX, (x) => vu.push(x), h.horloge)
    anim.vers(100)
    expect(vu).toEqual([100])
    expect(anim.valeur()).toBe(100)
    expect(h.enAttente()).toBe(0)
  })
})

describe('mouvementReduit', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('est faux quand matchMedia est absent (Node)', () => {
    expect(mouvementReduit()).toBe(false)
  })

  it('lit prefers-reduced-motion', () => {
    const requetes: string[] = []
    vi.stubGlobal('matchMedia', (q: string) => {
      requetes.push(q)
      return { matches: true }
    })
    expect(mouvementReduit()).toBe(true)
    expect(requetes).toEqual(['(prefers-reduced-motion: reduce)'])
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(mouvementReduit()).toBe(false)
  })
})
