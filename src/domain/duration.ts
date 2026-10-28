import type { Reglages } from './types'

// Tolérance contre les erreurs de virgule flottante aux demi-pas (ex. 47,25 / 15).
const EPSILON = 1e-9

/** Arrondit `min` au plus proche multiple de `pas` ; la moitié exacte va vers le haut. */
export function arrondiPas(min: number, pas: number): number {
  return Math.floor(min / pas + 0.5 + EPSILON) * pas
}

/** Coefficient du tour `t` (1-based) ; le dernier coefficient vaut pour les tours suivants. */
function coefTour(tour: number, coefsTours: number[]): number {
  return coefsTours[Math.min(tour, coefsTours.length) - 1]
}

/** Durée d'un créneau (spec §6), après arrondi au pas et minimum, avant découpage. */
export function dureeTour(pages: number, coefCollege: number, tour: number, r: Reglages): number {
  const base =
    pages * (r.rythme.minutes / r.rythme.pages) * coefCollege * coefTour(tour, r.coefsTours)
  return Math.max(r.dureeMin, arrondiPas(base, r.pas))
}

/** Découpe une durée en parties de au plus `dureeMax` (spec §6). */
export function decouper(duree: number, r: Reglages): number[] {
  if (duree <= r.dureeMax) return [duree]
  const n = Math.ceil(duree / r.dureeMax)
  const partie = Math.max(r.dureeMin, arrondiPas(duree / n, r.pas))
  return Array.from({ length: n }, () => partie)
}
