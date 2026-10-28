// Réglages : pour l'instant seulement « Apparence ». Le reste de l'écran (rythme, journée,
// données…) arrive avec la tâche 19.
import { modifierReglages } from '../../domain/actions-etat'
import type { Reglages as ReglagesEtat } from '../../domain/types'
import { useStore } from '../store'

const THEMES: ReadonlyArray<{ valeur: ReglagesEtat['theme']; libelle: string }> = [
  { valeur: 'auto', libelle: 'Auto' },
  { valeur: 'clair', libelle: 'Clair' },
  { valeur: 'sombre', libelle: 'Sombre' },
]

export function Reglages({ onRetour }: { onRetour: () => void }) {
  const theme = useStore((s) => s.etat.reglages.theme)
  // Les réglages ne sont pas annulables (spec §9.6) : hors historique.
  const appliquer = useStore((s) => s.appliquerSansHistorique)

  return (
    <section className="ecran" aria-labelledby="titre-reglages">
      <div className="ecran-entete">
        <h1 id="titre-reglages">Réglages</h1>
        <button type="button" className="btn-texte" onClick={onRetour}>
          Retour au calendrier
        </button>
      </div>

      <div className="carte">
        <h2 id="titre-apparence">Apparence</h2>
        <p className="aide">« Auto » suit le réglage de l'appareil.</p>
        <div className="segments" role="group" aria-labelledby="titre-apparence">
          {THEMES.map(({ valeur, libelle }) => (
            <button
              key={valeur}
              type="button"
              className="segment"
              aria-pressed={theme === valeur}
              onClick={() => {
                if (valeur !== theme) appliquer((e) => modifierReglages(e, { theme: valeur }))
              }}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
