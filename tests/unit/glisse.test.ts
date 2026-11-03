import { describe, expect, it } from 'vitest'
import type { Creneau } from '../../src/domain/types'
import {
  apercuColonne,
  cleColonne,
  emplacementPrincipal,
  etiquetteHeure,
  GLISSE_VIDE,
  vitesseLacher,
  type Glisse,
} from '../../src/ui/dnd/glisse'

const J = '2026-11-03'
const K = '2026-11-04'

function cr(id: string, debut: string | null, duree = 60): Creneau {
  return {
    id,
    itemId: 'c:300',
    tour: 1,
    partie: null,
    debut,
    duree,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
  }
}

const cible = (jour: string, t: number) => ({ type: 'colonne' as const, cible: { jour, t, cibleId: null, moitie: 'haute' as const } })

describe('apercuColonne / cleColonne', () => {
  it('sans geste : rien', () => {
    expect(apercuColonne(GLISSE_VIDE, J)).toEqual({ sources: [], debuts: {}, fantomes: [], refus: false, visee: false })
  })

  it('déplacement vers un autre jour : la source est estompée partout, le fantôme et les poussés seulement ce jour-là', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'creneau', id: 'a' },
      fantome: cr('a', `${J}T14:00`),
      survol: cible(K, 900),
      apercu: { ok: true, positions: { a: `${K}T15:00`, b: `${K}T16:00` }, nouveaux: [], versBac: 0 },
    }
    expect(apercuColonne(s, J)).toEqual({ sources: ['a'], debuts: {}, fantomes: [], refus: false, visee: false })
    const k = apercuColonne(s, K)
    expect(k.debuts).toEqual({ b: 960 })
    expect(k.visee).toBe(true)
    expect(k.fantomes.map((f) => [f.creneau.id, f.debut, f.refus, f.principal])).toEqual([['a', 900, false, true]])
  })

  it('refus : fantôme rouge à l’heure visée, colonne teintée', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'item', itemIds: ['c:300'] },
      fantome: cr('apercu-1', null, 165),
      survol: cible(J, 600),
      apercu: { ok: false, positions: {}, nouveaux: [], versBac: 0 },
    }
    const a = apercuColonne(s, J)
    expect(a.refus).toBe(true)
    expect(a.fantomes.map((f) => [f.debut, f.refus])).toEqual([[600, true]])
  })

  it('la clé d’une colonne ne change pas quand seul un autre jour change', () => {
    const base: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'item', itemIds: ['c:300'] },
      fantome: cr('apercu-1', null),
      survol: cible(K, 900),
      apercu: { ok: true, positions: { 'apercu-1': `${K}T15:00` }, nouveaux: [cr('apercu-1', `${K}T15:00`)], versBac: 0 },
    }
    const ailleurs: Glisse = {
      ...base,
      survol: cible(K, 915),
      apercu: { ok: true, positions: { 'apercu-1': `${K}T15:15` }, nouveaux: [cr('apercu-1', `${K}T15:15`)], versBac: 0 },
    }
    expect(cleColonne(base, J)).toBe(cleColonne(ailleurs, J))
    expect(cleColonne(base, K)).not.toBe(cleColonne(ailleurs, K))
  })
})

