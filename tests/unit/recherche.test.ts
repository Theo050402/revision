import { describe, expect, test } from 'vitest'
import { chercherOfficiels } from '../../src/import/recherche'
import { filtrer, normaliser } from '../../src/ui/bibliotheque/recherche'
import { ITEMS, etatBib } from './helpers-bibliotheque'
import { formaterDuree } from '../../src/ui/duree'

const liste = new Map([
  [290, 'Cancérologie : généralités'],
  [291, 'Tumeurs du sein'],
  [300, 'Thérapeutiques anticancéreuses'],
  [30, 'Œdème aigu'],
])

describe('chercherOfficiels', () => {
  test('un nombre cherche par début de numéro, trié', () => {
    expect(chercherOfficiels('30', liste).map((i) => i.numero)).toEqual([30, 300])
    expect(chercherOfficiels('291', liste).map((i) => i.numero)).toEqual([291])
  })
  test('texte : sans accent ni casse, tous les mots', () => {
    expect(chercherOfficiels('CANCEROLOGIE', liste).map((i) => i.numero)).toEqual([290])
    expect(chercherOfficiels('therapeutiques anti', liste).map((i) => i.numero)).toEqual([300])
    expect(chercherOfficiels('oedeme', liste).map((i) => i.numero)).toEqual([30])
    expect(chercherOfficiels('tumeurs foie', liste)).toEqual([])
  })
  test('saisie vide : tout', () => {
    expect(chercherOfficiels('  ', liste)).toHaveLength(4)
  })
  test('la liste officielle est utilisée par défaut', () => {
    expect(chercherOfficiels('290')[0].numero).toBe(290)
  })
  test('normaliser', () => {
    expect(normaliser('Éléphant Œuf')).toBe('elephant oeuf')
  })
})

describe('formaterDuree', () => {
  test.each([
    [30, '30 min'],
    [45, '45 min'],
    [60, '1h'],
    [75, '1h15'],
    [135, '2h15'],
    [125, '2h05'],
  ])('%i min', (m, attendu) => expect(formaterDuree(m)).toBe(attendu))
})

describe('normaliser : ligatures', () => {
  test('œ → oe, æ → ae, accents et casse', () => {
    expect(normaliser("Tumeurs de l'Œsophage")).toBe("tumeurs de l'oesophage")
    expect(normaliser('Cœur et vaisseaux')).toBe('coeur et vaisseaux')
    expect(normaliser('ÆTHER')).toBe('aether')
    expect(normaliser('Côlon')).toBe('colon')
  })
})

describe('filtrer (bibliothèque)', () => {
  const vide = { colleges: [], etats: [], longueurs: [] }
  const nums = (r: { numero: number }[]) => r.map((i) => i.numero)

  test('« oesophage » trouve « œsophage », « colon » trouve « côlon »', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, 'oesophage', vide, e))).toEqual([305])
    expect(nums(filtrer(ITEMS, 'Œsophage', vide, e))).toEqual([305])
    expect(nums(filtrer(ITEMS, 'colon', vide, e))).toContain(301)
  })

  test('une faute par mot de 5 lettres ou plus (transposition comprise)', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, 'estomca', vide, e))).toEqual([303])
    expect(nums(filtrer(ITEMS, 'pancreus', vide, e))).toEqual([304]) // substitution
    expect(nums(filtrer(ITEMS, 'mlanome', vide, e))).toEqual([296]) // oubli
    expect(nums(filtrer(ITEMS, 'estomcca', vide, e))).toEqual([]) // deux fautes
    expect(nums(filtrer(ITEMS, 'foir', vide, e))).toEqual([]) // mot court : pas de tolérance
  })

  test('un nombre filtre par préfixe de numéro', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, '30', vide, e))).toEqual([300, 301, 302, 303, 304, 305])
    expect(nums(filtrer(ITEMS, '2', vide, e))).toEqual([290, 291, 292, 293, 294, 295, 296, 297])
    expect(nums(filtrer(ITEMS, '303', vide, e))).toEqual([303])
    expect(nums(filtrer(ITEMS, '3030', vide, e))).toEqual([])
  })

  test('tous les mots doivent être présents, requête vide = tout', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, 'tumeurs foie', vide, e))).toEqual([302])
    expect(nums(filtrer(ITEMS, 'tumeurs foie sein', vide, e))).toEqual([])
    expect(filtrer(ITEMS, '   ', vide, e)).toHaveLength(ITEMS.length)
  })

  test('filtre par collège', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, '', { ...vide, colleges: ['c3'] }, e))).toEqual([300, 301, 302, 303, 304, 305])
    expect(filtrer(ITEMS, '', { ...vide, colleges: ['c1', 'c3'] }, e)).toHaveLength(ITEMS.length)
  })

  test('filtre par longueur : court < 10, moyen 10–20, long > 20', () => {
    const e = etatBib()
    expect(nums(filtrer(ITEMS, '', { ...vide, longueurs: ['court'] }, e))).toEqual([292, 296])
    expect(nums(filtrer(ITEMS, '', { ...vide, longueurs: ['long'] }, e))).toEqual([294, 300])
    expect(nums(filtrer(ITEMS, '290', { ...vide, longueurs: ['moyen'] }, e))).toEqual([290])
    expect(nums(filtrer(ITEMS, '', { ...vide, longueurs: ['court', 'long'] }, e))).toEqual([292, 294, 296, 300])
    // 10 et 20 pages sont « moyen »
    expect(nums(filtrer(ITEMS, '', { ...vide, longueurs: ['moyen'] }, e))).toEqual(expect.arrayContaining([293, 295]))
  })

  test('filtre par état : nonvu = etatTours vide, 1, 2, 3 et plus', () => {
    const e = etatBib([
      { itemId: 'c1:290', tour: 1, fait: true },
      { itemId: 'c1:291', tour: 1, fait: true },
      { itemId: 'c1:291', tour: 2 },
      { itemId: 'c1:292', tour: 1, fait: true },
      { itemId: 'c1:292', tour: 2, fait: true },
      { itemId: 'c1:292', tour: 3 },
      { itemId: 'c1:293', tour: 1, fait: true },
      { itemId: 'c1:293', tour: 2, fait: true },
      { itemId: 'c1:293', tour: 3, fait: true },
      { itemId: 'c1:293', tour: 4 },
    ])
    const dans = (etats: ('nonvu' | 1 | 2 | 3)[]) => nums(filtrer(ITEMS, '29', { ...vide, etats }, e))
    expect(dans(['nonvu'])).toEqual([294, 295, 296, 297])
    expect(dans([1])).toEqual([290])
    expect(dans([2])).toEqual([291])
    expect(dans([3])).toEqual([292, 293]) // « T3 et plus »
    expect(dans([1, 2])).toEqual([290, 291])
  })

  test('les filtres se combinent (et avec la recherche)', () => {
    const e = etatBib([{ itemId: 'c3:302', tour: 1 }])
    const f = { colleges: ['c3'], etats: ['nonvu' as const], longueurs: ['moyen' as const] }
    expect(nums(filtrer(ITEMS, 'tumeurs', f, e))).toEqual([305, 303].sort((a, b) => a - b))
  })
})
