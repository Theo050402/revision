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

describe("semaines de changement d'heure (arithmétique en UTC, jamais le fuseau de la machine)", () => {
  it("fin de l'heure d'été : dimanche 25 octobre 2026 (semaine ISO 43)", () => {
    const semaine = joursDeLaSemaine('2026-10-25')
    expect(semaine).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
    expect(joursDeLaSemaine('2026-10-19')).toEqual(semaine)
    expect(lundiDe('2026-10-25')).toBe('2026-10-19')
    expect(numeroSemaine('2026-10-25')).toBe(43)
    expect(numeroSemaine('2026-10-26')).toBe(44) // lundi suivant
    expect(joursDeLaSemaine('2026-10-26')[0]).toBe('2026-10-26')
  })

  it("début de l'heure d'été : dimanche 28 mars 2027 (semaine ISO 12)", () => {
    const semaine = joursDeLaSemaine('2027-03-28')
    expect(semaine).toEqual([
      '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-27', '2027-03-28',
    ])
    expect(joursDeLaSemaine('2027-03-22')).toEqual(semaine)
    expect(lundiDe('2027-03-28')).toBe('2027-03-22')
    expect(numeroSemaine('2027-03-28')).toBe(12)
    expect(numeroSemaine('2027-03-29')).toBe(13)
    expect(joursDeLaSemaine('2027-03-29')[0]).toBe('2027-03-29')
  })

  it("les mois qui contiennent un changement d'heure ont des jours consécutifs et uniques", () => {
    for (const mois of ['2026-10', '2027-03']) {
      const jours = joursDuMois(mois)
      expect(new Set(jours).size).toBe(jours.length)
      expect(jours.length % 7).toBe(0)
      for (let i = 1; i < jours.length; i++) {
        expect(Date.parse(`${jours[i]}T00:00:00Z`) - Date.parse(`${jours[i - 1]}T00:00:00Z`)).toBe(86_400_000)
      }
    }
    expect(joursDuMois('2026-10')).toContain('2026-10-25')
    expect(joursDuMois('2027-03')).toContain('2027-03-28')
  })
})
