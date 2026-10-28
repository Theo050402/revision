import { describe, expect, it } from 'vitest'
import {
  placer,
  type EntreePlacement,
  type Intervalle,
  type Pose,
  type ResultatPlacement,
} from '../../src/domain/cascade'

const BORNES: Intervalle = { debut: 420, fin: 1380 }

function entree(p: Partial<EntreePlacement> & Pick<EntreePlacement, 'nouveau' | 't'>): EntreePlacement {
  return { poses: [], verrous: [], bornes: BORNES, cibleId: null, moitie: 'haute', ...p }
}

const pose = (id: string, debut: number, fin: number): Pose => ({ id, debut, duree: fin - debut })

const CAS: Record<string, { entree: EntreePlacement; attendu: ResultatPlacement }> = {
  libre: {
    entree: entree({ poses: [pose('A', 600, 660)], nouveau: { id: 'N', duree: 90 }, t: 720 }),
    attendu: { ok: true, debuts: { N: 720 } },
  },
  'insertion avant (haute)': {
    entree: entree({
      poses: [pose('A', 840, 960), pose('B', 960, 1020)],
      nouveau: { id: 'N', duree: 60 },
      t: 840,
      cibleId: 'A',
      moitie: 'haute',
    }),
    attendu: { ok: true, debuts: { N: 840, A: 900, B: 1020 } },
  },
  'insertion après (basse)': {
    entree: entree({
      poses: [pose('A', 840, 960)],
      nouveau: { id: 'N', duree: 60 },
      t: 930,
      cibleId: 'A',
      moitie: 'basse',
    }),
    attendu: { ok: true, debuts: { N: 930, A: 810 } },
  },
  'basse, suite poussée vers le bas': {
    entree: entree({
      poses: [pose('A', 840, 960), pose('B', 960, 1020)],
      nouveau: { id: 'N', duree: 60 },
      t: 930,
      cibleId: 'A',
      moitie: 'basse',
    }),
    attendu: { ok: true, debuts: { N: 930, A: 810, B: 990 } },
  },
  'saut de verrou': {
    entree: entree({
      poses: [pose('A', 900, 990)],
      verrous: [{ debut: 1020, fin: 1080 }],
      nouveau: { id: 'N', duree: 60 },
      t: 900,
      cibleId: 'A',
      moitie: 'haute',
    }),
    attendu: { ok: true, debuts: { N: 900, A: 1080 } },
  },
  'refus sur verrou': {
    entree: entree({
      verrous: [{ debut: 480, fin: 780 }],
      nouveau: { id: 'N', duree: 60 },
      t: 600,
    }),
    attendu: { ok: false },
  },
  'refus aux bornes': {
    entree: entree({
      poses: [pose('A', 1260, 1380)],
      nouveau: { id: 'N', duree: 60 },
      t: 1260,
      cibleId: 'A',
      moitie: 'haute',
    }),
    attendu: { ok: false },
  },
  'refus de N hors bornes': {
    entree: entree({ nouveau: { id: 'N', duree: 60 }, t: 1350 }),
    attendu: { ok: false },
  },
  'sans cible, chevauchement': {
    entree: entree({
      poses: [pose('A', 780, 840)],
      nouveau: { id: 'N', duree: 120 },
      t: 720,
      cibleId: null,
    }),
    attendu: { ok: true, debuts: { N: 720, A: 840 } },
  },
  'poussée vers le haut avec saut': {
    entree: entree({
      poses: [pose('A', 780, 840)],
      verrous: [{ debut: 480, fin: 780 }],
      nouveau: { id: 'N', duree: 60 },
      t: 800,
      cibleId: 'A',
      moitie: 'basse',
    }),
    attendu: { ok: true, debuts: { N: 800, A: 420 } },
  },
}

