import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat } from '../../src/domain/types'
import { modifierNote, supprimerCreneau, viderPlanning } from '../../src/domain/actions-creneaux'
import { ajouterCollege, changementsEnAttente, marquerExporte, viderSuppressions } from '../../src/domain/actions-etat'
import { lireSauvegarde } from '../../src/storage/backup'
import { chargerTout, db } from '../../src/storage/db'
import { attendreEcritures, useStore } from '../../src/ui/store'

const MSG_QUOTA = "Plus d'espace pour enregistrer. Sauvegarde tes données puis libère de la place."

function creneau(id: string, p: Partial<Creneau> = {}): Creneau {
  return {
    id,
    itemId: 'c1:300',
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

const ajoute = (c: Creneau) => (e: Etat): Etat => ({ ...e, creneaux: { ...e.creneaux, [c.id]: c } })
const s = () => useStore.getState()

beforeEach(async () => {
  await db.delete()
  await db.open()
  await s().initialiser()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chargerTout', () => {
  it('renvoie un état vide sur une base vide', async () => {
    expect(await chargerTout()).toEqual(etatVide())
  })
})

describe('store : appliquer', () => {
  it('est prêt après initialiser, sans erreur', () => {
    expect(s().pret).toBe(true)
    expect(s().erreur).toBeNull()
    expect(s().etat).toEqual(etatVide())
  })

  it('null = refus : renvoie false, aucun effet', async () => {
    const avant = s().etat
    expect(s().appliquer(() => null)).toBe(false)
    expect(s().etat).toBe(avant)
    expect(s().passe).toHaveLength(0)
  })

  it('même référence = refus : pas d’historique', () => {
    expect(s().appliquer((e) => e)).toBe(false)
    expect(s().passe).toHaveLength(0)
  })

  it('un changement empile, vide le futur et persiste', async () => {
    expect(s().appliquer(ajoute(creneau('a')))).toBe(true)
    expect(s().passe).toHaveLength(1)
    await attendreEcritures()
    expect((await chargerTout()).creneaux.a).toEqual(creneau('a'))
  })

  it('plafonne l’historique à 50 niveaux', () => {
    for (let k = 0; k < 60; k++) s().appliquer(ajoute(creneau(`c${k}`)))
    expect(s().passe).toHaveLength(50)
  })
})

describe('store : annuler / rétablir', () => {
  it('annule et rétablit, et persiste chaque étape', async () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b')))
    await attendreEcritures()

    s().annuler()
    expect(Object.keys(s().etat.creneaux)).toEqual(['a'])
    expect(s().futur).toHaveLength(1)
    await attendreEcritures()
    expect(Object.keys((await chargerTout()).creneaux)).toEqual(['a'])

    s().retablir()
    expect(Object.keys(s().etat.creneaux).sort()).toEqual(['a', 'b'])
    await attendreEcritures()
    expect(Object.keys((await chargerTout()).creneaux).sort()).toEqual(['a', 'b'])
  })

  it('un nouvel appliquer vide le futur', () => {
    s().appliquer(ajoute(creneau('a')))
    s().annuler()
    expect(s().futur).toHaveLength(1)
    s().appliquer(ajoute(creneau('b')))
    expect(s().futur).toHaveLength(0)
  })

  it('sans historique, annuler et rétablir ne font rien', () => {
    const e = s().etat
    s().annuler()
    s().retablir()
    expect(s().etat).toBe(e)
  })
})

describe('store : appliquerSansHistorique (réglages hors historique)', () => {
  const sombre = (e: Etat): Etat => ({ ...e, reglages: { ...e.reglages, theme: 'sombre' } })

  it('applique et persiste sans toucher à passe ni à futur', async () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b')))
    s().annuler()
    const passe = s().passe
    const futur = s().futur
    expect(futur).toHaveLength(1)

    expect(s().appliquerSansHistorique(sombre)).toBe(true)
    expect(s().etat.reglages.theme).toBe('sombre')
    expect(s().passe).toBe(passe)
    expect(s().futur).toBe(futur) // ↷ reste disponible
    await attendreEcritures()
    expect((await chargerTout()).reglages.theme).toBe('sombre')
  })

  it('refuse sur null, même référence, ou tant que pret est faux', () => {
    expect(s().appliquerSansHistorique(() => null)).toBe(false)
    expect(s().appliquerSansHistorique((e) => e)).toBe(false)
    useStore.setState({ pret: false })
    expect(s().appliquerSansHistorique(sombre)).toBe(false)
    expect(s().etat.reglages.theme).toBe('auto')
  })

  it('un changement de thème n’active pas annuler', () => {
    s().appliquerSansHistorique(sombre)
    expect(s().passe).toHaveLength(0)
  })

  it('annuler et rétablir un créneau gardent le thème courant', async () => {
    s().appliquer(ajoute(creneau('a'))) // snapshot : thème auto
    s().appliquerSansHistorique(sombre)
    s().appliquerSansHistorique((e) => ({ ...e, premierExportFait: true }))

    s().annuler()
    expect(s().etat.creneaux).toEqual({})
    expect(s().etat.reglages.theme).toBe('sombre')
    expect(s().etat.premierExportFait).toBe(true)
    await attendreEcritures()
    expect((await chargerTout()).reglages.theme).toBe('sombre')

    s().retablir()
    expect(Object.keys(s().etat.creneaux)).toEqual(['a'])
    expect(s().etat.reglages.theme).toBe('sombre')
    expect(s().etat.premierExportFait).toBe(true)
    await attendreEcritures()
    expect((await chargerTout()).reglages.theme).toBe('sombre')
  })
})

