// Zone du calendrier : barre de navigation (précédent / Aujourd'hui / suivant), balayage horizontal
// pour changer de période, et la vue choisie (Semaine, Jour ou Mois).
import { useEffect, useMemo, useRef, useSyncExternalStore, type PointerEvent } from 'react'
import { ajouterJours } from '../../domain/temps'
import { enregistrerChangementPeriode } from '../dnd/bords'
import { Corbeille } from '../dnd/Corbeille'
import { gesteDepuis } from '../dnd/glisse'
import type { Vue } from '../ecran'
import { ajouterMois, joursDeLaSemaine, libellePeriode } from '../periode'
import type { Disposition } from '../useDisposition'
import { Grille } from './Grille'
import { PX_HEURE_IPAD, PX_HEURE_IPHONE } from './geometrie'
import { useAujourdhui } from './maintenant'
import { VueMois } from './VueMois'
import './calendrier.css'

type Props = {
  vue: Vue
  /** Jour affiché (pilote le titre de la barre du haut). */
  jour: string
  disposition: Disposition
  onJour: (jour: string) => void
  /** Ouvre un jour dans la vue Jour (tap sur un carreau du mois). */
  onOuvrirJour: (jour: string) => void
  /** Tap sur un emplacement libre de la grille (« Pour combler ce trou »). */
  onTapTrou?: (jour: string, t: number) => void
  /** Tap sur un créneau ou une indisponibilité (fiches : tâche 19). */
  onOuvrirCreneau?: (id: string) => void
  onOuvrirIndispo?: (id: string) => void
}

/** iPhone en paysage : la vue Jour montre trois jours (spec §9.1). */
const requetePaysage = '(orientation: landscape) and (min-width: 600px) and (max-width: 899px)'

function abonnerPaysage(rappel: () => void): () => void {
  const media = window.matchMedia(requetePaysage)
  media.addEventListener('change', rappel)
  return () => media.removeEventListener('change', rappel)
}

const SEUIL_BALAYAGE = 60

/**
 * Balayage horizontal au doigt ou au stylet. Le conteneur déclare `touch-action: pan-y` : le navigateur
 * ne garde que le défilement vertical, les mouvements horizontaux arrivent ici jusqu'au `pointerup`.
 */
function useBalayage(precedent: () => void, suivant: () => void) {
  // Un geste de la grille (glisser un créneau, redimensionner, tracer) commencé après le `pointerdown` l'annule.
  const depart = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return
      depart.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    },
    onPointerUp(e: PointerEvent) {
      const d = depart.current
      depart.current = null
      if (!d || d.id !== e.pointerId || gesteDepuis(d.t)) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (Math.abs(dx) < SEUIL_BALAYAGE || Math.abs(dx) < 1.5 * Math.abs(dy)) return
      if (dx < 0) suivant()
      else precedent()
    },
    onPointerCancel() {
      depart.current = null
    },
  }
}

export function Calendrier({ vue, jour, disposition, onJour, onOuvrirJour, onTapTrou, onOuvrirCreneau, onOuvrirIndispo }: Props) {
  const aujourdhui = useAujourdhui()
  const paysage = useSyncExternalStore(abonnerPaysage, () => window.matchMedia(requetePaysage).matches)

  const nbJours = vue === 'semaine' ? 7 : vue === 'jour' ? (disposition === 'iphone' && paysage ? 3 : 1) : 0
  const jours = useMemo(
    () => (vue === 'semaine' ? joursDeLaSemaine(jour) : vue === 'jour' ? Array.from({ length: nbJours }, (_, i) => ajouterJours(jour, i)) : [jour]),
    [vue, jour, nbJours],
  )
  // 48 px/h partout, 56 en vue Jour sur iPhone (voir geometrie.ts).
  const pxHeure = disposition === 'iphone' && vue === 'jour' ? PX_HEURE_IPHONE : PX_HEURE_IPAD

  const decaler = (sens: 1 | -1) =>
    onJour(vue === 'mois' ? ajouterMois(jour, sens) : ajouterJours(jour, sens * (vue === 'semaine' ? 7 : nbJours)))
  const precedent = () => decaler(-1)
  const suivant = () => decaler(1)
  const balayage = useBalayage(precedent, suivant)

  // Pendant un glisser, le doigt tenu contre le bord gauche ou droit de la grille change de période (spec §C.2) :
  // une semaine en vue Semaine, un jour en vue Jour (même sur trois jours : on avance jour par jour) ; rien en vue Mois.
  const deplacer = useRef((_sens: 1 | -1) => {})
  deplacer.current = (sens) => onJour(ajouterJours(jour, sens * (vue === 'semaine' ? 7 : 1)))
  useEffect(() => enregistrerChangementPeriode(vue === 'mois' ? null : (sens) => deplacer.current(sens)), [vue])

  const unite = vue === 'semaine' ? 'semaine' : vue === 'jour' ? (nbJours > 1 ? 'période' : 'jour') : 'mois'
  const genre = unite === 'semaine' || unite === 'période' ? ['précédente', 'suivante'] : ['précédent', 'suivant']
  const aujourdhuiVisible = vue === 'mois' ? jour.slice(0, 7) === aujourdhui.slice(0, 7) : jours.includes(aujourdhui)

  return (
    <section className="calendrier" aria-label="Calendrier" data-vue={vue}>
      <div className="calendrier-barre">
        <button type="button" className="btn-icone" aria-label={`${capitale(unite)} ${genre[0]}`} onClick={precedent}>
          <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <button type="button" className="btn-aujourdhui" data-actif={aujourdhuiVisible} onClick={() => onJour(aujourdhui)}>
          Aujourd'hui
        </button>
        <button type="button" className="btn-icone" aria-label={`${capitale(unite)} ${genre[1]}`} onClick={suivant}>
          <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <p className="calendrier-periode" aria-live="polite">
          {libellePeriode(vue, jours)}
        </p>
      </div>

      <div className="calendrier-defilement" {...balayage}>
        {vue === 'mois' ? (
          <VueMois mois={jour.slice(0, 7)} onOuvrirJour={onOuvrirJour} />
        ) : (
          // La clé fait repartir le défilement à zéro (ou sur « maintenant ») quand on change de vue.
          <Grille
            key={`${vue}-${nbJours}`}
            jours={jours}
            pxHeure={pxHeure}
            onTapTrou={onTapTrou}
            onOuvrirCreneau={onOuvrirCreneau}
            onOuvrirIndispo={onOuvrirIndispo}
          />
        )}
      </div>
      <Corbeille />
    </section>
  )
}

const capitale = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
