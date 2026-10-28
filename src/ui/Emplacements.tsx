// Emplacements des écrans des tâches suivantes. Chacun est remplacé tel quel par le vrai contenu ;
// aucun ne contient de logique (sauf le bouton « + Collège », qui reste).
import { ouvrirImport } from './importDemande'

/** Contenu de la bibliothèque d'items (tâche 16) : dans le panneau (iPad) ou la feuille (iPhone). */
export function EmplacementBibliotheque() {
  return (
    <div className="bibliotheque">
      {/* Le bouton reste en tête de la bibliothèque (panneau iPad, feuille iPhone) quand la vraie liste arrive. */}
      <button type="button" className="btn-ajout" onClick={() => ouvrirImport()}>
        + Collège
      </button>
      <div className="emplacement" data-emplacement="bibliotheque">
        <p>La bibliothèque d'items arrive ici.</p>
      </div>
    </div>
  )
}

/** Zone du calendrier (tâches 17 et suivantes). */
export function EmplacementCalendrier({ vue }: { vue: string }) {
  return (
    <section className="ecran ecran-centre" aria-labelledby="titre-calendrier" data-emplacement="calendrier">
      <div className="carte carte-vide">
        <h1 id="titre-calendrier">Calendrier</h1>
        <p>La vue {vue} arrive ici.</p>
      </div>
    </section>
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
