// Point d'entrée de la restauration quand la lecture de la base a échoué : seul chemin de récupération.
// Affiché seulement une fois `initialiser` terminé en échec (l'écran d'erreur de la coque), donc la
// restauration n'est jamais proposée pendant le chargement.
import { Restauration } from './screens/Restauration'
import './screens/reglages.css'

export function EmplacementRestauration() {
  return (
    <div className="emplacement" data-emplacement="restauration">
      <p>Si tu as une sauvegarde, tu peux repartir d'elle.</p>
      <Restauration />
    </div>
  )
}
