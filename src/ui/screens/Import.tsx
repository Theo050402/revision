// Parcours d'import d'un collège (§5.1) : choix du PDF, analyse avec barre de progression,
// puis écran de vérification (Verification.tsx). Le PDF n'est pas conservé.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ajouterCollege, reimporterCollege } from '../../domain/actions-etat'
import { construireItems, nomDepuisFichier, type ItemExtrait } from '../../import/catalog'
import { ErreurPdf, descriptionTechnique, lirePdf } from '../../import/lirePdf'
import { VERSION_APP } from '../../version'
import { useDemandeImport } from '../importDemande'
import { useStore } from '../store'
import { toast } from '../Toast'
import { Verification } from './Verification'
import './import.css'

export { ouvrirImport } from '../importDemande'

/** Texte de la §14 : PDF illisible ou chiffré. */
export const MESSAGE_PDF_ILLISIBLE = "Ce fichier ne s'ouvre pas. Vérifie qu'il s'agit bien d'un PDF non protégé."

/** Le script du worker n'a pas pu se charger : l'app a été mise à jour pendant que la page était ouverte. */
export const MESSAGE_MISE_A_JOUR =
  "Une mise à jour de l'app a été installée. Ferme-la complètement puis rouvre-la, et recommence l'import."

/** L'écran d'analyse reste au moins ce temps : un PDF léger ne le fait pas clignoter. */
const DUREE_MIN_ANALYSE_MS = 450

type Phase =
  | { type: 'choix' }
  | { type: 'analyse'; fichier: string; fait: number; total: number }
  | { type: 'erreur'; message: string; detail: string }
  | { type: 'verification'; nom: string; items: ItemExtrait[] }

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const pluriel = (n: number) => `${n} ${n > 1 ? 'items' : 'item'}`

/** `onTermine(true)` après un enregistrement, `onTermine(false)` si Emma abandonne. */
export function Import({ onTermine }: { onTermine: (enregistre: boolean) => void }) {
  const collegeId = useDemandeImport((s) => s.collegeId)
  const colleges = useStore((s) => s.etat.colleges)
  const college = collegeId !== null ? (colleges[collegeId] ?? null) : null
  const couleur = college ? college.couleur : Object.keys(colleges).length % 6

  const [phase, setPhase] = useState<Phase>({ type: 'choix' })
  const entree = useRef<HTMLInputElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)
  /** Numéro de l'analyse en cours : une analyse abandonnée ne doit plus rien afficher. */
  const jeton = useRef(0)
  /** Annule la lecture en cours (et arrête son worker). */
  const abandon = useRef<AbortController | null>(null)

  useEffect(() => {
    titre.current?.focus({ preventScroll: true })
    return () => {
      jeton.current++
      abandon.current?.abort()
    }
  }, [])

  async function analyser(ev: ChangeEvent<HTMLInputElement>) {
    const fichier = ev.target.files?.[0]
    ev.target.value = '' // permet de rechoisir le même fichier après une erreur
    if (!fichier) return
    const moi = ++jeton.current
    abandon.current?.abort()
    const controleur = new AbortController()
    abandon.current = controleur
    setPhase({ type: 'analyse', fichier: fichier.name, fait: 0, total: 0 })
    try {
      const [resultat] = await Promise.all([
        lirePdf(fichier, (fait, total) => {
          if (jeton.current === moi) setPhase({ type: 'analyse', fichier: fichier.name, fait, total })
        }, controleur.signal),
        pause(DUREE_MIN_ANALYSE_MS),
      ])
      if (jeton.current !== moi) return
      setPhase({
        type: 'verification',
        nom: college ? college.nom : nomDepuisFichier(fichier.name),
        items: construireItems(resultat.entrees),
      })
    } catch (e) {
      if (jeton.current !== moi || (e instanceof DOMException && e.name === 'AbortError')) return
      const message =
        e instanceof ErreurPdf
          ? e.code === 'mise-a-jour'
            ? MESSAGE_MISE_A_JOUR
            : MESSAGE_PDF_ILLISIBLE
          : `L'analyse a échoué : ${e instanceof Error ? e.message : String(e)}`
      const detail = `${descriptionTechnique(e)} · fichier ${fichier.size} o, ${fichier.type || 'type inconnu'} · version ${VERSION_APP}`
      setPhase({ type: 'erreur', message, detail })
    }
  }

  function annuler() {
    jeton.current++
    abandon.current?.abort()
    onTermine(false)
  }

  function valider(nom: string, items: ItemExtrait[]) {
    // Ajouter ou réimporter un collège n'est pas une opération sur les créneaux : hors historique (§9.6).
    const ok = useStore
      .getState()
      .appliquerSansHistorique(
        (e) =>
          college && e.colleges[college.id]
            ? reimporterCollege(e, college.id, items)
            : ajouterCollege(e, nom, items),
        // Un réimport remplace les items : annuler ne doit pas ramener l'ancien état (ni ses créneaux).
        { viderHistorique: Boolean(college) },
      )
    if (!ok) return
    toast(`${college ? 'Collège réimporté' : 'Collège ajouté'} : ${college ? college.nom : nom} (${pluriel(items.length)})`)
    onTermine(true)
  }

  if (phase.type === 'verification') {
    return (
      <Verification
        items={phase.items}
        nomInitial={phase.nom}
        college={college}
        couleur={couleur}
        onAnnuler={annuler}
        onValider={valider}
      />
    )
  }

  const pct = phase.type === 'analyse' && phase.total > 0 ? Math.min(100, Math.round((phase.fait / phase.total) * 100)) : 0

  return (
    <section className="import" aria-labelledby="titre-import">
      <div className="carte import-carte">
        <h1 id="titre-import" ref={titre} tabIndex={-1}>
          {college ? `Réimporter ${college.nom}` : 'Importer un collège'}
        </h1>

        {phase.type === 'analyse' ? (
          <>
            <p className="aide" role="status">
              Analyse de {phase.fichier}
              {phase.total > 0 ? ` : page ${Math.min(phase.fait + 1, phase.total)} sur ${phase.total}` : '…'}
            </p>
            <div
              className="progression"
              role="progressbar"
              aria-label="Analyse du PDF"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              data-indetermine={phase.total === 0}
            >
              <span className="progression-trait" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <div className="import-actions">
              <button type="button" className="btn-texte" onClick={annuler}>
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            {phase.type === 'erreur' ? (
              <>
                <p className="bandeau-erreur bandeau-seul" role="alert">
                  {phase.message}
                </p>
                <details className="detail-technique">
                  <summary>Détail technique</summary>
                  <p data-testid="detail-technique">{phase.detail}</p>
                </details>
              </>
            ) : (
              <p className="aide">
                Choisis le PDF du collège : les items sont lus dans son sommaire. Le PDF n'est pas conservé, seuls les
                items le sont.
              </p>
            )}
            <input ref={entree} type="file" accept="application/pdf" hidden onChange={analyser} aria-label="Fichier PDF" />
            <div className="import-actions">
              <button type="button" className="btn-texte" onClick={annuler}>
                Annuler
              </button>
              <button type="button" className="btn-principal" onClick={() => entree.current?.click()}>
                {phase.type === 'erreur' ? 'Choisir un autre PDF' : 'Choisir un PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
