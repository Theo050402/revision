// Bouton « Exporter » de la barre du haut : badge du nombre de changements en attente (nouveaux créneaux,
// créneaux modifiés, suppressions à faire à la main), et ouverture de la feuille d'export.
import { useEffect, useRef, useState } from 'react'
import { changementsEnAttente, evenementsExport } from '../../domain/actions-etat'
import { quitterSelection } from '../selection/useSelection'
import { useStore } from '../store'
import { FeuilleExport } from './FeuilleExport'
import './export.css'

export function BoutonExport() {
  const etat = useStore((s) => s.etat)
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)

  const { nouveaux, modifies, suppressions } = changementsEnAttente(etat)
  const badge = nouveaux.length + modifies.length + suppressions.length
  // Inactif seulement tant que rien n'a jamais pu être exporté : sinon la feuille reste utile (suppressions, « Tout »).
  const exportable = evenementsExport(etat, 'tout').length > 0 || suppressions.length > 0

  // Pendant que la feuille est ouverte (rendue hors de la coque), le reste est inerte ; à la fermeture, le focus
  // revient au bouton.
  useEffect(() => {
    if (!ouvert) return
    const coque = document.querySelector('.coque')
    coque?.setAttribute('inert', '')
    return () => {
      coque?.removeAttribute('inert')
      bouton.current?.focus({ preventScroll: true })
    }
  }, [ouvert])

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="btn-export"
        disabled={!exportable}
        aria-haspopup="dialog"
        aria-label={badge > 0 ? `Exporter, ${badge === 1 ? '1 changement' : `${badge} changements`} en attente` : undefined}
        onClick={() => {
          quitterSelection() // ouvrir l'export quitte le mode sélection (spec §D.2)
          setOuvert(true)
        }}
      >
        Exporter
        {badge > 0 && (
          <span className="export-badge" aria-hidden="true">{badge}</span>
        )}
      </button>
      {ouvert && <FeuilleExport onFermer={() => setOuvert(false)} />}
    </>
  )
}
