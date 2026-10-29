import type { ReactNode } from 'react'
import type { Ecran, Vue } from './ecran'
import { nomDuMois, numeroSemaine } from './periode'
import type { Disposition } from './useDisposition'

const VUES: ReadonlyArray<{ vue: Vue; libelle: string }> = [
  { vue: 'semaine', libelle: 'Semaine' },
  { vue: 'jour', libelle: 'Jour' },
  { vue: 'mois', libelle: 'Mois' },
]

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

type Props = {
  disposition: Disposition
  /** Jour affiché `YYYY-MM-DD` : sert au titre (mois) et au numéro de semaine. */
  jour: string
  vue: Vue
  onVue: (v: Vue) => void
  ecran: Ecran
  onReglages: () => void
  peutAnnuler: boolean
  peutRetablir: boolean
  onAnnuler: () => void
  onRetablir: () => void
  /** iPad seulement : le panneau de la bibliothèque est-il déplié ? */
  panneauOuvert: boolean
  onItems: () => void
  /** Bouton Exporter (`export/BoutonExport`). Par défaut : bouton inactif. */
  exporter?: ReactNode
}

export function BarreHaut(p: Props) {
  return (
    <header className="barre" data-dispo={p.disposition}>
      {p.disposition === 'ipad' && (
        <button
          type="button"
          className="btn-icone barre-items"
          aria-label="Items"
          aria-controls="panneau-bibliotheque"
          aria-expanded={p.panneauOuvert}
          onClick={p.onItems}
        >
          <Icone>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </Icone>
        </button>
      )}

      <div className="barre-titre">
        <span className="mois">
          <span className="surligneur">{nomDuMois(p.jour)}</span>
        </span>
        <span className="semaine">semaine {numeroSemaine(p.jour)}</span>
      </div>

      <div className="barre-historique">
        <button type="button" className="btn-icone" aria-label="Annuler" disabled={!p.peutAnnuler} onClick={p.onAnnuler}>
          <Icone>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </Icone>
        </button>
        <button type="button" className="btn-icone" aria-label="Rétablir" disabled={!p.peutRetablir} onClick={p.onRetablir}>
          <Icone>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </Icone>
        </button>
      </div>

      <div className="segments barre-vues" role="group" aria-label="Vue du calendrier">
        {VUES.map(({ vue, libelle }) => (
          <button
            key={vue}
            type="button"
            className="segment"
            aria-pressed={p.ecran === 'calendrier' && p.vue === vue}
            onClick={() => p.onVue(vue)}
          >
            {libelle}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn-icone barre-reglages"
        aria-label="Réglages"
        aria-pressed={p.ecran === 'reglages'}
        onClick={p.onReglages}
      >
        <Icone>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </Icone>
      </button>

      <div className="barre-export" data-emplacement="exporter">
        {p.exporter ?? (
          <button type="button" className="btn-principal" disabled>
            Exporter
          </button>
        )}
      </div>
    </header>
  )
}
