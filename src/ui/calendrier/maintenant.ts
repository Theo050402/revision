// « Maintenant » en heure de Paris, partagé par toute l'interface : un seul minuteur, démarré au
// premier abonné. Les abonnés ne sont réveillés que quand la minute change (la ligne « maintenant »)
// ou, pour `useAujourdhui`, quand le jour change : la grille entière ne se redessine pas chaque minute.
import { useSyncExternalStore } from 'react'
import { jourDe, utcVersLocal } from '../../domain/temps'

let courant = utcVersLocal(new Date())
const abonnes = new Set<() => void>()
let minuteur: number | undefined

function rafraichir(): void {
  const n = utcVersLocal(new Date())
  if (n === courant) return
  courant = n
  for (const f of [...abonnes]) f()
}

function abonner(rappel: () => void): () => void {
  abonnes.add(rappel)
  if (abonnes.size === 1) {
    rafraichir()
    // Toutes les 10 s : la minute change avec au plus 10 s de retard, sans dépendre de l'alignement.
    minuteur = window.setInterval(rafraichir, 10_000)
    // iPad reprise après veille ou retour d'un autre onglet : les minuteurs ont pu être gelés.
    document.addEventListener('visibilitychange', rafraichir)
  }
  return () => {
    abonnes.delete(rappel)
    if (abonnes.size === 0) {
      window.clearInterval(minuteur)
      document.removeEventListener('visibilitychange', rafraichir)
    }
  }
}

function instantane(): string {
  if (abonnes.size === 0) courant = utcVersLocal(new Date()) // personne n'écoute : pas de valeur périmée
  return courant
}

/** Heure locale courante `YYYY-MM-DDTHH:mm`, mise à jour à chaque minute. À réserver à la ligne « maintenant ». */
export function useMaintenant(): string {
  return useSyncExternalStore(abonner, instantane)
}

/** Jour courant `YYYY-MM-DD` (Paris) ; ne change qu'à minuit. */
export function useAujourdhui(): string {
  return useSyncExternalStore(abonner, () => jourDe(instantane()))
}
