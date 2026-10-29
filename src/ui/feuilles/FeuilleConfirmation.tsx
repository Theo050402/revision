// Confirmation d'une action destructrice ou irréversible (suppression d'un collège, restauration).
import type { ReactNode } from 'react'
import { Feuille } from '../Feuille'
import './feuilles.css'

type Props = {
  titre: string
  children: ReactNode
  /** Libellé du bouton qui confirme (« Supprimer », « Remplacer »). */
  confirmer: string
  onConfirmer: () => void
  onAnnuler: () => void
}

export function FeuilleConfirmation({ titre, children, confirmer, onConfirmer, onAnnuler }: Props) {
  return (
    <Feuille titre={titre} onFermer={onAnnuler} className="feuille-etroite">
      <div className="feuille-confirmation">
        <div className="aide">{children}</div>
        <div className="feuille-actions">
          <button type="button" className="btn-texte" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="button" className="btn-principal btn-danger" onClick={onConfirmer}>
            {confirmer}
          </button>
        </div>
      </div>
    </Feuille>
  )
}
