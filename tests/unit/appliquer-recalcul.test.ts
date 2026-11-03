import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ajouterCollege, modifierReglages } from '../../src/domain/actions-etat'
import type { Creneau, Etat } from '../../src/domain/types'
import { appliquerEtRecalculer } from '../../src/ui/recalcul'
import { db } from '../../src/storage/db'
import { attendreEcritures, useStore } from '../../src/ui/store'

const s = () => useStore.getState()

// Placé loin dans l'avenir : toujours « aujourd'hui ou après » pour le recalcul.
const creneau: Creneau = {
  id: 'a',
  itemId: 'c1:300',
  tour: 1,
  partie: null,
  debut: '2099-01-05T14:00',
  duree: 60,
  dureePerso: false,
  fait: false,
  note: '',
  version: 1,
  versionExportee: null,
}

beforeEach(async () => {
  await attendreEcritures()
  await db.delete()
  await db.open()
  await s().initialiser()
  s().appliquerSansHistorique((e: Etat) => {
    const avec = ajouterCollege(e, 'Cancérologie', [{ numero: 300, titre: 'Item', pageDebut: 1, pages: 8, aVerifier: false, raison: null }], () => 'c1')
    return { ...avec, creneaux: { a: creneau } }
  })
})

describe('appliquerEtRecalculer : portée', () => {
  const rythme = (e: Etat) => modifierReglages(e, { rythme: { minutes: 90, pages: 8 } })

  it('portée absente : tous les créneaux sont recalculés', async () => {
    expect(appliquerEtRecalculer(rythme)).toBe(true)
    expect(s().etat.creneaux.a.duree).toBe(90)
    await attendreEcritures()
  })

  it('portée null fixe : pas de recalcul (comme une portée calculée null)', async () => {
    expect(appliquerEtRecalculer(rythme, { portee: null })).toBe(true)
    expect(s().etat.reglages.rythme.minutes).toBe(90)
    expect(s().etat.creneaux.a.duree).toBe(60)
    expect(appliquerEtRecalculer((e) => modifierReglages(e, { rythme: { minutes: 30, pages: 8 } }), { portee: () => null })).toBe(true)
    expect(s().etat.creneaux.a.duree).toBe(60)
    await attendreEcritures()
  })
})
