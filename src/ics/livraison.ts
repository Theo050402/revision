export type MethodeLivraison = 'partage' | 'telechargement'

function telecharger(contenu: string, nomFichier: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Livre un fichier .ics. Par défaut : téléchargement seul. Test sur iPad
 * (28/10/2026) : la feuille de partage d'iOS n'offre pas l'app Calendrier pour
 * un .ics, alors qu'un téléchargement ouvre l'écran d'import natif du
 * Calendrier. `methode: 'partage'` force la tentative de partage de fichier
 * (écran de test), avec repli sur le téléchargement si le partage est
 * indisponible ou échoue.
 * Renvoie la méthode réellement utilisée, ou `'annule'` si l'utilisateur a
 * fermé la feuille de partage.
 */
export async function livrerIcs(
  contenu: string,
  nomFichier: string,
  methode?: MethodeLivraison,
): Promise<MethodeLivraison | 'annule'> {
  if (methode === 'partage') {
    const fichier = new File([contenu], nomFichier, { type: 'text/calendar' })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier] })
        return 'partage'
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'annule'
        // Autre échec du partage : repli sur le téléchargement.
      }
    }
  }
  telecharger(contenu, nomFichier)
  return 'telechargement'
}
