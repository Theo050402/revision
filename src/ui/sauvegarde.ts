// Sauvegarde JSON de toutes les données (spec §11), partagée par Réglages › Données et le bandeau « quota ».
import { livrerFichier } from '../ics/livraison'
import { exporterSauvegarde } from '../storage/backup'
import { nomSauvegarde } from './screens/reglagesLogique'
import { useStore } from './store'
import { toast } from './Toast'

/** Livre `revisions-AAAA-MM-JJ.json` (téléchargement ; sur iPad, enregistré dans Fichiers). */
export async function sauvegarder(): Promise<void> {
  const contenu = exporterSauvegarde(useStore.getState().etat)
  const resultat = await livrerFichier(contenu, nomSauvegarde(), 'application/json')
  if (resultat !== 'annule') toast('Sauvegarde prête : cherche le fichier dans tes téléchargements.')
}
