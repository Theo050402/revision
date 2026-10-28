import { useSyncExternalStore } from 'react'

export type Disposition = 'ipad' | 'iphone'

/** Largeur minimale (px) de la disposition iPad : panneau + calendrier côte à côte (spec §8). */
export const LARGEUR_IPAD = 900

const requete = `(min-width: ${LARGEUR_IPAD}px)`

function abonner(rappel: () => void): () => void {
  const media = window.matchMedia(requete)
  media.addEventListener('change', rappel)
  return () => media.removeEventListener('change', rappel)
}

const instantane = (): Disposition => (window.matchMedia(requete).matches ? 'ipad' : 'iphone')

/** `'ipad'` si la largeur est ≥ 900 px, sinon `'iphone'`. Suit la rotation et le redimensionnement. */
export function useDisposition(): Disposition {
  return useSyncExternalStore(abonner, instantane)
}