describe('groupe (spec §D.3) : un emplacement par membre, l’ancre principale', () => {
  const L = '2026-11-05'
  // Ancre a (mar. 14h, 60 min) ; b (mar. 16h, 30 min) ; c (mer. 9h, 45 min).
  const a = cr('a', `${J}T14:00`)
  const b = cr('b', `${J}T16:00`, 30)
  const c = cr('c', `${K}T09:00`, 45)
  const groupe: Glisse = {
    ...GLISSE_VIDE,
    source: { type: 'groupe', ids: ['a', 'b', 'c'], ancre: 'a' },
    fantome: a,
    membres: [a, b, c],
  }

  it('accepté (+1 jour, +30 min) : tous estompés, chaque emplacement dans le jour de sa nouvelle place', () => {
    const s: Glisse = {
      ...groupe,
      survol: cible(K, 870),
      apercu: { ok: true, positions: { a: `${K}T14:30`, b: `${K}T16:30`, c: `${L}T09:30` }, nouveaux: [], versBac: 0 },
    }
    const j = apercuColonne(s, J)
    expect(j.sources).toEqual(['a', 'b', 'c'])
    expect([j.fantomes, j.debuts, j.visee]).toEqual([[], {}, false])
    const k = apercuColonne(s, K)
    // Les membres ne « s'écartent » pas : seuls leurs emplacements bougent.
    expect(k.debuts).toEqual({})
    expect(k.visee).toBe(true)
    expect(k.fantomes.map((f) => [f.creneau.id, f.debut, f.refus, f.principal])).toEqual([
      ['a', 870, false, true],
      ['b', 990, false, false],
    ])
    const l = apercuColonne(s, L)
    expect(l.visee).toBe(false)
    expect(l.fantomes.map((f) => [f.creneau.id, f.debut, f.principal])).toEqual([['c', 570, false]])
    expect(emplacementPrincipal(s)).toMatchObject({ jour: K, debut: 870, refus: false })
  })

  it('refus : chaque membre à sa place visée, en rouge ; la colonne visée teintée', () => {
    const s: Glisse = { ...groupe, survol: cible(K, 600), apercu: { ok: false, positions: {}, nouveaux: [], versBac: 0 } }
    const k = apercuColonne(s, K)
    expect(k.refus).toBe(true)
    expect(k.fantomes.map((f) => [f.creneau.id, f.debut, f.refus, f.principal])).toEqual([
      ['a', 600, true, true],
      ['b', 720, true, false],
    ])
    expect(apercuColonne(s, L).fantomes.map((f) => [f.creneau.id, f.debut, f.refus])).toEqual([['c', 300, true]])
    expect(apercuColonne(s, L).refus).toBe(false)
    expect(emplacementPrincipal(s)).toMatchObject({ jour: K, debut: 600, refus: true })
  })

  it('un membre qui sortirait de sa journée n’a pas d’emplacement (minuit dépassé)', () => {
    const s: Glisse = { ...groupe, survol: cible(J, 23 * 60), apercu: { ok: false, positions: {}, nouveaux: [], versBac: 0 } }
    // b : 25h, c : mer. 18h.
    expect(apercuColonne(s, J).fantomes.map((f) => f.creneau.id)).toEqual(['a'])
    expect(apercuColonne(s, K).fantomes.map((f) => [f.creneau.id, f.debut])).toEqual([['c', 18 * 60]])
  })

  it('lâché sur place : emplacements aux places d’origine', () => {
    const s: Glisse = { ...groupe, survol: cible(J, 840), apercu: { ok: true, positions: {}, nouveaux: [], versBac: 0 } }
    expect(apercuColonne(s, J).fantomes.map((f) => [f.creneau.id, f.debut])).toEqual([
      ['a', 840],
      ['b', 960],
    ])
  })

  it('la clé d’une colonne change quand un membre y arrive, pas quand rien ne la touche', () => {
    const s1: Glisse = { ...groupe, survol: cible(J, 840), apercu: { ok: true, positions: {}, nouveaux: [], versBac: 0 } }
    const s2: Glisse = { ...groupe, survol: cible(J, 855), apercu: { ok: true, positions: {}, nouveaux: [], versBac: 0 } }
    expect(cleColonne(s1, K)).not.toBe(cleColonne(s2, K)) // c y bouge
    expect(cleColonne(s1, '2026-11-08')).toBe(cleColonne(s2, '2026-11-08'))
  })
})

