// Mise à jour du service worker (`registerType: 'autoUpdate'` : skipWaiting + clientsClaim). Après un déploiement, la
// page ouverte garde son ancien JavaScript alors que le cache a changé : un chunk paresseux (le worker du PDF) a
// disparu. On recharge donc dès que c'est possible, mais jamais au milieu d'un geste : une feuille ouverte ou un
// import en cours repoussent la mise à jour au prochain lancement.

export type DepsMiseAJour = {
  /** Une feuille (réglage, fiche, confirmation) est ouverte. */
  feuilleOuverte: () => boolean
  /** L'écran d'import est ouvert (choix, analyse ou vérification). */
  importOuvert: () => boolean
  /** Résolu quand les écritures en cours sont terminées. */
  attendreEcritures: () => Promise<void>
  recharger: () => void
}

/**
 * Recharge la page si l'app est au repos : ni feuille, ni import. L'état est relu après `attendreEcritures()` (rien ne
 * doit être perdu, et une feuille ouverte entre-temps annule le rechargement). Renvoie `true` si la page est rechargée.
 */
export async function rechargerSiAuRepos(d: DepsMiseAJour): Promise<boolean> {
  const auRepos = () => !d.feuilleOuverte() && !d.importOuvert()
  if (!auRepos()) return false
  await d.attendreEcritures()
  if (!auRepos()) return false
  d.recharger()
  return true
}
