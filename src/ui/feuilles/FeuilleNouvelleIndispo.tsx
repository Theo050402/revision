// Création d'une indisponibilité ponctuelle par le bouton « + Indisponibilité » de la barre du calendrier (spec §D.5).
// Préremplie avec l'emplacement libre touché en dernier, sinon avec aujourd'hui à l'heure pleine suivante, pendant
// une heure (`prefillIndispo`). Tout passe par `appliquer` : ↶ retire l'indisponibilité.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ajouterIndispo } from '../../domain/actions-etat'
import { hm, local, utcVersLocal } from '../../domain/temps'
import { validerIndispo } from '../../domain/validation'
import { Feuille } from '../Feuille'
import { useStore } from '../store'
import { toast } from '../Toast'
import { useTrou } from '../trou'
import { ChampQuand } from './ChampQuand'
import { prefillIndispo } from './prefillIndispo'
import './feuilles.css'

type Props = { onFermer: () => void }

export function FeuilleNouvelleIndispo({ onFermer }: Props) {
  const [depart] = useState(() => {
    const { reglages } = useStore.getState().etat
    return prefillIndispo(useTrou.getState().trou, utcVersLocal(new Date()), reglages.pas, reglages.journee)
  })
  const pas = useStore((s) => s.etat.reglages.pas)
  const [titre, setTitre] = useState('')
  const [titreVu, setTitreVu] = useState(false)
  const [jour, setJour] = useState(depart.jour)
  const [debut, setDebut] = useState(depart.debut)
  const [fin, setFin] = useState(depart.fin)

  // La feuille met d'abord le focus sur « Fermer » (son propre effet, après celui-ci) : on le reprend ensuite.
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => champ.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const erreurs = validerIndispo({ titre, debut, fin })
  // « Donne un titre. » n'apparaît qu'une fois le champ quitté : pas de reproche avant d'avoir écrit.
  const erreurTitre = titreVu ? erreurs.titre : undefined
  const invalide = Object.keys(erreurs).length > 0 || jour === ''

  const ajouter = (ev: FormEvent) => {
    ev.preventDefault()
    if (invalide) return
    const ajoutee = useStore
      .getState()
      .appliquer((e) => ajouterIndispo(e, titre.trim(), local(jour, hm(debut)), local(jour, hm(fin))))
    if (ajoutee) toast('Indisponibilité ajoutée.')
    onFermer()
  }

  return (
    <Feuille titre="Nouvelle indisponibilité" onFermer={onFermer} className="feuille-etroite">
      {/* `noValidate` : la roue d'iOS permet une minute hors du pas (`step`) ; la validation est celle de la fiche,
          jamais la bulle native de Safari. */}
      <form className="fiche" noValidate onSubmit={ajouter}>
        <div className="fiche-champ">
          <label className="etiquette" htmlFor="nouvelle-indispo-titre">
            Titre
          </label>
          <input
            ref={champ}
            id="nouvelle-indispo-titre"
            className="champ"
            placeholder="Cours, sport, rendez-vous…"
            value={titre}
            aria-invalid={erreurTitre !== undefined || undefined}
            aria-describedby={erreurTitre ? 'nouvelle-indispo-titre-erreur' : undefined}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setTitre(e.target.value)}
            onBlur={() => setTitreVu(true)}
          />
          {erreurTitre && (
            <p id="nouvelle-indispo-titre-erreur" className="message-erreur">
              {erreurTitre}
            </p>
          )}
        </div>

        <ChampQuand
          jour={jour}
          debut={debut}
          fin={fin}
          onJour={setJour}
          onDebut={setDebut}
          onFin={setFin}
          erreur={erreurs.heures}
          pas={pas}
        />

        <div className="feuille-actions">
          <button type="button" className="btn-texte" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="btn-principal" disabled={invalide}>
            Ajouter
          </button>
        </div>
      </form>
    </Feuille>
  )
}
