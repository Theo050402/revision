import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Feuille modale qui monte du bas (bibliothèque sur iPhone). Échap, le fond et « Fermer » la
 * ferment ; le focus entre dans la feuille. Le parent rend le reste de l'interface inerte pendant
 * ce temps et rend le focus au bouton qui l'a ouverte.
 *
 * Rendue dans `document.body` (portail) : un ancêtre contenu (`contain`) ou transformé deviendrait sinon le bloc
 * conteneur de son fond `position: fixed`, qui ne couvrirait plus l'écran (ex. la feuille d'une indisponibilité
 * tracée dans la grille, qui défile).
 */
export function Feuille({
  titre,
  onFermer,
  className,
  efface = false,
  children,
}: {
  titre: string
  onFermer: () => void
  /** Classe en plus (ex. feuille étroite et centrée sur iPad). */
  className?: string
  /** Effacée le temps d'un glisser parti de la feuille (elle découvre la grille, sans se fermer). */
  efface?: boolean
  children: ReactNode
}) {
  const fermer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fermer.current?.focus()
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [onFermer])

  return createPortal(
    <div className="feuille-fond" data-efface={efface || undefined} onClick={onFermer}>
      <div
        className={className ? `feuille ${className}` : 'feuille'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-feuille"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="feuille-poignee" aria-hidden="true" />
        <div className="feuille-entete">
          <h2 id="titre-feuille">{titre}</h2>
          <button ref={fermer} type="button" className="btn-texte" onClick={onFermer}>
            Fermer
          </button>
        </div>
        <div className="feuille-corps">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
