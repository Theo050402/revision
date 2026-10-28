import { describe, expect, test } from 'vitest'
import { OFFICIELS, construireItems, nomDepuisFichier } from '../../src/import/catalog'
import type { EntreeSommaire } from '../../src/import/catalog'

const e = (numeros: number[], pageDebut: number): EntreeSommaire => ({ numeros, pageDebut })

describe('OFFICIELS', () => {
  test('367 items, numéros 1 à 367 tous présents', () => {
    expect(OFFICIELS.size).toBe(367)
    for (let n = 1; n <= 367; n++) expect(OFFICIELS.get(n), `item ${n}`).toBeTruthy()
  })

  test('intitulés cohérents avec le collège de cancérologie', () => {
    expect(OFFICIELS.get(290)).toBe('Épidémiologie, facteurs de risque, prévention et dépistage des cancers')
    expect(OFFICIELS.get(299)).toBe('Tumeurs intracrâniennes')
    expect(OFFICIELS.get(305)).toBe("Tumeurs de l'œsophage")
  })
})

describe('construireItems', () => {
  const sommaire = [
    [290, 13], [291, 27], [292, 45], [293, 61], [294, 73], [295, 101], [297, 111], [298, 121],
    [299, 135], [300, 153], [301, 175], [302, 193], [303, 213], [304, 229], [305, 249],
  ].map(([n, p]) => e([n], p))

  test('sommaire de cancérologie : pages, dernier item à vérifier, titre officiel', () => {
    const r = construireItems(sommaire)
    expect(r.map((i) => i.pages)).toEqual([14, 18, 16, 12, 28, 10, 10, 14, 18, 22, 18, 20, 16, 20, 17])
    expect(r.at(-1)).toMatchObject({ numero: 305, aVerifier: true, raison: 'dernier item' })
    expect(r[9].titre).toBe(OFFICIELS.get(300))
    expect(r.slice(0, -1).every((i) => !i.aVerifier && i.raison === null)).toBe(true)
    expect(r[0]).toMatchObject({ numero: 290, pageDebut: 13, pages: 14 })
  })

  test('un chapitre à 2 items répartit ses pages, même pageDebut', () => {
    const r = construireItems([e([10, 11], 50), e([12], 70), e([13], 80)])
    expect(r.map((i) => i.pages)).toEqual([10, 10, 10, 10])
    expect(r.map((i) => i.pageDebut)).toEqual([50, 50, 70, 80])
    expect(r.map((i) => i.numero)).toEqual([10, 11, 12, 13])
  })

  test('répartition arrondie, au moins 1 page', () => {
    const r = construireItems([e([10, 11, 12], 50), e([13, 14, 15], 52), e([16], 60)])
    expect(r.slice(0, 3).map((i) => i.pages)).toEqual([1, 1, 1])
    expect(r.slice(3, 6).map((i) => i.pages)).toEqual([3, 3, 3])
  })

  test('dernier item : médiane d’un nombre pair = moyenne des deux centraux, arrondie', () => {
    const r = construireItems([e([1], 1), e([2], 11), e([3], 14), e([4], 30)])
    // longueurs 10, 3, 16 → médiane 10 (impair)
    expect(r[3].pages).toBe(10)
    const p = construireItems([e([1], 1), e([2], 11), e([3], 14)])
    // longueurs 10, 3 → (3+10)/2 = 6,5 → 7
    expect(p[2]).toMatchObject({ pages: 7, aVerifier: true, raison: 'dernier item' })
  })

  test('anomalie : pages ≤ 0', () => {
    const r = construireItems([e([1], 10), e([2], 10), e([3], 20), e([4], 30)])
    expect(r[0]).toMatchObject({ pages: 0, aVerifier: true, raison: 'pages ≤ 0' })
    expect(r[1]).toMatchObject({ pages: 10, aVerifier: false, raison: null })
  })

  test('anomalie : plus de 60 pages', () => {
    const r = construireItems([e([1], 10), e([2], 71), e([3], 80)])
    expect(r[0]).toMatchObject({ pages: 61, aVerifier: true, raison: 'plus de 60 pages' })
    const ok = construireItems([e([1], 10), e([2], 70), e([3], 80)])
    expect(ok[0]).toMatchObject({ pages: 60, aVerifier: false, raison: null })
  })

  test('anomalie : hors liste officielle, titre « Item N »', () => {
    const r = construireItems([e([400], 10), e([2], 20), e([3], 30)])
    expect(r[0]).toMatchObject({ numero: 400, titre: 'Item 400', aVerifier: true, raison: 'hors liste officielle' })
  })

  test('liste officielle injectable', () => {
    const r = construireItems([e([1], 1), e([2], 5)], new Map([[1, 'Un']]))
    expect(r[0]).toMatchObject({ titre: 'Un', aVerifier: false })
    expect(r[1]).toMatchObject({ titre: 'Item 2', raison: 'hors liste officielle' })
  })

  test('priorité des raisons : hors liste > pages ≤ 0 > plus de 60 pages > dernier item', () => {
    const r = construireItems([e([400], 10), e([401], 10), e([1], 100), e([2], 200), e([3], 300)])
    expect(r.map((i) => i.raison)).toEqual([
      'hors liste officielle', 'hors liste officielle', 'plus de 60 pages', 'plus de 60 pages', 'plus de 60 pages',
    ])
    const s = construireItems([e([1], 10), e([2], 10), e([3], 20)])
    expect(s[0].raison).toBe('pages ≤ 0')
    // dernier item hors liste
    expect(construireItems([e([1], 1), e([400], 5)])[1].raison).toBe('hors liste officielle')
  })

  test('doublon : première occurrence gardée, les autres supprimées', () => {
    const r = construireItems([e([5], 10), e([6], 20), e([5], 30), e([7], 40)])
    expect(r.map((i) => i.numero)).toEqual([5, 6, 7])
    expect(r[0]).toMatchObject({ numero: 5, pageDebut: 10, pages: 10 })
    const g = construireItems([e([5, 5, 6], 10), e([7], 40)])
    expect(g.map((i) => i.numero)).toEqual([5, 6, 7])
  })

  test('entrées non triées : triées par pageDebut', () => {
    const r = construireItems([e([3], 30), e([1], 10), e([2], 20)])
    expect(r.map((i) => i.numero)).toEqual([1, 2, 3])
    expect(r.map((i) => i.pages)).toEqual([10, 10, 10])
  })

  test('liste vide ; un seul item', () => {
    expect(construireItems([])).toEqual([])
    expect(construireItems([e([1], 5)])).toHaveLength(1)
    expect(construireItems([e([1], 5)])[0].aVerifier).toBe(true)
  })
})

describe('nomDepuisFichier', () => {
  test('abréviations connues', () => {
    expect(nomDepuisFichier('CANCERO 4e college_extract.pdf')).toBe('Cancérologie')
    expect(nomDepuisFichier('cardio.pdf')).toBe('Cardiologie')
    expect(nomDepuisFichier('GYNÉCO_2024.pdf')).toBe('Gynécologie-obstétrique')
    expect(nomDepuisFichier('hge - cours.PDF')).toBe('Hépato-gastro-entérologie')
    expect(nomDepuisFichier('Urgences.pdf')).toBe('Médecine d\'urgence')
  })

  test('sinon le premier mot avec majuscule initiale', () => {
    expect(nomDepuisFichier('mon livre.pdf')).toBe('Mon')
    expect(nomDepuisFichier('ÉCHOGRAPHIE.pdf')).toBe('Échographie')
  })
})
