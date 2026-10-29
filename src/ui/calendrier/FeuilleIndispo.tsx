// Titre d'une indisponibilité tracée dans la grille (spec §9.3, §10) : demandé après le tracé.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Feuille } from '../Feuille'
import { libellePeriode } from '../periode'
import { heureCourte } from './Bloc'
import type { Trace } from './gestes'

type Props = { trace: Trace; onCreer: (titre: string) => void; onAnnuler: () => void }

export function FeuilleIndispo({ trace, onCreer, onAnnuler }: Props) {
  const [titre, setTitre] = useState('')
  const champ = useRef<HTMLInputElement>(null)
  // La feuille met d'abord le focus sur « Fermer » (son propre effet, après celui-ci) : on le reprend ensuite.
  useEffect(() => {
    const id = requestAnimationFrame(() => champ.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const valider = (ev: FormEvent) => {
    ev.preventDefault()
    if (titre.trim() !== '') onCreer(titre.trim())
  }

  return (
    <Feuille titre="Titre de l'indisponibilité" onFermer={onAnnuler} className="feuille-etroite">
      <form className="feuille-indispo" onSubmit={valider}>
        <p className="aide">
          {libellePeriode('jour', [trace.jour])}, {heureCourte(trace.debut)}–{heureCourte(trace.fin)}
        </p>
        <input
          ref={champ}
          className="champ"
          aria-label="Titre"
          placeholder="Cours, sport, rendez-vous…"
          enterKeyHint="done"
          autoComplete="off"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
        />
        <div className="feuille-indispo-actions">
          <button type="button" className="btn-texte" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn-principal" disabled={titre.trim() === ''}>
            Créer
          </button>
        </div>
      </form>
    </Feuille>
  )
}
