import { describe, expect, it } from 'vitest'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Indispo } from '../../src/domain/types'
import {
  blocsDesJours,
  chargeJour,
  chargesDesJours,
  jourSousX,
  minutesVersY,
  plageAffichee,
  plageDesJours,
  yVersMinutes,
} from '../../src/ui/calendrier/geometrie'

const reglages = etatVide().reglages // journée 07:00–23:00, pas 15

function creneau(id: string, debut: string | null, duree: number): Creneau {
  return {
    id,
    itemId: 'c1:300',
    tour: 1,
    partie: null,
    debut,
    duree,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
  }
}

function indispo(id: string, debut: string, fin: string): Indispo {
  return { id, titre: 'Stage', source: 'ponctuelle', sourceId: null, debut, fin }
}

function etatAvec(creneaux: Creneau[], indispos: Indispo[] = []): Etat {
  const e = etatVide()
  for (const c of creneaux) e.creneaux[c.id] = c
  for (const i of indispos) e.indispos[i.id] = i
  return e
}

describe('plageAffichee', () => {
  it('reprend les bornes de la journée quand rien ne dépasse', () => {
    expect(plageAffichee(reglages, [{ debut: 600, fin: 660 }])).toEqual({ debut: 420, fin: 1380 })
    expect(plageAffichee(reglages, [])).toEqual({ debut: 420, fin: 1380 })
  })

  it('étend la plage à un créneau posé avant les bornes (06:00–07:00)', () => {
    expect(plageAffichee(reglages, [{ debut: 360, fin: 420 }])).toEqual({ debut: 360, fin: 1380 })
  })

  it('étend la plage à un créneau qui finit après les bornes, alignée sur l\'heure', () => {
    expect(plageAffichee(reglages, [{ debut: 1350, fin: 1425 }])).toEqual({ debut: 420, fin: 1440 })
    expect(plageAffichee(reglages, [{ debut: 400, fin: 470 }])).toEqual({ debut: 360, fin: 1380 })
  })

  it('aligne aussi des bornes qui ne tombent pas sur l\'heure', () => {
    const r = { ...reglages, journee: { debut: '07:30', fin: '22:15' } }
    expect(plageAffichee(r, [])).toEqual({ debut: 420, fin: 1380 })
  })

  it('ne sort jamais de la journée civile', () => {
    expect(plageAffichee(reglages, [{ debut: -30, fin: 1500 }])).toEqual({ debut: 0, fin: 1440 })
  })
})

describe('minutesVersY', () => {
  it('convertit des minutes en pixels depuis le haut de la plage', () => {
    const plage = { debut: 420, fin: 1380 }
    expect(minutesVersY(420, plage, 48)).toBe(0)
    expect(minutesVersY(480, plage, 48)).toBe(48)
    expect(minutesVersY(14 * 60, plage, 48)).toBeCloseTo(336)
    expect(minutesVersY(14 * 60 + 165, plage, 48)).toBeCloseTo(468)
  })
})

describe('yVersMinutes', () => {
  const plage = { debut: 420, fin: 1380 }
  it('magnétise au pas de 15', () => {
    // 48 px/h : 1 px = 1,25 min.
    expect(yVersMinutes(0, plage, 48, 15)).toBe(420)
    expect(yVersMinutes(10, plage, 48, 15)).toBe(435) // 12,5 min → 15
    expect(yVersMinutes(5, plage, 48, 15)).toBe(420) // 6,25 min → 0
    expect(yVersMinutes(6.5, plage, 48, 15)).toBe(435) // 8,1 min → 15
    expect(yVersMinutes(336, plage, 48, 15)).toBe(840)
  })
  it('respecte les autres pas', () => {
    expect(yVersMinutes(10, plage, 48, 5)).toBe(435)
    expect(yVersMinutes(10, plage, 48, 10)).toBe(430)
  })
  it('est l\'inverse de minutesVersY sur les minutes magnétisées', () => {
    for (const min of [420, 435, 600, 1005, 1380]) {
      expect(yVersMinutes(minutesVersY(min, plage, 56), plage, 56, 15)).toBe(min)
    }
  })
})

