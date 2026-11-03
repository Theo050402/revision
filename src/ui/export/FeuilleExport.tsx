// Feuille d'export (spec §12, révisée après le test sur l'iPad le 28/10/2026) : un fichier .ics par action,
// livré par téléchargement, qui ouvre l'écran d'import du Calendrier. Les nouveaux créneaux s'ajoutent d'un
// coup (« Tout ajouter ») ; les créneaux modifiés sont mis à jour sans doublon, mais Calendrier demande de
// valider chaque mise à jour une par une.
import { useEffect, useId, useRef, useState } from 'react'
import {
  changementsEnAttente,
  creneauxExportes,
  evenementsExport,
  marquerExporte,
  viderSuppressions,
  type Envoye,
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

/**
 * Un fichier livré, en attente de la réponse d'Emma. Livrer n'est pas une preuve d'import (iOS laisse fermer son écran
 * d'import avec le ✓ sans rien mettre à jour) : rien n'est marqué envoyé avant « Oui, c'est fait ». `vide` : repartir
 * d'un calendrier recréé (tout le planning ; les suppressions à la main n'ont alors plus d'objet).
 */
type EnAttente = { portee: Portee | 'vide'; envoyes: Envoye[] }

export function messageEnvoi(n: number): string {
  return n === 1 ? '1 créneau envoyé au Calendrier' : `${n} créneaux envoyés au Calendrier`
}

export function FeuilleExport({ onFermer }: { onFermer: () => void }) {
  const etat = useStore((s) => s.etat)
  const [occupe, setOccupe] = useState(false)
  // État local à la feuille : fermer la feuille (ou l'app) sans répondre l'oublie, et rien n'a été marqué.
  const [enAttente, setEnAttente] = useState<EnAttente | null>(null)

  const { nouveaux, modifies, suppressions } = changementsEnAttente(etat)
  const total = evenementsExport(etat, 'tout').length
  const trop = modifies.length > SEUIL_TOUT_REEXPORTER
  // Ouverte d'office quand il y a trop de mises à jour ; ensuite, c'est l'utilisateur qui décide (elle doit rester
  // ouverte après « Tout réexporter », où se trouve la question).
  const [alternativeOuverte, setAlternativeOuverte] = useState(trop)

  /** `vide` : l'utilisateur repart d'un calendrier recréé, les suppressions à la main n'ont plus d'objet. */
  async function livrer(portee: Portee, vide = false): Promise<void> {
    if (occupe) return
    const courant = useStore.getState().etat
    const evenements = evenementsExport(courant, portee)
    if (evenements.length === 0) return
    // Les versions écrites dans le fichier : seuls ces créneaux, à ces versions, seront marqués envoyés si Emma confirme.
    const envoyes = creneauxExportes(courant, portee).map((id) => ({ id, version: courant.creneaux[id].version }))
    setOccupe(true)
    try {
      const methode = await livrerIcs(genererIcs(evenements, new Date()), NOM_FICHIER[portee])
      // Fermer la feuille de partage sans envoyer : rien n'est parti, pas de question.
      if (methode === 'annule') return
      setEnAttente({ portee: vide ? 'vide' : portee, envoyes })
    } finally {
      setOccupe(false)
    }
  }

  /** « Oui, c'est fait » : Emma confirme que Calendrier a enregistré le fichier. Le suivi n'est pas annulable. */
  function confirmer(): void {
    if (!enAttente) return
    const { portee, envoyes } = enAttente
    useStore
      .getState()
      .appliquerSansHistorique((e) =>
        portee === 'vide' ? viderSuppressions(marquerExporte(e, envoyes)) : marquerExporte(e, envoyes),
      )
    setEnAttente(null)
    toast(messageEnvoi(envoyes.length))
  }

  /** À la place du bouton de l'action utilisée : la question, tant qu'Emma n'a pas répondu. */
  const demande = (cible: EnAttente['portee']) =>
    enAttente?.portee === cible ? (
      <QuestionExport
        texte={
          cible === 'vide'
            ? 'Calendrier contient bien tout le planning ?'
            : enAttente.envoyes.length === 1
              ? 'Calendrier a bien enregistré ce créneau ?'
              : `Calendrier a bien enregistré ces ${enAttente.envoyes.length} créneaux ?`
        }
        onOui={confirmer}
        onNon={() => setEnAttente(null)}
      />
    ) : null

  return (
    <Feuille titre="Exporter vers Calendrier" onFermer={onFermer} className="feuille-etroite feuille-export">
      <div className="export">
        {!etat.premierExportFait && (
          <p className="encart export-info" data-ton="info">
            Crée d'abord un calendrier « Révisions » dans l'app Calendrier, puis choisis-le au moment de l'import.
          </p>
        )}

        <section className="export-section" aria-labelledby="export-nouveaux">
          <h3 id="export-nouveaux">Nouveaux créneaux ({nouveaux.length})</h3>
          {nouveaux.length > 0 ? (
            <>
              <p className="aide">Dans Calendrier, touche « Tout ajouter ».</p>
              {enAttente?.portee === 'nouveaux' ? (
                demande('nouveaux')
              ) : (
                <button type="button" className="btn-principal" disabled={occupe} onClick={() => void livrer('nouveaux')}>
                  Ajouter au Calendrier
                </button>
              )}
            </>
          ) : (
            <p className="aide">Rien de nouveau à ajouter.</p>
          )}
        </section>

        {modifies.length > 0 && (
          <section className="export-section" aria-labelledby="export-modifies">
            <h3 id="export-modifies">Créneaux modifiés ({modifies.length})</h3>
            <p className="aide">Calendrier te demandera de valider chaque mise à jour, une par une.</p>
            {enAttente?.portee === 'modifies' ? (
              demande('modifies')
            ) : (
              <button type="button" className="btn-principal" disabled={occupe} onClick={() => void livrer('modifies')}>
                Mettre à jour dans Calendrier
              </button>
            )}
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
          {enAttente?.portee === 'vide' ? (
            demande('vide')
          ) : (
            <button type="button" className="btn-secondaire" disabled={occupe || total === 0} onClick={() => void livrer('tout', true)}>
              Tout réexporter
            </button>
          )}
        </details>

        <section className="export-section" aria-labelledby="export-tout">
          <h3 id="export-tout">Tout le planning</h3>
          <p className="aide">
            {total === 1 ? 'Le créneau placé' : `Les ${total} créneaux placés`}, qu'ils aient déjà été exportés ou non.
          </p>
          {enAttente?.portee === 'tout' ? (
            demande('tout')
          ) : (
            <button
              type="button"
              className="btn-secondaire"
              disabled={occupe || total === 0}
              onClick={() => void livrer('tout')}
            >
              Exporter tout le planning
            </button>
          )}
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

/** La question posée après un fichier livré ; le focus y va (le bouton utilisé vient de disparaître). */
function QuestionExport({ texte, onOui, onNon }: { texte: string; onOui: () => void; onNon: () => void }) {
  const idTexte = useId()
  const groupe = useRef<HTMLDivElement>(null)
  useEffect(() => groupe.current?.focus(), [])
  return (
    <div ref={groupe} className="export-question" role="group" aria-labelledby={idTexte} tabIndex={-1}>
      <p id={idTexte} className="export-question-texte">
        {texte}
      </p>
      <div className="export-question-boutons">
        <button type="button" className="btn-principal" onClick={onOui}>
          Oui, c'est fait
        </button>
        <button type="button" className="btn-secondaire" onClick={onNon}>
          Non
        </button>
      </div>
    </div>
  )
}
