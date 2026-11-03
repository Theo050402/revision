import { describe, expect, it } from 'vitest'
import { creneauxDansZone, decalageGroupe, deplacerGroupe, supprimerGroupe, type Zone } from '../../src/domain/selection'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Indispo } from '../../src/domain/types'

// Le 4 novembre 2024 est un lundi.
const LUN = '2024-11-04'
const MAR = '2024-11-05'
const MER = '2024-11-06'
const h = (hh: number, mm = 0): number => hh * 60 + mm

function creneau(id: string, debut: string | null, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'canc:300',
    tour: 1,
    partie: null,
    debut,
    duree: 60,
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

function base(creneaux: Creneau[] = [], indispos: Indispo[] = []): Etat {
  const e = etatVide()
  e.colleges.canc = { id: 'canc', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2024-10-01' }
  e.items['canc:300'] = {
    id: 'canc:300',
    collegeId: 'canc',
    numero: 300,
    titre: 'Item 300',
    pages: 22,
    pageDebut: 1,
    aVerifier: false,
  }
  for (const c of creneaux) e.creneaux[c.id] = c
  for (const i of indispos) e.indispos[i.id] = i
  return e
}

describe('creneauxDansZone', () => {
  it('zone sur plusieurs jours : créneaux lun. 9h et mer. 14h, indispo ignorée', () => {
    const e = base(
      [creneau('a', `${LUN}T09:00`), creneau('b', `${MER}T14:00`), creneau('bac', null)],
      [indispo('i', `${MAR}T09:00`, `${MAR}T10:00`)],
    )
    const z: Zone = { jourDebut: LUN, jourFin: MER, debut: h(8), fin: h(15) }
    expect(creneauxDansZone(e, z)).toEqual(['a', 'b'])
  })

  it('un créneau qui touche à peine le bord est inclus, un voisin juste à côté non', () => {
    const e = base([
      creneau('fin', `${LUN}T08:00`, { duree: 60 }), // finit à 9h00 pile = bord haut de la zone
      creneau('debut', `${LUN}T15:00`), // commence à 15h00 = bord bas
      creneau('avant', `${LUN}T06:00`, { duree: 60 }), // finit à 7h00 < 8h
      creneau('apres', `${LUN}T16:00`), // commence à 16h > 15h
    ])
    const z: Zone = { jourDebut: LUN, jourFin: LUN, debut: h(9), fin: h(15) }
    expect(creneauxDansZone(e, z)).toEqual(['fin', 'debut'])
  })

  it('ignore les jours hors zone et trie par début puis id', () => {
    const e = base([
      creneau('z', `${LUN}T10:00`),
      creneau('b', `${LUN}T09:00`),
      creneau('a', `${LUN}T09:00`),
      creneau('hors', `${MAR}T09:00`),
    ])
    const z: Zone = { jourDebut: LUN, jourFin: LUN, debut: 0, fin: 1440 }
    expect(creneauxDansZone(e, z)).toEqual(['a', 'b', 'z'])
  })

  it('zone exprimée en minutes : indépendante du défilement', () => {
    const e = base([creneau('a', `${MAR}T10:00`)])
    const z: Zone = { jourDebut: MAR, jourFin: MAR, debut: h(9), fin: h(11) }
    // Même zone, appelée deux fois (avant et après un défilement fictif) : même résultat.
    expect(creneauxDansZone(e, z)).toEqual(['a'])
    expect(creneauxDansZone(e, { ...z })).toEqual(['a'])
  })

  it('normalise une zone à jours inversés', () => {
    const e = base([creneau('a', `${LUN}T09:00`), creneau('b', `${MER}T14:00`)])
    const z: Zone = { jourDebut: MER, jourFin: LUN, debut: h(8), fin: h(15) }
    expect(creneauxDansZone(e, z)).toEqual(['a', 'b'])
  })
})

describe('deplacerGroupe', () => {
  it('déplacement accepté : +1 jour et +30 min, version + 1, autres références intactes', () => {
    const a = creneau('a', `${LUN}T09:00`)
    const b = creneau('b', `${MAR}T14:00`)
    const autre = creneau('autre', `${MER}T18:00`)
    const bac = creneau('bac', null)
    const e = base([a, b, autre, bac])
    const r = deplacerGroupe(e, ['a', 'b'], 1, 30)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.etat.creneaux.a.debut).toBe(`${MAR}T09:30`)
    expect(r.etat.creneaux.a.version).toBe(2)
    expect(r.etat.creneaux.b.debut).toBe(`${MER}T14:30`)
    expect(r.etat.creneaux.b.version).toBe(2)
    expect(r.etat.creneaux.autre).toBe(autre)
    expect(r.etat.creneaux.bac).toBe(bac)
    expect(e.creneaux.a).toBe(a)
  })

  it('décalage nul : même état, même référence', () => {
    const e = base([creneau('a', `${LUN}T09:00`)])
    const r = deplacerGroupe(e, ['a'], 0, 0)
    expect(r).toEqual({ ok: true, etat: e, versBac: 0 })
    if (r.ok) expect(r.etat).toBe(e)
  })

  it('les créneaux du bac et ids inconnus sont ignorés', () => {
    const bac = creneau('bac', null)
    const e = base([creneau('a', `${LUN}T09:00`), bac])
    const r = deplacerGroupe(e, ['a', 'bac', 'inconnu'], 1, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.etat.creneaux.a.debut).toBe(`${MAR}T09:00`)
    expect(r.etat.creneaux.bac).toBe(bac)
    expect(r.etat.creneaux.inconnu).toBeUndefined()
  })

  it('refus : un membre tomberait sur une indisponibilité', () => {
    const e = base(
      [creneau('a', `${LUN}T09:00`), creneau('b', `${LUN}T11:00`)],
      [indispo('i', `${MAR}T11:30`, `${MAR}T12:00`)],
    )
    expect(deplacerGroupe(e, ['a', 'b'], 1, 0)).toEqual({ ok: false })
  })

  it('refus : un membre tomberait sur un créneau non sélectionné', () => {
    const e = base([
      creneau('a', `${LUN}T09:00`),
      creneau('b', `${LUN}T11:00`),
      creneau('autre', `${MAR}T11:30`),
    ])
    expect(deplacerGroupe(e, ['a', 'b'], 1, 0)).toEqual({ ok: false })
  })

  it('refus : un membre sortirait des bornes de sa journée', () => {
    // Journée par défaut 07:00 – 23:00.
    const e = base([creneau('a', `${LUN}T07:30`), creneau('b', `${LUN}T21:30`)])
    expect(deplacerGroupe(e, ['a', 'b'], 0, -45)).toEqual({ ok: false })
    expect(deplacerGroupe(e, ['a', 'b'], 0, 45)).toEqual({ ok: false })
  })

  it('accepte un membre qui finit pile à la fin de journée ou démarre pile au début', () => {
    const e = base([creneau('a', `${LUN}T21:00`)])
    expect(deplacerGroupe(e, ['a'], 1, 60).ok).toBe(true)
    expect(deplacerGroupe(e, ['a'], 1, 61).ok).toBe(false)
  })

  it('un créneau non sélectionné qui touche juste le bord ne gêne pas (intervalles semi-ouverts)', () => {
    const e = base([
      creneau('a', `${LUN}T09:00`),
      creneau('voisin', `${MAR}T10:00`), // commence là où le membre finit
    ])
    expect(deplacerGroupe(e, ['a'], 1, 0).ok).toBe(true)
  })

  it('un membre déjà occupé par un autre membre qui libère la place est accepté', () => {
    // a (lun. 9h) glisse sur la place que b occupait (mar. 9h), b part ailleurs.
    const e = base([creneau('a', `${LUN}T09:00`), creneau('b', `${MAR}T09:00`)])
    const r = deplacerGroupe(e, ['a', 'b'], 1, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.etat.creneaux.a.debut).toBe(`${MAR}T09:00`)
    expect(r.etat.creneaux.b.debut).toBe(`${MER}T09:00`)
  })

  it('groupe qui se suit lui-même : pas de conflit entre membres', () => {
    const e = base([creneau('a', `${LUN}T09:00`), creneau('b', `${LUN}T10:00`)])
    const r = deplacerGroupe(e, ['a', 'b'], 0, 30)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.etat.creneaux.a.debut).toBe(`${LUN}T09:30`)
    expect(r.etat.creneaux.b.debut).toBe(`${LUN}T10:30`)
  })
})

