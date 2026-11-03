import { describe, expect, it } from 'vitest'
import type { Cible } from '../../src/domain/actions-creneaux'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Indispo, Item } from '../../src/domain/types'
import { apercu, cibleMois, creneauFantome, deposer, type Source } from '../../src/ui/dnd/apercu'

// Le 3 novembre 2026 est un mardi.
const J = '2026-11-03'

function item(numero: number, pages: number): Item {
  return { id: `c:${numero}`, collegeId: 'c', numero, titre: `Item ${numero}`, pages, pageDebut: 1, aVerifier: false }
}

function creneau(id: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'c:300',
    tour: 1,
    partie: null,
    debut: `${J}T14:00`,
    duree: 60,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

const stage: Indispo = {
  id: 'stage',
  titre: 'Stage',
  source: 'ponctuelle',
  sourceId: null,
  debut: `${J}T08:00`,
  fin: `${J}T13:00`,
}

function base(creneaux: Creneau[] = []): Etat {
  const e = etatVide()
  e.colleges.c = { id: 'c', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2026-10-01T10:00' }
  // 300 : 22 p → 2h45 ; 291 : 18 p → 2h15 ; 296 : 8 p → 1h ; 299 : 12 p → 1h30.
  for (const i of [item(300, 22), item(291, 18), item(296, 8), item(299, 12)]) e.items[i.id] = i
  for (const c of creneaux) e.creneaux[c.id] = c
  e.indispos.stage = stage
  return e
}

const cible = (hh: number, mm = 0, p: Partial<Cible> = {}): Cible => ({
  jour: J,
  t: hh * 60 + mm,
  cibleId: null,
  moitie: 'haute',
  ...p,
})

describe('apercu (aperçu de cascade, pur)', () => {
  it('un item sur un emplacement libre : un nouveau créneau à l’heure magnétisée, état intact', () => {
    const e = base()
    const avant = JSON.stringify(e)
    const r = apercu(e, { type: 'item', itemIds: ['c:300'] }, cible(14))
    expect(r.ok).toBe(true)
    expect(Object.values(r.positions)).toEqual([`${J}T14:00`])
    expect(r.nouveaux).toHaveLength(1)
    expect(r.nouveaux[0]).toMatchObject({ itemId: 'c:300', duree: 165, debut: `${J}T14:00` })
    expect(r.positions[r.nouveaux[0].id]).toBe(`${J}T14:00`)
    // Jamais persisté : l'état d'entrée n'est pas modifié.
    expect(JSON.stringify(e)).toBe(avant)
  })

  it('moitié haute d’un créneau : le nouveau s’insère avant, l’existant descend', () => {
    const e = base([creneau('a', { debut: `${J}T14:00`, duree: 165 })])
    const r = apercu(e, { type: 'item', itemIds: ['c:296'] }, cible(14, 30, { cibleId: 'a', moitie: 'haute' }))
    expect(r.ok).toBe(true)
    // 296 occupe 14h30–15h30, « a » repart de 15h30.
    expect(r.positions.a).toBe(`${J}T15:30`)
    expect(r.positions[r.nouveaux[0].id]).toBe(`${J}T14:30`)
  })

  it('moitié basse d’un créneau : le nouveau s’insère après, l’existant monte', () => {
    const e = base([creneau('a', { debut: `${J}T15:00`, duree: 60 })])
    const r = apercu(e, { type: 'item', itemIds: ['c:296'] }, cible(15, 30, { cibleId: 'a', moitie: 'basse' }))
    expect(r.ok).toBe(true)
    expect(r.positions.a).toBe(`${J}T14:30`)
  })

  it('les créneaux qui ne bougent pas sont absents de `positions`', () => {
    const e = base([creneau('a', { debut: `${J}T14:00` }), creneau('loin', { debut: `${J}T20:00` })])
    const r = apercu(e, { type: 'item', itemIds: ['c:296'] }, cible(17))
    expect(r.ok).toBe(true)
    expect(r.positions).not.toHaveProperty('a')
    expect(r.positions).not.toHaveProperty('loin')
  })

  it('sur une indisponibilité : refus, aucune position', () => {
    const e = base()
    const r = apercu(e, { type: 'item', itemIds: ['c:300'] }, cible(9))
    expect(r).toEqual({ ok: false, positions: {}, nouveaux: [], versBac: 0 })
  })

  it('poussée hors de la journée : refus', () => {
    const e = base([creneau('a', { debut: `${J}T21:00`, duree: 120 })])
    const r = apercu(e, { type: 'item', itemIds: ['c:296'] }, cible(21, 0, { cibleId: 'a', moitie: 'haute' }))
    expect(r.ok).toBe(false)
  })

  it('déplacement d’un créneau : sa nouvelle heure, sans nouveau créneau', () => {
    const e = base([creneau('a', { debut: `${J}T14:00` })])
    const r = apercu(e, { type: 'creneau', id: 'a' }, { ...cible(16), jour: '2026-11-04' })
    expect(r.ok).toBe(true)
    expect(r.positions).toEqual({ a: '2026-11-04T16:00' })
    expect(r.nouveaux).toEqual([])
  })

  it('créneau lâché à sa place : aucune position', () => {
    const e = base([creneau('a', { debut: `${J}T14:00` })])
    const r = apercu(e, { type: 'creneau', id: 'a' }, cible(14))
    expect(r).toMatchObject({ ok: true, positions: {} })
  })

  it('dépôt multiple : créneaux espacés de la pause (10 min), sans pousser l’existant', () => {
    const e = base([creneau('a', { debut: `${J}T18:00`, duree: 60 })])
    const r = apercu(e, { type: 'item', itemIds: ['c:299', 'c:296', 'c:300'] }, cible(14))
    expect(r.ok).toBe(true)
    expect(r.positions).not.toHaveProperty('a')
    // Ordre des numéros : 296 (1h), 299 (1h30), 300 (2h45 ne tient pas avant 18h → après « a », sans pause).
    const debuts = r.nouveaux.map((c) => [c.itemId, c.debut])
    expect(debuts).toEqual([
      ['c:296', `${J}T14:00`],
      ['c:299', `${J}T15:10`],
      ['c:300', `${J}T19:00`],
    ])
  })

  it('dépôt multiple qui déborde : versBac compte les créneaux mis de côté', () => {
    const e = base()
    const r = apercu(e, { type: 'item', itemIds: ['c:296', 'c:299', 'c:300'] }, cible(21))
    expect(r.ok).toBe(true)
    expect(r.versBac).toBe(2)
    expect(r.nouveaux).toHaveLength(1)
  })

  it('identifiants déterministes : deux aperçus identiques donnent le même résultat', () => {
    const e = base()
    const s: Source = { type: 'item', itemIds: ['c:300'] }
    expect(apercu(e, s, cible(14))).toEqual(apercu(e, s, cible(14)))
  })
})

describe('deposer (le lâcher, mêmes actions que l’aperçu)', () => {
  it('donne les mêmes heures que l’aperçu', () => {
    const e = base([creneau('a', { debut: `${J}T14:00`, duree: 165 })])
    const c = cible(14, 30, { cibleId: 'a', moitie: 'haute' })
    const vu = apercu(e, { type: 'item', itemIds: ['c:296'] }, c)
    const r = deposer(e, { type: 'item', itemIds: ['c:296'] }, c)
    if (!r.ok) throw new Error('refus inattendu')
    expect(r.etat.creneaux.a.debut).toBe(vu.positions.a)
  })
})

describe('groupe (spec §D.3) : l’ancre donne le décalage, tout le groupe le suit', () => {
  const K = '2026-11-04'
  const groupe = (ids: string[], ancre: string): Source => ({ type: 'groupe', ids, ancre })

  it('aperçu et lâcher : chaque membre décalé comme l’ancre, sans nouveau créneau ni poussée', () => {
    const e = base([
      creneau('a', { debut: `${J}T14:00`, duree: 60 }),
      creneau('b', { debut: `${J}T16:00`, duree: 30 }),
      creneau('autre', { debut: `${K}T18:00`, duree: 60 }),
    ])
    // L'ancre a (mar. 14h) visée mer. 15h : +1 jour, +60 min.
    const c: Cible = { jour: K, t: 15 * 60, cibleId: null, moitie: 'haute' }
    const vu = apercu(e, groupe(['a', 'b'], 'a'), c)
    expect(vu).toEqual({ ok: true, positions: { a: `${K}T15:00`, b: `${K}T17:00` }, nouveaux: [], versBac: 0 })
    const r = deposer(e, groupe(['a', 'b'], 'a'), c)
    if (!r.ok) throw new Error('refus inattendu')
    expect(r.etat.creneaux.a.debut).toBe(vu.positions.a)
    expect(r.etat.creneaux.b.debut).toBe(vu.positions.b)
    expect(r.etat.creneaux.autre).toBe(e.creneaux.autre)
  })

  it('un membre tomberait sur le stage : refus du groupe entier, sans cascade', () => {
    const e = base([creneau('a', { debut: `${J}T16:00` }), creneau('b', { debut: `${J}T19:00` })])
    // b remonte de 4 h : 15h, libre ; a remonte à 12h, dans le stage (8h–13h).
    const c = cible(15, 0)
    expect(apercu(e, groupe(['a', 'b'], 'b'), c).ok).toBe(false)
    expect(deposer(e, groupe(['a', 'b'], 'b'), c)).toEqual({ ok: false })
  })

  it('un créneau non sélectionné sur le chemin : refus (pas de poussée pour un groupe)', () => {
    const e = base([creneau('a', { debut: `${J}T14:00` }), creneau('x', { debut: `${J}T15:30` })])
    expect(apercu(e, groupe(['a'], 'a'), cible(15, 0)).ok).toBe(false)
  })

  it('lâché sur place : aucune position', () => {
    const e = base([creneau('a'), creneau('b', { debut: `${J}T16:00` })])
    expect(apercu(e, groupe(['a', 'b'], 'a'), cible(14, 0))).toEqual({ ok: true, positions: {}, nouveaux: [], versBac: 0 })
  })

  it('ancre disparue ou au bac : refus', () => {
    const e = base([creneau('a'), creneau('bac', { debut: null })])
    expect(deposer(e, groupe(['a'], 'inconnu'), cible(15)).ok).toBe(false)
    expect(deposer(e, groupe(['a', 'bac'], 'bac'), cible(15)).ok).toBe(false)
  })

  it('vue Mois : pas de dépôt de groupe (null) ; le fantôme est l’ancre', () => {
    const e = base([creneau('a'), creneau('b', { debut: `${J}T16:00` })])
    expect(cibleMois(e, groupe(['a', 'b'], 'b'), '2026-11-07')).toBeNull()
    expect(creneauFantome(e, groupe(['a', 'b'], 'b'))).toBe(e.creneaux.b)
  })
})

describe('cibleMois (dépôt sur un jour de la vue Mois)', () => {
  it('jour libre : début de la journée', () => {
    const e = base()
    expect(cibleMois(e, { type: 'item', itemIds: ['c:300'] }, '2026-11-07')).toEqual({
      jour: '2026-11-07',
      t: 7 * 60,
      cibleId: null,
      moitie: 'haute',
    })
  })

  it('première heure libre où le créneau tient sans rien pousser', () => {
    // Stage 8h–13h ; 7h–8h trop court pour 2h45 ; un créneau 13h–14h → 14h.
    const e = base([creneau('a', { debut: `${J}T13:00`, duree: 60 })])
    expect(cibleMois(e, { type: 'item', itemIds: ['c:300'] }, J)?.t).toBe(14 * 60)
    // 1h tient de 7h à 8h.
    expect(cibleMois(e, { type: 'item', itemIds: ['c:296'] }, J)?.t).toBe(7 * 60)
  })

  it('un créneau déplacé ignore sa propre place', () => {
    const e = base([creneau('a', { debut: '2026-11-07T07:00', duree: 60 })])
    expect(cibleMois(e, { type: 'creneau', id: 'a' }, '2026-11-07')?.t).toBe(7 * 60)
  })

  it('aucune place : null (refus)', () => {
    const e = base([creneau('a', { debut: `${J}T13:00`, duree: 600 })])
    expect(cibleMois(e, { type: 'item', itemIds: ['c:300'] }, J)).toBeNull()
  })

  it('plusieurs items : la série part du début de la journée', () => {
    const e = base()
    expect(cibleMois(e, { type: 'item', itemIds: ['c:296', 'c:299'] }, J)?.t).toBe(7 * 60)
  })
})

describe('creneauFantome (fantôme hors aperçu)', () => {
  it('item : première partie du prochain tour, du plus petit numéro', () => {
    const e = base([creneau('a', { itemId: 'c:296', tour: 1 })])
    expect(creneauFantome(e, { type: 'item', itemIds: ['c:300', 'c:296'] })).toMatchObject({
      itemId: 'c:296',
      tour: 2,
      duree: 30,
      debut: null,
    })
  })

  it('créneau : lui-même ; item inconnu : null', () => {
    const e = base([creneau('a')])
    expect(creneauFantome(e, { type: 'creneau', id: 'a' })).toBe(e.creneaux.a)
    expect(creneauFantome(e, { type: 'item', itemIds: ['x:1'] })).toBeNull()
  })
})