describe('jourSousX', () => {
  const colonnes = [
    { jour: '2026-11-02', gauche: 44, largeur: 100 },
    { jour: '2026-11-03', gauche: 144, largeur: 100 },
  ]
  it('trouve la colonne sous le pointeur', () => {
    expect(jourSousX(44, colonnes)).toBe('2026-11-02')
    expect(jourSousX(143.9, colonnes)).toBe('2026-11-02')
    expect(jourSousX(144, colonnes)).toBe('2026-11-03')
    expect(jourSousX(243, colonnes)).toBe('2026-11-03')
  })
  it('renvoie null hors des colonnes', () => {
    expect(jourSousX(10, colonnes)).toBeNull()
    expect(jourSousX(244, colonnes)).toBeNull()
    expect(jourSousX(50, [])).toBeNull()
  })
})

describe('chargeJour', () => {
  it('additionne les durées des créneaux posés ce jour-là', () => {
    const e = etatAvec([
      creneau('a', '2026-11-03T14:00', 165),
      creneau('b', '2026-11-03T09:00', 60),
      creneau('c', '2026-11-04T09:00', 90),
      creneau('bac', null, 120),
    ])
    expect(chargeJour(e, '2026-11-03')).toBe(225)
    expect(chargeJour(e, '2026-11-04')).toBe(90)
    expect(chargeJour(e, '2026-11-05')).toBe(0)
  })

  it('chargesDesJours donne les mêmes totaux en un seul parcours', () => {
    const e = etatAvec([creneau('a', '2026-11-03T14:00', 165), creneau('b', '2026-11-04T09:00', 90)])
    const charges = chargesDesJours(e, ['2026-11-03', '2026-11-04', '2026-11-05'])
    expect(charges).toEqual({ '2026-11-03': 165, '2026-11-04': 90, '2026-11-05': 0 })
  })
})

describe('blocsDesJours', () => {
  it('range créneaux et indisponibilités par jour affiché, triés', () => {
    const e = etatAvec(
      [creneau('b', '2026-11-03T14:00', 60), creneau('a', '2026-11-03T09:00', 60), creneau('x', '2026-11-09T09:00', 60)],
      [indispo('s', '2026-11-02T08:00', '2026-11-02T13:00')],
    )
    const b = blocsDesJours(e, ['2026-11-02', '2026-11-03'])
    expect(b['2026-11-03'].creneaux.map((c) => c.id)).toEqual(['a', 'b'])
    expect(b['2026-11-02'].indispos).toEqual([{ indispo: e.indispos.s, debut: 480, fin: 780 }])
    expect(b['2026-11-02'].creneaux).toEqual([])
    expect(Object.keys(b)).toEqual(['2026-11-02', '2026-11-03'])
  })

  it('découpe une indisponibilité sur plusieurs jours', () => {
    const e = etatAvec([], [indispo('v', '2026-11-02T20:00', '2026-11-04T10:00')])
    const b = blocsDesJours(e, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
    expect(b['2026-11-02'].indispos[0]).toMatchObject({ debut: 1200, fin: 1440 })
    expect(b['2026-11-03'].indispos[0]).toMatchObject({ debut: 0, fin: 1440 })
    expect(b['2026-11-04'].indispos[0]).toMatchObject({ debut: 0, fin: 600 })
    expect(b['2026-11-05'].indispos).toEqual([])
  })
})

describe('plageDesJours', () => {
  it('garde visible un créneau posé avant les bornes rétrécies (union, tous jours affichés)', () => {
    const e = etatAvec([creneau('tot', '2026-11-04T06:00', 60), creneau('tard', '2026-11-05T22:30', 90)])
    const b = blocsDesJours(e, ['2026-11-03', '2026-11-04', '2026-11-05'])
    expect(plageDesJours(e.reglages, b)).toEqual({ debut: 360, fin: 1440 })
  })
  it('ignore les indisponibilités (une journée entière ne doit pas étirer la grille)', () => {
    const e = etatAvec([], [indispo('j', '2026-11-03T00:00', '2026-11-04T00:00')])
    const b = blocsDesJours(e, ['2026-11-03'])
    expect(plageDesJours(e.reglages, b)).toEqual({ debut: 420, fin: 1380 })
  })
})