describe('deplacerGroupe : décalages invalides', () => {
  // Refus (et non « rien ») : un décalage invalide ne vient que d'un appelant fautif, jamais d'un geste ; refuser
  // fait revenir le groupe à son origine sans rien écrire, comme tout dépôt impossible.
  it.each([
    [Number.NaN, 0],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
    [0.5, 0],
    [0, 15.5],
  ])('décalage (%s jours, %s min) : refus, rien d’écrit', (jours, minutes) => {
    const e = base([creneau('a', `${LUN}T09:00`)])
    expect(deplacerGroupe(e, ['a'], jours, minutes)).toEqual({ ok: false })
    expect(e.creneaux.a.debut).toBe(`${LUN}T09:00`)
  })

  it('un décalage qui ramène pile au même début n’existe pas : tout membre déplacé passe en version + 1', () => {
    // +1 jour −1440 min sortirait des bornes de la journée avant de pouvoir retomber au même début.
    const e = base([creneau('a', `${LUN}T09:00`)])
    expect(deplacerGroupe(e, ['a'], 1, -1440)).toEqual({ ok: false })
    const r = deplacerGroupe(e, ['a'], 0, 15)
    expect(r.ok && r.etat.creneaux.a.version).toBe(2)
  })
})

describe('decalageGroupe (décalage magnétisé de l’ancre)', () => {
  it('jours et minutes entre le début de l’ancre et la cible (déjà magnétisée au pas)', () => {
    const ancre = creneau('a', `${LUN}T09:00`)
    expect(decalageGroupe(ancre, { jour: MER, t: h(14, 30) })).toEqual({ jours: 2, minutes: 330 })
    expect(decalageGroupe(ancre, { jour: LUN, t: h(9) })).toEqual({ jours: 0, minutes: 0 })
    expect(decalageGroupe(creneau('b', `${MER}T16:15`), { jour: LUN, t: h(8) })).toEqual({ jours: -2, minutes: -495 })
  })

  it('traverse un mois et un changement d’heure sans glisser d’une heure', () => {
    // 25 oct. 2026 : passage à l'heure d'hiver ; le 1er nov. change de mois.
    expect(decalageGroupe(creneau('a', '2026-10-24T10:00'), { jour: '2026-11-02', t: h(10) })).toEqual({ jours: 9, minutes: 0 })
    expect(decalageGroupe(creneau('a', '2027-03-27T10:00'), { jour: '2027-03-29', t: h(11) })).toEqual({ jours: 2, minutes: 60 })
  })

  it('ancre au bac : aucun décalage possible (null)', () => {
    expect(decalageGroupe(creneau('a', null), { jour: LUN, t: h(9) })).toBeNull()
  })
})

describe('supprimerGroupe', () => {
  it('supprime les membres ; suppression en attente pour les exportés seulement', () => {
    const e = base([
      creneau('a', `${LUN}T09:00`, { versionExportee: 1 }),
      creneau('b', `${LUN}T11:00`),
      creneau('bac', null),
      creneau('reste', `${MAR}T09:00`),
    ])
    const s = supprimerGroupe(e, ['a', 'b', 'bac'])
    expect(Object.keys(s.creneaux)).toEqual(['reste'])
    expect(Object.keys(s.suppressions)).toEqual(['a'])
    expect(s.suppressions.a.creneauId).toBe('a')
    expect(s.creneaux.reste).toBe(e.creneaux.reste)
    expect(e.creneaux.a).toBeDefined()
  })

  it('ids inconnus ignorés ; rien à retirer = même état', () => {
    const e = base([creneau('a', `${LUN}T09:00`)])
    expect(supprimerGroupe(e, ['x', 'y'])).toBe(e)
    expect(supprimerGroupe(e, [])).toBe(e)
  })
})
