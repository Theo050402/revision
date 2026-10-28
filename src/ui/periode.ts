import { ajouterJours, jourSemaine } from '../domain/temps'

const formatMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })

/** `2026-10-28` → « Octobre ». */
export function nomDuMois(jour: string): string {
  const [a, m] = jour.split('-').map(Number)
  const nom = formatMois.format(new Date(Date.UTC(a, m - 1, 1)))
  return nom.charAt(0).toUpperCase() + nom.slice(1)
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function numeroSemaine(jour: string): number {
  const jeudi = ajouterJours(jour, 4 - jourSemaine(jour))
  const [a, m, j] = jeudi.split('-').map(Number)
  const rang = (Date.UTC(a, m - 1, j) - Date.UTC(a, 0, 1)) / 86_400_000
  return Math.floor(rang / 7) + 1
}
