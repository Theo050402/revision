import { describe, expect, it } from 'vitest'
import { changementsEnAttente } from '../../src/domain/actions-etat'
import { etatVide } from '../../src/domain/defaults'
import { messageRecalcul, recalculerCreneaux } from '../../src/domain/recalcul'
import type { Creneau, Etat, Indispo, Item } from '../../src/domain/types'

const AUJ = '2026-11-02'
const J = '2026-11-05'

function item(numero: number, pages: number, collegeId = 'canc'): Item {
  return { id: `${collegeId}:${numero}`, collegeId, numero, titre: `Item ${numero}`, pageDebut: 1, pages, aVerifier: false }
}

function creneau(id: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'canc:20',
    tour: 1,
    partie: null,
    debut: `${J}T14:00`,
    duree: 120,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

function indispo(id: string, debut: string, fin: string): Indispo {
  return { id, titre: 'Cours', source: 'ponctuelle', sourceId: null, debut, fin }
}

// Items : canc:20 = 20 p (150 min au rythme par défaut), canc:16 = 16 p (120 min), canc:40 = 40 p (300 min).
function base(creneaux: Creneau[] = [], indispos: Indispo[] = []): Etat {
  const e = etatVide()
  e.colleges.canc = { id: 'canc', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2026-10-01' }
  e.colleges.neuro = { id: 'neuro', nom: 'Neurologie', couleur: 1, coefficient: 1, importeLe: '2026-10-01' }
  for (const i of [item(20, 20), item(16, 16), item(40, 40), item(20, 20, 'neuro')]) e.items[i.id] = i
  for (const c of creneaux) e.creneaux[c.id] = c
  for (const i of indispos) e.indispos[i.id] = i
  return e
}

describe('recalculerCreneaux', () => {
  it('nouvelle durée : rythme 45 min / 8 p → 90 au lieu de 120, version +1', () => {
    const e = base([creneau('a', { itemId: 'canc:16' })])
    e.reglages.rythme = { minutes: 45, pages: 8 }
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.duree).toBe(90)
    expect(etat.creneaux.a.debut).toBe(`${J}T14:00`)
    expect(etat.creneaux.a.version).toBe(2)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
    expect(e.creneaux.a.duree).toBe(120) // l'entrée n'est pas mutée
  })

  it('chevauchement poussé : B à 16:30 derrière A qui passe à 150 min', () => {
    const e = base([
      creneau('a', { debut: `${J}T14:00` }),
      creneau('b', { debut: `${J}T15:30`, duree: 60, dureePerso: true }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.b.debut).toBe(`${J}T16:30`)
    expect(etat.creneaux.b.duree).toBe(60)
    expect(etat.creneaux.b.version).toBe(2)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 1, versBac: 0 })
  })

  it('trou conservé : B reste à 14:00', () => {
    const e = base([
      creneau('a', { debut: `${J}T09:00` }),
      creneau('b', { debut: `${J}T14:00`, duree: 60, dureePerso: true }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.b).toBe(e.creneaux.b)
    expect(bilan.deplaces).toBe(0)
  })

  it('raccourcissement sans remontée : B garde son heure', () => {
    const e = base([
      creneau('a', { itemId: 'canc:16', debut: `${J}T14:00`, duree: 150 }),
      creneau('b', { debut: `${J}T16:30`, duree: 60, dureePerso: true }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.duree).toBe(120)
    expect(etat.creneaux.b.debut).toBe(`${J}T16:30`)
    expect(etat.creneaux.b).toBe(e.creneaux.b)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
  })

  it("saut d'indisponibilité : B poussé dans 17:00–18:00 → 18:00", () => {
    const e = base(
      [
        creneau('a', { debut: `${J}T14:00` }),
        creneau('b', { debut: `${J}T15:30`, duree: 60, dureePerso: true }),
      ],
      [indispo('i', `${J}T17:00`, `${J}T18:00`)],
    )
    const { etat } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.b.debut).toBe(`${J}T18:00`)
  })

  it('indisponibilités accolées : B saute 17:00–18:00 puis 18:00–19:00 → 19:00', () => {
    const e = base(
      [
        creneau('a', { debut: `${J}T14:00` }),
        creneau('b', { debut: `${J}T15:30`, duree: 60, dureePerso: true }),
      ],
      [indispo('i1', `${J}T17:00`, `${J}T18:00`), indispo('i2', `${J}T18:00`, `${J}T19:00`)],
    )
    expect(recalculerCreneaux(e, AUJ).etat.creneaux.b.debut).toBe(`${J}T19:00`)
  })

  it("fin à la minute où commence l'indisponibilité : pas de saut (intervalles semi-ouverts)", () => {
    const e = base(
      [
        creneau('a', { debut: `${J}T14:00` }),
        creneau('b', { debut: `${J}T15:30`, duree: 30, dureePerso: true }),
      ],
      [indispo('i', `${J}T17:00`, `${J}T18:00`)],
    )
    expect(recalculerCreneaux(e, AUJ).etat.creneaux.b.debut).toBe(`${J}T16:30`)
  })

  it("indisponibilité jusqu'à minuit : B poussé dedans part dans À placer", () => {
    const e = base(
      [
        creneau('a', { debut: `${J}T19:00` }),
        creneau('b', { debut: `${J}T21:00`, duree: 60, dureePerso: true }),
      ],
      [indispo('i', `${J}T22:00`, '2026-11-06T00:00')],
    )
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.b.debut).toBeNull()
    expect(bilan.versBac).toBe(1)
  })

  it('bac hors portée : intact', () => {
    const e = base([creneau('x', { itemId: 'neuro:20', debut: null }), creneau('a', { debut: null })])
    const { etat } = recalculerCreneaux(e, AUJ, { collegeId: 'canc' })
    expect(etat.creneaux.x).toBe(e.creneaux.x)
    expect(etat.creneaux.a.duree).toBe(150)
  })

  it('créneau inchangé déjà dans une indisponibilité : il ne bouge pas', () => {
    const e = base(
      [
        creneau('a', { debut: `${J}T09:00` }),
        creneau('c', { debut: `${J}T14:00`, duree: 60, dureePerso: true }),
      ],
      [indispo('i', `${J}T14:30`, `${J}T15:00`)],
    )
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.c).toBe(e.creneaux.c)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
  })

  it('débordement vers À placer : un créneau poussé au-delà de 23:00', () => {
    const e = base([
      creneau('a', { debut: `${J}T20:00` }),
      creneau('b', { debut: `${J}T21:00`, duree: 60, dureePerso: true }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.debut).toBe(`${J}T20:00`)
    expect(etat.creneaux.b.debut).toBeNull()
    expect(etat.creneaux.b.duree).toBe(60)
    expect(etat.creneaux.b.version).toBe(2)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 1 })
  })

  it("exporté envoyé dans À placer : suppression en attente à l'ancienne heure, versionExportee gardée", () => {
    const e = base([
      creneau('a', { debut: `${J}T20:00` }),
      creneau('b', { debut: `${J}T21:00`, duree: 60, dureePerso: true, version: 3, versionExportee: 3 }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.b).toMatchObject({ debut: null, version: 4, versionExportee: 3 })
    expect(etat.suppressions).toEqual({ b: { creneauId: 'b', libelle: '20 · T1 · jeudi 5 nov. 21h' } })
    expect(bilan.versBac).toBe(1)
    // Badge : `a` (nouveau, jamais exporté) + la suppression de `b` ; `b` lui-même, au bac, n'est pas exporté.
    const ch = changementsEnAttente(etat)
    expect(ch.nouveaux.map((c) => c.id)).toEqual(['a'])
    expect(ch.modifies).toEqual([])
    expect(ch.suppressions.map((s) => s.creneauId)).toEqual(['b'])
    expect(e.suppressions).toEqual({}) // l'entrée n'est pas mutée
  })

  it('jamais exporté envoyé dans À placer : pas de suppression en attente', () => {
    const e = base([
      creneau('a', { debut: `${J}T20:00` }),
      creneau('b', { debut: `${J}T21:00`, duree: 60, dureePerso: true }),
    ])
    const { etat } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.b.debut).toBeNull()
    expect(etat.suppressions).toBe(e.suppressions)
  })

  it('intacts : « Fait », durée manuelle et créneau passé gardent la même référence', () => {
    const e = base([
      creneau('fait', { fait: true, debut: `${J}T09:00` }),
      creneau('perso', { dureePerso: true, debut: `${J}T12:00` }),
      creneau('hier', { debut: '2026-11-01T14:00' }),
      creneau('dem', { debut: '2026-11-06T14:00' }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.fait).toBe(e.creneaux.fait)
    expect(etat.creneaux.perso).toBe(e.creneaux.perso)
    expect(etat.creneaux.hier).toBe(e.creneaux.hier)
    expect(etat.creneaux.dem.duree).toBe(150)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
  })

  it("aujourd'hui est recalculé", () => {
    const e = base([creneau('a', { debut: `${AUJ}T14:00` })])
    expect(recalculerCreneaux(e, AUJ).etat.creneaux.a.duree).toBe(150)
  })

  it("rien à changer : même référence d'état", () => {
    const e = base([creneau('a', { itemId: 'canc:16' })])
    const r = recalculerCreneaux(e, AUJ)
    expect(r.etat).toBe(e)
    expect(r.bilan).toEqual({ recalcules: 0, deplaces: 0, versBac: 0 })
  })

  it('parties : total recalculé 300 → chaque partie 150, nombre conservé', () => {
    const e = base([
      creneau('p1', { itemId: 'canc:40', partie: { i: 1, n: 2 }, debut: `${J}T09:00`, duree: 100 }),
      creneau('p2', { itemId: 'canc:40', partie: { i: 2, n: 2 }, debut: `${J}T14:00`, duree: 100 }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.p1.duree).toBe(150)
    expect(etat.creneaux.p2.duree).toBe(150)
    expect(etat.creneaux.p1.partie).toEqual({ i: 1, n: 2 })
    expect(etat.creneaux.p2.partie).toEqual({ i: 2, n: 2 })
    expect(bilan.recalcules).toBe(2)
  })

  it('bac recalculé sans placement', () => {
    const e = base([creneau('a', { debut: null })])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.a.debut).toBeNull()
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.a.version).toBe(2)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
  })

  it('portée collège : seuls ses créneaux changent de durée, les autres peuvent être poussés', () => {
    const e = base([
      creneau('a', { debut: `${J}T14:00` }),
      creneau('b', { itemId: 'neuro:20', debut: `${J}T16:00` }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ, { collegeId: 'canc' })
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.b.duree).toBe(120)
    expect(etat.creneaux.b.debut).toBe(`${J}T16:30`)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 1, versBac: 0 })
  })

  it('portée items : seuls les items listés sont recalculés', () => {
    const e = base([
      creneau('a', { itemId: 'canc:20', debut: `${J}T09:00` }),
      creneau('b', { itemId: 'neuro:20', debut: `${J}T14:00` }),
    ])
    const { etat } = recalculerCreneaux(e, AUJ, { itemIds: ['canc:20'] })
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.b).toBe(e.creneaux.b)
  })

  it('hors bornes inchangé : 23:15–23:45 reste en place', () => {
    const e = base([
      creneau('a', { debut: `${J}T09:00` }),
      creneau('c', { debut: `${J}T23:15`, duree: 30, dureePerso: true }),
    ])
    const { etat, bilan } = recalculerCreneaux(e, AUJ)
    expect(etat.creneaux.c).toBe(e.creneaux.c)
    expect(bilan).toEqual({ recalcules: 1, deplaces: 0, versBac: 0 })
  })

  it.each(['2026-10-25', '2027-03-28'])("changement d'heure le %s : heures exactes", (jour) => {
    const e = base([
      creneau('a', { debut: `${jour}T14:00` }),
      creneau('b', { debut: `${jour}T15:00`, duree: 60, dureePerso: true }),
    ])
    const { etat } = recalculerCreneaux(e, '2026-10-01')
    expect(etat.creneaux.a.debut).toBe(`${jour}T14:00`)
    expect(etat.creneaux.a.duree).toBe(150)
    expect(etat.creneaux.b.debut).toBe(`${jour}T16:30`)
  })
})

describe('messageRecalcul', () => {
  it('assemble les parties non nulles', () => {
    expect(messageRecalcul({ recalcules: 3, deplaces: 2, versBac: 1 })).toBe(
      '3 créneaux recalculés · 2 déplacés · 1 mis dans À placer',
    )
    expect(messageRecalcul({ recalcules: 1, deplaces: 0, versBac: 0 })).toBe('1 créneau recalculé')
  })

  it('rien si rien ne change', () => {
    expect(messageRecalcul({ recalcules: 0, deplaces: 0, versBac: 0 })).toBeNull()
  })
})
