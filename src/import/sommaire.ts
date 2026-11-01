import type { EntreeSommaire } from './catalog'

/** Fragment de texte ; coordonnées en points, origine en haut de la page. */
export type Fragment = { str: string; x: number; y: number; h: number }
export type PageTexte = { page: number; hauteur: number; fragments: Fragment[] }
export type Ligne = { x: number; y: number; texte: string }

const TOLERANCE_Y = 3
const PAGES_SOMMAIRE = 20
const MIN_ENTREES = 3
/** Fenêtre de recherche du numéro de page : 4 hauteurs de ligne au-dessus de « Item N ». */
const FENETRE_LIGNES = 4
/** Marge à gauche de la colonne « Item » : exclut les libellés « Chapitre N : ». */
const MARGE_COLONNE = 20

// « Item » peut être coupé par l'OCR (« It » + « em ») : une espace est tolérée à l'intérieur.
// `(?!\d)` : « Item 12 - 2019 » ne doit pas lire « 201 » comme un second numéro.
const RE_ITEM = /It\s?em\s?s?\s+(\d{1,3})(?!\d)((?:\s*(?:,|et|-)\s*\d{1,3}(?!\d))*)/i
const RE_ITEM_COMPTE = /It\s?em\s?s?\s+\d{1,3}(?!\d)/gi
const RE_ITEM_DEBUT = new RegExp('^\\s*' + RE_ITEM.source, 'i')
const RE_PAGE = /[.\s…-]*(\d{1,4})\s*$/

type LigneFragments = { y: number; fragments: Fragment[] }

/** Regroupe en lignes (même y à ±3 pt), fragments triés par x. Le flux de texte n'est jamais utilisé. */
function grouperFragments(fragments: Fragment[]): LigneFragments[] {
  const tries = [...fragments].sort((a, b) => a.y - b.y || a.x - b.x)
  const groupes: Fragment[][] = []
  let yRef = 0
  for (const fr of tries) {
    const courant = groupes[groupes.length - 1]
    if (courant && Math.abs(fr.y - yRef) <= TOLERANCE_Y) courant.push(fr)
    else {
      groupes.push([fr])
      yRef = fr.y
    }
  }
  return groupes.map((g) => {
    const fragmentsLigne = g.sort((a, b) => a.x - b.x)
    return { y: Math.min(...g.map((fr) => fr.y)), fragments: fragmentsLigne }
  })
}

const texteDe = (fr: Fragment[]) => fr.map((x) => x.str).join(' ')

export function grouperLignes(f: Fragment[]): Ligne[] {
  return grouperFragments(f).map((l) => ({ x: l.fragments[0].x, y: l.y, texte: texteDe(l.fragments) }))
}

const nombres = (s: string) => (s.match(/\d+/g) ?? []).map(Number)

/** Fragment de la ligne qui contient le caractère d'indice `idx` du texte joint. */
function fragmentA(fragments: Fragment[], idx: number): Fragment {
  let debut = 0
  for (const fr of fragments) {
    const fin = debut + fr.str.length
    if (idx < fin) return fr
    debut = fin + 1 // espace de jointure
  }
  return fragments[fragments.length - 1]
}

function compterItems(lignes: LigneFragments[]): number {
  return lignes.reduce((n, l) => n + (texteDe(l.fragments).match(RE_ITEM_COMPTE)?.length ?? 0), 0)
}

