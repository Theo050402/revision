import { describe, expect, it } from 'vitest'
import {
  ajouterMois,
  joursDeLaSemaine,
  joursDuMois,
  libelleJourCourt,
  libellePeriode,
  lundiDe,
  nomDuMois,
  numeroSemaine,
} from '../../src/ui/periode'

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

describe('navigation par période', () => {
  it('lundiDe donne le lundi de la semaine ISO', () => {
    expect(lundiDe('2026-11-04')).toBe('2026-11-02') // mercredi
    expect(lundiDe('2026-11-02')).toBe('2026-11-02')
    expect(lundiDe('2026-11-08')).toBe('2026-11-02') // dimanche
    expect(lundiDe('2027-01-01')).toBe('2026-12-28')
  })

  it('joursDeLaSemaine donne sept jours de lundi à dimanche', () => {
    expect(joursDeLaSemaine('2026-11-04')).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ])
  })

  it('ajouterMois borne le jour au dernier jour du mois', () => {
    expect(ajouterMois('2026-10-31', 1)).toBe('2026-11-30')
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28')
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29')
    expect(ajouterMois('2026-12-15', 1)).toBe('2027-01-15')
    expect(ajouterMois('2026-01-15', -1)).toBe('2025-12-15')
    expect(ajouterMois('2026-11-04', 0)).toBe('2026-11-04')
  })

  it('joursDuMois couvre des semaines entières (lundi → dimanche)', () => {
    const j = joursDuMois('2026-11')
    expect(j[0]).toBe('2026-10-26') // le 1er novembre 2026 est un dimanche
    expect(j[41]).toBe('2026-12-06')
    expect(j).toHaveLength(42)
    expect(joursDuMois('2026-02')).toHaveLength(35) // 1er février 2026 : dimanche
    expect(joursDuMois('2027-02')).toHaveLength(28) // 1er février 2027 : lundi, 28 jours
    expect(joursDuMois('2027-02')[0]).toBe('2027-02-01')
  })

  it('libellePeriode', () => {
    expect(libellePeriode('mois', ['2026-11-04'])).toBe('Novembre 2026')
    expect(libellePeriode('jour', ['2026-11-04'])).toBe('mercredi 4 novembre')
    expect(libellePeriode('semaine', joursDeLaSemaine('2026-11-04'))).toBe('2 – 8 nov. 2026')
    expect(libellePeriode('semaine', joursDeLaSemaine('2026-10-28'))).toBe('26 oct. – 1 nov. 2026')
    expect(libellePeriode('semaine', joursDeLaSemaine('2026-12-30'))).toBe('28 déc. 2026 – 3 janv. 2027')
    expect(libellePeriode('jour', ['2026-11-04', '2026-11-05', '2026-11-06'])).toBe('4 – 6 nov. 2026')
  })

  it('libelleJourCourt', () => {
    expect(libelleJourCourt('2026-11-04')).toEqual({ nom: 'mer.', numero: 4 })
    expect(libelleJourCourt('2026-11-02')).toEqual({ nom: 'lun.', numero: 2 })
  })
})
