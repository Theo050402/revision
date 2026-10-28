import { describe, expect, it } from 'vitest'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat } from '../../src/domain/types'
import { diff } from '../../src/storage/db'

function creneau(id: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'c1:300',
    tour: 1,
    partie: null,
    debut: '2026-11-03T14:00',
    duree: 60,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

function avec(e: Etat, ...cs: Creneau[]): Etat {
  return { ...e, creneaux: { ...e.creneaux, ...Object.fromEntries(cs.map((c) => [c.id, c])) } }
}

describe('diff (par identité d’objet)', () => {
  it('un créneau modifié donne 1 put', () => {
    const a = avec(etatVide(), creneau('a'), creneau('b'))
    const modifie = { ...a.creneaux.a!, fait: true }
    const b = avec(a, modifie)
    expect(diff(a, b)).toEqual([{ table: 'creneaux', puts: [modifie], deletes: [] }])
  })

  it('un créneau ajouté donne 1 put', () => {
    const a = avec(etatVide(), creneau('a'))
    const nouveau = creneau('n')
    expect(diff(a, avec(a, nouveau))).toEqual([{ table: 'creneaux', puts: [nouveau], deletes: [] }])
  })

  it('un créneau supprimé donne 1 delete', () => {
    const a = avec(etatVide(), creneau('a'), creneau('b'))
    const { b: _supprime, ...reste } = a.creneaux
    const b: Etat = { ...a, creneaux: reste }
    expect(diff(a, b)).toEqual([{ table: 'creneaux', puts: [], deletes: ['b'] }])
  })

  it('aucune table touchée donne une liste vide', () => {
    const a = avec(etatVide(), creneau('a'))
    expect(diff(a, a)).toEqual([])
    expect(diff(a, { ...a })).toEqual([])
  })

  it('un Record recréé dont les objets sont identiques donne une liste vide', () => {
    const a = avec(etatVide(), creneau('a'))
    expect(diff(a, { ...a, creneaux: { ...a.creneaux } })).toEqual([])
  })

  it('un changement de réglages donne un put dans meta', () => {
    const a = etatVide()
    const b: Etat = { ...a, reglages: { ...a.reglages, pas: 10 } }
    expect(diff(a, b)).toEqual([
      { table: 'meta', puts: [{ cle: 'reglages', valeur: b.reglages }], deletes: [] },
    ])
  })

  it('premierExportFait donne un put dans meta quand sa valeur change', () => {
    const a = etatVide()
    expect(diff(a, { ...a, premierExportFait: true })).toEqual([
      { table: 'meta', puts: [{ cle: 'premierExportFait', valeur: true }], deletes: [] },
    ])
  })

  it('suppressions : indexées par creneauId', () => {
    const a = etatVide()
    const s = { creneauId: 'x', libelle: '300 · T1' }
    const b: Etat = { ...a, suppressions: { x: s } }
    expect(diff(a, b)).toEqual([{ table: 'suppressions', puts: [s], deletes: [] }])
    expect(diff(b, a)).toEqual([{ table: 'suppressions', puts: [], deletes: ['x'] }])
  })

  it('plusieurs tables à la fois', () => {
    const a = avec(etatVide(), creneau('a'))
    const col = { id: 'c1', nom: 'X', couleur: 0, coefficient: 1, importeLe: '2026-10-28T11:00' }
    const b: Etat = { ...a, colleges: { c1: col }, creneaux: {} }
    const tables = diff(a, b).map((d) => d.table)
    expect(tables.sort()).toEqual(['colleges', 'creneaux'])
  })
})
