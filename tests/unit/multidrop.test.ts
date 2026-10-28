import { describe, expect, it } from 'vitest'
import { deposerSerie } from '../../src/domain/multidrop'
import type { Intervalle } from '../../src/domain/cascade'

const BORNES: Intervalle = { debut: 420, fin: 1380 }

function serie(
  durees: number[],
  t: number,
  opts: { occupes?: Intervalle[]; bornes?: Intervalle; pause?: number } = {},
) {
  return deposerSerie({
    occupes: opts.occupes ?? [],
    bornes: opts.bornes ?? BORNES,
    t,
    durees: durees.map((duree, i) => ({ id: `id${i + 1}`, duree })),
    pause: opts.pause ?? 10,
  })
}

describe('deposerSerie (dépôt multiple, §9.5)', () => {
  it('enchaînement avec pause : t=840, durées 60 et 60 -> 840 et 910', () => {
    const r = serie([60, 60], 840)
    expect(r.places).toEqual([
      { id: 'id1', debut: 840 },
      { id: 'id2', debut: 910 },
    ])
    expect(r.restants).toEqual([])
  })

  it("saut d'un occupé trop court : occupé 900–960, t=840, durée 90 -> 960", () => {
    const r = serie([90], 840, { occupes: [{ debut: 900, fin: 960 }] })
    expect(r.places).toEqual([{ id: 'id1', debut: 960 }])
    expect(r.restants).toEqual([])
  })

  it('débordement et ordre conservé : bornes 420–1020, t=840, durées 120, 30, 30 -> 840, 970 ; reste le troisième', () => {
    const r = serie([120, 30, 30], 840, { bornes: { debut: 420, fin: 1020 } })
    expect(r.places).toEqual([
      { id: 'id1', debut: 840 },
      { id: 'id2', debut: 970 },
    ])
    expect(r.restants).toEqual(['id3'])
  })

  it('arrêt au premier qui ne tient pas : bornes 420–1020, t=900, durées 180, 30 -> restants = [id1, id2]', () => {
    const r = serie([180, 30], 900, { bornes: { debut: 420, fin: 1020 } })
    expect(r.places).toEqual([])
    expect(r.restants).toEqual(['id1', 'id2'])
  })

  it('occupés qui se chevauchent entre eux, donnés en désordre : le saut va jusqu au bout de l union', () => {
    const r = serie([30], 840, {
      occupes: [
        { debut: 870, fin: 1000 },
        { debut: 850, fin: 900 },
        { debut: 860, fin: 880 },
      ],
    })
    expect(r.places).toEqual([{ id: 'id1', debut: 1000 }])
  })

  it('un occupé qui touche (fin = début) ne bloque pas : intervalles demi-ouverts', () => {
    const r = serie([60], 840, { occupes: [{ debut: 900, fin: 960 }, { debut: 780, fin: 840 }] })
    expect(r.places).toEqual([{ id: 'id1', debut: 840 }])
  })

  it('le créneau tient exactement dans le trou libre (fin = début de l occupé)', () => {
    const r = serie([60], 840, { occupes: [{ debut: 900, fin: 960 }] })
    expect(r.places).toEqual([{ id: 'id1', debut: 840 }])
  })

  it('le curseur après un créneau (fin + pause) saute aussi les occupés suivants', () => {
    const r = serie([60, 30], 840, { occupes: [{ debut: 905, fin: 1000 }] })
    expect(r.places).toEqual([
      { id: 'id1', debut: 840 },
      { id: 'id2', debut: 1000 },
    ])
  })

  it('pas de pause avant le premier créneau', () => {
    const r = serie([60], 840, { pause: 25 })
    expect(r.places).toEqual([{ id: 'id1', debut: 840 }])
  })

  it('t avant le début des bornes : on part de bornes.debut', () => {
    const r = serie([60], 400)
    expect(r.places).toEqual([{ id: 'id1', debut: 420 }])
  })

  it('t après la fin des bornes : tout va dans restants', () => {
    const r = serie([30, 30], 1400)
    expect(r.places).toEqual([])
    expect(r.restants).toEqual(['id1', 'id2'])
  })

  it('un créneau peut finir exactement à bornes.fin', () => {
    const r = serie([60], 1320)
    expect(r.places).toEqual([{ id: 'id1', debut: 1320 }])
  })

  it('liste vide : rien de placé, rien de restant', () => {
    const r = serie([], 840)
    expect(r).toEqual({ places: [], restants: [] })
  })

  it('ne modifie pas ses entrées', () => {
    const occupes = [{ debut: 900, fin: 960 }, { debut: 850, fin: 870 }]
    const copie = structuredClone(occupes)
    serie([30], 840, { occupes })
    expect(occupes).toEqual(copie)
  })
})
