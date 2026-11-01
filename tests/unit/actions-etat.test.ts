import { describe, expect, it } from 'vitest'
import {
  ajouterCollege,
  ajouterIndispo,
  changementsEnAttente,
  conflits,
  creneauxExportes,
  enregistrerRecurrence,
  evenementsExport,
  importerIndisposIcs,
  marquerExporte,
  modifierCollege,
  modifierIndispo,
  modifierReglages,
  reconcilierExport,
  reimporterCollege,
  supprimerCollege,
  supprimerIndispo,
  supprimerRecurrence,
  viderSuppressions,
} from '../../src/domain/actions-etat'
import { etatVide } from '../../src/domain/defaults'
import type { ItemExtrait } from '../../src/import/catalog'
import type { Creneau, Etat, Recurrence } from '../../src/domain/types'

function extrait(numero: number, pageDebut: number, pages: number, titre = `Item ${numero}`): ItemExtrait {
  return { numero, titre, pageDebut, pages, aVerifier: false, raison: null }
}

function creneau(id: string, itemId: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId,
    tour: 1,
    partie: null,
    debut: '2026-11-03T14:00',
    duree: 60,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

/** État avec un collège « Cancérologie » (id `c1`) et les items 300 et 301. */
function base(): Etat {
  return ajouterCollege(
    etatVide(),
    'Cancérologie',
    [extrait(300, 153, 22, 'Tumeurs du col utérin, tumeurs du corps utérin'), extrait(301, 175, 10)],
    () => 'c1',
    new Date('2026-10-28T10:00:00Z'),
  )
}

function avec(e: Etat, ...cs: Creneau[]): Etat {
  return { ...e, creneaux: { ...e.creneaux, ...Object.fromEntries(cs.map((c) => [c.id, c])) } }
}

describe('collèges', () => {
  it('ajouterCollege crée le collège et ses items (couleur = nombre de collèges % 6)', () => {
    const e = base()
    expect(e.colleges.c1).toEqual({
      id: 'c1',
      nom: 'Cancérologie',
      couleur: 0,
      coefficient: 1,
      importeLe: '2026-10-28T11:00',
    })
    expect(e.items['c1:300']).toEqual({
      id: 'c1:300',
      collegeId: 'c1',
      numero: 300,
      titre: 'Tumeurs du col utérin, tumeurs du corps utérin',
      pageDebut: 153,
      pages: 22,
      aVerifier: false,
    })
    let s = e
    for (let k = 2; k <= 7; k++) s = ajouterCollege(s, `C${k}`, [], () => `c${k}`)
    expect(s.colleges.c7.couleur).toBe(0) // 6 collèges existants → 6 % 6
    expect(s.colleges.c3.couleur).toBe(2)
  })

  it('modifierCollege fusionne les champs', () => {
    const e = modifierCollege(base(), 'c1', { nom: 'Cancéro', couleur: 3, coefficient: 1.5 })
    expect(e.colleges.c1).toMatchObject({ nom: 'Cancéro', couleur: 3, coefficient: 1.5 })
    expect(modifierCollege(base(), 'inconnu', { nom: 'x' })).toEqual(base())
  })

  it('reimporterCollege remplace les items par numéro et garde les créneaux', () => {
    const e0 = avec(base(), creneau('k1', 'c1:300'), creneau('k2', 'c1:301'))
    const e = reimporterCollege(e0, 'c1', [extrait(300, 160, 30, 'Nouveau titre'), extrait(302, 200, 5)])
    // 301 a disparu mais k2 le référence : l'item est gardé, titre figé, à vérifier
    expect(Object.keys(e.items).sort()).toEqual(['c1:300', 'c1:301', 'c1:302'])
    expect(e.items['c1:301']).toEqual({ ...e0.items['c1:301'], aVerifier: true })
    expect(e.items['c1:300']).toMatchObject({ pageDebut: 160, pages: 30, titre: 'Nouveau titre' })
    // les deux créneaux sont conservés, y compris celui dont le numéro a disparu
    expect(e.creneaux.k1).toBe(e0.creneaux.k1)
    expect(e.creneaux.k2).toBe(e0.creneaux.k2)
  })

  it('reimporterCollege garde (aVerifier) un item disparu tant qu un créneau le référence, sinon le retire', () => {
    const e0 = avec(
      ajouterCollege(base(), 'Cardio', [], () => 'c2'),
      creneau('k1', 'c1:301', { versionExportee: null }),
    )
    // 300 (sans créneau) et 301 (avec créneau) disparaissent, 302 apparaît
    const e = reimporterCollege(e0, 'c1', [extrait(302, 200, 5)])
    expect(Object.keys(e.items).sort()).toEqual(['c1:301', 'c1:302'])
    expect(e.items['c1:301']).toEqual({ ...e0.items['c1:301'], aVerifier: true })
    expect(e.items['c1:300']).toBeUndefined()
    expect(e.creneaux.k1).toBe(e0.creneaux.k1)
    // le créneau est exporté normalement, avec son titre figé
    expect(evenementsExport(e, 'tout').map((v) => v.resume)).toEqual(['📚 301 · Item 301 · T1'])
    expect(changementsEnAttente(e).nouveaux.map((c) => c.id)).toEqual(['k1'])
  })

  it("changementsEnAttente et evenementsExport s'accordent même pour un état sans item", () => {
    const e = avec(
      base(),
      creneau('ok', 'c1:300'),
      creneau('orphelin', 'c1:999', { debut: '2026-11-04T09:00' }),
      creneau('orphelinMod', 'c1:998', { debut: '2026-11-04T10:00', version: 2, versionExportee: 1 }),
    )
    const ch = changementsEnAttente(e)
    expect(ch.nouveaux.length).toBe(evenementsExport(e, 'nouveaux').length)
    expect(ch.modifies.length).toBe(evenementsExport(e, 'modifies').length)
    expect(evenementsExport(e, 'tout')).toHaveLength(1)
    expect(ch.nouveaux.map((c) => c.id)).toEqual(['ok'])
  })

  it("reimporterCollege ne touche pas aux items d'un autre collège", () => {
    let e = base()
    e = ajouterCollege(e, 'Cardio', [extrait(300, 1, 5)], () => 'c2')
    e = reimporterCollege(e, 'c1', [extrait(301, 175, 10)])
    expect(Object.keys(e.items).sort()).toEqual(['c1:301', 'c2:300'])
  })

  it('supprimerCollege : 1 créneau exporté + 1 jamais exporté → 1 seule suppression en attente', () => {
    const e0 = avec(
      base(),
      creneau('k1', 'c1:300', { versionExportee: 1 }),
      creneau('k2', 'c1:301', { versionExportee: null }),
    )
    const e = supprimerCollege(e0, 'c1')
    expect(e.colleges).toEqual({})
    expect(e.items).toEqual({})
    expect(e.creneaux).toEqual({})
    expect(Object.values(e.suppressions)).toEqual([
      { creneauId: 'k1', libelle: '300 · T1 · mardi 3 nov. 14h' },
    ])
  })

  it("supprimerCollege n'affecte pas les autres collèges", () => {
    let e = avec(base(), creneau('k1', 'c1:300', { versionExportee: 1 }))
    e = ajouterCollege(e, 'Cardio', [extrait(300, 1, 5)], () => 'c2')
    e = avec(e, creneau('k9', 'c2:300', { versionExportee: 1 }))
    const s = supprimerCollege(e, 'c1')
    expect(Object.keys(s.colleges)).toEqual(['c2'])
    expect(Object.keys(s.items)).toEqual(['c2:300'])
    expect(Object.keys(s.creneaux)).toEqual(['k9'])
    expect(Object.keys(s.suppressions)).toEqual(['k1'])
  })
})

describe('indisponibilités', () => {
  it('ajouter, modifier, supprimer une indispo ponctuelle', () => {
    let e = ajouterIndispo(etatVide(), 'Cours', '2026-11-03T08:00', '2026-11-03T10:00', () => 'i1')
    expect(e.indispos.i1).toEqual({
      id: 'i1',
      titre: 'Cours',
      source: 'ponctuelle',
      sourceId: null,
      debut: '2026-11-03T08:00',
      fin: '2026-11-03T10:00',
    })
    e = modifierIndispo(e, 'i1', { titre: 'TD', fin: '2026-11-03T11:00' })
    expect(e.indispos.i1).toMatchObject({ titre: 'TD', fin: '2026-11-03T11:00' })
    e = supprimerIndispo(e, 'i1')
    expect(e.indispos).toEqual({})
  })

  const stage: Recurrence = {
    id: 'r1',
    titre: 'Stage',
    jours: [1, 2, 3, 4, 5],
    heureDebut: '08:00',
    heureFin: '13:00',
    du: '2026-11-02',
    au: '2026-11-15',
  }

  it('une récurrence lundi-vendredi sur 2 semaines produit 10 indispos ; la modifier les remplace', () => {
    let e = enregistrerRecurrence(etatVide(), stage)
    const liste = Object.values(e.indispos)
    expect(liste).toHaveLength(10)
    expect(liste.every((i) => i.source === 'recurrente' && i.sourceId === 'r1')).toBe(true)
    expect(e.indispos['r1:2026-11-02']).toMatchObject({
      titre: 'Stage',
      debut: '2026-11-02T08:00',
      fin: '2026-11-02T13:00',
    })
    expect(e.indispos['r1:2026-11-07']).toBeUndefined() // samedi

    e = enregistrerRecurrence(e, { ...stage, heureFin: '12:00' })
    const apres = Object.values(e.indispos)
    expect(apres).toHaveLength(10)
    expect(apres.every((i) => i.fin.endsWith('T12:00'))).toBe(true)
    expect(Object.keys(e.recurrences)).toEqual(['r1'])
  })

  it('remplacer une récurrence retire les blocs des jours qui ne correspondent plus', () => {
    let e = enregistrerRecurrence(etatVide(), stage)
    e = enregistrerRecurrence(e, { ...stage, jours: [1] })
    expect(Object.keys(e.indispos).sort()).toEqual(['r1:2026-11-02', 'r1:2026-11-09'])
  })

  it('enregistrerRecurrence garde les autres indispos', () => {
    let e = ajouterIndispo(etatVide(), 'Cours', '2026-11-03T08:00', '2026-11-03T10:00', () => 'i1')
    e = enregistrerRecurrence(e, stage)
    e = enregistrerRecurrence(e, { ...stage, jours: [1] })
    expect(e.indispos.i1).toBeDefined()
  })

  it('supprimerRecurrence retire la règle et ses blocs', () => {
    let e = ajouterIndispo(etatVide(), 'Cours', '2026-11-03T08:00', '2026-11-03T10:00', () => 'i1')
    e = enregistrerRecurrence(e, stage)
    e = supprimerRecurrence(e, 'r1')
    expect(e.recurrences).toEqual({})
    expect(Object.keys(e.indispos)).toEqual(['i1'])
  })

  it('importerIndisposIcs remplace les blocs du même fichier seulement', () => {
    let e = importerIndisposIcs(etatVide(), 'fac.ics', [
      { titre: 'Cours A', debut: '2026-11-03T08:00', fin: '2026-11-03T10:00' },
      { titre: 'Cours B', debut: '2026-11-04T08:00', fin: '2026-11-04T10:00' },
    ])
    e = importerIndisposIcs(e, 'autre.ics', [
      { titre: 'X', debut: '2026-11-05T08:00', fin: '2026-11-05T09:00' },
    ])
    expect(Object.values(e.indispos)).toHaveLength(3)
    expect(Object.values(e.indispos).every((i) => i.source === 'ics')).toBe(true)

    e = importerIndisposIcs(e, 'fac.ics', [
      { titre: 'Cours C', debut: '2026-11-06T08:00', fin: '2026-11-06T10:00' },
    ])
    const liste = Object.values(e.indispos)
    expect(liste).toHaveLength(2)
    expect(liste.filter((i) => i.sourceId === 'fac.ics').map((i) => i.titre)).toEqual(['Cours C'])
    expect(liste.filter((i) => i.sourceId === 'autre.ics')).toHaveLength(1)
  })

  it('conflits signale un créneau à 9h un lundi de stage', () => {
    let e = enregistrerRecurrence(base(), stage)
    e = avec(
      e,
      creneau('k1', 'c1:300', { debut: '2026-11-02T09:00' }), // lundi de stage
      creneau('k2', 'c1:301', { debut: '2026-11-02T13:00' }), // juste après la fin : pas de conflit
      creneau('k3', 'c1:301', { debut: '2026-11-07T09:00' }), // samedi
      creneau('k4', 'c1:301', { debut: null }), // bac
    )
    expect(conflits(e)).toEqual([{ indispoId: 'r1:2026-11-02', creneauIds: ['k1'] }])
  })

  it('conflits : chevauchement partiel des deux côtés', () => {
    let e = ajouterIndispo(base(), 'Cours', '2026-11-03T14:30', '2026-11-03T15:30', () => 'i1')
    e = avec(
      e,
      creneau('k1', 'c1:300', { debut: '2026-11-03T14:00', duree: 60 }),
      creneau('k2', 'c1:301', { debut: '2026-11-03T15:00', duree: 60 }),
      creneau('k3', 'c1:301', { debut: '2026-11-03T15:30', duree: 30 }),
    )
    expect(conflits(e)).toEqual([{ indispoId: 'i1', creneauIds: ['k1', 'k2'] }])
  })
})

describe('export', () => {
  it('evenementsExport : résumé, description, catégorie, rappel ; bac exclu', () => {
    let e = avec(
      base(),
      creneau('k1', 'c1:300', { debut: '2026-11-03T14:00', duree: 90, version: 3 }),
      creneau('k2', 'c1:300', { debut: null }),
    )
    e = modifierReglages(e, { rappel: 15 })
    const evts = evenementsExport(e, 'tout')
    expect(evts).toEqual([
      {
        uid: 'k1@revisions-emma',
        sequence: 3,
        debut: '2026-11-03T14:00',
        fin: '2026-11-03T15:30',
        resume: '📚 300 · Tumeurs du col utérin, tumeurs du corps utérin · T1',
        description: 'Cancérologie · p. 153–175 (22 p)',
        categorie: 'Cancérologie',
        rappel: 15,
      },
    ])
  })

  it('evenementsExport : partie et note', () => {
    const e = avec(
      base(),
      creneau('k1', 'c1:301', { tour: 2, partie: { i: 1, n: 2 }, note: 'Revoir le schéma' }),
    )
    const [ev] = evenementsExport(e, 'tout')
    expect(ev.resume).toBe('📚 301 · Item 301 · T2 · 1/2')
    expect(ev.description).toBe('Cancérologie · p. 175–185 (10 p)\nRevoir le schéma')
  })

  it("evenementsExport : un item ajouté à la main (pageDebut 0) n'affiche pas de plage de pages", () => {
    let e = base()
    e = { ...e, items: { ...e.items, 'c1:900': { ...e.items['c1:300'], id: 'c1:900', numero: 900, pageDebut: 0, pages: 22 } } }
    e = avec(e, creneau('k1', 'c1:900', { note: 'Voir cours' }), creneau('k2', 'c1:900'))
    const evts = evenementsExport(e, 'tout')
    expect(evts[0].description).toBe('Cancérologie · 22 p\nVoir cours')
    expect(evts[1].description).toBe('Cancérologie · 22 p')
  })

  it('changementsEnAttente : nouveaux, modifies, suppressions ; bac exclu ; trié par début', () => {
    const e = avec(
      base(),
      creneau('n2', 'c1:300', { debut: '2026-11-04T09:00' }),
      creneau('n1', 'c1:300', { debut: '2026-11-03T09:00' }),
      creneau('m1', 'c1:300', { debut: '2026-11-03T11:00', version: 2, versionExportee: 1 }),
      creneau('ok', 'c1:300', { debut: '2026-11-03T12:00', version: 2, versionExportee: 2 }),
      creneau('bac', 'c1:300', { debut: null }),
      creneau('bac2', 'c1:300', { debut: null, version: 2, versionExportee: 1 }),
    )
    const e2: Etat = {
      ...e,
      suppressions: { x: { creneauId: 'x', libelle: '300 · T1 · lundi 2 nov. 9h' } },
    }
    const ch = changementsEnAttente(e2)
    expect(ch.nouveaux.map((c) => c.id)).toEqual(['n1', 'n2'])
    expect(ch.modifies.map((c) => c.id)).toEqual(['m1'])
    expect(ch.suppressions).toEqual([{ creneauId: 'x', libelle: '300 · T1 · lundi 2 nov. 9h' }])
  })

  it('evenementsExport selon la portée', () => {
    const e = avec(
      base(),
      creneau('n1', 'c1:300', { debut: '2026-11-03T09:00' }),
      creneau('m1', 'c1:300', { debut: '2026-11-03T11:00', version: 2, versionExportee: 1 }),
      creneau('ok', 'c1:300', { debut: '2026-11-03T12:00', version: 2, versionExportee: 2 }),
    )
    const uids = (p: 'nouveaux' | 'modifies' | 'tout') =>
      evenementsExport(e, p).map((v) => v.uid.split('@')[0])
    expect(uids('nouveaux')).toEqual(['n1'])
    expect(uids('modifies')).toEqual(['m1'])
    expect(uids('tout')).toEqual(['n1', 'm1', 'ok'])
  })

  it('marquerExporte vide les changements et positionne premierExportFait ; viderSuppressions', () => {
    let e = avec(
      base(),
      creneau('n1', 'c1:300', { debut: '2026-11-03T09:00' }),
      creneau('m1', 'c1:300', { debut: '2026-11-03T11:00', version: 2, versionExportee: 1 }),
    )
    e = { ...e, suppressions: { x: { creneauId: 'x', libelle: 'x' } } }
    expect(e.premierExportFait).toBe(false)
    e = marquerExporte(e, [
      { id: 'n1', version: 1 },
      { id: 'm1', version: 2 },
    ])
    expect(e.premierExportFait).toBe(true)
    expect(e.creneaux.n1.versionExportee).toBe(1)
    expect(e.creneaux.m1.versionExportee).toBe(2)
    const ch = changementsEnAttente(e)
    expect(ch.nouveaux).toEqual([])
    expect(ch.modifies).toEqual([])
    expect(ch.suppressions).toHaveLength(1)
    expect(changementsEnAttente(viderSuppressions(e)).suppressions).toEqual([])
  })

  it("marquerExporte : seules les versions réellement écrites sont marquées", () => {
    let e = avec(
      base(),
      creneau('a', 'c1:300', { debut: '2026-11-03T09:00', version: 1 }),
      creneau('b', 'c1:300', { debut: '2026-11-03T11:00', version: 2 }),
    )
    // Entre la construction du fichier et le marquage, `b` est passé en version 3 et `a` a disparu.
    e = { ...e, creneaux: { b: { ...e.creneaux.b, version: 3 } } }
    e = marquerExporte(e, [
      { id: 'a', version: 1 },
      { id: 'b', version: 2 },
    ])
    expect(e.creneaux.b.versionExportee).toBeNull()
    expect(changementsEnAttente(e).nouveaux.map((c) => c.id)).toEqual(['b'])
    expect(e.creneaux.a).toBeUndefined()
    expect(e.premierExportFait).toBe(true)
  })

  it('creneauxExportes : mêmes ids que les UID de evenementsExport, même ordre ; item ou collège inconnu exclu', () => {
    let e = avec(
      base(),
      creneau('n2', 'c1:300', { debut: '2026-11-04T09:00' }),
      creneau('n1', 'c1:300', { debut: '2026-11-03T09:00' }),
      creneau('m1', 'c1:300', { debut: '2026-11-03T11:00', version: 2, versionExportee: 1 }),
      creneau('ok', 'c1:300', { debut: '2026-11-03T12:00', version: 2, versionExportee: 2 }),
      creneau('bac', 'c1:300', { debut: null }),
      creneau('sans-item', 'c1:999', { debut: '2026-11-03T10:00' }),
      creneau('sans-college', 'c9:300', { debut: '2026-11-03T10:30' }),
    )
    e = { ...e, items: { ...e.items, 'c9:300': { ...e.items['c1:300'], id: 'c9:300', collegeId: 'c9' } } }
    const suffixe = '@revisions-emma'
    for (const p of ['nouveaux', 'modifies', 'tout'] as const) {
      const uids = evenementsExport(e, p).map((v) => v.uid.slice(0, -suffixe.length))
      expect(creneauxExportes(e, p)).toEqual(uids)
      expect(uids).not.toContain('sans-item')
      expect(uids).not.toContain('sans-college')
      expect(uids).not.toContain('bac')
    }
    expect(creneauxExportes(e, 'nouveaux')).toEqual(['n1', 'n2'])
    expect(creneauxExportes(e, 'modifies')).toEqual(['m1'])
    expect(creneauxExportes(e, 'tout')).toEqual(['n1', 'm1', 'ok', 'n2'])
  })

  it('modifierReglages fusionne superficiellement', () => {
    const e = modifierReglages(etatVide(), { rappel: 30, theme: 'sombre' })
    expect(e.reglages).toMatchObject({ rappel: 30, theme: 'sombre', pas: 15 })
  })
})

describe('reconcilierExport (annuler / rétablir)', () => {
  const sup = (id: string, libelle = id) => ({ creneauId: id, libelle })

  it("annuler un déplacement après l'export : le créneau n'est ni nouveau ni modifié", () => {
    // Instantané d'avant l'export, état courant : exporté en version 1 puis déplacé (version 2).
    const instantane = avec(base(), creneau('k1', 'c1:300', { version: 1, versionExportee: null }))
    const courant = avec(base(), creneau('k1', 'c1:300', { version: 2, versionExportee: 1 }))
    const r = reconcilierExport(instantane, courant)
    expect(r.creneaux.k1).toMatchObject({ version: 1, versionExportee: 1 })
    const ch = changementsEnAttente(r)
    expect(ch.nouveaux).toEqual([])
    expect(ch.modifies).toEqual([])
  })

  it("garde la version exportée la plus récente, qu'elle vienne de l'instantané ou de l'état courant", () => {
    const instantane = avec(base(), creneau('k1', 'c1:300', { version: 3, versionExportee: 3 }))
    const courant = avec(base(), creneau('k1', 'c1:300', { version: 3, versionExportee: 2 }))
    expect(reconcilierExport(instantane, courant).creneaux.k1.versionExportee).toBe(3)
    const r = reconcilierExport(courant, instantane)
    expect(r.creneaux.k1.versionExportee).toBe(3)
  })

  it("jamais exporté des deux côtés : reste null", () => {
    const e = avec(base(), creneau('k1', 'c1:300'))
    expect(reconcilierExport(e, e).creneaux.k1.versionExportee).toBeNull()
  })

  it("supprimé après export puis annulé avant « C'est fait » : la suppression disparaît, rien à réexporter", () => {
    const instantane = avec(base(), creneau('k1', 'c1:300', { versionExportee: 1 }))
    const courant: Etat = { ...base(), suppressions: { k1: sup('k1'), autre: sup('autre') } }
    const r = reconcilierExport(instantane, courant)
    expect(r.suppressions).toEqual({ autre: sup('autre') })
    expect(r.creneaux.k1.versionExportee).toBe(1)
    const ch = changementsEnAttente(r)
    expect(ch.nouveaux).toEqual([])
    expect(ch.modifies).toEqual([])
  })

  it("supprimé, « C'est fait » confirmé, puis annulé : le créneau repart comme nouveau", () => {
    const instantane = avec(base(), creneau('k1', 'c1:300', { versionExportee: 1 }))
    const r = reconcilierExport(instantane, base())
    expect(r.creneaux.k1.versionExportee).toBeNull()
    expect(r.suppressions).toEqual({})
    expect(changementsEnAttente(r).nouveaux.map((c) => c.id)).toEqual(['k1'])
  })

  it("une annulation qui retire un créneau exporté ajoute une suppression ; un créneau jamais exporté, non", () => {
    const instantane = avec(base(), creneau('k1', 'c1:300', { versionExportee: 1 }))
    const courant = avec(
      instantane,
      creneau('k2', 'c1:300', { debut: '2026-11-03T15:00', versionExportee: 1 }),
      creneau('k3', 'c1:300', { debut: '2026-11-03T16:00' }),
    )
    const r = reconcilierExport(instantane, courant)
    expect(Object.keys(r.creneaux)).toEqual(['k1'])
    expect(r.suppressions).toEqual({ k2: sup('k2', '300 · T1 · mardi 3 nov. 15h') })
  })

  it('les suppressions en attente sans rapport avec l’instantané sont conservées', () => {
    const instantane = avec(base(), creneau('k1', 'c1:300'))
    const courant: Etat = { ...avec(base(), creneau('k1', 'c1:300')), suppressions: { z: sup('z') } }
    expect(reconcilierExport(instantane, courant).suppressions).toEqual({ z: sup('z') })
  })
})
