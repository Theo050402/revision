// Jour, début et fin d'une indisponibilité ponctuelle (fiche et feuille de création) : trois champs sur une ligne,
// le message d'erreur des heures dessous.
import { useId } from 'react'

type Props = {
  jour: string
  debut: string
  fin: string
  onJour: (v: string) => void
  onDebut: (v: string) => void
  onFin: (v: string) => void
  /** Message en ligne (fin avant début…). */
  erreur?: string
  /** Pas des heures, en minutes (les sélecteurs d'heure avancent de ce pas). */
  pas?: number
}

export function ChampQuand({ jour, debut, fin, onJour, onDebut, onFin, erreur, pas }: Props) {
  const id = useId()
  const step = pas ? pas * 60 : undefined
  return (
    <div className="fiche-champ">
      <span className="etiquette" id={`${id}-quand`}>
        Quand
      </span>
      <div className="fiche-ligne" role="group" aria-labelledby={`${id}-quand`}>
        <input type="date" className="champ" aria-label="Jour" value={jour} onChange={(e) => onJour(e.target.value)} />
        <input
          type="time"
          className="champ"
          aria-label="Début"
          step={step}
          value={debut}
          onChange={(e) => onDebut(e.target.value)}
        />
        <span aria-hidden="true">–</span>
        <input
          type="time"
          className="champ"
          aria-label="Fin"
          step={step}
          value={fin}
          onChange={(e) => onFin(e.target.value)}
        />
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}
    </div>
  )
}
