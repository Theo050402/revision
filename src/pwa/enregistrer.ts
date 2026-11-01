// Enregistrement du service worker (virtual:pwa-register) et rechargement à la mise à jour. Séparé de `miseAJour.ts`
// pour que la logique de repos reste testable sans le module virtuel du plugin.
import { registerSW } from 'virtual:pwa-register'
import { useDemandeImport } from '../ui/importDemande'
import { attendreEcritures } from '../ui/store'
import { rechargerSiAuRepos } from './miseAJour'

export function enregistrerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // Au premier lancement le contrôleur apparaît sans qu'il s'agisse d'une mise à jour : seul un changement de
  // contrôleur après coup compte.
  const avaitUnControleur = navigator.serviceWorker.controller !== null
  let enCours = false
  const miseAJour = () => {
    if (enCours) return
    enCours = true
    void rechargerSiAuRepos({
      feuilleOuverte: () => document.querySelector('[role="dialog"]') !== null,
      importOuvert: () => useDemandeImport.getState().ouvert,
      attendreEcritures,
      recharger: () => window.location.reload(),
    }).then((recharge) => {
      // Pas au repos : on laisse la mise à jour au prochain lancement (l'ancienne page reste utilisable).
      if (!recharge) enCours = false
    })
  }
  if (avaitUnControleur) navigator.serviceWorker.addEventListener('controllerchange', miseAJour)
  registerSW({ immediate: true, onNeedReload: miseAJour })
}
