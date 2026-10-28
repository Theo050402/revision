// Recherche et filtres de la bibliothèque (spec §8). Fonctions pures.
import { normaliser } from '../../import/recherche'
import { etatToursParItem } from '../../domain/tours'
import type { Etat, Item } from '../../domain/types'

// Une seule normalisation dans l'application (œ → oe, æ → ae, accents, casse) : celle de l'import.
export { normaliser }

export type EtatFiltre = 'nonvu' | 1 | 2 | 3
export type Longueur = 'court' | 'moyen' | 'long'
export type Filtres = { colleges: string[]; etats: EtatFiltre[]; longueurs: Longueur[] }

export const FILTRES_VIDES: Filtres = { colleges: [], etats: [], longueurs: [] }

/** Un mot d'au moins 5 lettres tolère une faute (spec §8). */
const LONGUEUR_FAUTE = 5

/**
 * Distance de Levenshtein avec transposition de deux lettres voisines (Damerau, variante « OSA ») :
 * « estomca » est à 1 faute d'« estomac ». Les distances au-delà de 1 n'ont pas besoin d'être exactes.
 */
export function distance(a: string, b: string): number {
  if (a === b) return 0
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > 1) return Math.abs(n - m) // inutile de calculer plus : le seuil est 1
  let avant2: number[] = []
  let avant = Array.from({ length: m + 1 }, (_, j) => j)
  for (let i = 1; i <= n; i++) {
    const ligne = [i]
    for (let j = 1; j <= m; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(avant[j] + 1, ligne[j - 1] + 1, avant[j - 1] + cout)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, avant2[j - 2] + 1)
      ligne.push(d)
    }
    avant2 = avant
    avant = ligne
  }
  return avant[m]
}

/** Le mot (déjà normalisé) apparaît dans le titre, ou, à partir de 5 lettres, à une faute près d'un mot du titre. */
function motTrouve(mot: string, titre: string, motsTitre: string[]): boolean {
  if (titre.includes(mot)) return true
  if (mot.length < LONGUEUR_FAUTE) return false
  return motsTitre.some((m) => distance(mot, m) <= 1)
}

function longueurDe(pages: number): Longueur {
  return pages < 10 ? 'court' : pages <= 20 ? 'moyen' : 'long'
}

/**
 * Items correspondant à la recherche et aux filtres, dans l'ordre reçu. Un nombre seul filtre par préfixe de
 * numéro ; un texte doit retrouver chacun de ses mots dans le titre. Filtres : « ou » à l'intérieur d'une
 * catégorie, « et » entre catégories. États : `nonvu` = aucun tour ; 1 et 2 = ce nombre de tours ; 3 = trois ou plus.
 */
export function filtrer(items: Item[], requete: string, filtres: Filtres, e: Etat): Item[] {
  const q = normaliser(requete).trim()
  const nombre = /^\d+$/.test(q)
  const mots = q === '' || nombre ? [] : q.split(/\s+/)
  const tours = filtres.etats.length > 0 ? etatToursParItem(Object.values(e.creneaux)) : null

  return items.filter((it) => {
    if (nombre && !String(it.numero).startsWith(q)) return false
    if (mots.length > 0) {
      const titre = normaliser(it.titre)
      const motsTitre = titre.split(/[^a-z0-9]+/).filter(Boolean)
      if (!mots.every((m) => motTrouve(m, titre, motsTitre))) return false
    }
    if (filtres.colleges.length > 0 && !filtres.colleges.includes(it.collegeId)) return false
    if (filtres.longueurs.length > 0 && !filtres.longueurs.includes(longueurDe(it.pages))) return false
    if (tours) {
      const n = tours.get(it.id)?.length ?? 0
      if (!filtres.etats.some((f) => (f === 'nonvu' ? n === 0 : f === 3 ? n >= 3 : n === f))) return false
    }
    return true
  })
}