describe('store : annuler / rétablir et suivi de l’export', () => {
  // Un collège et un item connus : sans eux, un créneau n'est jamais exportable.
  beforeEach(() => {
    s().appliquerSansHistorique((e) =>
      ajouterCollege(e, 'Cancérologie', [{ numero: 300, titre: 'Item', pageDebut: 1, pages: 5, aVerifier: false, raison: null }], () => 'c1'),
    )
  })

  const exporter = (...ids: string[]) =>
    s().appliquerSansHistorique((e) =>
      marquerExporte(
        e,
        ids.map((id) => ({ id, version: e.creneaux[id].version })),
      ),
    )

  it('vider le planning puis annuler : la suppression en attente disparaît, versionExportee est gardée', async () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b', { debut: null })))
    exporter('a')
    expect(s().appliquer(viderPlanning)).toBe(true)
    expect(s().etat.creneaux).toEqual({})
    expect(s().etat.suppressions.a).toBeDefined()
    expect(s().etat.suppressions.b).toBeUndefined()

    s().annuler()
    expect(Object.keys(s().etat.creneaux).sort()).toEqual(['a', 'b'])
    expect(s().etat.suppressions).toEqual({})
    expect(s().etat.creneaux.a.versionExportee).toBe(1)
    expect(s().etat.creneaux.b.versionExportee).toBeNull()
    expect(changementsEnAttente(s().etat).modifies).toEqual([])
    await attendreEcritures() // sinon les écritures en cours retombent dans la base du test suivant
  })

  it('annuler un déplacement après l’export ne remet pas le créneau à exporter', () => {
    s().appliquer(ajoute(creneau('a'))) // instantané : a non exporté
    exporter('a')
    s().appliquer((e) => modifierNote(e, 'a', 'x')) // version 2, exportée en 1
    expect(changementsEnAttente(s().etat).modifies).toHaveLength(1)

    s().annuler() // l'instantané du déplacement est celui d'après l'export
    s().annuler() // celui d'avant l'export : a y est absent
    expect(s().etat.creneaux).toEqual({})
    expect(s().etat.suppressions.a).toBeDefined() // exporté puis retiré : à supprimer à la main

    s().retablir() // a revient, sa suppression disparaît, il reste exporté
    expect(s().etat.suppressions).toEqual({})
    expect(s().etat.creneaux.a.versionExportee).toBe(1)
    const ch = changementsEnAttente(s().etat)
    expect(ch.nouveaux).toEqual([])
    expect(ch.modifies).toEqual([])
  })

  it('annuler un placement exporté ajoute une suppression, annuler la suppression l’efface', () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b')))
    exporter('a', 'b')
    s().annuler()
    expect(Object.keys(s().etat.creneaux)).toEqual(['a'])
    expect(Object.keys(s().etat.suppressions)).toEqual(['b'])
    expect(s().etat.creneaux.a.versionExportee).toBe(1)
    s().retablir()
    expect(s().etat.suppressions).toEqual({})
    expect(s().etat.creneaux.b.versionExportee).toBe(1)
  })

  it('supprimer un exporté, « C’est fait », puis annuler : il repart comme nouveau', () => {
    s().appliquer(ajoute(creneau('a')))
    exporter('a')
    s().appliquer((e) => supprimerCreneau(e, 'a'))
    expect(Object.keys(s().etat.suppressions)).toEqual(['a'])
    s().appliquerSansHistorique(viderSuppressions)
    s().annuler()
    expect(s().etat.creneaux.a.versionExportee).toBeNull()
    expect(changementsEnAttente(s().etat).nouveaux.map((c) => c.id)).toEqual(['a'])
  })

  it('supprimer un exporté puis annuler avant « C’est fait » : plus de suppression, rien à réexporter', () => {
    s().appliquer(ajoute(creneau('a')))
    exporter('a')
    s().appliquer((e) => supprimerCreneau(e, 'a'))
    s().annuler()
    expect(s().etat.suppressions).toEqual({})
    const ch = changementsEnAttente(s().etat)
    expect(ch.nouveaux).toEqual([])
    expect(ch.modifies).toEqual([])
  })
})

