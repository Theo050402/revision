// Libellés des fiches : « mardi 3 nov. · 14h–16h45 ».
import { jourDe, minutesDe } from '../../domain/temps'
import { heureCourte } from '../calendrier/Bloc'

const formatJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** `2026-11-03` → « mardi 3 nov. ». */
export function jourLisible(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  return formatJour.format(new Date(Date.UTC(a, m - 1, j)))
}

/** `2026-11-03T14:00`, `2026-11-03T16:45` → « mardi 3 nov. · 14h–16h45 ». */
export function plageLisible(debut: string, fin: string): string {
  return `${jourLisible(jourDe(debut))} · ${heureCourte(minutesDe(debut))}–${heureCourte(minutesDe(fin))}`
}

const formatDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** `2026-11-02` → « 2 nov. ». */
export function dateCourte(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  return formatDate.format(new Date(Date.UTC(a, m - 1, j)))
}
