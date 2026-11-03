// Fiche d'une indisponibilité (spec §9.2, §10) : titre, horaires, origine, suppression. Seule une indisponibilité
// ponctuelle a des horaires modifiables : les blocs d'une récurrence se changent par la récurrence (qui les
// régénère), ceux d'un fichier .ics par un nouvel import. Tout passe par `appliquer` (annulable, §9.6).
import { useEffect, useState } from 'react'
import { modifierIndispo, supprimerIndispo } from '../../domain/actions-etat'
import { hm, jourDe, local, minutesDe, versHm } from '../../domain/temps'
import { validerIndispo } from '../../domain/validation'
import { Feuille } from '../Feuille'
import { useStore } from '../store'
import { toast } from '../Toast'
import { ChampQuand } from './ChampQuand'
import { plageLisible } from './format'
import './feuilles.css'

type Props = {
  id: string
  onFermer: () => void
  /** « Modifier la récurrence » : ouvre Réglages › Indisponibilités sur cette récurrence. */
  onModifierRecurrence: (recurrenceId: string) => void
}

export function FicheIndispo({ id, onFermer, onModifierRecurrence }: Props) {
  const indispo = useStore((s) => s.etat.indispos[id])
  const recurrence = useStore((s) => (indispo?.sourceId ? s.etat.recurrences[indispo.sourceId] : undefined))

  const [titre, setTitre] = useState(indispo?.titre ?? '')
  const [jour, setJour] = useState(indispo ? jourDe(indispo.debut) : '')
  const [debut, setDebut] = useState(indispo ? versHm(minutesDe(indispo.debut)) : '')
  const [fin, setFin] = useState(indispo ? versHm(minutesDe(indispo.fin)) : '')

  useEffect(() => {
    if (!indispo) onFermer()
  }, [indispo, onFermer])
  if (!indispo) return null

  const ponctuelle = indispo.source === 'ponctuelle'
  const erreurs = validerIndispo({ titre, debut: ponctuelle ? debut : '00:00', fin: ponctuelle ? fin : '23:59' })
  const jourManquant = ponctuelle && jour === ''
  const inchange =
    titre.trim() === indispo.titre &&
    (!ponctuelle || (local(jour, hm(debut)) === indispo.debut && local(jour, hm(fin)) === indispo.fin))
  const invalide = Object.keys(erreurs).length > 0 || jourManquant

  const enregistrer = () => {
    if (invalide) return
    const champs = ponctuelle
      ? { titre: titre.trim(), debut: local(jour, hm(debut)), fin: local(jour, hm(fin)) }
      : { titre: titre.trim() }
    useStore.getState().appliquer((e) => modifierIndispo(e, id, champs))
    onFermer()
  }

  const supprimer = () => {
    useStore.getState().appliquer((e) => supprimerIndispo(e, id))
    toast('Indisponibilité supprimée.')
    onFermer()
  }

  return (
    <Feuille titre={indispo.titre} onFermer={onFermer} className="feuille-etroite">
      <form
        className="fiche"
        onSubmit={(ev) => {
          ev.preventDefault()
          enregistrer()
        }}
      >
        <div className="fiche-champ">
          <label className="etiquette" htmlFor="indispo-titre">
            Titre
          </label>
          <input
            id="indispo-titre"
            className="champ"
            value={titre}
            aria-invalid={erreurs.titre !== undefined || undefined}
            aria-describedby={erreurs.titre ? 'indispo-titre-erreur' : undefined}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setTitre(e.target.value)}
          />
          {erreurs.titre && (
            <p id="indispo-titre-erreur" className="message-erreur">
              {erreurs.titre}
            </p>
          )}
        </div>

        {ponctuelle ? (
          <ChampQuand
            jour={jour}
            debut={debut}
            fin={fin}
            onJour={setJour}
            onDebut={setDebut}
            onFin={setFin}
            erreur={erreurs.heures}
          />
        ) : (
          <p className="fiche-quand">{plageLisible(indispo.debut, indispo.fin)}</p>
        )}

        <p className="aide fiche-source">
          {ponctuelle && 'Ponctuelle : tracée dans le calendrier.'}
          {indispo.source === 'recurrente' && (
            <>
              {`Fait partie de “${recurrence?.titre ?? indispo.titre}” — `}
              {recurrence && (
                <button
                  type="button"
                  className="btn-lien"
                  onClick={() => onModifierRecurrence(recurrence.id)}
                >
                  modifier la récurrence
                </button>
              )}
            </>
          )}
          {indispo.source === 'ics' && `Importée du fichier « ${indispo.sourceId ?? ''} ».`}
        </p>

        <div className="feuille-actions">
          <button type="button" className="btn-texte btn-danger-texte" onClick={supprimer}>
            Supprimer
          </button>
          <button type="submit" className="btn-principal" disabled={invalide || inchange}>
            Enregistrer
          </button>
        </div>
        {indispo.source === 'recurrente' && (
          <p className="aide">Supprimer retire seulement ce bloc ; la récurrence reste.</p>
        )}
      </form>
    </Feuille>
  )
}