function analyserPageSommaire(p: PageTexte): EntreeSommaire[] {
  const lignes = grouperFragments(p.fragments)
  const entrees: EntreeSommaire[] = []
  for (const ligne of lignes) {
    const texte = texteDe(ligne.fragments)
    const m = RE_ITEM.exec(texte)
    if (!m) continue
    const frItem = fragmentA(ligne.fragments, m.index)
    const xColonne = frItem.x - MARGE_COLONNE
    const yItem = ligne.y
    const h = frItem.h
    // Le critère de colonne écarte les « Chapitre N » placés à gauche, avant tout regroupement.
    const candidats = p.fragments.filter(
      (fr) => fr.x >= xColonne && fr.y >= yItem - FENETRE_LIGNES * h && fr.y < yItem,
    )
    const haut = grouperFragments(candidats)
    let pageDebut: number | null = null
    for (let i = haut.length - 1; i >= 0 && pageDebut === null; i--) {
      const t = texteDe(haut[i].fragments)
      if (RE_ITEM.test(t)) continue // « Item N » d'un bloc précédent : jamais un numéro de page
      const mp = RE_PAGE.exec(t)
      if (mp) pageDebut = Number(mp[1])
    }
    if (pageDebut !== null) entrees.push({ numeros: nombres(m[0].replace(/^\D+/, '')), pageDebut })
  }
  return entrees
}

const parPage = (a: EntreeSommaire, b: EntreeSommaire) => a.pageDebut - b.pageDebut

/**
 * Pages de sommaire, communes aux stratégies A et B : une page (des 20 premières) est « pleine » si elle compte
 * au moins `MIN_ENTREES` lignes « Item N » ; une page à 1 ou 2 items est la fin d'un sommaire seulement si la
 * page précédente est elle-même pleine. Pas de chaînage : une fin de sommaire n'en prolonge pas une autre.
 */
function pagesDeSommaire(pages: PageTexte[]): Set<number> {
  const comptes = new Map<number, number>()
  for (const p of pages) comptes.set(p.page, compterItems(grouperFragments(p.fragments)))
  const n = (page: number) => comptes.get(page) ?? 0
  const sommaire = new Set<number>()
  for (const p of pages) {
    if (p.page > PAGES_SOMMAIRE) continue
    if (n(p.page) >= MIN_ENTREES || (n(p.page) >= 1 && n(p.page - 1) >= MIN_ENTREES)) sommaire.add(p.page)
  }
  return sommaire
}

/**
 * Stratégie A : numéros d'items et pages de début lus dans les pages de sommaire. Seul le total des entrées
 * doit atteindre `MIN_ENTREES` : la dernière page d'un sommaire n'a souvent qu'un ou deux items.
 */
export function analyserSommaire(pages: PageTexte[]): EntreeSommaire[] {
  const sommaire = pagesDeSommaire(pages)
  const entrees = pages.filter((p) => sommaire.has(p.page)).flatMap(analyserPageSommaire)
  return entrees.length >= MIN_ENTREES ? entrees.sort(parPage) : []
}

/** Stratégie B : première page où une ligne commence par « Item N » dans le tiers supérieur (pages de sommaire ignorées). */
export function analyserTitres(pages: PageTexte[]): EntreeSommaire[] {
  const vus = new Set<number>()
  const entrees: EntreeSommaire[] = []
  const sommaire = pagesDeSommaire(pages)
  for (const p of pages) {
    // Une page de sommaire n'est jamais le début d'un item.
    if (sommaire.has(p.page)) continue
    const lignes = grouperFragments(p.fragments)
    for (const ligne of lignes) {
      if (ligne.y >= p.hauteur / 3) continue
      const m = RE_ITEM_DEBUT.exec(texteDe(ligne.fragments))
      if (!m) continue
      const numeros = nombres(m[0].replace(/^\D+/, '')).filter((n) => !vus.has(n))
      if (numeros.length === 0) continue
      numeros.forEach((n) => vus.add(n))
      entrees.push({ numeros, pageDebut: p.page })
    }
  }
  return entrees.sort(parPage)
}

export async function extraireEntrees(
  pagesDebut: PageTexte[],
  lireToutes: () => Promise<PageTexte[]>,
): Promise<{ entrees: EntreeSommaire[]; strategie: 'sommaire' | 'titres' | 'aucune' }> {
  const a = analyserSommaire(pagesDebut)
  if (a.length >= MIN_ENTREES) return { entrees: a, strategie: 'sommaire' }
  const b = analyserTitres(await lireToutes())
  if (b.length > 0) return { entrees: b, strategie: 'titres' }
  return { entrees: [], strategie: 'aucune' }
}
