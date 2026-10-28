// Vue Mois (spec §9.1) : un carreau par jour, teinté à l'encre proportionnellement aux heures planifiées.
// Un tap ouvre le jour. Chaque carreau porte `data-jour` : c'est aussi une cible de dépôt (tâche 18).
import { useMemo, type CSSProperties } from 'react'
import { formaterDuree } from '../duree'
import { joursDuMois, libelleJourCourt, libellePeriode } from '../periode'
import { useStore } from '../store'
import { chargesDesJours } from './geometrie'
import { useAujourdhui } from './maintenant'

/** Charge (minutes) pour laquelle la teinte est pleine : 8 h. */
export const CHARGE_PLEINE = 480

/** Opacité de la teinte d'encre : `min(1, charge / 480)`. */
export const teinteCharge = (charge: number): number => Math.min(1, charge / CHARGE_PLEINE)

const NOMS_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

type Props = {
  /** Mois affiché, `YYYY-MM`. */
  mois: string
  /** Un tap sur un jour l'ouvre dans la vue Jour. */
  onOuvrirJour: (jour: string) => void
}

export function VueMois({ mois, onOuvrirJour }: Props) {
  const creneaux = useStore((s) => s.etat.creneaux)
  const aujourdhui = useAujourdhui()
  const jours = useMemo(() => joursDuMois(mois), [mois])
  const charges = useMemo(() => chargesDesJours({ creneaux }, jours), [creneaux, jours])

  return (
    <div className="mois-vue" data-mois={mois}>
      <div className="mois-entete" aria-hidden="true">
        {NOMS_JOURS.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="mois-grille" style={{ gridTemplateRows: `repeat(${jours.length / 7}, minmax(64px, 1fr))` }}>
        {jours.map((j) => {
          const charge = charges[j]
          const ratio = teinteCharge(charge)
          const { numero } = libelleJourCourt(j)
          const description = `${libellePeriode('jour', [j])}, ${charge > 0 ? `${formaterDuree(charge)} planifiées` : 'rien de planifié'}`
          return (
            <button
              key={j}
              type="button"
              className="mois-jour"
              data-jour={j}
              data-charge={charge}
              data-hors-mois={j.slice(0, 7) !== mois}
              data-aujourdhui={j === aujourdhui}
              data-dense={ratio > 0.6}
              style={{ '--charge': ratio } as CSSProperties}
              aria-label={description}
              aria-current={j === aujourdhui ? 'date' : undefined}
              onClick={() => onOuvrirJour(j)}
            >
              <span className="mois-numero">{numero}</span>
              {charge > 0 && <span className="mois-charge">{formaterDuree(charge)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
