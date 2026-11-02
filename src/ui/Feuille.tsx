import { useEffect, useId, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { animerFeuille, type MouvementFeuille } from './mouvement/feuille'

/**
 * Feuille modale : sur iPhone elle monte du bas et se ferme en la tirant vers le bas ; sur iPad (feuille étroite)
 * c'est un popover qui grandit depuis le bouton qui l'a ouvert (mouvement : `mouvement/feuille.ts`, spec §C.6).
 * Échap, le fond, « Fermer » et la tirée la ferment, avec la sortie animée ; le focus entre dans la feuille.
 * Le parent rend le reste de l'interface inerte pendant ce temps et rend le focus au bouton qui l'a ouverte.
 * `onFermer` n'est appelé qu'une fois la sortie terminée.
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
  const fond = useRef<HTMLDivElement>(null)
  const voile = useRef<HTMLDivElement>(null)
  const feuille = useRef<HTMLDivElement>(null)
  const mouvement = useRef<MouvementFeuille | null>(null)
  const idTitre = useId()
  // Les appelants passent souvent une fermeture neuve à chaque rendu : on la garde en référence pour que l'effet
  // (focus d'ouverture, écoute d'Échap) ne tourne qu'à l'ouverture, pas à chaque changement du store.
  const surFermer = useRef(onFermer)
  surFermer.current = onFermer

  // Avant la première peinture : la feuille est posée hors de l'écran (ou réduite) avant d'être vue.
  useLayoutEffect(() => {
    const m = animerFeuille({ fond: fond.current!, voile: voile.current!, feuille: feuille.current! }, () => surFermer.current())
    mouvement.current = m
    return () => {
      m.detruire()
      mouvement.current = null
    }
  }, [])

  const demanderFermeture = () => mouvement.current?.fermer()

  useEffect(() => {
    fermer.current?.focus({ preventScroll: true })
    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') mouvement.current?.fermer()
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [])

  // La tête (poignée et titre) est la prise : un doigt posé dessus peut tirer la feuille vers le bas.
  const prise = (ev: PointerEvent) => {
    if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return
    mouvement.current?.prendre(ev.pointerId, ev.clientY)
  }

  return createPortal(
    <div ref={fond} className="feuille-fond" data-efface={efface || undefined} onClick={demanderFermeture}>
      <div ref={voile} className="feuille-voile" aria-hidden="true" />
      <div
        ref={feuille}
        className={className ? `feuille ${className}` : 'feuille'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="feuille-prise" onPointerDown={prise}>
          <div className="feuille-poignee" aria-hidden="true" />
          <div className="feuille-entete">
            <h2 id={idTitre}>{titre}</h2>
            <button ref={fermer} type="button" className="btn-texte" onClick={demanderFermeture}>
              Fermer
            </button>
          </div>
        </div>
        <div className="feuille-corps">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
