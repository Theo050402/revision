// Fiche d'un créneau (spec §9.3) : ouverte par un tap sur le bloc. Fait, durée, tour, note, Supprimer.
// Tout passe par `appliquer` : chaque action est annulable (§9.6).
import { useCallback, useEffect, useRef, useState } from 'react'
import { basculerFait, modifierNote, supprimerCreneau } from '../../domain/actions-creneaux'
import { ajouterMinutes } from '../../domain/temps'
import { etiquetteCreneau } from '../calendrier/etiquette'
import { formaterDuree } from '../duree'
import { Feuille } from '../Feuille'
import { useStore } from '../store'
import { toast } from '../Toast'
import { plageLisible } from './format'
import './feuilles.css'

type Props = { id: string; onFermer: () => void }

export function FicheCreneau({ id, onFermer }: Props) {
  const creneau = useStore((s) => s.etat.creneaux[id])
  const item = useStore((s) => (creneau ? s.etat.items[creneau.itemId] : undefined))
  const college = useStore((s) => (item ? s.etat.colleges[item.collegeId] : undefined))

  const [note, setNote] = useState(creneau?.note ?? '')
  const noteCourante = useRef(note)
  noteCourante.current = note

  // La note est enregistrée à la sortie du champ, et aussi à la fermeture : sur iPad, toucher le fond ou « Fermer »
  // ne fait pas toujours perdre le focus au champ.
  const enregistrerNote = useCallback(() => {
    const c = useStore.getState().etat.creneaux[id]
    if (c && c.note !== noteCourante.current) {
      useStore.getState().appliquer((e) => modifierNote(e, id, noteCourante.current))
    }
  }, [id])
  useEffect(() => enregistrerNote, [enregistrerNote])

  const fermer = useCallback(() => {
    enregistrerNote()
    onFermer()
  }, [enregistrerNote, onFermer])

  // Le créneau a disparu (annulation, suppression) : la fiche n'a plus d'objet.
  useEffect(() => {
    if (!creneau) onFermer()
  }, [creneau, onFermer])
  if (!creneau) return null

  const { titre } = etiquetteCreneau(creneau, item)
  const partie = creneau.partie ? ` · partie ${creneau.partie.i}/${creneau.partie.n}` : ''

  const supprimer = () => {
    useStore.getState().appliquer((e) => supprimerCreneau(e, id))
    toast('Créneau supprimé.')
    onFermer()
  }

  return (
    <Feuille titre={titre} onFermer={fermer} className="feuille-etroite">
      <div className="fiche">
        <p className="fiche-quand">
          {creneau.debut === null
            ? 'Dans « À placer »'
            : plageLisible(creneau.debut, ajouterMinutes(creneau.debut, creneau.duree))}
        </p>

        <dl className="fiche-details">
          {college && (
            <div>
              <dt>Collège</dt>
              <dd>{college.nom}</dd>
            </div>
          )}
          <div>
            <dt>Tour</dt>
            <dd>{`T${creneau.tour}${partie}`}</dd>
          </div>
          <div>
            <dt>Durée</dt>
            <dd>
              {formaterDuree(creneau.duree)}
              {creneau.dureePerso && <span className="pastille">personnalisée</span>}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn-fait"
          aria-pressed={creneau.fait}
          onClick={() => useStore.getState().appliquer((e) => basculerFait(e, id))}
        >
          ✓ Fait
        </button>

        <div className="fiche-champ">
          <label className="etiquette" htmlFor="fiche-note">
            Note
          </label>
          <textarea
            id="fiche-note"
            className="champ champ-note"
            rows={3}
            value={note}
            placeholder="Une remarque pour ce créneau…"
            onChange={(e) => setNote(e.target.value)}
            onBlur={enregistrerNote}
          />
        </div>

        <div className="feuille-actions">
          <button type="button" className="btn-texte btn-danger-texte" onClick={supprimer}>
            Supprimer
          </button>
        </div>
      </div>
    </Feuille>
  )
}
