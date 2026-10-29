// Corbeille (spec §9.3) : visible seulement pendant le glisser d'un créneau. Un créneau lâché dessus est
// supprimé (annulable par ↶). La cible est repérée par `data-corbeille` (voir cibles.ts).
import { useGlisse } from './glisse'

export function Corbeille() {
  const visible = useGlisse((s) => s.source?.type === 'creneau')
  const survol = useGlisse((s) => s.survol?.type === 'corbeille')
  return (
    <div
      className="corbeille"
      data-corbeille=""
      data-visible={visible}
      data-survol={survol}
      aria-hidden={!visible}
    >
      <svg className="icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </svg>
      <span>Supprimer</span>
    </div>
  )
}
