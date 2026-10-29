import { describe, expect, it } from 'vitest'
import { REGLAGES_DEFAUT } from '../../src/domain/defaults'
import {
  brutDurees,
  lireCoefficient,
  lireDurees,
  lireJournee,
  reglagesPourPas,
  validerIndispo,
  validerRecurrence,
} from '../../src/domain/validation'

const brut = (modif: Partial<ReturnType<typeof brutDurees>> = {}) => ({ ...brutDurees(REGLAGES_DEFAUT), ...modif })

describe('lireDurees', () => {
  it('relit les valeurs par défaut telles quelles (coefficients en %)', () => {
    expect(brutDurees(REGLAGES_DEFAUT).coefs).toEqual(['100', '50', '35', '25'])
    const r = lireDurees(brut(), 15)
    expect(r).toEqual({
      ok: true,
      valeurs: {
        rythme: { minutes: 60, pages: 8 },
        dureeMin: 30,
        dureeMax: 180,
        coefsTours: [1, 0.5, 0.35, 0.25],
        pauseMultiple: 10,
      },
    })
  })

  it("refuse une durée max qui n'est pas un multiple du pas", () => {
    const r = lireDurees(brut({ dureeMax: '170' }), 15)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreurs.dureeMax).toBe('Doit être un multiple de 15 min.')
  })

  it('refuse une durée max inférieure à la durée min', () => {
    const r = lireDurees(brut({ dureeMin: '60', dureeMax: '45' }), 15)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreurs.dureeMax).toBe('Au moins égale à la durée minimale.')
  })

  it('refuse une durée min inférieure au pas ou hors multiple', () => {
    const a = lireDurees(brut({ dureeMin: '10' }), 15)
    expect(!a.ok && a.erreurs.dureeMin).toBe('Au moins un pas de la grille (15 min).')
    const b = lireDurees(brut({ dureeMin: '40' }), 15)
    expect(!b.ok && b.erreurs.dureeMin).toBe('Doit être un multiple de 15 min.')
  })

  it('refuse un rythme non entier ou nul', () => {
    for (const v of ['', '0', '-3', '7,5', 'abc']) {
      const r = lireDurees(brut({ minutes: v }), 15)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erreurs.minutes).toBe('Un nombre entier, au moins 1.')
    }
    const p = lireDurees(brut({ pages: '0' }), 15)
    expect(!p.ok && p.erreurs.pages).toBe('Un nombre entier, au moins 1.')
  })

  it('exige au moins un tour et des coefficients dans ]0 ; 100] %', () => {
    const vide = lireDurees(brut({ coefs: [] }), 15)
    expect(!vide.ok && vide.erreurs.coefs).toBe('Ajoute au moins un tour.')
    for (const v of ['0', '101', '', 'x', '-5']) {
      const r = lireDurees(brut({ coefs: ['100', v] }), 15)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erreurs.coef1).toBe('Entre 1 et 100 %.')
    }
    const virgule = lireDurees(brut({ coefs: ['100', '12,5'] }), 15)
    expect(virgule.ok && virgule.valeurs.coefsTours).toEqual([1, 0.125])
  })

  it('accepte une pause à 0 mais pas négative ni décimale', () => {
    expect(lireDurees(brut({ pause: '0' }), 15).ok).toBe(true)
    expect(lireDurees(brut({ pause: '-1' }), 15).ok).toBe(false)
    expect(lireDurees(brut({ pause: '2,5' }), 15).ok).toBe(false)
  })
})

describe('lireJournee', () => {
  it('accepte début < fin', () => {
    expect(lireJournee('07:00', '23:00')).toEqual({ ok: true, valeurs: { debut: '07:00', fin: '23:00' } })
  })
  it('refuse début >= fin ou heure absente', () => {
    expect(lireJournee('23:00', '07:00')).toEqual({ ok: false, erreur: 'Le début doit précéder la fin.' })
    expect(lireJournee('08:00', '08:00').ok).toBe(false)
    expect(lireJournee('', '08:00')).toEqual({ ok: false, erreur: 'Choisis une heure de début et de fin.' })
  })
})

describe('reglagesPourPas', () => {
  it('re-cale les durées min et max sur le nouveau pas', () => {
    const r = reglagesPourPas({ ...REGLAGES_DEFAUT, dureeMin: 45, dureeMax: 180 }, 10)
    expect(r.pas).toBe(10)
    expect(r.dureeMin).toBe(50)
    expect(r.dureeMax).toBe(180)
  })
  it('garde max >= min et min >= pas', () => {
    const r = reglagesPourPas({ ...REGLAGES_DEFAUT, dureeMin: 30, dureeMax: 30 }, 5)
    expect(r.dureeMin).toBe(30)
    expect(r.dureeMax).toBe(30)
    const s = reglagesPourPas({ ...REGLAGES_DEFAUT, dureeMin: 5, dureeMax: 20, pas: 5 }, 15)
    expect(s.dureeMin).toBe(15)
    expect(s.dureeMax).toBe(15)
  })
  it("ne touche à rien d'autre", () => {
    expect(reglagesPourPas(REGLAGES_DEFAUT, 15)).toEqual(REGLAGES_DEFAUT)
  })
})

describe('validerRecurrence', () => {
  const ok = { titre: 'Stage', jours: [1, 2, 3, 4, 5], heureDebut: '08:00', heureFin: '13:00', du: '2026-11-02', au: '2026-11-06' }
  it('accepte une récurrence cohérente', () => {
    expect(validerRecurrence(ok)).toEqual({})
  })
  it('exige un titre et au moins un jour', () => {
    expect(validerRecurrence({ ...ok, titre: '  ' }).titre).toBe('Donne un titre.')
    expect(validerRecurrence({ ...ok, jours: [] }).jours).toBe('Choisis au moins un jour.')
  })
  it('exige heureFin > heureDebut', () => {
    expect(validerRecurrence({ ...ok, heureFin: '08:00' }).heures).toBe('La fin doit suivre le début.')
    expect(validerRecurrence({ ...ok, heureFin: '' }).heures).toBe('Choisis une heure de début et de fin.')
  })
  it('exige du <= au et au plus 366 jours', () => {
    expect(validerRecurrence({ ...ok, du: '2026-11-07' }).dates).toBe('La date de fin doit suivre celle de début.')
    expect(validerRecurrence({ ...ok, du: '', au: '' }).dates).toBe('Choisis une date de début et de fin.')
    expect(validerRecurrence({ ...ok, du: '2026-01-01', au: '2027-01-02' }).dates).toBe('Au plus 366 jours.')
    expect(validerRecurrence({ ...ok, du: '2026-01-01', au: '2027-01-01' })).toEqual({})
  })
})

describe('validerIndispo', () => {
  it('exige un titre et fin > début', () => {
    expect(validerIndispo({ titre: 'Cours', debut: '09:00', fin: '10:00' })).toEqual({})
    expect(validerIndispo({ titre: ' ', debut: '09:00', fin: '10:00' }).titre).toBe('Donne un titre.')
    expect(validerIndispo({ titre: 'Cours', debut: '10:00', fin: '10:00' }).heures).toBe('La fin doit suivre le début.')
  })
})

describe('lireCoefficient', () => {
  it('lit un nombre décimal avec virgule ou point, entre 0,1 et 5', () => {
    expect(lireCoefficient('1')).toBe(1)
    expect(lireCoefficient('1,25')).toBe(1.25)
    expect(lireCoefficient('0.5')).toBe(0.5)
    for (const v of ['', '0', '-1', 'x', '6', '0,05']) expect(lireCoefficient(v)).toBeNull()
  })
})
