// Barre du mode sélection (spec §D.2, §D.4) : flottante et translucide en bas du calendrier, « N sélectionnés »,
// « Supprimer » (immédiat, annulable en un pas par ↶) et ✕. Échap quitte aussi. Elle entre et sort par ressort (fondu
// court en mouvement réduit). Un créneau sélectionné qui disparaît (↶, autre appareil) sort de la sélection. La sélection
// survit au changement de semaine : la barre dit alors combien de sélectionnés sont hors des jours affichés.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supprimerGroupe } from '../../domain/selection'
import { useGlisse } from '../dnd/glisse'
import { fondu, type Fondu } from '../mouvement/geste'
import { animerValeur, mouvementReduit, RESSORT_DOUX, type Anim } from '../mouvement/ressort'
import { useStore } from '../store'
import { toast } from '../Toast'
import { horsDeLaVue, quitterSelection, texteSelection, texteSuppression, useSelection } from './useSelection'
import './selection.css'

/** Course (px) de l'entrée par le bas. */
const ENTREE = 24

/** `jours` : jours affichés par la grille (`YYYY-MM-DD`). */
export function BarreSelection({ jours }: { jours: readonly string[] }) {
  const ids = useSelection((s) => s.ids)
  const creneaux = useStore((s) => s.etat.creneaux)
  const valides = useMemo(() => [...ids].filter((id) => creneaux[id]?.debut != null), [ids, creneaux])

  useEffect(() => {
    if (valides.length !== ids.size) useSelection.setState({ ids: new Set(valides) })
  }, [valides, ids])

  // La barre reste montée le temps de sa sortie (M12), avec le dernier contenu affiché.
  const visible = valides.length > 0
  const [montee, setMontee] = useState(visible)
  if (visible && !montee) setMontee(true)
  const contenu = useRef({ ids: valides, horsVue: 0 })
  if (visible) contenu.current = { ids: valides, horsVue: horsDeLaVue(valides, creneaux, jours) }
  const partie = useCallback(() => setMontee(false), [])

  if (!montee) return null
  return <Barre ids={contenu.current.ids} horsVue={contenu.current.horsVue} sortie={!visible} onPartie={partie} />
}

type PropsBarre = {
  ids: string[]
  horsVue: number
  /** La sélection est vide : la barre sort par où elle est entrée, puis `onPartie` la démonte. */
  sortie: boolean
  onPartie: () => void
}

function Barre({ ids, horsVue, sortie, onPartie }: PropsBarre) {
  const ref = useRef<HTMLDivElement>(null)
  const anim = useRef<Anim | null>(null)
  const fade = useRef<Fondu | null>(null)
  /** Avancée de la sortie : 0 en place, 1 sortie (24 px plus bas, transparente). */
  const avance = useRef(1)
  const sortieRef = useRef(sortie)
  sortieRef.current = sortie
  const partie = useRef(onPartie)
  partie.current = onPartie

  // Entrée : de 24 px plus bas et transparente, vers sa place, par ressort ; sortie : le même ressort en sens inverse
  // (interruptible : une nouvelle sélection la ramène). Mouvement réduit : fondus de 150 ms.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.toggleAttribute('inert', sortie)
    const cible = sortie ? 1 : 0
    if (mouvementReduit()) {
      fade.current?.arreter()
      fade.current = fondu(
        (o) => {
          avance.current = 1 - o
          el.style.opacity = o === 1 ? '' : String(o)
        },
        1 - avance.current,
        1 - cible,
        150,
        () => {
          if (sortieRef.current) partie.current()
        },
      )
      return () => fade.current?.arreter()
    }
    const poser = (p: number) => {
      avance.current = p
      el.style.transform = p === 0 ? '' : `translateY(${p * ENTREE}px)`
      el.style.opacity = p === 0 ? '' : String(1 - p)
    }
    // Repart de la position affichée (avant la première peinture : pas d'éclair à la place finale).
    poser(avance.current)
    anim.current = animerValeur(avance.current, RESSORT_DOUX, (p) => {
      poser(p)
      if (p === 1 && sortieRef.current) partie.current()
    })
    anim.current.vers(cible)
    return () => {
      anim.current?.arreter()
      anim.current = null
    }
  }, [sortie])

  // Échap quitte le mode (pas pendant un glisser, qu'Échap annule ; pas sous une feuille, qu'Échap ferme).
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || sortieRef.current || useGlisse.getState().source !== null) return
      if (document.querySelector('[role="dialog"]')) return
      quitterSelection()
    }
    window.addEventListener('keydown', clavier)
    return () => window.removeEventListener('keydown', clavier)
  }, [])

  const supprimer = () => {
    const liste = ids
    // Écriture refusée (store pas prêt…) : le mode reste ouvert, rien n'est perdu.
    if (!useStore.getState().appliquer((e) => supprimerGroupe(e, liste))) return
    quitterSelection()
    toast(texteSuppression(liste.length))
  }

  return (
    <div className="barre-selection-place">
      <div ref={ref} className="barre-selection" role="toolbar" aria-label="Sélection">
        <span className="barre-selection-nombre" aria-live="polite">
          {texteSelection(ids.length, horsVue)}
        </span>
        <button type="button" className="btn-principal barre-selection-supprimer" onClick={supprimer}>
          Supprimer
        </button>
        <button type="button" className="btn-icone" aria-label="Quitter la sélection" onClick={quitterSelection}>
          <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
