// Réglages › Indisponibilités (spec §10) : récurrences (liste, création, modification, suppression), import
// d'un fichier .ics, et liste des créneaux qui chevauchent une indisponibilité (en orange, jamais bloquante).
// Tout passe par `appliquer` : annulable avec ↶ (spec §9.6).
import { useRef, useState } from 'react'
import { libelleSuppression } from '../../../domain/actions-creneaux'
import { enregistrerRecurrence, importerIndisposIcs, supprimerRecurrence } from '../../../domain/actions-etat'
import { ajouterJours, hm } from '../../../domain/temps'
import type { Recurrence } from '../../../domain/types'
import { validerRecurrence } from '../../../domain/validation'
import { heureCourte } from '../../calendrier/Bloc'
import { useAujourdhui } from '../../calendrier/maintenant'
import { Feuille } from '../../Feuille'
import { dateCourte } from '../../feuilles/format'
import { useStore } from '../../store'
import { toast } from '../../Toast'
import { libelleConflit, lireFichierIcs, phraseIgnores, resumerConflits } from '../reglagesLogique'
import { Champ } from './Champ'

const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** « lun. → ven. » pour une suite d'au moins trois jours, sinon « lun., mer. ». */
function libelleJours(jours: number[]): string {
  const tri = [...jours].sort((a, b) => a - b)
  const suite = tri.length >= 3 && tri.every((j, i) => i === 0 || j === tri[i - 1] + 1)
  return suite
    ? `${JOURS_COURTS[tri[0] - 1]} → ${JOURS_COURTS[tri[tri.length - 1] - 1]}`
    : tri.map((j) => JOURS_COURTS[j - 1]).join(', ')
}

const heureLisible = (h: string): string => heureCourte(hm(h))

