// État du geste en cours (glisser-déposer, redimensionnement, tracé d'indisponibilité), hors du store de
// l'application : rien ici n'est persisté ni annulable. La grille et la corbeille s'y abonnent ; seul l'aperçu
// change pendant le geste, et uniquement quand la minute magnétisée, la cible ou la moitié changent.
import { create } from 'zustand'
import type { Cible } from '../../domain/actions-creneaux'
import type { Creneau } from '../../domain/types'
import type { Apercu, Source } from './apercu'

export type { Source } from './apercu'

/** Ce qui est sous le doigt. */
export type Survol =
  | { type: 'colonne'; cible: Cible }
  | { type: 'mois'; jour: string; cible: Cible | null }
  | { type: 'corbeille' }
  | null

export type Glisse = {
  /** Source du glisser en cours (null : aucun). */
  source: Source | null
  /** Le glisser est parti de la feuille de la bibliothèque (iPhone) : elle s'efface pendant le geste. */
  depuisFeuille: boolean
  /** Décalage vertical (px) entre le doigt et le haut du bloc saisi : le bloc ne saute pas sous le doigt. */
  prise: number
  survol: Survol
  apercu: Apercu | null
  /** Créneau que dessine le fantôme quand l'aperçu n'en donne pas (refus) : calculé une fois au début. */
  fantome: Creneau | null
}

export const GLISSE_VIDE: Glisse = { source: null, depuisFeuille: false, prise: 0, survol: null, apercu: null, fantome: null }

export const useGlisse = create<Glisse>()(() => GLISSE_VIDE)

/** Redimensionnement en cours : la durée prévue s'affiche, rien n'est écrit avant le lâcher. */
export const useRedim = create<{ id: string | null; duree: number }>()(() => ({ id: null, duree: 0 }))

// ───────────────── Geste en cours (balayage, défilement) ─────────────────

let gesteActif = false
let dernierGeste = -Infinity

/**
 * Un geste (glisser, redimensionnement, tracé) commence ou finit. Pendant qu'il dure, le défilement tactile
 * est bloqué (voir `bloquerDefilement`) ; après, le balayage horizontal de la grille l'ignore.
 */
export function marquerGeste(actif: boolean): void {
  gesteActif = actif
  dernierGeste = performance.now()
}

/** Vrai si un geste a eu lieu (ou dure encore) depuis l'instant `t` (`performance.now()`). */
export function gesteDepuis(t: number): boolean {
  return gesteActif || dernierGeste >= t
}

/**
 * iOS Safari : une fois le geste activé (après l'appui long), le premier `touchmove` est annulé pour que le
 * navigateur ne fasse pas défiler la grille ou la bibliothèque (ce qui enverrait `pointercancel`). L'écouteur
 * doit être non passif ; il ne fait rien hors d'un geste.
 */
export function bloquerDefilement(): () => void {
  const bloquer = (e: TouchEvent) => {
    if (gesteActif && e.cancelable) e.preventDefault()
  }
  window.addEventListener('touchmove', bloquer, { passive: false })
  return () => window.removeEventListener('touchmove', bloquer)
}
