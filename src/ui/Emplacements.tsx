// Emplacements des écrans des tâches suivantes. Chacun est remplacé tel quel par le vrai contenu ;
// aucun ne contient de logique (sauf le bouton « + Collège », qui reste).
import { ouvrirImport, useDemandeImport } from './importDemande'

/** Contenu de la bibliothèque d'items (tâche 16) : dans le panneau (iPad) ou la feuille (iPhone). */
export function EmplacementBibliotheque() {
  // Un seul import à la fois : pendant qu'il est ouvert, un second lancerait une autre cible sur l'état en cours.
  const importOuvert = useDemandeImport((s) => s.ouvert)
  return (
    <div className="bibliotheque">
      {/* Le bouton reste en tête de la bibliothèque (panneau iPad, feuille iPhone) quand la vraie liste arrive. */}
      <button type="button" className="btn-ajout" disabled={importOuvert} onClick={() => ouvrirImport()}>
        + Collège
      </button>
      <div className="emplacement" data-emplacement="bibliotheque">
        <p>La bibliothèque d'items arrive ici.</p>
      </div>
    </div>
  )
}

/** Point d'entrée de la restauration d'une sauvegarde quand la lecture a échoué (tâche 19). */
export function EmplacementRestauration() {
  return (
    <div className="emplacement" data-emplacement="restauration">
      <p>La restauration depuis une sauvegarde sera proposée ici.</p>
    </div>
  )
}
