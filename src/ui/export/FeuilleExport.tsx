// Feuille d'export (spec §12, révisée après le test sur l'iPad le 28/10/2026) : un fichier .ics par action,
// livré par téléchargement, qui ouvre l'écran d'import du Calendrier. Les nouveaux créneaux s'ajoutent d'un
// coup (« Tout ajouter ») ; les créneaux modifiés sont mis à jour sans doublon, mais Calendrier demande de
// valider chaque mise à jour une par une.
import { useState } from 'react'
import {
  changementsEnAttente,
  creneauxExportes,
  evenementsExport,
  marquerExporte,
  viderSuppressions,
} from '../../domain/actions-etat'
import { genererIcs } from '../../ics/export'
import { livrerIcs } from '../../ics/livraison'
import { Feuille } from '../Feuille'
import { useStore } from '../store'
import { toast } from '../Toast'
import './export.css'

/** Au-delà, valider chaque mise à jour devient pénible : on propose de repartir de zéro. */
export const SEUIL_TOUT_REEXPORTER = 10

type Portee = 'nouveaux' | 'modifies' | 'tout'

const NOM_FICHIER: Record<Portee, string> = {
  nouveaux: 'revisions-nouveaux.ics',
  modifies: 'revisions-modifies.ics',
  tout: 'revisions-tout.ics',
}

export function messageEnvoi(n: number): string {
  return n === 1 ? '1 créneau envoyé au Calendrier' : `${n} créneaux envoyés au Calendrier`
}

export function FeuilleExport({ onFermer }: { onFermer: () => void }) {
  const etat = useStore((s) => s.etat)
  const [occupe, setOccupe] = useState(false)

  const { nouveaux, modifies, suppressions } = changementsEnAttente(etat)
  const total = evenementsExport(etat, 'tout').length

  async function livrer(portee: Portee): Promise<void> {
    if (occupe) return
    const courant = useStore.getState().etat
    const evenements = evenementsExport(courant, portee)
    if (evenements.length === 0) return
    const ids = creneauxExportes(courant, portee)
    setOccupe(true)
    try {
      const methode = await livrerIcs(genererIcs(evenements, new Date()), NOM_FICHIER[portee])
      // Fermer la feuille de partage sans envoyer ne marque rien ; un téléchargement est considéré comme livré.
      if (methode === 'annule') return
      // Le suivi de l'export n'est pas annulable : « Annuler » ne doit pas re-proposer ce qui est parti.
      useStore.getState().appliquerSansHistorique((e) => marquerExporte(e, ids))
      toast(messageEnvoi(ids.length))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Feuille titre="Exporter vers Calendrier" onFermer={onFermer} className="feuille-etroite feuille-export">
      <div className="export">
        {!etat.premierExportFait && (
          <p className="export-info">
            Crée d'abord un calendrier « Révisions » dans l'app Calendrier, puis choisis-le au moment de l'import.
          </p>
        )}

        <section className="export-section" aria-labelledby="export-nouveaux">
          <h3 id="export-nouveaux">Nouveaux créneaux ({nouveaux.length})</h3>
          {nouveaux.length > 0 ? (
            <>
              <p className="aide">Dans Calendrier, touche « Tout ajouter ».</p>
              <button type="button" className="btn-principal" disabled={occupe} onClick={() => void livrer('nouveaux')}>
                Ajouter au Calendrier
              </button>
            </>
          ) : (
            <p className="aide">Rien de nouveau à ajouter.</p>
          )}
        </section>

        {modifies.length > 0 && (
          <section className="export-section" aria-labelledby="export-modifies">
            <h3 id="export-modifies">Créneaux modifiés ({modifies.length})</h3>
            <p className="aide">Calendrier te demandera de valider chaque mise à jour, une par une.</p>
            <button type="button" className="btn-principal" disabled={occupe} onClick={() => void livrer('modifies')}>
              Mettre à jour dans Calendrier
            </button>
            {modifies.length > SEUIL_TOUT_REEXPORTER && (
              <div className="export-alternative">
                <h4>Trop de mises à jour à valider ?</h4>
                <p className="aide">Repars d'un calendrier vide : tout s'ajoute alors en une fois.</p>
                <ol>
                  <li>Dans l'app Calendrier, supprime le calendrier « Révisions ».</li>
                  <li>Recrée-le avec le même nom.</li>
                  <li>Touche « Tout réexporter » ci-dessous, puis « Tout ajouter » dans Calendrier.</li>
                </ol>
                <button type="button" className="btn-secondaire" disabled={occupe} onClick={() => void livrer('tout')}>
                  Tout réexporter
                </button>
              </div>
            )}
          </section>
        )}

        <section className="export-section" aria-labelledby="export-tout">
          <h3 id="export-tout">Tout le planning</h3>
          <p className="aide">
            {total === 1 ? 'Le créneau placé' : `Les ${total} créneaux placés`}, qu'ils aient déjà été exportés ou non.
          </p>
          <button
            type="button"
            className="btn-secondaire"
            disabled={occupe || total === 0}
            onClick={() => void livrer('tout')}
          >
            Exporter tout le planning
          </button>
        </section>

        {suppressions.length > 0 && (
          <section className="export-section export-suppressions" aria-labelledby="export-suppr">
            <h3 id="export-suppr">À supprimer à la main dans Calendrier :</h3>
            <ul>
              {suppressions.map((s) => (
                <li key={s.creneauId}>{s.libelle}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-secondaire"
              onClick={() => useStore.getState().appliquerSansHistorique((e) => viderSuppressions(e))}
            >
              C'est fait
            </button>
          </section>
        )}
      </div>
    </Feuille>
  )
}
