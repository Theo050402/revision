// Emplacement libre touché dans la grille (spec §8, « Pour combler ce trou »). La grille l'écrit (tâche 18),
// la bibliothèque le lit ; il vit hors des composants pour ne pas faire passer de rappel entre les deux.
import { create } from 'zustand'

export type Trou = { jour: string; t: number }

export const useTrou = create<{ trou: Trou | null }>()(() => ({ trou: null }))

/** `jour` au format `YYYY-MM-DD`, `t` en minutes depuis minuit. */
export function choisirTrou(jour: string, t: number): void {
  useTrou.setState({ trou: { jour, t } })
}

export function effacerTrou(): void {
  useTrou.setState({ trou: null })
}