export function Indispos({ recurrenceInitiale }: { recurrenceInitiale: string | null }) {
  const recurrences = useStore((s) => s.etat.recurrences)
  const etat = useStore((s) => s.etat)
  const aujourdhui = useAujourdhui()
  const [edition, setEdition] = useState<Recurrence | 'nouvelle' | null>(() =>
    recurrenceInitiale !== null && recurrences[recurrenceInitiale] ? recurrences[recurrenceInitiale] : null,
  )
  const [retourIcs, setRetourIcs] = useState<{ erreur: boolean; lignes: string[] } | null>(null)
  const champIcs = useRef<HTMLInputElement>(null)

  const liste = Object.values(recurrences).sort((a, b) => a.titre.localeCompare(b.titre, 'fr') || a.du.localeCompare(b.du))
  const conflits = resumerConflits(etat)

  const importer = async (fichier: File | undefined) => {
    if (champIcs.current) champIcs.current.value = ''
    if (!fichier) return
    let texte = ''
    try {
      texte = await fichier.text()
    } catch {
      /* texte vide : illisible ci-dessous */
    }
    const lecture = lireFichierIcs(texte, aujourdhui)
    if (!lecture.ok) {
      setRetourIcs({ erreur: true, lignes: ["Ce fichier de calendrier n'a pas pu être lu."] })
      return
    }
    const lignes: string[] = []
    if (lecture.evenements.length > 0) {
      useStore.getState().appliquer((e) => importerIndisposIcs(e, fichier.name, lecture.evenements))
      const n = lecture.evenements.length
      lignes.push(n === 1 ? '1 indisponibilité importée.' : `${n} indisponibilités importées.`)
    } else {
      lignes.push('Aucun événement à importer dans ce fichier.')
    }
    if (lecture.ignores > 0) lignes.push(phraseIgnores(lecture.ignores))
    setRetourIcs({ erreur: false, lignes })
  }

  const supprimer = (r: Recurrence) => {
    useStore.getState().appliquer((e) => supprimerRecurrence(e, r.id))
    toast(`Récurrence « ${r.titre} » supprimée.`)
  }

  return (
    <section className="carte reglage" aria-labelledby="titre-indispos">
      <h2 id="titre-indispos">Indisponibilités</h2>
      <p className="aide">
        Les ponctuelles s'ajoutent avec « + Indisponibilité », dans la barre du calendrier.
      </p>

      {liste.length > 0 && (
        <ul className="liste-reglage" aria-label="Récurrences">
          {liste.map((r) => (
            <li key={r.id} className="ligne-reglage">
              <div className="ligne-texte">
                <b>{r.titre}</b>
                <span className="aide">
                  {libelleJours(r.jours)} · {heureLisible(r.heureDebut)}–{heureLisible(r.heureFin)} · du {dateCourte(r.du)} au {dateCourte(r.au)}
                </span>
              </div>
              <div className="ligne-actions">
                <button type="button" className="btn-texte" aria-label={`Modifier ${r.titre}`} onClick={() => setEdition(r)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn-texte btn-danger-texte"
                  aria-label={`Supprimer ${r.titre}`}
                  onClick={() => supprimer(r)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rangee-boutons">
        <button type="button" className="btn-ajout" onClick={() => setEdition('nouvelle')}>
          + Récurrence
        </button>
        <button type="button" className="btn-secondaire" onClick={() => champIcs.current?.click()}>
          Importer un fichier
        </button>
        <input
          ref={champIcs}
          type="file"
          accept=".ics,text/calendar"
          hidden
          data-champ="ics"
          onChange={(e) => void importer(e.target.files?.[0])}
        />
      </div>
      <p className="aide">
        Un fichier .ics (calendrier de la fac, par exemple) devient des blocs verrouillés ; le réimporter remplace ses blocs.
      </p>

      {retourIcs && (
        <div
          className={retourIcs.erreur ? 'encart message-erreur-bloc' : 'encart message-info'}
          data-ton={retourIcs.erreur ? 'erreur' : 'info'}
          role={retourIcs.erreur ? 'alert' : 'status'}
        >
          {retourIcs.lignes.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}

      {conflits.length > 0 && (
        <div className="encart conflits" data-ton="avertissement" role="status" data-testid="conflits">
          {conflits.map((c) => (
            <div key={c.titre} className="conflit">
              <b>{libelleConflit(c)}</b>
              <ul>
                {c.creneauIds.map((id) => (
                  <li key={id}>{libelleSuppression(etat, etat.creneaux[id])}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="aide">Déplace-les toi-même : les indisponibilités sont créées quand même.</p>
        </div>
      )}

      {edition !== null && (
        <FormulaireRecurrence
          // Un formulaire neuf par récurrence éditée (le brouillon part de ses valeurs).
          key={edition === 'nouvelle' ? 'nouvelle' : edition.id}
          initiale={edition === 'nouvelle' ? null : edition}
          aujourdhui={aujourdhui}
          onFermer={() => setEdition(null)}
        />
      )}
    </section>
  )
}

function FormulaireRecurrence({
  initiale,
  aujourdhui,
  onFermer,
}: {
  initiale: Recurrence | null
  aujourdhui: string
  onFermer: () => void
}) {
  const [titre, setTitre] = useState(initiale?.titre ?? '')
  const [jours, setJours] = useState<number[]>(initiale?.jours ?? [1, 2, 3, 4, 5])
  const [heureDebut, setHeureDebut] = useState(initiale?.heureDebut ?? '08:00')
  const [heureFin, setHeureFin] = useState(initiale?.heureFin ?? '12:00')
  const [du, setDu] = useState(initiale?.du ?? aujourdhui)
  const [au, setAu] = useState(initiale?.au ?? ajouterJours(aujourdhui, 41))

  const erreurs = validerRecurrence({ titre, jours, heureDebut, heureFin, du, au })
  const invalide = Object.keys(erreurs).length > 0

  const basculer = (j: number) => setJours((l) => (l.includes(j) ? l.filter((x) => x !== j) : [...l, j].sort((a, b) => a - b)))

  const enregistrer = () => {
    if (invalide) return
    const r: Recurrence = {
      id: initiale?.id ?? crypto.randomUUID(),
      titre: titre.trim(),
      jours,
      heureDebut,
      heureFin,
      du,
      au,
    }
    useStore.getState().appliquer((e) => enregistrerRecurrence(e, r))
    onFermer()
  }

  return (
    <Feuille titre={initiale ? 'Modifier la récurrence' : 'Nouvelle récurrence'} onFermer={onFermer} className="feuille-etroite">
      <form
        className="fiche"
        onSubmit={(ev) => {
          ev.preventDefault()
          enregistrer()
        }}
      >
        <div className="fiche-champ">
          <label className="etiquette" htmlFor="rec-titre">
            Titre
          </label>
          <input
            id="rec-titre"
            className="champ"
            value={titre}
            placeholder="Stage, cours, sport…"
            autoComplete="off"
            aria-invalid={erreurs.titre !== undefined || undefined}
            onChange={(e) => setTitre(e.target.value)}
          />
          {erreurs.titre && titre !== '' && <p className="message-erreur">{erreurs.titre}</p>}
        </div>

        <div className="fiche-champ" role="group" aria-labelledby="rec-jours">
          <span className="etiquette" id="rec-jours">
            Jours
          </span>
          <div className="jours-semaine">
            {JOURS_LONGS.map((nom, i) => (
              <button
                key={nom}
                type="button"
                className="jour-bouton"
                aria-label={nom}
                aria-pressed={jours.includes(i + 1)}
                onClick={() => basculer(i + 1)}
              >
                {LETTRES[i]}
              </button>
            ))}
          </div>
          {erreurs.jours && <p className="message-erreur">{erreurs.jours}</p>}
        </div>

        <div className="grille-champs">
          <Champ etiquette="De" type="time" value={heureDebut} onChange={setHeureDebut} />
          <Champ etiquette="À" type="time" value={heureFin} onChange={setHeureFin} />
        </div>
        {erreurs.heures && <p className="message-erreur">{erreurs.heures}</p>}

        <div className="grille-champs">
          <Champ etiquette="Du" type="date" value={du} onChange={setDu} />
          <Champ etiquette="Au" type="date" value={au} onChange={setAu} />
        </div>
        {erreurs.dates && <p className="message-erreur">{erreurs.dates}</p>}

        <div className="feuille-actions">
          <button type="button" className="btn-texte" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="btn-principal" disabled={invalide}>
            Enregistrer
          </button>
        </div>
      </form>
    </Feuille>
  )
}
