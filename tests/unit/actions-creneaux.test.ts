import { describe, expect, it } from 'vitest'
import {
  basculerFait,
  deplacerCreneau,
  deposerItem,
  deposerItemsSerie,
  libelleSuppression,
  modifierNote,
  redimensionner,
  supprimerCreneau,
  viderPlanning,
  vueJour,
  type Cible,
} from '../../src/domain/actions-creneaux'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Indispo, Item } from '../../src/domain/types'

// Le 5 novembre 2024 est un mardi.
const J = '2024-11-05'
const h = (hh: number, mm = 0): number => hh * 60 + mm

function gen(): () => string {
  let n = 0
  return () => `id${++n}`
}

function item(numero: number, pages: number, collegeId = 'canc'): Item {
  return {
    id: `${collegeId}:${numero}`,
    collegeId,
    numero,
    titre: `Item ${numero}`,
    pages,
    pageDebut: 1,
    aVerifier: false,
  }
}

function creneau(id: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'canc:300',
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

function indispo(id: string, debut: string, fin: string): Indispo {
  return { id, titre: 'Cours', source: 'ponctuelle', sourceId: null, debut, fin }
}

function base(creneaux: Creneau[] = [], indispos: Indispo[] = []): Etat {
  const e = etatVide()
  e.colleges.canc = { id: 'canc', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2024-10-01' }
  for (const i of [item(300, 22), item(291, 18), item(301, 40)]) e.items[i.id] = i
  for (const c of creneaux) e.creneaux[c.id] = c
  for (const i of indispos) e.indispos[i.id] = i
  return e
}

const cible = (t: number, p: Partial<Cible> = {}): Cible => ({
  jour: J,
  t,
  cibleId: null,
  moitie: 'haute',
  ...p,
})

function ok(r: ReturnType<typeof deposerItem>): { etat: Etat; versBac: number } {
  if (!r.ok) throw new Error('refus inattendu')
  return r
}

describe('vueJour', () => {
  it('liste les poses du jour, exclut le créneau demandé et ignore le bac', () => {
    const e = base([
      creneau('A', { debut: `${J}T09:00`, duree: 90 }),
      creneau('B', { debut: `${J}T14:00`, duree: 60 }),
      creneau('C', { debut: '2024-11-06T09:00' }),
      creneau('D', { debut: null }),
    ])
    const v = vueJour(e, J, 'B')
    expect(v.poses).toEqual([{ id: 'A', debut: h(9), duree: 90 }])
    expect(v.bornes).toEqual({ debut: h(7), fin: h(23) })
  })

  it('découpe les indisponibilités sur le jour [0, 1440)', () => {
    const e = base(
      [],
      [
        indispo('i1', `${J}T12:00`, `${J}T13:30`),
        indispo('i2', '2024-11-04T22:00', `${J}T08:00`),
        indispo('i3', `${J}T22:00`, '2024-11-06T02:00'),
        indispo('i4', '2024-11-06T08:00', '2024-11-06T09:00'),
        indispo('i5', '2024-11-04T08:00', `${J}T00:00`),
      ],
    )
    expect(vueJour(e, J).verrous).toEqual([
      { debut: h(12), fin: h(13, 30) },
      { debut: 0, fin: h(8) },
      { debut: h(22), fin: 1440 },
    ])
  })
})

describe('libelleSuppression', () => {
  it('formate numéro · tour · date', () => {
    const e = base()
    expect(libelleSuppression(e, creneau('A'))).toBe('300 · T1 · mardi 5 nov. 14h')
    expect(libelleSuppression(e, creneau('A', { tour: 2, debut: `${J}T09:30` }))).toBe(
      '300 · T2 · mardi 5 nov. 9h30',
    )
  })

  it("item disparu : le numéro vient de la fin de l'itemId, jamais d'un identifiant complet", () => {
    const e = base()
    expect(libelleSuppression(e, creneau('A', { itemId: 'a1b2-c3d4:302' }))).toBe(
      '302 · T1 · mardi 5 nov. 14h',
    )
  })
})

describe('deposerItem', () => {
  it('crée un T1 de 165 min à l\'heure du dépôt', () => {
    const e = base()
    const { etat, versBac } = ok(deposerItem(e, 'canc:300', cible(h(14)), gen()))
    expect(versBac).toBe(0)
    expect(etat.creneaux.id1).toEqual({
      id: 'id1',
      itemId: 'canc:300',
      tour: 1,
      partie: null,
      debut: `${J}T14:00`,
      duree: 165,
      dureePerso: false,
      fait: false,
      note: '',
      version: 1,
      versionExportee: null,
    })
    expect(etat.items).toBe(e.items)
    expect(e.creneaux.id1).toBeUndefined()
  })

  it('un 2e dépôt du même item crée T2 de 90 min', () => {
    const e1 = ok(deposerItem(base(), 'canc:300', cible(h(8)), gen())).etat
    const e2 = ok(deposerItem(e1, 'canc:300', cible(h(14)), () => 'second')).etat
    expect(e2.creneaux.second.tour).toBe(2)
    expect(e2.creneaux.second.duree).toBe(90)
  })

  it('découpe un item de 40 pages : partie 1/2 placée, 2/2 au bac', () => {
    const { etat, versBac } = ok(deposerItem(base(), 'canc:301', cible(h(9)), gen()))
    expect(versBac).toBe(1)
    expect(etat.creneaux.id1).toMatchObject({ partie: { i: 1, n: 2 }, debut: `${J}T09:00`, duree: 150, tour: 1 })
    expect(etat.creneaux.id2).toMatchObject({ partie: { i: 2, n: 2 }, debut: null, duree: 150, tour: 1, version: 1 })
  })

  it('moitié haute sur un créneau existant : il est décalé et sa version passe à 2', () => {
    const A = creneau('A', { debut: `${J}T14:00`, duree: 60 })
    const B = creneau('B', { debut: `${J}T09:00`, duree: 60 })
    const e = base([A, B])
    const { etat } = ok(deposerItem(e, 'canc:291', cible(h(14), { cibleId: 'A', moitie: 'haute' }), gen()))
    expect(etat.creneaux.id1.debut).toBe(`${J}T14:00`)
    expect(etat.creneaux.id1.duree).toBe(135)
    expect(etat.creneaux.A).toMatchObject({ debut: `${J}T16:15`, version: 2 })
    expect(etat.creneaux.B).toBe(B)
  })

  it('refuse sur une indisponibilité et garde l\'état d\'origine', () => {
    const e = base([], [indispo('i1', `${J}T13:00`, `${J}T15:00`)])
    const r = deposerItem(e, 'canc:300', cible(h(14)), gen())
    expect(r).toEqual({ ok: false })
  })

  it('refuse un item inconnu', () => {
    expect(deposerItem(base(), 'canc:999', cible(h(14)), gen())).toEqual({ ok: false })
  })

  it('refuse si la partie 1 sort de la journée', () => {
    expect(deposerItem(base(), 'canc:300', cible(h(22)), gen())).toEqual({ ok: false })
  })
})

describe('deplacerCreneau', () => {
  it('sort un créneau du bac : debut non nul, version + 1', () => {
    const A = creneau('A', { debut: null })
    const e = base([A])
    const r = deplacerCreneau(e, 'A', cible(h(10)))
    if (!r.ok) throw new Error('refus')
    expect(r.etat.creneaux.A.debut).toBe(`${J}T10:00`)
    expect(r.etat.creneaux.A.version).toBe(2)
    expect(r.versBac).toBe(0)
    expect(r.etat.items).toBe(e.items)
  })

  it('déplace un créneau posé sans tenir compte de sa position d\'origine', () => {
    const A = creneau('A', { debut: `${J}T14:00`, duree: 60 })
    const e = base([A])
    // Se recouvre lui-même : accepté car A est retiré des poses.
    const r = deplacerCreneau(e, 'A', cible(h(14, 30)))
    if (!r.ok) throw new Error('refus')
    expect(r.etat.creneaux.A.debut).toBe(`${J}T14:30`)
    expect(r.etat.creneaux.A.version).toBe(2)
  })

  it('même heure : la version ne bouge pas', () => {
    const A = creneau('A')
    const r = deplacerCreneau(base([A]), 'A', cible(h(14)))
    if (!r.ok) throw new Error('refus')
    expect(r.etat.creneaux.A.version).toBe(1)
  })

  it('pousse les créneaux d\'un autre jour et incrémente leur version', () => {
    const A = creneau('A', { debut: `${J}T09:00`, duree: 60 })
    const B = creneau('B', { debut: '2024-11-06T10:00', duree: 60 })
    const r = deplacerCreneau(base([A, B]), 'A', {
      jour: '2024-11-06',
      t: h(10),
      cibleId: 'B',
      moitie: 'haute',
    })
    if (!r.ok) throw new Error('refus')
    expect(r.etat.creneaux.A.debut).toBe('2024-11-06T10:00')
    expect(r.etat.creneaux.B).toMatchObject({ debut: '2024-11-06T11:00', version: 2 })
  })

  it('refuse sur une indisponibilité ou un créneau inconnu', () => {
    const e = base([creneau('A')], [indispo('i1', `${J}T09:00`, `${J}T10:00`)])
    expect(deplacerCreneau(e, 'A', cible(h(9)))).toEqual({ ok: false })
    expect(deplacerCreneau(e, 'zzz', cible(h(11)))).toEqual({ ok: false })
  })
})

describe('deposerItemsSerie', () => {
  it('place dans l\'ordre des numéros avec la pause, sans pousser l\'existant', () => {
    const X = creneau('X', { itemId: 'canc:301', debut: `${J}T16:30`, duree: 30 })
    const e = base([X])
    const r = deposerItemsSerie(e, ['canc:300', 'canc:291'], J, h(14), gen())
    if (!r.ok) throw new Error('refus')
    // 291 : 135 min → 14:00–16:15 ; 300 : 165 min, saute X (16:30–17:00) → 17:00–19:45
    expect(r.etat.creneaux.id1).toMatchObject({ itemId: 'canc:291', debut: `${J}T14:00`, duree: 135 })
    expect(r.etat.creneaux.id2).toMatchObject({ itemId: 'canc:300', debut: `${J}T17:00`, duree: 165 })
    expect(r.versBac).toBe(0)
    expect(r.etat.creneaux.X).toBe(X)
    expect(r.etat.items).toBe(e.items)
  })

  it('envoie au bac ce qui ne tient pas, et compte aussi les parties en trop', () => {
    const r = deposerItemsSerie(base(), ['canc:291', 'canc:300'], J, h(21), gen())
    if (!r.ok) throw new Error('refus')
    expect(r.versBac).toBe(2)
    expect(r.etat.creneaux.id1).toMatchObject({ itemId: 'canc:291', debut: null })
    expect(r.etat.creneaux.id2).toMatchObject({ itemId: 'canc:300', debut: null })

    const r2 = deposerItemsSerie(base(), ['canc:301'], J, h(19), gen())
    if (!r2.ok) throw new Error('refus')
    expect(r2.versBac).toBe(1)
    expect(r2.etat.creneaux.id1).toMatchObject({ partie: { i: 1, n: 2 }, debut: `${J}T19:00` })
    expect(r2.etat.creneaux.id2).toMatchObject({ partie: { i: 2, n: 2 }, debut: null })
  })

  it('numérote les tours en tenant compte de l\'existant', () => {
    const e = base([creneau('A', { debut: null })])
    const r = deposerItemsSerie(e, ['canc:300'], J, h(8), gen())
    if (!r.ok) throw new Error('refus')
    expect(r.etat.creneaux.id1.tour).toBe(2)
    expect(r.etat.creneaux.id1.duree).toBe(90)
  })

  it('refuse un item inconnu', () => {
    expect(deposerItemsSerie(base(), ['canc:999'], J, h(8), gen())).toEqual({ ok: false })
  })
})

describe('redimensionner', () => {
  it('est plafonné par le bloc suivant ; dureePerso passe à true ; version + 1', () => {
    const A = creneau('A', { debut: `${J}T14:00`, duree: 60 })
    const N = creneau('N', { debut: `${J}T15:30`, duree: 60 })
    const e = base([A, N])
    const apres = redimensionner(e, 'A', 300)
    expect(apres.creneaux.A).toMatchObject({ duree: 90, dureePerso: true, version: 2 })
    expect(apres.creneaux.N).toBe(N)
    expect(apres.items).toBe(e.items)
  })

  it('est plafonné par une indisponibilité', () => {
    const e = base([creneau('A')], [indispo('i1', `${J}T16:00`, `${J}T17:00`)])
    expect(redimensionner(e, 'A', 300).creneaux.A.duree).toBe(120)
  })

  it('est plafonné par la fin de journée', () => {
    const e = base([creneau('A', { debut: `${J}T21:00` })])
    expect(redimensionner(e, 'A', 300).creneaux.A.duree).toBe(120)
  })

  it('ne descend pas sous un pas', () => {
    const e = base([creneau('A')])
    expect(redimensionner(e, 'A', 0).creneaux.A.duree).toBe(15)
  })

  it('ignore les blocs d\'un autre jour ou antérieurs', () => {
    const e = base([
      creneau('A'),
      creneau('P', { debut: `${J}T09:00` }),
      creneau('Q', { debut: '2024-11-06T15:00' }),
    ])
    expect(redimensionner(e, 'A', 120).creneaux.A.duree).toBe(120)
  })

  it('ne touche pas la version si la durée est inchangée', () => {
    const e = base([creneau('A')])
    const apres = redimensionner(e, 'A', 60)
    expect(apres.creneaux.A.version).toBe(1)
    expect(apres.creneaux.A.dureePerso).toBe(true)
  })

  it('dans le bac : règle simplement la durée', () => {
    const e = base([creneau('A', { debut: null, duree: 60 })])
    const apres = redimensionner(e, 'A', 500)
    expect(apres.creneaux.A).toMatchObject({ duree: 500, dureePerso: true, version: 2 })
  })
})

describe('supprimerCreneau', () => {
  it('ajoute une suppression en attente pour un créneau exporté', () => {
    const A = creneau('A', { versionExportee: 1 })
    const B = creneau('B', { debut: `${J}T09:00` })
    const e = base([A, B])
    const apres = supprimerCreneau(e, 'A')
    expect(apres.creneaux.A).toBeUndefined()
    expect(apres.creneaux.B).toBe(B)
    expect(apres.suppressions.A).toEqual({ creneauId: 'A', libelle: '300 · T1 · mardi 5 nov. 14h' })
    expect(e.creneaux.A).toBe(A)
  })

  it('n\'en ajoute pas pour un créneau jamais exporté', () => {
    const e = base([creneau('A')])
    const apres = supprimerCreneau(e, 'A')
    expect(apres.creneaux.A).toBeUndefined()
    expect(apres.suppressions).toBe(e.suppressions)
  })

  it('ne renumérote pas les autres tours', () => {
    const e = base([creneau('A', { tour: 1 }), creneau('B', { tour: 2, debut: `${J}T09:00` })])
    expect(supprimerCreneau(e, 'A').creneaux.B.tour).toBe(2)
  })
})

describe('viderPlanning', () => {
  it("supprime tous les créneaux (placés et à placer) ; seul l'exporté laisse une suppression en attente", () => {
    const A = creneau('A', { versionExportee: 2 })
    const B = creneau('B', { debut: `${J}T09:00` })
    const C = creneau('C', { debut: null })
    const e = base([A, B, C], [indispo('I', `${J}T08:00`, `${J}T09:00`)])
    const apres = viderPlanning(e)
    expect(apres.creneaux).toEqual({})
    expect(apres.suppressions).toEqual({ A: { creneauId: 'A', libelle: '300 · T1 · mardi 5 nov. 14h' } })
    expect(apres.colleges).toBe(e.colleges)
    expect(apres.items).toBe(e.items)
    expect(apres.indispos).toBe(e.indispos)
    expect(apres.reglages).toBe(e.reglages)
    expect(e.creneaux.A).toBe(A)
  })

  it('conserve les suppressions déjà en attente', () => {
    const e = base([creneau('A', { versionExportee: 1 })])
    e.suppressions = { Z: { creneauId: 'Z', libelle: 'ancien' } }
    const apres = viderPlanning(e)
    expect(Object.keys(apres.suppressions).sort()).toEqual(['A', 'Z'])
  })

  it("renvoie le même état s'il n'y a aucun créneau", () => {
    const e = base()
    expect(viderPlanning(e)).toBe(e)
  })
})

describe('basculerFait / modifierNote', () => {
  it('basculerFait n\'incrémente pas la version', () => {
    const A = creneau('A')
    const e = base([A])
    const f = basculerFait(e, 'A')
    expect(f.creneaux.A.fait).toBe(true)
    expect(f.creneaux.A.version).toBe(1)
    expect(basculerFait(f, 'A').creneaux.A.fait).toBe(false)
    expect(f.items).toBe(e.items)
  })

  it('modifierNote incrémente la version seulement si la note change', () => {
    const e = base([creneau('A')])
    const n = modifierNote(e, 'A', 'revoir les tableaux')
    expect(n.creneaux.A).toMatchObject({ note: 'revoir les tableaux', version: 2 })
    expect(modifierNote(n, 'A', 'revoir les tableaux')).toBe(n)
  })

  it('créneau inconnu : état inchangé', () => {
    const e = base()
    expect(basculerFait(e, 'zzz')).toBe(e)
    expect(modifierNote(e, 'zzz', 'x')).toBe(e)
    expect(supprimerCreneau(e, 'zzz')).toBe(e)
    expect(redimensionner(e, 'zzz', 60)).toBe(e)
  })
})
