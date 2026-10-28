// Libellés de la bibliothèque : historique des créneaux et points des tours.
import { libelleHeure } from '../../domain/actions-creneaux'
import { jourDe, minutesDe } from '../../domain/temps'
import type { EtatTour } from '../../domain/tours'
import type { Creneau } from '../../domain/types'

const fmtDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** « T1 · mardi 5 nov. 14h », « T1 · 2/3 · jeudi 5 nov. 14h » ou « T1 · À placer » (créneau dans le bac). */
export function libelleQuand(c: Creneau): string {
  const parts = [`T${c.tour}`]
  if (c.partie) parts.push(`${c.partie.i}/${c.partie.n}`)
  if (c.debut === null) parts.push('À placer')
  else {
    const [a, m, j] = jourDe(c.debut).split('-').map(Number)
    parts.push(`${fmtDate.format(new Date(Date.UTC(a, m - 1, j)))} ${libelleHeure(minutesDe(c.debut))}`)
  }
  return parts.join(' · ')
}

export type PointTour = 'nonvu' | EtatTour

/** Points d'une carte : un par tour (au moins trois), le reste « non vu ». */
export function pointsTours(etats: EtatTour[]): PointTour[] {
  return Array.from({ length: Math.max(3, etats.length) }, (_, i) => etats[i] ?? 'nonvu')
}

/** « T1 fait, T2 planifié », pour les lecteurs d'écran (les points sont décoratifs). */
export function descriptionTours(etats: EtatTour[]): string {
  if (etats.length === 0) return 'Pas encore vu'
  return etats.map((e, i) => `T${i + 1} ${e === 'fait' ? 'fait' : 'planifié'}`).join(', ')
}
