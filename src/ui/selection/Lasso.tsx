// Rectangle du lasso (spec §D.1) : accent à 12 %, bord accent. Posé dans le corps de la grille d'après la zone en
// jours et minutes (selection/zoneLasso.ts) : il défile avec la grille sans être recalculé en pixels écran.
import type { CSSProperties } from 'react'
import type { Intervalle } from '../../domain/cascade'
import { minutesVersY } from '../calendrier/geometrie'
import { useLasso } from './useSelection'
import './selection.css'

type Props = { jours: string[]; plage: Intervalle; pxHeure: number }

export function Lasso({ jours, plage, pxHeure }: Props) {
  const zone = useLasso((s) => s.zone)
  if (!zone) return null
  const i = jours.indexOf(zone.jourDebut)
  const j = jours.indexOf(zone.jourFin)
  if (i < 0 || j < 0) return null
  const haut = minutesVersY(zone.debut, plage, pxHeure)
  const style = {
    '--i': i,
    '--n': j - i + 1,
    top: haut,
    height: minutesVersY(zone.fin, plage, pxHeure) - haut,
  } as CSSProperties
  return <div className="lasso" data-lasso="" style={style} aria-hidden="true" />
}
