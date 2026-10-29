// Sauvegarde JSON de toutes les données (spec §11), partagée par Réglages › Données et le bandeau « quota ».
import { livrerFichier } from '../ics/livraison'
import { exporterSauvegarde } from '../storage/backup'
import { nomSauvegarde } from './screens/reglagesLogique'
import { useStore } from './store'
import { toast } from './Toast'

/**
 * Livre `revisions-AAAA-MM-JJ.json` par la feuille de partage (AirDrop, Fichiers : spec §11). Si le partage de
 * fichier est indisponible ou échoue, `livrerFichier` retombe sur un téléchargement. Fermer la feuille de partage
 * n'est pas une erreur : aucun message. (Un .ics, lui, reste en téléchargement seul : voir `livrerIcs`.)
 */
export async function sauvegarder(): Promise<void> {
  const contenu = exporterSauvegarde(useStore.getState().etat)
  const resultat = await livrerFichier(contenu, nomSauvegarde(), 'application/json', 'partage')
  if (resultat === 'partage') toast('Sauvegarde prête.')
  else if (resultat === 'telechargement') toast('Sauvegarde téléchargée : cherche le fichier dans tes téléchargements.')
}
