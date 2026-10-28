import { describe, expect, test } from 'vitest'
import {
  analyserSommaire,
  analyserTitres,
  extraireEntrees,
  grouperLignes,
  type Fragment,
  type PageTexte,
} from '../../src/import/sommaire'
import fixture from '../fixtures/sommaire-cancero.json'

const H = 842
const f = (str: string, x: number, y: number, h = 10): Fragment => ({ str, x, y, h })
const page = (page: number, fragments: Fragment[], hauteur = H): PageTexte => ({ page, hauteur, fragments })

/** Bloc de sommaire : titre + numéro de page à droite, puis « Item N » sous le titre. */
function bloc(y: number, titre: string, numPage: number, item: string): Fragment[] {
  return [f(titre, 125, y), f('.......', 400, y), f(String(numPage), 515, y), f(item, 125, y + 12)]
}

describe('grouperLignes', () => {
  test('regroupe à ±3 pt, trie par x et joint par une espace', () => {
    const lignes = grouperLignes([f('b', 50, 101), f('a', 10, 100), f('c', 10, 120)])
    expect(lignes).toEqual([
      { x: 10, y: 100, texte: 'a b' },
      { x: 10, y: 120, texte: 'c' },
    ])
  })

  test('sépare les lignes distantes de plus de 3 pt', () => {
    expect(grouperLignes([f('a', 0, 100), f('b', 5, 104)])).toHaveLength(2)
  })
})

describe('analyserSommaire', () => {
  test('sommaire réel de cancérologie (fixture)', () => {
    const pages = fixture as PageTexte[]
    expect(analyserSommaire(pages)).toEqual(
      [[290, 13], [291, 27], [292, 45], [293, 61], [294, 73], [295, 101], [297, 111],
        [298, 121], [299, 135], [300, 153], [301, 175], [302, 193], [303, 213], [304, 229], [305, 249]]
        .map(([n, p]) => ({ numeros: [n], pageDebut: p })),
    )
  })

  test("« Chapitre 9 » à gauche, à la même hauteur qu'un titre, n'est jamais pris pour une page", () => {
    const fr = [
      f('Chapitre 9', 60, 100),
      ...bloc(100, 'Titre un', 17, 'Item 1'),
      ...bloc(150, 'Titre deux', 29, 'Item 2'),
      f('Chapitre 9', 60, 200),
      ...bloc(200, 'Titre trois', 41, 'Item 3'),
    ]
    // « Chapitre 9 » est au même y que le titre mais x=60 < 125-20 : exclu avant le regroupement
    expect(analyserSommaire([page(1, fr)])).toEqual([
      { numeros: [1], pageDebut: 17 },
      { numeros: [2], pageDebut: 29 },
      { numeros: [3], pageDebut: 41 },
    ])
  })

  test('« Items 10, 11 » donne deux numéros', () => {
    const fr = [
      ...bloc(100, 'Titre un', 10, 'Items 10, 11'),
      ...bloc(160, 'Titre deux', 20, 'Item 12'),
      ...bloc(220, 'Titre trois', 30, 'Item 13'),
    ]
    const r = analyserSommaire([page(1, fr)])
    expect(r[0]).toEqual({ numeros: [10, 11], pageDebut: 10 })
    expect(r).toHaveLength(3)
  })

  test('tolère le bruit OCR sur le numéro de page (« - 45 », points de conduite)', () => {
    const fr = [
      f('Titre', 125, 100), f('..........', 300, 100), f('- 45', 510, 100), f('Item 1 ,.', 125, 112),
      ...bloc(160, 'T2', 50, 'Item 2'),
      ...bloc(220, 'T3', 60, 'Item 3'),
    ]
    expect(analyserSommaire([page(1, fr)])[0]).toEqual({ numeros: [1], pageDebut: 45 })
  })

  test('titre sur trois lignes, numéro de page sur la dernière', () => {
    const fr = [
      f('ligne 1', 125, 100), f('ligne 2', 125, 112), f('ligne 3', 125, 124), f('88', 515, 124),
      f('Item 4', 125, 136),
      ...bloc(200, 'T2', 99, 'Item 5'),
      ...bloc(260, 'T3', 110, 'Item 6'),
    ]
    expect(analyserSommaire([page(1, fr)])[0]).toEqual({ numeros: [4], pageDebut: 88 })
  })

  test('moins de 3 « Item N » dans les 20 premières pages : liste vide', () => {
    const fr = [...bloc(100, 'T1', 10, 'Item 1'), ...bloc(160, 'T2', 20, 'Item 2')]
    expect(analyserSommaire([page(1, fr)])).toEqual([])
  })

  test('les pages au-delà de la 20e sont ignorées', () => {
    const fr = [...bloc(100, 'T1', 10, 'Item 1'), ...bloc(160, 'T2', 20, 'Item 2'), ...bloc(220, 'T3', 30, 'Item 3')]
    expect(analyserSommaire([page(21, fr)])).toEqual([])
  })

  test('résultat trié par page de début', () => {
    const fr = [
      ...bloc(100, 'T1', 50, 'Item 1'),
      ...bloc(160, 'T2', 20, 'Item 2'),
      ...bloc(220, 'T3', 30, 'Item 3'),
    ]
    expect(analyserSommaire([page(1, fr)]).map((e) => e.pageDebut)).toEqual([20, 30, 50])
  })
})

