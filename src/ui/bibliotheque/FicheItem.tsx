// Fiche d'un item (spec §8) : pages, collège, historique des créneaux avec leurs dates. Sur iPhone, elle propose
// « Planifier… » : un jour et une heure (au pas de la grille) remplacent le glisser-déposer.
import { useEffect, useRef, useState } from 'react'
import { deplacerCreneau, deposerItem, libelleHeure } from '../../domain/actions-creneaux'
import { dureeTour } from '../../domain/duration'
import { hm } from '../../domain/temps'
import { dernierTourParItem, etatToursParItem } from '../../domain/tours'
import type { Etat } from '../../domain/types'
import { formaterDuree } from '../duree'
import { useStore } from '../store'
import { toast } from '../Toast'
import type { Disposition } from '../useDisposition'
import { descriptionTours, libelleQuand, pointsTours } from './libelles'

type Props = {
  itemId: string
  etat: Etat
  disposition: Disposition
  /** Jour proposé par défaut pour « Planifier… » (aujourd'hui). */
  jourParDefaut: string
  onRetour: () => void
}

/** Heures proposées : de l'ouverture de la journée à la dernière heure de début possible, au pas de la grille. */
function heuresPossibles(e: Etat): number[] {
  const { journee, pas } = e.reglages
  const res: number[] = []
  for (let m = hm(journee.debut); m < hm(journee.fin); m += pas) res.push(m)
  return res
}

export function FicheItem({ itemId, etat, disposition, jourParDefaut, onRetour }: Props) {
  const retour = useRef<HTMLButtonElement>(null)
  const [planifie, setPlanifie] = useState(false)
  const [jour, setJour] = useState(jourParDefaut)
  const heures = heuresPossibles(etat)
  const [heure, setHeure] = useState<number>(() => heures.find((m) => m >= 9 * 60) ?? heures[0] ?? 0)

  useEffect(() => {
    retour.current?.focus({ preventScroll: true })
  }, [])

  const item = etat.items[itemId]
  const college = item && etat.colleges[item.collegeId]
  if (!item || !college) {
    return (
      <div className="fiche">
        <button ref={retour} type="button" className="btn-texte fiche-retour" onClick={onRetour}>
          Retour
        </button>
        <p className="aide">Cet item n'existe plus.</p>
      </div>
    )
  }

  const creneaux = Object.values(etat.creneaux)
    .filter((c) => c.itemId === itemId)
    .sort((a, b) => a.tour - b.tour || (a.partie?.i ?? 0) - (b.partie?.i ?? 0))
  const etats = etatToursParItem(creneaux).get(itemId) ?? []
  const prochain = (dernierTourParItem(creneaux).get(itemId) ?? 0) + 1
  const duree = dureeTour(item.pages, college.coefficient, prochain, etat.reglages)
  const teinte = `var(--c${((college.couleur % 6) + 6) % 6})`

  // Un créneau de cet item attend dans le bac : c'est lui qu'on place (la première partie, dans l'ordre), plutôt que
  // de créer un nouveau tour.
  const enAttente = creneaux.find((c) => c.debut === null)
  const libelleAction = enAttente
    ? enAttente.partie
      ? `Placer la partie ${enAttente.partie.i}/${enAttente.partie.n}…`
      : `Placer le tour ${enAttente.tour}…`
    : 'Planifier…'

  const planifier = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return
    let versBac = 0
    const ok = useStore.getState().appliquer((e) => {
      const cible = { jour, t: heure, cibleId: null, moitie: 'haute' as const }
      const res = enAttente ? deplacerCreneau(e, enAttente.id, cible) : deposerItem(e, itemId, cible)
      if (!res.ok) return null
      versBac = res.versBac
      return res.etat
    })
    if (!ok) {
      toast('Pas de place à cette heure')
      return
    }
    toast(`Placé à ${libelleHeure(heure)}${versBac > 0 ? `, ${versBac} partie${versBac > 1 ? 's' : ''} dans le bac` : ''}`)
    setPlanifie(false)
  }

  return (
    <div className="fiche">
      <button ref={retour} type="button" className="btn-texte fiche-retour" onClick={onRetour}>
        ← Retour
      </button>
      <div className="fiche-entete">
        <span className="carte-pastille fiche-pastille" style={{ background: teinte }} aria-hidden="true">
          {item.numero}
        </span>
        <h3 className="fiche-titre">
          <span className="sr-seul">{`Item ${item.numero}, `}</span>
          {item.titre}
        </h3>
      </div>
      {item.aVerifier && (
        <p className="fiche-alerte">Cet item a une anomalie à vérifier (détectée à l'import).</p>
      )}
      <dl className="fiche-infos">
        <dt>Collège</dt>
        <dd>{college.nom}</dd>
        <dt>Pages</dt>
        <dd>
          {item.pages} p, à partir de la page {item.pageDebut}
        </dd>
        <dt>Prochain tour</dt>
        <dd>
          T{prochain} · {formaterDuree(duree)}
        </dd>
        <dt>Tours</dt>
        <dd>
          <span className="carte-points" aria-hidden="true">
            {pointsTours(etats).map((p, i) => (
              <i key={i} className="point-tour" data-etat={p} />
            ))}
          </span>{' '}
          <span className="fiche-tours-texte">{descriptionTours(etats)}</span>
        </dd>
      </dl>

      <h4 className="fiche-sous-titre">Créneaux</h4>
      {creneaux.length === 0 ? (
        <p className="aide">Aucun créneau pour l'instant.</p>
      ) : (
        <ul className="fiche-creneaux">
          {creneaux.map((c) => (
            <li key={c.id} data-creneau-id={c.id} data-fait={c.fait}>
              <span>{libelleQuand(c)}</span>
              <span className="fiche-creneau-etat">
                {formaterDuree(c.duree)}
                {c.fait ? ' · fait' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {disposition === 'iphone' && (
        <div className="fiche-planifier">
          {!planifie ? (
            <button type="button" className="btn-principal" aria-expanded={false} onClick={() => setPlanifie(true)}>
              {libelleAction}
            </button>
          ) : (
            <form className="fiche-form" onSubmit={planifier}>
              <label>
                <span>Jour</span>
                <input type="date" value={jour} required onChange={(ev) => setJour(ev.target.value)} />
              </label>
              <label>
                <span>Heure</span>
                <select value={heure} onChange={(ev) => setHeure(Number(ev.target.value))}>
                  {heures.map((m) => (
                    <option key={m} value={m}>
                      {libelleHeure(m)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="fiche-form-actions">
                <button type="button" className="btn-texte" onClick={() => setPlanifie(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn-principal">
                  Placer
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