describe('store : persistance', () => {
  it('sérialise les écritures : l’état final de la base est celui du dernier appel', async () => {
    for (let k = 0; k < 10; k++) s().appliquer(ajoute(creneau(`c${k}`)))
    s().annuler()
    s().annuler()
    s().appliquer(ajoute(creneau('z')))
    await attendreEcritures()
    expect(await chargerTout()).toEqual(s().etat)
  })

  it('initialiser recharge ce qui a été persisté, historique vide', async () => {
    s().appliquer(ajoute(creneau('a')))
    await attendreEcritures()
    useStore.setState({ etat: etatVide(), passe: [], futur: [], pret: false })
    await s().initialiser()
    expect(s().pret).toBe(true)
    expect(s().etat.creneaux.a).toEqual(creneau('a'))
    expect(s().passe).toHaveLength(0)
  })

  it('QuotaExceededError : erreur au texte de la §14, sans exception, puis rattrapage', async () => {
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw quota
    })
    expect(() => s().appliquer(ajoute(creneau('a')))).not.toThrow()
    await attendreEcritures()
    expect(s().erreur).toBe(MSG_QUOTA)
    expect(s().etat.creneaux.a).toBeDefined()

    // l'écriture suivante réussit et rattrape le créneau « a » resté en mémoire
    s().appliquer(ajoute(creneau('b')))
    await attendreEcritures()
    expect(s().erreur).toBeNull()
    expect(Object.keys((await chargerTout()).creneaux).sort()).toEqual(['a', 'b'])
  })

  it('BulkError Dexie : quota détecté dans failures', async () => {
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    const bulk = Object.assign(new Error('bulk'), { name: 'BulkError', failures: [new Error('autre'), quota] })
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw bulk
    })
    s().appliquer(ajoute(creneau('a')))
    await attendreEcritures()
    expect(s().erreur).toBe(MSG_QUOTA)
  })

  it('BulkError sans quota : message générique', async () => {
    const bulk = Object.assign(new Error('bulk'), { name: 'BulkError', failures: [new Error('autre')] })
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw bulk
    })
    s().appliquer(ajoute(creneau('a')))
    await attendreEcritures()
    expect(s().erreur).toBe('Enregistrement impossible : bulk')
  })

  it('autre échec : message générique « Enregistrement impossible : … »', async () => {
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('disque en feu')
    })
    s().appliquer(ajoute(creneau('a')))
    await attendreEcritures()
    expect(s().erreur).toBe('Enregistrement impossible : disque en feu')
  })
})

describe('store : restaurer', () => {
  it('remplace l’état, vide l’historique et persiste (suppressions comprises)', async () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b')))
    await attendreEcritures()

    const restaure: Etat = { ...etatVide(), creneaux: { r: creneau('r') }, premierExportFait: true }
    s().restaurer(restaure)
    expect(s().etat).toBe(restaure)
    expect(s().passe).toHaveLength(0)
    expect(s().futur).toHaveLength(0)
    await attendreEcritures()
    expect(await chargerTout()).toEqual(restaure)
  })
})

