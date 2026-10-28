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
 * Livre un fichier .ics selon l'ordre de la §12.4 : partage de fichier, puis
 * téléchargement. `methode` force une méthode (écran de test) ; si le partage
 * de fichier est indisponible, on se rabat sur le téléchargement.
 * Renvoie la méthode réellement utilisée, ou `'annule'` si l'utilisateur a
 * fermé la feuille de partage.
 */
export async function livrerIcs(
  contenu: string,
  nomFichier: string,
  methode?: MethodeLivraison,
): Promise<MethodeLivraison | 'annule'> {
  if (methode !== 'telechargement') {
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
