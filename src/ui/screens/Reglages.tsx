// Réglages (spec §11) : Durées, Journée, Indisponibilités, Collèges, Export, Apparence, Données.
// Les réglages, les collèges et la restauration ne sont pas annulables (spec §9.6) : `appliquerSansHistorique`.
import { modifierReglages } from '../../domain/actions-etat'
import type { Reglages as ReglagesEtat } from '../../domain/types'
import { sauvegarder } from '../sauvegarde'
import { useStore } from '../store'
import { Colleges } from './reglages/Colleges'
import { Durees, Journee } from './reglages/Durees'
import { Indispos } from './reglages/Indispos'
import { Restauration } from './Restauration'
import { VERSION_APP } from '../../version'
import './reglages.css'

const THEMES: ReadonlyArray<{ valeur: ReglagesEtat['theme']; libelle: string }> = [
  { valeur: 'auto', libelle: 'Auto' },
  { valeur: 'clair', libelle: 'Clair' },
  { valeur: 'sombre', libelle: 'Sombre' },
]

const RAPPELS: ReadonlyArray<{ valeur: ReglagesEtat['rappel']; libelle: string }> = [
  { valeur: 0, libelle: 'Aucun' },
  { valeur: 5, libelle: '5 min' },
  { valeur: 15, libelle: '15 min' },
  { valeur: 30, libelle: '30 min' },
]

export const MESSAGE_PERSISTANCE =
  "Pense à sauvegarder régulièrement : iOS peut effacer les données de l'app si l'espace manque."

type Props = {
  onRetour: () => void
  /** Récurrence à ouvrir en modification (depuis la fiche d'un bloc récurrent). */
  recurrenceInitiale?: string | null
}

export function Reglages({ onRetour, recurrenceInitiale = null }: Props) {
  const reglages = useStore((s) => s.etat.reglages)
  const persistance = useStore((s) => s.persistance)
  const appliquer = useStore((s) => s.appliquerSansHistorique)

  const choisir = (champs: Partial<ReglagesEtat>) => appliquer((e) => modifierReglages(e, champs))

  return (
    <section className="ecran ecran-reglages" aria-labelledby="titre-reglages">
      <div className="ecran-entete">
        <h1 id="titre-reglages">Réglages</h1>
        <button type="button" className="btn-texte" onClick={onRetour}>
          Retour au calendrier
        </button>
      </div>

      <Durees />
      <Journee />
      <Indispos recurrenceInitiale={recurrenceInitiale} />
      <Colleges />

      <section className="carte reglage" aria-labelledby="titre-export">
        <h2 id="titre-export">Export</h2>
        <p className="aide">Rappel ajouté à chaque événement du prochain export vers le Calendrier.</p>
        <div className="segments" role="group" aria-labelledby="titre-export">
          {RAPPELS.map(({ valeur, libelle }) => (
            <button
              key={valeur}
              type="button"
              className="segment"
              aria-pressed={reglages.rappel === valeur}
              onClick={() => reglages.rappel !== valeur && choisir({ rappel: valeur })}
            >
              {libelle}
            </button>
          ))}
        </div>
      </section>

      <section className="carte reglage" aria-labelledby="titre-apparence">
        <h2 id="titre-apparence">Apparence</h2>
        <p className="aide">« Auto » suit le réglage de l'appareil.</p>
        <div className="segments" role="group" aria-labelledby="titre-apparence">
          {THEMES.map(({ valeur, libelle }) => (
            <button
              key={valeur}
              type="button"
              className="segment"
              aria-pressed={reglages.theme === valeur}
              onClick={() => reglages.theme !== valeur && choisir({ theme: valeur })}
            >
              {libelle}
            </button>
          ))}
        </div>
      </section>

      <section className="carte reglage" aria-labelledby="titre-donnees">
        <h2 id="titre-donnees">Données</h2>
        <p className="aide">
          Tout reste sur cet appareil. Une sauvegarde est un fichier que tu peux ranger dans Fichiers ou t'envoyer par AirDrop.
        </p>
        {persistance === false && (
          <p className="message-info" data-testid="rappel-persistance">
            {MESSAGE_PERSISTANCE}
          </p>
        )}
        <div className="rangee-boutons">
          <button type="button" className="btn-principal" onClick={() => void sauvegarder()}>
            Sauvegarder
          </button>
          <Restauration />
        </div>
        <p className="aide" data-testid="version-app">
          Version de l'app : {VERSION_APP}
        </p>
      </section>
    </section>
  )
}
