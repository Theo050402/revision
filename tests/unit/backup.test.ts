import { describe, expect, it } from 'vitest'
import { REGLAGES_DEFAUT, etatVide } from '../../src/domain/defaults'
import type { Etat } from '../../src/domain/types'
import { exporterSauvegarde, lireSauvegarde } from '../../src/storage/backup'

function etatRempli(): Etat {
  const e = etatVide()
  return {
    ...e,
    colleges: { c1: { id: 'c1', nom: 'Cancérologie', couleur: 2, coefficient: 1.5, importeLe: '2026-10-28T11:00' } },
    items: {
      'c1:300': { id: 'c1:300', collegeId: 'c1', numero: 300, titre: 'Tumeurs', pageDebut: 153, pages: 22, aVerifier: true },
    },
    creneaux: {
      k1: {
        id: 'k1', itemId: 'c1:300', tour: 1, partie: { i: 1, n: 2 }, debut: '2026-11-03T14:00', duree: 75,
        dureePerso: true, fait: false, note: 'à relire', version: 3, versionExportee: 2,
      },
      k2: {
        id: 'k2', itemId: 'c1:300', tour: 2, partie: null, debut: null, duree: 30,
        dureePerso: false, fait: true, note: '', version: 1, versionExportee: null,
      },
    },
    indispos: {
      i1: { id: 'i1', titre: 'Stage', source: 'recurrente', sourceId: 'r1', debut: '2026-11-03T08:00', fin: '2026-11-03T12:00' },
    },
    recurrences: {
      r1: { id: 'r1', titre: 'Stage', jours: [1, 3], heureDebut: '08:00', heureFin: '12:00', du: '2026-11-01', au: '2026-12-01' },
    },
    suppressions: { k9: { creneauId: 'k9', libelle: '300 · T1 · mardi 5 nov. 14h' } },
    reglages: { ...e.reglages, pas: 10, theme: 'sombre' },
    premierExportFait: true,
  }
}

function brut(e: Etat): Record<string, unknown> {
  return JSON.parse(exporterSauvegarde(e)) as Record<string, unknown>
}

describe('exporterSauvegarde', () => {
  it('contient schemaVersion 1, exporteLe et toutes les tables', () => {
    const o = brut(etatRempli())
    expect(o.schemaVersion).toBe(1)
    expect(typeof o.exporteLe).toBe('string')
    for (const t of ['colleges', 'items', 'creneaux', 'indispos', 'recurrences', 'suppressions']) {
      expect(Array.isArray(o[t])).toBe(true)
    }
    expect((o.creneaux as unknown[]).length).toBe(2)
  })
})

describe('lireSauvegarde', () => {
  it('l’aller-retour donne un état égal en profondeur', () => {
    const e = etatRempli()
    expect(lireSauvegarde(exporterSauvegarde(e))).toEqual({ ok: true, etat: e })
  })

  it('l’aller-retour d’un état vide', () => {
    const e = etatVide()
    expect(lireSauvegarde(exporterSauvegarde(e))).toEqual({ ok: true, etat: e })
  })

  it('un JSON invalide donne « fichier illisible »', () => {
    expect(lireSauvegarde('{pas du json')).toEqual({ ok: false, raison: 'fichier illisible' })
    expect(lireSauvegarde('42')).toEqual({ ok: false, raison: 'fichier illisible' })
    expect(lireSauvegarde('null')).toEqual({ ok: false, raison: 'fichier illisible' })
    expect(lireSauvegarde('[]')).toEqual({ ok: false, raison: 'fichier illisible' })
  })

  it('schemaVersion 2 donne « version non prise en charge »', () => {
    const o = { ...brut(etatRempli()), schemaVersion: 2 }
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'version non prise en charge' })
  })

  it('un créneau sans itemId donne « créneau invalide »', () => {
    const o = brut(etatRempli())
    const cs = o.creneaux as Record<string, unknown>[]
    delete cs[0]!.itemId
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'créneau invalide' })
  })

  it('un créneau avec un type incorrect est invalide', () => {
    const o = brut(etatRempli())
    const cs = o.creneaux as Record<string, unknown>[]
    cs[1]!.duree = '30'
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'créneau invalide' })
  })

  it.each([
    ['colleges', 'collège invalide'],
    ['items', 'item invalide'],
    ['indispos', 'indisponibilité invalide'],
    ['recurrences', 'récurrence invalide'],
  ])('une entrée cassée dans %s donne « %s »', (table, raison) => {
    const o = brut(etatRempli())
    const lignes = o[table] as Record<string, unknown>[]
    lignes[0]!.id = 12
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison })
  })

  it('une suppression en attente cassée est refusée', () => {
    const o = brut(etatRempli())
    const lignes = o.suppressions as Record<string, unknown>[]
    lignes[0]!.libelle = null
    expect(lireSauvegarde(JSON.stringify(o)).ok).toBe(false)
  })

  it('réglages invalides', () => {
    const o = brut(etatRempli())
    ;(o.reglages as Record<string, unknown>).pas = 7
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'réglages invalides' })
  })

  it('une table absente ou qui n’est pas un tableau est refusée (jamais traitée comme vide)', () => {
    const o = brut(etatRempli())
    delete o.creneaux
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'créneau invalide' })
    o.creneaux = {}
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({ ok: false, raison: 'créneau invalide' })
  })

  it('ignore les champs inconnus et complète les réglages manquants par les valeurs par défaut', () => {
    const e = etatRempli()
    const o = brut(e)
    o.champInconnu = 1
    const cs = o.creneaux as Record<string, unknown>[]
    cs[0]!.extra = 'x'
    const reglages = o.reglages as Record<string, unknown>
    delete reglages.rappel
    reglages.nouveau = true
    expect(lireSauvegarde(JSON.stringify(o))).toEqual({
      ok: true,
      etat: { ...e, reglages: { ...e.reglages, rappel: REGLAGES_DEFAUT.rappel } },
    })
  })
})
