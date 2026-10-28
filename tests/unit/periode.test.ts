import { describe, expect, it } from 'vitest'
import { nomDuMois, numeroSemaine } from '../../src/ui/periode'

describe('nomDuMois', () => {
  it('donne le mois en français, avec une majuscule', () => {
    expect(nomDuMois('2026-10-28')).toBe('Octobre')
    expect(nomDuMois('2026-12-31')).toBe('Décembre')
    expect(nomDuMois('2026-02-01')).toBe('Février')
  })
})

describe('numeroSemaine (ISO 8601)', () => {
  it.each([
    ['2026-10-28', 44],
    ['2026-01-01', 1], // jeudi : semaine 1
    ['2025-12-29', 1], // lundi de la semaine 1 de 2026
    ['2027-01-01', 53], // vendredi : encore la semaine 53 de 2026
    ['2024-12-30', 1],
    ['2021-01-03', 53],
    ['2026-11-01', 44], // dimanche
    ['2026-11-02', 45], // lundi
  ])('%s → semaine %i', (jour, semaine) => {
    expect(numeroSemaine(jour)).toBe(semaine)
  })
})
