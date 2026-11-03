import { describe, expect, it } from 'vitest'
import { prefillIndispo } from '../../src/ui/feuilles/prefillIndispo'

const journee = { debut: '07:00', fin: '23:00' }

describe('prefillIndispo', () => {
  it('emplacement touché : ce jour, cette heure arrondie au pas, une heure', () => {
    expect(prefillIndispo({ jour: '2026-11-07', t: 16 * 60 }, '2026-11-04T10:30', 15, journee)).toEqual({
      jour: '2026-11-07',
      debut: '16:00',
      fin: '17:00',
    })
    expect(prefillIndispo({ jour: '2026-11-07', t: 16 * 60 + 8 }, '2026-11-04T10:30', 15, journee).debut).toBe('16:15')
    expect(prefillIndispo({ jour: '2026-11-07', t: 16 * 60 + 7 }, '2026-11-04T10:30', 15, journee).debut).toBe('16:00')
  })

  it('sans emplacement : aujourd’hui, à l’heure pleine suivante, pendant une heure', () => {
    expect(prefillIndispo(null, '2026-11-04T10:30', 15, journee)).toEqual({ jour: '2026-11-04', debut: '11:00', fin: '12:00' })
    // Pile sur l’heure : la suivante.
    expect(prefillIndispo(null, '2026-11-04T10:00', 15, journee).debut).toBe('11:00')
  })

  it('la fin est bornée à la fin de la journée', () => {
    expect(prefillIndispo({ jour: '2026-11-07', t: 22 * 60 + 30 }, '2026-11-04T10:30', 15, journee)).toEqual({
      jour: '2026-11-07',
      debut: '22:30',
      fin: '23:00',
    })
  })

  it('tard le soir : le début recule pour garder au moins un pas avant la fin', () => {
    expect(prefillIndispo(null, '2026-11-04T22:40', 15, journee)).toEqual({ jour: '2026-11-04', debut: '22:45', fin: '23:00' })
    expect(prefillIndispo({ jour: '2026-11-07', t: 23 * 60 }, '2026-11-04T10:30', 15, journee)).toEqual({
      jour: '2026-11-07',
      debut: '22:45',
      fin: '23:00',
    })
  })

  it('après la fin de journée des réglages : borne à 23:59, toujours fin > début dans le même jour', () => {
    const p = prefillIndispo(null, '2026-11-04T23:40', 15, journee)
    expect(p.jour).toBe('2026-11-04')
    expect(p.fin > p.debut).toBe(true)
    expect(p.fin <= '23:59').toBe(true)
  })

  it('borné à 23:59, les deux bornes restent au pas (15 min)', () => {
    expect(prefillIndispo(null, '2026-11-04T23:40', 15, journee)).toEqual({ jour: '2026-11-04', debut: '23:30', fin: '23:45' })
    expect(prefillIndispo({ jour: '2026-11-07', t: 23 * 60 + 50 }, '2026-11-04T10:30', 15, journee)).toEqual({
      jour: '2026-11-07',
      debut: '23:30',
      fin: '23:45',
    })
  })

  it('borné à 23:59, les deux bornes restent au pas (60 min)', () => {
    expect(prefillIndispo(null, '2026-11-04T23:40', 60, journee)).toEqual({ jour: '2026-11-04', debut: '22:00', fin: '23:00' })
  })

  it('fin de journée hors du pas : la fin recule au dernier pas', () => {
    expect(prefillIndispo({ jour: '2026-11-07', t: 22 * 60 + 40 }, '2026-11-04T10:30', 15, { debut: '07:00', fin: '22:50' })).toEqual({
      jour: '2026-11-07',
      debut: '22:30',
      fin: '22:45',
    })
  })
})