describe('analyserTitres', () => {
  test('« Item 12 » en haut de page (tiers supérieur) : page de début', () => {
    const pages = [page(1, [f('Introduction', 50, 100)]), page(5, [f('Item 12 – Titre', 50, 100)])]
    expect(analyserTitres(pages)).toEqual([{ numeros: [12], pageDebut: 5 }])
  })

  test('« Item 12 » en bas de page ignoré', () => {
    const pages = [page(3, [f('Item 12 – Titre', 50, 700)])]
    expect(analyserTitres(pages)).toEqual([])
  })

  test('garde la première page pour un numéro répété', () => {
    const pages = [page(4, [f('Item 7', 50, 80)]), page(9, [f('Item 7', 50, 80)])]
    expect(analyserTitres(pages)).toEqual([{ numeros: [7], pageDebut: 4 }])
  })

  test("« Item N » dont le mot est coupé par l'OCR (« It » + « em »)", () => {
    const pages = [page(8, [f('It', 50, 80), f('em 14', 58, 80)])]
    expect(analyserTitres(pages)).toEqual([{ numeros: [14], pageDebut: 8 }])
  })

  test('une ligne qui ne commence pas par « Item » est ignorée', () => {
    expect(analyserTitres([page(2, [f('voir Item 12', 50, 80)])])).toEqual([])
  })
})

describe('extraireEntrees', () => {
  const sommaire = page(1, [
    ...bloc(100, 'T1', 10, 'Item 1'),
    ...bloc(160, 'T2', 20, 'Item 2'),
    ...bloc(220, 'T3', 30, 'Item 3'),
  ])

  test('A suffisant : stratégie « sommaire », lireToutes non appelée', async () => {
    let appels = 0
    const r = await extraireEntrees([sommaire], async () => {
      appels++
      return []
    })
    expect(r.strategie).toBe('sommaire')
    expect(r.entrees).toHaveLength(3)
    expect(appels).toBe(0)
  })

  test("A trouve moins de 3 entrées : bascule vers « titres »", async () => {
    const r = await extraireEntrees([page(1, [])], async () => [page(6, [f('Item 3 – Titre', 50, 80)])])
    expect(r).toEqual({ entrees: [{ numeros: [3], pageDebut: 6 }], strategie: 'titres' })
  })

  test("B ne trouve rien : « aucune »", async () => {
    const r = await extraireEntrees([page(1, [])], async () => [page(2, [f('texte', 50, 80)])])
    expect(r).toEqual({ entrees: [], strategie: 'aucune' })
  })
})
