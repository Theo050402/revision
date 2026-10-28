import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat } from '../../src/domain/types'
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
