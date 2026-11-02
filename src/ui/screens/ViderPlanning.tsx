// « Vider le planning » (spec B.5) : supprime tous les créneaux, placés ou à placer. Annulable (↶) : passe par `appliquer`.
import { useState } from 'react'
import { viderPlanning } from '../../domain/actions-creneaux'
import { FeuilleConfirmation } from '../feuilles/FeuilleConfirmation'
import { useStore } from '../store'

export function ViderPlanning() {
  const creneaux = useStore((s) => s.etat.creneaux)
  const appliquer = useStore((s) => s.appliquer)
  const [confirmer, setConfirmer] = useState(false)

  const tous = Object.values(creneaux)
  const n = tous.length
  const dejaExportes = tous.some((c) => c.versionExportee !== null)

  const vider = () => {
    appliquer(viderPlanning)
    setConfirmer(false)
  }

  return (
    <>
      <button type="button" className="btn-principal btn-danger" disabled={n === 0} onClick={() => setConfirmer(true)}>
        Vider le planning
      </button>
      {confirmer && (
        <FeuilleConfirmation
          titre={n === 1 ? 'Supprimer le créneau du planning ?' : `Supprimer les ${n} créneaux du planning ?`}
          confirmer="Supprimer"
          onConfirmer={vider}
          onAnnuler={() => setConfirmer(false)}
        >
          <p>Les collèges, les indisponibilités et les réglages sont conservés.</p>
          {dejaExportes && (
            <p>
              Ils sont aussi dans ton Calendrier : le plus simple est ensuite de supprimer le calendrier « Révisions » et de le
              recréer.
            </p>
          )}
        </FeuilleConfirmation>
      )}
    </>
  )
}
