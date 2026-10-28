import { describe, expect, test } from 'vitest'
import { arrondiPas, decouper, dureeTour } from '../../src/domain/duration'
import { REGLAGES_DEFAUT, etatVide } from '../../src/domain/defaults'

const r = REGLAGES_DEFAUT

describe('arrondiPas', () => {
  test('arrondit au plus proche multiple du pas, .5 vers le haut', () => {
    expect(arrondiPas(67.5, 15)).toBe(75)
    expect(arrondiPas(47.25, 15)).toBe(45)
    expect(arrondiPas(52.5, 15)).toBe(60)
    expect(arrondiPas(7.5, 15)).toBe(15)
    expect(arrondiPas(0, 15)).toBe(0)
    expect(arrondiPas(133.33, 15)).toBe(135)
    expect(arrondiPas(137, 10)).toBe(140)
    expect(arrondiPas(12, 5)).toBe(10)
  })
})

describe('dureeTour', () => {
  test('exemple de la §6 : item de 18 pages', () => {
    expect(dureeTour(18, 1, 1, r)).toBe(135)
    expect(dureeTour(18, 1, 2, r)).toBe(75) // 67,5 → 75
    expect(dureeTour(18, 1, 3, r)).toBe(45) // 47,25 → 45
  })

  test('le dernier coefficient vaut pour les tours suivants', () => {
    expect(dureeTour(18, 1, 4, r)).toBe(30) // 33,75 → 30
    expect(dureeTour(18, 1, 7, r)).toBe(30) // le coef 0,25 vaut pour les tours ≥ 4 ; 33,75 → 30
    expect(dureeTour(40, 1, 9, r)).toBe(75) // 75 min au coef 0,25
  })

  test('applique le minimum', () => {
    expect(dureeTour(2, 1, 1, r)).toBe(30)
  })

  test('applique le coefficient du collège', () => {
    expect(dureeTour(18, 1.2, 1, r)).toBe(165) // 162 → 165
  })

  test('respecte le pas des réglages', () => {
    expect(dureeTour(18, 1, 1, { ...r, pas: 10 })).toBe(140)
  })

  test('dureeTour renvoie la durée avant découpage (peut dépasser dureeMax)', () => {
    expect(dureeTour(40, 1, 1, r)).toBe(300)
  })
})

describe('decouper', () => {
  test('ne découpe pas ce qui tient dans dureeMax', () => {
    expect(decouper(180, r)).toEqual([180])
    expect(decouper(30, r)).toEqual([30])
  })

  test('découpe en n parties égales arrondies au pas', () => {
    expect(decouper(300, r)).toEqual([150, 150]) // 40 p au T1
    expect(decouper(400, r)).toEqual([135, 135, 135]) // 133,3 → 135
  })

  test('ne descend pas sous dureeMin', () => {
    expect(decouper(100, { ...r, dureeMax: 40, dureeMin: 45 })).toEqual([45, 45, 45])
  })
})

describe('REGLAGES_DEFAUT et etatVide', () => {
  test('valeurs par défaut des réglages (§11)', () => {
    expect(REGLAGES_DEFAUT).toEqual({
      rythme: { minutes: 60, pages: 8 },
      dureeMin: 30,
      dureeMax: 180,
      coefsTours: [1, 0.5, 0.35, 0.25],
      pauseMultiple: 10,
      journee: { debut: '07:00', fin: '23:00' },
      pas: 15,
      rappel: 0,
      theme: 'auto',
    })
  })

  test('etatVide renvoie un état vide', () => {
    const e = etatVide()
    expect(e.colleges).toEqual({})
    expect(e.items).toEqual({})
    expect(e.creneaux).toEqual({})
    expect(e.indispos).toEqual({})
    expect(e.recurrences).toEqual({})
    expect(e.suppressions).toEqual({})
    expect(e.premierExportFait).toBe(false)
    expect(e.reglages).toEqual(REGLAGES_DEFAUT)
  })

  test('etatVide renvoie des objets neufs à chaque appel', () => {
    const a = etatVide()
    const b = etatVide()
    expect(a).not.toBe(b)
    expect(a.colleges).not.toBe(b.colleges)
    expect(a.items).not.toBe(b.items)
    expect(a.creneaux).not.toBe(b.creneaux)
    expect(a.indispos).not.toBe(b.indispos)
    expect(a.recurrences).not.toBe(b.recurrences)
    expect(a.suppressions).not.toBe(b.suppressions)
    expect(a.reglages).not.toBe(b.reglages)
    expect(a.reglages.rythme).not.toBe(b.reglages.rythme)
    expect(a.reglages.coefsTours).not.toBe(b.reglages.coefsTours)
    expect(a.reglages.journee).not.toBe(b.reglages.journee)
    a.reglages.coefsTours.push(9)
    expect(REGLAGES_DEFAUT.coefsTours).toEqual([1, 0.5, 0.35, 0.25])
  })
})