describe('emplacementPrincipal / etiquetteHeure', () => {
  it('sans survol : aucun emplacement', () => {
    expect(emplacementPrincipal({ ...GLISSE_VIDE, source: { type: 'creneau', id: 'a' }, fantome: cr('a', `${J}T14:00`) })).toBeNull()
  })

  it('créneau déplacé : sa position projetée par l’aperçu (identique au lâcher)', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'creneau', id: 'a' },
      fantome: cr('a', `${J}T14:00`),
      survol: cible(K, 870),
      apercu: { ok: true, positions: { a: `${K}T14:30`, b: `${K}T15:30` }, nouveaux: [], versBac: 0 },
    }
    const e = emplacementPrincipal(s)!
    expect([e.creneau.id, e.jour, e.debut, e.refus]).toEqual(['a', K, 870, false])
    expect(etiquetteHeure(e)).toBe('mer. 4 · 14h30 → 15h30')
    // C'est aussi l'emplacement marqué principal dans la colonne.
    expect(apercuColonne(s, K).fantomes.filter((f) => f.principal).map((f) => f.debut)).toEqual([870])
  })

  it('plusieurs nouveaux créneaux : le premier est principal', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'item', itemIds: ['x', 'y'] },
      fantome: cr('apercu-1', null),
      survol: cible(K, 540),
      apercu: {
        ok: true,
        positions: {},
        nouveaux: [cr('apercu-2', `${K}T09:00`), cr('apercu-1', `${K}T10:10`)],
        versBac: 0,
      },
    }
    expect(emplacementPrincipal(s)?.creneau.id).toBe('apercu-2')
    expect(apercuColonne(s, K).fantomes.map((f) => [f.creneau.id, f.principal])).toEqual([
      ['apercu-2', true],
      ['apercu-1', false],
    ])
  })

  it('refus : le créneau glissé à l’heure visée, marqué refusé', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'item', itemIds: ['c:300'] },
      fantome: cr('apercu-1', null, 165),
      survol: cible(J, 600),
      apercu: { ok: false, positions: {}, nouveaux: [], versBac: 0 },
    }
    expect(emplacementPrincipal(s)).toMatchObject({ jour: J, debut: 600, refus: true })
    expect(etiquetteHeure(emplacementPrincipal(s)!)).toBe('mar. 3 · 10h → 12h45')
  })

  it('jour du mois sans heure libre : aucun emplacement', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'item', itemIds: ['c:300'] },
      fantome: cr('apercu-1', null),
      survol: { type: 'mois', jour: J, cible: null },
      apercu: { ok: false, positions: {}, nouveaux: [], versBac: 0 },
    }
    expect(emplacementPrincipal(s)).toBeNull()
  })
})

describe('vitesseLacher', () => {
  const ech = (pas: number, dx: number, dy: number, n = 5) =>
    Array.from({ length: n }, (_, i) => ({ t: 1000 + i * pas, x: 100 + i * dx, y: 200 + i * dy }))

  it('px/s sur les échantillons, du premier au dernier', () => {
    // 4 intervalles de 16 ms, 8 px puis −4 px chacun : 500 px/s et −250 px/s.
    const v = vitesseLacher(ech(16, 8, -4), 1000 + 4 * 16 + 5)
    expect(v.vx).toBeCloseTo(500, 6)
    expect(v.vy).toBeCloseTo(-250, 6)
  })

  it('doigt immobile avant le lâcher (plus de 80 ms) : vitesse nulle', () => {
    expect(vitesseLacher(ech(16, 8, 8), 1000 + 4 * 16 + 81)).toEqual({ vx: 0, vy: 0 })
  })

  it('moins de deux échantillons, ou intervalle nul : vitesse nulle', () => {
    expect(vitesseLacher([], 0)).toEqual({ vx: 0, vy: 0 })
    expect(vitesseLacher(ech(16, 8, 8, 1), 1000)).toEqual({ vx: 0, vy: 0 })
    expect(vitesseLacher(ech(0, 8, 8), 1000)).toEqual({ vx: 0, vy: 0 })
  })

  it('bornée à 4 000 px/s', () => {
    const v = vitesseLacher(ech(1, 50, -50), 1004)
    expect(v).toEqual({ vx: 4000, vy: -4000 })
  })
})
