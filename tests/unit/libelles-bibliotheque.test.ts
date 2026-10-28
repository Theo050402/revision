import { describe, expect, test } from 'vitest'
import { descriptionTours, libelleQuand, pointsTours } from '../../src/ui/bibliotheque/libelles'
import { creneau } from './helpers-bibliotheque'

describe('libelleQuand', () => {
  test('créneau posé : tour, jour en lettres, heure', () => {
    expect(libelleQuand(creneau({ itemId: 'a:1', debut: '2026-11-05T14:00' }))).toBe('T1 · jeudi 5 nov. 14h')
    expect(libelleQuand(creneau({ itemId: 'a:1', tour: 2, debut: '2026-11-03T09:30' }))).toBe('T2 · mardi 3 nov. 9h30')
  })
  test('partie et bac', () => {
    expect(libelleQuand(creneau({ itemId: 'a:1', debut: null }))).toBe('T1 · À placer')
    expect(libelleQuand(creneau({ itemId: 'a:1', debut: null, partie: { i: 2, n: 3 } }))).toBe('T1 · 2/3 · À placer')
    expect(libelleQuand(creneau({ itemId: 'a:1', debut: '2026-11-05T14:00', partie: { i: 1, n: 2 } }))).toBe(
      'T1 · 1/2 · jeudi 5 nov. 14h',
    )
  })
})

describe('pointsTours', () => {
  test('toujours trois points au moins', () => {
    expect(pointsTours([])).toEqual(['nonvu', 'nonvu', 'nonvu'])
    expect(pointsTours(['fait', 'planifie'])).toEqual(['fait', 'planifie', 'nonvu'])
    expect(pointsTours(['fait', 'fait', 'fait', 'planifie'])).toEqual(['fait', 'fait', 'fait', 'planifie'])
  })
  test('description pour lecteur d\'écran', () => {
    expect(descriptionTours([])).toBe('Pas encore vu')
    expect(descriptionTours(['fait', 'planifie'])).toBe('T1 fait, T2 planifié')
  })
})

describe('reutiliser (stabilité des références pour le memo des cartes)', () => {
  test('garde la référence précédente si le contenu est identique', async () => {
    const { reutiliser } = await import('../../src/ui/bibliotheque/libelles')
    const avant: ('fait' | 'planifie')[] = ['fait', 'planifie']
    expect(reutiliser(avant, ['fait', 'planifie'])).toBe(avant)
    expect(reutiliser([], [])).toEqual([])
  })
  test('prend la nouvelle référence si le contenu change ou s\'il n\'y avait rien avant', async () => {
    const { reutiliser } = await import('../../src/ui/bibliotheque/libelles')
    const avant: ('fait' | 'planifie')[] = ['fait', 'planifie']
    const suivant: ('fait' | 'planifie')[] = ['fait', 'fait']
    expect(reutiliser(avant, suivant)).toBe(suivant)
    expect(reutiliser(avant, ['fait'])).toEqual(['fait'])
    const nouveau: ('fait' | 'planifie')[] = ['planifie']
    expect(reutiliser(undefined, nouveau)).toBe(nouveau)
  })
})
