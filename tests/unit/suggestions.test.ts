import { describe, expect, test } from 'vitest'
import { aPlanifier, pourCombler, trouLibre } from '../../src/ui/bibliotheque/suggestions'
import { etatBib } from './helpers-bibliotheque'

const J = '2026-11-04'
const nums = (r: { numero: number }[]) => r.map((i) => i.numero)

describe('aPlanifier', () => {
  test('par collège, les n premiers non vus par numéro croissant, fusionnés par numéro', () => {
    expect(nums(aPlanifier(etatBib()))).toEqual([290, 291, 292, 293, 294, 300, 301, 302, 303, 304])
    expect(nums(aPlanifier(etatBib(), 2))).toEqual([290, 291, 300, 301])
  })

  test('un item qui a un créneau (placé ou dans le bac) n\'est plus « non vu »', () => {
    const e = etatBib([
      { itemId: 'c1:291', debut: `${J}T09:00` },
      { itemId: 'c3:300', debut: null },
    ])
    expect(nums(aPlanifier(e, 2))).toEqual([290, 292, 301, 302])
  })

  test('collège épuisé ou sans item : aucun plantage', () => {
    const e = etatBib()
    for (const id of Object.keys(e.items)) if (id.startsWith('c3:')) delete e.items[id]
    expect(nums(aPlanifier(e, 3))).toEqual([290, 291, 292])
    expect(aPlanifier(etatBib(), 0)).toEqual([])
  })
})

describe('trouLibre', () => {
  test('jusqu\'à la fin de la journée quand rien ne suit', () => {
    expect(trouLibre(etatBib(), J, 14 * 60)).toBe(9 * 60) // 14h → 23h
  })

  test('jusqu\'au prochain créneau', () => {
    const e = etatBib([{ itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 }])
    expect(trouLibre(e, J, 14 * 60)).toBe(120)
    expect(trouLibre(e, J, 17 * 60)).toBe(6 * 60) // après le créneau : fin de journée
  })

  test('jusqu\'à la prochaine indisponibilité', () => {
    const e = etatBib()
    e.indispos = {
      i1: { id: 'i1', titre: 'Cours', source: 'ponctuelle', sourceId: null, debut: `${J}T12:00`, fin: `${J}T13:30` },
    }
    expect(trouLibre(e, J, 10 * 60 + 15)).toBe(105)
  })

  test('0 si l\'instant est dans un bloc, ou hors de la journée', () => {
    const e = etatBib([{ itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 }])
    expect(trouLibre(e, J, 16 * 60 + 30)).toBe(0)
    expect(trouLibre(e, J, 6 * 60)).toBe(0) // avant 07:00
    expect(trouLibre(e, J, 23 * 60)).toBe(0) // à la fin
  })

  test('les blocs d\'un autre jour ne comptent pas', () => {
    const e = etatBib([{ itemId: 'c1:290', debut: '2026-11-05T15:00', duree: 60 }])
    expect(trouLibre(e, J, 14 * 60)).toBe(9 * 60)
  })
})

describe('pourCombler', () => {
  test('trou de 120 min : durée du prochain tour ≤ 120, la plus longue d\'abord', () => {
    // durées T1 (60 min / 8 p, pas 15) : 297 et 303 → 2h, 304 → 1h45, 302 et 305 → 1h30, 292 et 293 → 1h15, 296 → 1h
    const r = pourCombler(etatBib(), J, 14 * 60 + 0) // trou = 9 h : tout tient, on borne ensuite
    expect(r).toHaveLength(14)
    const e = etatBib([{ itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 }])
    expect(nums(pourCombler(e, J, 14 * 60))).toEqual([297, 303, 304, 302, 305, 292, 293, 290, 296]) // 290 est posé : son T2 dure 1h
  })

  test('le prochain tour compte : un item déjà vu rentre plus facilement', () => {
    // 295 (20 p) : T1 = 2h30 (ne tient pas), T2 = 1h15 (tient)
    const e = etatBib([
      { itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 },
      { itemId: 'c1:295', tour: 1, debut: '2026-11-06T09:00', duree: 150 },
    ])
    const avant = nums(pourCombler(etatBib([{ itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 }]), J, 14 * 60))
    expect(avant).not.toContain(295)
    expect(nums(pourCombler(e, J, 14 * 60))).toContain(295)
  })

  test('trou de 0 : rien', () => {
    const e = etatBib([{ itemId: 'c1:290', debut: `${J}T16:00`, duree: 60 }])
    expect(pourCombler(e, J, 16 * 60)).toEqual([])
  })
})
