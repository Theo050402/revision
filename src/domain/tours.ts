// Tours et progression (spec §7). Fonctions pures.
import type { Creneau, Etat } from './types'

export type EtatTour = 'planifie' | 'fait'

/** Nombre total d'items de l'EDN. */
const TOTAL_ITEMS = 367 as const

/** Tour d'un nouveau créneau : 1 + max(tour) des créneaux du même item, ou 1. Pas de renumérotation. */
export function prochainTour(creneaux: Creneau[], itemId: string): number {
  let max = 0
  for (const c of creneaux) {
    if (c.itemId === itemId && c.tour > max) max = c.tour
  }
  return max + 1
}

/**
 * États des tours d'un item, triés par numéro de tour. Un tour absent (ex. T2 supprimé)
 * n'a pas d'entrée : la longueur vaut le nombre de tours présents. Vide = non vu.
 * Un tour est « fait » seulement si tous ses créneaux (toutes parties) sont faits.
 */
export function etatTours(creneaux: Creneau[], itemId: string): EtatTour[] {
  const parTour = new Map<number, boolean>() // tour -> tous faits ?
  for (const c of creneaux) {
    if (c.itemId !== itemId) continue
    parTour.set(c.tour, (parTour.get(c.tour) ?? true) && c.fait)
  }
  return [...parTour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tousFaits]) => (tousFaits ? 'fait' : 'planifie'))
}

/**
 * Anneau de progression : numéros d'items distincts (tous collèges confondus) dont le T1 est
 * « fait » au sens d'etatTours (tous les créneaux/parties du T1 de l'item sont faits) dans au
 * moins un collège. Placé ou dans le bac. Les créneaux dont l'item n'existe plus sont ignorés.
 */
export function progression(etat: Etat): { vus: number; total: 367 } {
  const t1Complet = new Map<string, boolean>() // itemId -> tous les créneaux T1 faits ?
  for (const c of Object.values(etat.creneaux)) {
    if (c.tour !== 1 || !etat.items[c.itemId]) continue
    t1Complet.set(c.itemId, (t1Complet.get(c.itemId) ?? true) && c.fait)
  }
  const numeros = new Set<number>()
  for (const [itemId, complet] of t1Complet) {
    if (complet) numeros.add(etat.items[itemId].numero)
  }
  return { vus: numeros.size, total: TOTAL_ITEMS }
}