describe('placer', () => {
  for (const [nom, { entree: e, attendu }] of Object.entries(CAS)) {
    it(nom, () => {
      expect(placer(e)).toEqual(attendu)
    })
  }

  it('un saut de verrou continue tant que la pose retombe sur un autre verrou', () => {
    const r = placer(
      entree({
        poses: [pose('A', 900, 960)],
        verrous: [
          { debut: 960, fin: 1000 },
          { debut: 1000, fin: 1100 },
        ],
        nouveau: { id: 'N', duree: 60 },
        t: 900,
        cibleId: 'A',
        moitie: 'haute',
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 900, A: 1100 } })
  })

  it('des intervalles qui se touchent ne se chevauchent pas', () => {
    const r = placer(
      entree({
        poses: [pose('A', 600, 660)],
        verrous: [{ debut: 720, fin: 780 }],
        nouveau: { id: 'N', duree: 60 },
        t: 660,
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 660 } })
  })

  it('invariant : après la cascade, ni pose/pose ni pose/verrou ne se chevauchent, tout reste dans les bornes', () => {
    const chevauche = (a: Intervalle, b: Intervalle) => a.debut < b.fin && b.debut < a.fin
    let verifies = 0
    let reussis = 0
    for (const { entree: e, attendu } of Object.values(CAS)) {
      const r = placer(e)
      expect(r).toEqual(attendu)
      if (attendu.ok) reussis++
      if (!r.ok) continue
      const finales = [
        ...e.poses.map((p) => ({ id: p.id, debut: r.debuts[p.id] ?? p.debut, duree: p.duree })),
        { id: e.nouveau.id, debut: r.debuts[e.nouveau.id], duree: e.nouveau.duree },
      ]
      const iv = finales.map((p) => ({ debut: p.debut, fin: p.debut + p.duree }))
      iv.forEach((a, i) => {
        expect(a.debut).toBeGreaterThanOrEqual(e.bornes.debut)
        expect(a.fin).toBeLessThanOrEqual(e.bornes.fin)
        for (const v of e.verrous) expect(chevauche(a, v)).toBe(false)
        for (let j = i + 1; j < iv.length; j++) expect(chevauche(a, iv[j])).toBe(false)
      })
      verifies++
    }
    expect(verifies).toBe(reussis)
    expect(verifies).toBeGreaterThan(0)
  })

  it('une pose non déplacée n’apparaît pas dans debuts', () => {
    const r = placer(
      entree({
        poses: [pose('A', 600, 660), pose('B', 900, 960)],
        nouveau: { id: 'N', duree: 60 },
        t: 600,
        cibleId: 'A',
        moitie: 'haute',
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 600, A: 660 } })
  })

  it('une pose déjà hors bornes et non déplacée ne provoque pas de refus', () => {
    const r = placer(
      entree({
        poses: [pose('A', 600, 660), pose('Z', 1350, 1410)],
        nouveau: { id: 'N', duree: 60 },
        t: 600,
        cibleId: 'A',
        moitie: 'haute',
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 600, A: 660 } })
  })

  it('cible qui chevauche S sans être la première chevauchée', () => {
    const r = placer(
      entree({
        poses: [pose('A', 780, 840), pose('B', 840, 900)],
        nouveau: { id: 'N', duree: 60 },
        t: 810,
        cibleId: 'B',
        moitie: 'haute',
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 810, B: 870, A: 750 } })
  })

  it('cible qui ne chevauche pas S : repli sur la première chevauchée, moitié haute', () => {
    const r = placer(
      entree({
        poses: [pose('A', 780, 840), pose('B', 1000, 1060)],
        nouveau: { id: 'N', duree: 120 },
        t: 720,
        cibleId: 'B',
        moitie: 'basse',
      }),
    )
    expect(r).toEqual({ ok: true, debuts: { N: 720, A: 840 } })
  })

  it('saut de verrou vers le haut puis dépassement de bornes.debut : refus', () => {
    const r = placer(
      entree({
        poses: [pose('A', 780, 840)],
        verrous: [{ debut: 450, fin: 780 }],
        nouveau: { id: 'N', duree: 60 },
        t: 800,
        cibleId: 'A',
        moitie: 'basse',
      }),
    )
    expect(r).toEqual({ ok: false })
  })

  it('l’ordre des poses en entrée ne change pas le résultat', () => {
    const base = entree({
      poses: [pose('A', 840, 960), pose('B', 960, 1020), pose('C', 780, 840)],
      nouveau: { id: 'N', duree: 60 },
      t: 930,
      cibleId: 'A',
      moitie: 'basse',
    })
    const trie = placer(base)
    const melange = placer({ ...base, poses: [base.poses[1], base.poses[2], base.poses[0]] })
    expect(trie.ok).toBe(true)
    expect(melange).toEqual(trie)
  })
})
