import type { Intervalle } from '../../domain/cascade'
import { minutesDe } from '../../domain/temps'
import { minutesVersY } from './geometrie'
import { useMaintenant } from './maintenant'

/**
 * Ligne « maintenant » du jour en cours (spec §9.1). Composant isolé : c'est le seul de la grille
 * qui s'abonne à l'horloge, donc le seul à se redessiner chaque minute.
 */
export function LigneMaintenant({ plage, pxHeure }: { plage: Intervalle; pxHeure: number }) {
  const maintenant = useMaintenant()
  const min = minutesDe(maintenant)
  if (min < plage.debut || min > plage.fin) return null
  return (
    <div
      className="maintenant"
      data-maintenant={maintenant}
      style={{ top: minutesVersY(min, plage, pxHeure) }}
      aria-hidden="true"
    />
  )
}
