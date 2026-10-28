import { describe, expect, it } from 'vitest'
import type { Creneau, Item } from '../../src/domain/types'
import { descriptionCreneau, etiquetteCreneau } from '../../src/ui/calendrier/etiquette'

const item: Item = {
  id: 'c1:300',
  collegeId: 'c1',
  numero: 300,
  titre: 'Tumeurs du col utérin',
  pageDebut: 10,
  pages: 22,
  aVerifier: false,
}

const creneau: Creneau = {
  id: 'k1',
  itemId: 'c1:300',
  tour: 1,
  partie: null,
  debut: '2026-11-03T14:00',
  duree: 165,
  dureePerso: false,
  fait: false,
  note: '',
  version: 1,
  versionExportee: null,
}

describe('etiquetteCreneau', () => {
  it('« 300 · titre » puis « T1 · 22 p · 2h45 »', () => {
    expect(etiquetteCreneau(creneau, item)).toEqual({
      numero: '300',
      titre: '300 · Tumeurs du col utérin',
      meta: 'T1 · 22 p · 2h45',
    })
  })

  it('durées en minutes sous une heure', () => {
    expect(etiquetteCreneau({ ...creneau, duree: 45, tour: 2 }, item).meta).toBe('T2 · 22 p · 45 min')
  })

  it('ajoute « · i/n » pour une partie', () => {
    expect(etiquetteCreneau({ ...creneau, duree: 90, partie: { i: 1, n: 2 } }, item).meta).toBe('T1 · 22 p · 1h30 · 1/2')
  })

  it('sans item connu : numéro tiré de l\'identifiant, pas de pages', () => {
    expect(etiquetteCreneau(creneau, undefined)).toEqual({ numero: '300', titre: '300', meta: 'T1 · 2h45' })
  })
})

describe('descriptionCreneau', () => {
  it('décrit le créneau pour un lecteur d\'écran, avec son état', () => {
    expect(descriptionCreneau(creneau, item)).toBe(
      '300 · Tumeurs du col utérin, T1 · 22 p · 2h45, de 14h00 à 16h45, pas encore exporté',
    )
    expect(descriptionCreneau({ ...creneau, fait: true, version: 2, versionExportee: 2 }, item)).toBe(
      '300 · Tumeurs du col utérin, T1 · 22 p · 2h45, de 14h00 à 16h45, fait',
    )
  })
})
