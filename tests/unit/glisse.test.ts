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
    expect(apercuColonne(GLISSE_VIDE, J)).toEqual({ idSource: null, debuts: {}, fantomes: [], refus: false, visee: false })
  })

  it('déplacement vers un autre jour : la source est estompée partout, le fantôme et les poussés seulement ce jour-là', () => {
    const s: Glisse = {
      ...GLISSE_VIDE,
      source: { type: 'creneau', id: 'a' },
      fantome: cr('a', `${J}T14:00`),
      survol: cible(K, 900),
      apercu: { ok: true, positions: { a: `${K}T15:00`, b: `${K}T16:00` }, nouveaux: [], versBac: 0 },
    }
    expect(apercuColonne(s, J)).toEqual({ idSource: 'a', debuts: {}, fantomes: [], refus: false, visee: false })
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