describe('store : échec de lecture initiale', () => {
  async function initialiserEnEchec() {
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('base illisible')
    })
    useStore.setState({ pret: false, erreur: null })
    await s().initialiser()
  }

  it('pret reste faux, erreur « Lecture impossible : … »', async () => {
    await initialiserEnEchec()
    expect(s().pret).toBe(false)
    expect(s().erreur).toBe('Lecture impossible : base illisible')
  })

  it('appliquer, annuler et rétablir refusent tant que pret est faux', async () => {
    s().appliquer(ajoute(creneau('a')))
    s().annuler()
    await attendreEcritures()
    await initialiserEnEchec()
    const e = s().etat
    expect(s().appliquer(ajoute(creneau('b')))).toBe(false)
    s().annuler()
    s().retablir()
    expect(s().etat).toBe(e)
    expect(s().passe).toHaveLength(0)
    await attendreEcritures()
    expect(Object.keys((await chargerTout()).creneaux)).toEqual([])
  })

  it('restaurer reste possible, remplace entièrement la base et rend le store prêt', async () => {
    s().appliquer(ajoute(creneau('ancien')))
    await attendreEcritures()
    await initialiserEnEchec()

    const restaure: Etat = { ...etatVide(), creneaux: { r: creneau('r') } }
    s().restaurer(restaure)
    await attendreEcritures()
    expect(s().pret).toBe(true)
    expect(s().erreur).toBeNull()
    expect(await chargerTout()).toEqual(restaure)
  })
})

describe('store : collèges et items hors historique (§9.6)', () => {
  const college = { id: 'c1', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2026-10-01T10:00' }
  const item = { id: 'c1:300', collegeId: 'c1', numero: 300, titre: 'Tumeurs', pageDebut: 1, pages: 10, aVerifier: false }
  const avecCollege = (e: Etat): Etat => ({ ...e, colleges: { c1: college }, items: { 'c1:300': item } })

  beforeEach(() => {
    s().appliquerSansHistorique(avecCollege)
  })

  it('renommer un collège puis annuler une opération sur un créneau garde le nom', () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquerSansHistorique(modifierCollege_('Cancéro'))
    s().annuler()
    expect(s().etat.creneaux).toEqual({})
    expect(s().etat.colleges.c1.nom).toBe('Cancéro')
    s().retablir()
    expect(Object.keys(s().etat.creneaux)).toEqual(['a'])
    expect(s().etat.colleges.c1.nom).toBe('Cancéro')
    expect(s().etat.items['c1:300']).toEqual(item)
  })

  it('supprimer un collège (viderHistorique) désactive annuler et rétablir', () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquer(ajoute(creneau('b')))
    s().annuler()
    expect(s().passe).toHaveLength(1)
    expect(s().futur).toHaveLength(1)
    s().appliquerSansHistorique(
      (e) => ({ ...e, colleges: {}, items: {}, creneaux: {} }),
      { viderHistorique: true },
    )
    expect(s().passe).toHaveLength(0)
    expect(s().futur).toHaveLength(0)
    s().annuler()
    expect(s().etat.creneaux).toEqual({})
    expect(s().etat.colleges).toEqual({})
  })

  it('un réimport (viderHistorique) vide aussi l’historique', () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquerSansHistorique((e) => ({ ...e, items: { ...e.items, 'c1:301': { ...item, id: 'c1:301', numero: 301 } } }), {
      viderHistorique: true,
    })
    expect(s().passe).toHaveLength(0)
    expect(s().futur).toHaveLength(0)
  })

  it('restaurer vide l’historique', () => {
    s().appliquer(ajoute(creneau('a')))
    s().annuler()
    s().restaurer(etatVide())
    expect(s().passe).toHaveLength(0)
    expect(s().futur).toHaveLength(0)
  })

  it('sans l’option, l’historique reste intact', () => {
    s().appliquer(ajoute(creneau('a')))
    s().appliquerSansHistorique(modifierCollege_('X'))
    expect(s().passe).toHaveLength(1)
  })

  it('enregistrer une note inchangée ne crée aucune étape d’annulation', () => {
    s().appliquer(ajoute(creneau('a', { note: 'revoir' })))
    const passe = s().passe
    expect(s().appliquer((e) => modifierNote(e, 'a', 'revoir'))).toBe(false)
    expect(s().passe).toBe(passe)
    expect(s().appliquer((e) => modifierNote(e, 'a', 'revoir 2'))).toBe(true)
    expect(s().passe).toHaveLength(2)
  })

  it('une restauration refusée (fichier invalide) laisse données et historique intacts', () => {
    s().appliquer(ajoute(creneau('a')))
    const etat = s().etat
    const passe = s().passe
    const lecture = lireSauvegarde('{"foo":1}')
    expect(lecture.ok).toBe(false)
    // L'écran n'appelle `restaurer` que si la lecture réussit : rien ne bouge.
    expect(s().etat).toBe(etat)
    expect(s().passe).toBe(passe)
  })
})

function modifierCollege_(nom: string) {
  return (e: Etat): Etat => ({ ...e, colleges: { ...e.colleges, c1: { ...e.colleges.c1, nom } } })
}
