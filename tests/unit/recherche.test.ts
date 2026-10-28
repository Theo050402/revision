import { describe, expect, test } from 'vitest'
import { chercherOfficiels, normaliser } from '../../src/import/recherche'
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
