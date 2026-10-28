// Demande d'ouverture du parcours d'import. Elle vit hors de la coque pour que n'importe quel écran
// (bibliothèque, Réglages › Collèges › Réimporter) puisse la déclencher sans passer de rappel.
import { create } from 'zustand'

type Demande = {
  ouvert: boolean
  /** Collège à réimporter (§5.7) ; `null` pour un nouveau collège. */
  collegeId: string | null
}

export const useDemandeImport = create<Demande>()(() => ({ ouvert: false, collegeId: null }))

/** Ouvre l'écran d'import : un nouveau collège, ou le réimport de `collegeId`. */
export function ouvrirImport(collegeId?: string): void {
  useDemandeImport.setState({ ouvert: true, collegeId: collegeId ?? null })
}

export function fermerImport(): void {
  useDemandeImport.setState({ ouvert: false, collegeId: null })
}
