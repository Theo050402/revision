// Feuille d'export (spec §12, révisée après le test sur l'iPad le 28/10/2026) : un fichier .ics par action,
// livré par téléchargement, qui ouvre l'écran d'import du Calendrier. Les nouveaux créneaux s'ajoutent d'un
// coup (« Tout ajouter ») ; les créneaux modifiés sont mis à jour sans doublon, mais Calendrier demande de
// valider chaque mise à jour une par une.
import { useState } from 'react'
import {
  annulerMarquage,
  changementsEnAttente,
  creneauxExportes,
  evenementsExport,
  marquerExporte,
  viderSuppressions,
  type EnvoyeAvant,
} from '../../domain/actions-etat'
import type { SuppressionEnAttente } from '../../domain/types'
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

/** Ce qu'il faut pour « Remettre à envoyer » après la dernière livraison, et l'action qui l'a produite. */
type DerniereLivraison = {
  cible: Portee | 'depart'
  envoyes: EnvoyeAvant[]
  premierExportFait: boolean
  suppressions: Record<string, SuppressionEnAttente>
}

export function messageEnvoi(n: number): string {
  return n === 1 ? '1 créneau envoyé au Calendrier' : `${n} créneaux envoyés au Calendrier`
}

export function FeuilleExport({ onFermer }: { onFermer: () => void }) {
  const etat = useStore((s) => s.etat)
  const [occupe, setOccupe] = useState(false)
  // Une livraison n'est pas une preuve d'import : tant que la feuille est ouverte, on peut la défaire.
  const [derniere, setDerniere] = useState<DerniereLivraison | null>(null)

  const { nouveaux, modifies, suppressions } = changementsEnAttente(etat)
  const total = evenementsExport(etat, 'tout').length
  const trop = modifies.length > SEUIL_TOUT_REEXPORTER
  // Ouverte d'office quand il y a trop de mises à jour ; ensuite, c'est l'utilisateur qui décide (elle doit rester
  // ouverte après « Tout réexporter », où se trouve « Remettre à envoyer »).
  const [alternativeOuverte, setAlternativeOuverte] = useState(trop)

  /** `depart` : l'utilisateur repart d'un calendrier recréé, les suppressions à la main n'ont plus d'objet. */
  async function livrer(portee: Portee, depart = false): Promise<void> {
    if (occupe) return
    const courant = useStore.getState().etat
    const evenements = evenementsExport(courant, portee)
    if (evenements.length === 0) return
    // Les versions écrites dans le fichier : seuls ces créneaux, à ces versions, sont marqués envoyés. On garde
    // leur `versionExportee` d'avant pour pouvoir la leur rendre.
    const envoyes = creneauxExportes(courant, portee).map((id) => ({
      id,
      version: courant.creneaux[id].version,
      avant: courant.creneaux[id].versionExportee,
    }))
    const memoire: DerniereLivraison = {
      cible: depart ? 'depart' : portee,
      envoyes,
      premierExportFait: courant.premierExportFait,
      suppressions: courant.suppressions,
    }
    setOccupe(true)
    try {
      const methode = await livrerIcs(genererIcs(evenements, new Date()), NOM_FICHIER[portee])
      // Fermer la feuille de partage sans envoyer ne marque rien ; un téléchargement est considéré comme livré.
      if (methode === 'annule') return
      // Le suivi de l'export n'est pas annulable : « Annuler » ne doit pas re-proposer ce qui est parti.
      useStore
        .getState()
        .appliquerSansHistorique((e) => (depart ? viderSuppressions(marquerExporte(e, envoyes)) : marquerExporte(e, envoyes)))
      setDerniere(memoire)
      toast(messageEnvoi(envoyes.length))
    } finally {
      setOccupe(false)
    }
  }

  /** « Remettre à envoyer » : rend aux créneaux de la dernière livraison leur état d'avant. */
  function remettre(): void {
    if (!derniere) return
    const d = derniere
    useStore.getState().appliquerSansHistorique((e) =>
      annulerMarquage(e, d.envoyes, {
        premierExportFait: d.premierExportFait,
        suppressions: d.cible === 'depart' ? d.suppressions : undefined,
      }),
    )
    setDerniere(null)
    toast('Remis à envoyer')
  }

  /** Sous le bouton de l'action utilisée, tant que la feuille reste ouverte. */
  const remise = (cible: DerniereLivraison['cible']) =>
    derniere?.cible === cible ? (
      <div className="export-remise">
        <p className="aide">Pas importé dans Calendrier ?</p>
        <button type="button" className="btn-secondaire" disabled={occupe} onClick={remettre}>
          Remettre à envoyer
        </button>
      </div>
    ) : null

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
          {remise('nouveaux')}
        </section>

        {modifies.length === 0 && derniere?.cible === 'modifies' && (
          <section className="export-section">{remise('modifies')}</section>
        )}

        {modifies.length > 0 && (
          <section className="export-section" aria-labelledby="export-modifies">
            <h3 id="export-modifies">Créneaux modifiés ({modifies.length})</h3>
            <p className="aide">Calendrier te demandera de valider chaque mise à jour, une par une.</p>
            <button type="button" className="btn-principal" disabled={occupe} onClick={() => void livrer('modifies')}>
              Mettre à jour dans Calendrier
            </button>
            {remise('modifies')}
          </section>
        )}

        <details
          className="export-alternative"
          data-conseille={trop || undefined}
          open={alternativeOuverte}
          onToggle={(ev) => setAlternativeOuverte(ev.currentTarget.open)}
        >
          <summary>{trop ? "Trop de mises à jour à valider ? Repartir d'un calendrier vide" : "Repartir d'un calendrier vide"}</summary>
          <p className="aide">
            Si ton Calendrier ne correspond plus à l'app, ou pour ne pas valider les mises à jour une par une : repars d'un
            calendrier vide, tout s'ajoute alors en une fois. La liste des suppressions à faire à la main est alors effacée,
            puisque l'ancien calendrier disparaît.
          </p>
          <ol>
            <li>Dans l'app Calendrier, supprime le calendrier « Révisions ».</li>
            <li>Recrée-le avec le même nom.</li>
            <li>Touche « Tout réexporter » ci-dessous, puis « Tout ajouter » dans Calendrier.</li>
          </ol>
          <button type="button" className="btn-secondaire" disabled={occupe || total === 0} onClick={() => void livrer('tout', true)}>
            Tout réexporter
          </button>
          {remise('depart')}
        </details>

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
          {remise('tout')}
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
