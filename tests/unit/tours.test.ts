import { describe, expect, test } from 'vitest'
import { etatTours, progression, prochainTour } from '../../src/domain/tours'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Item } from '../../src/domain/types'

let seq = 0
function cr(p: Partial<Creneau> & { itemId: string; tour: number }): Creneau {
  seq += 1
  return {
    id: `c${seq}`,
    partie: null,
    debut: null,
    duree: 60,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

function item(collegeId: string, numero: number): Item {
  return {
    id: `${collegeId}:${numero}`,
    collegeId,
    numero,
    titre: `Item ${numero}`,
    pageDebut: 1,
    pages: 8,
    aVerifier: false,
  }
}

describe('prochainTour', () => {
  test('vaut 1 sans créneau', () => {
    expect(prochainTour([], 'a:1')).toBe(1)
    expect(prochainTour([cr({ itemId: 'a:2', tour: 1 })], 'a:1')).toBe(1)
  })

  test('vaut 3 si les tours 1 et 2 existent', () => {
    const l = [cr({ itemId: 'a:1', tour: 1 }), cr({ itemId: 'a:1', tour: 2 })]
    expect(prochainTour(l, 'a:1')).toBe(3)
  })

  test('pas de renumérotation : T2 supprimé, T3 existe → 4', () => {
    const l = [cr({ itemId: 'a:1', tour: 1 }), cr({ itemId: 'a:1', tour: 3 })]
    expect(prochainTour(l, 'a:1')).toBe(4)
  })

  test('ignore les créneaux des autres items (même numéro, autre collège)', () => {
    const l = [cr({ itemId: 'b:1', tour: 2 })]
    expect(prochainTour(l, 'a:1')).toBe(1)
  })
})

describe('etatTours', () => {
  test('tableau vide = non vu', () => {
    expect(etatTours([], 'a:1')).toEqual([])
    expect(etatTours([cr({ itemId: 'a:2', tour: 1 })], 'a:1')).toEqual([])
  })

  test('créneau sans Fait = planifié', () => {
    expect(etatTours([cr({ itemId: 'a:1', tour: 1 })], 'a:1')).toEqual(['planifie'])
  })

  test('T1 en 2 parties dont une seule faite = planifié ; les deux faites = fait', () => {
    const p1 = (fait: boolean) => cr({ itemId: 'a:1', tour: 1, partie: { i: 1, n: 2 }, fait })
    const p2 = (fait: boolean) => cr({ itemId: 'a:1', tour: 1, partie: { i: 2, n: 2 }, fait })
    expect(etatTours([p1(true), p2(false)], 'a:1')).toEqual(['planifie'])
    expect(etatTours([p1(true), p2(true)], 'a:1')).toEqual(['fait'])
  })

  test('un état par tour, ordonné par numéro de tour', () => {
    const l = [
      cr({ itemId: 'a:1', tour: 2 }),
      cr({ itemId: 'a:1', tour: 1, fait: true }),
    ]
    expect(etatTours(l, 'a:1')).toEqual(['fait', 'planifie'])
  })

  test('tour intermédiaire absent : le tableau ne couvre que les tours présents', () => {
    const l = [
      cr({ itemId: 'a:1', tour: 1, fait: true }),
      cr({ itemId: 'a:1', tour: 3 }),
    ]
    expect(etatTours(l, 'a:1')).toEqual(['fait', 'planifie'])
  })
})

describe('progression', () => {
  function etatAvec(items: Item[], creneaux: Creneau[]) {
    const e = etatVide()
    for (const i of items) e.items[i.id] = i
    for (const c of creneaux) e.creneaux[c.id] = c
    return e
  }

  test('état vide : 0 / 367', () => {
    expect(progression(etatVide())).toEqual({ vus: 0, total: 367 })
  })

  test('compte les numéros distincts : item 300 fait au T1 dans 2 collèges = 1', () => {
    const e = etatAvec(
      [item('a', 300), item('b', 300), item('a', 5)],
      [
        cr({ itemId: 'a:300', tour: 1, fait: true }),
        cr({ itemId: 'b:300', tour: 1, fait: true }),
        cr({ itemId: 'a:5', tour: 1, fait: false }),
      ],
    )
    expect(progression(e)).toEqual({ vus: 1, total: 367 })
  })

  test('un T2 fait sans T1 fait ne compte pas', () => {
    const e = etatAvec(
      [item('a', 7)],
      [
        cr({ itemId: 'a:7', tour: 1, fait: false }),
        cr({ itemId: 'a:7', tour: 2, fait: true }),
      ],
    )
    expect(progression(e).vus).toBe(0)
  })

  test('compte aussi les créneaux du bac (debut null)', () => {
    const e = etatAvec([item('a', 9)], [cr({ itemId: 'a:9', tour: 1, fait: true, debut: null })])
    expect(progression(e).vus).toBe(1)
  })

  test('ignore les créneaux dont l’item n’existe plus', () => {
    const e = etatAvec([], [cr({ itemId: 'a:42', tour: 1, fait: true })])
    expect(progression(e).vus).toBe(0)
  })
})
