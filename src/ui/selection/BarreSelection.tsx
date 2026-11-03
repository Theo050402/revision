// Barre du mode sélection (spec §D.2, §D.4) : flottante et translucide en bas du calendrier, « N sélectionnés »,
// « Supprimer » (immédiat, annulable en un pas par ↶) et ✕. Échap quitte aussi. Elle entre par ressort (fondu court
// en mouvement réduit). Un créneau sélectionné qui disparaît (↶, autre appareil) sort de la sélection. La sélection
// survit au changement de semaine : la barre dit alors combien de sélectionnés sont hors des jours affichés.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { supprimerGroupe } from '../../domain/selection'
import { useGlisse } from '../dnd/glisse'
import { fondu } from '../mouvement/geste'
import { animerValeur, mouvementReduit, RESSORT_DOUX } from '../mouvement/ressort'
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

  if (valides.length === 0) return null
  return <Barre ids={valides} horsVue={horsDeLaVue(valides, creneaux, jours)} />
}

function Barre({ ids, horsVue }: { ids: string[]; horsVue: number }) {
  const ref = useRef<HTMLDivElement>(null)

  // Entrée : de 24 px plus bas et transparente, vers sa place, par ressort ; fondu de 150 ms en mouvement réduit.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (mouvementReduit()) {
      const f = fondu((o) => (el.style.opacity = String(o)), 0, 1, 150, () => (el.style.opacity = ''))
      return () => f.arreter()
    }
    const anim = animerValeur(1, RESSORT_DOUX, (p) => {
      el.style.transform = p === 0 ? '' : `translateY(${p * ENTREE}px)`
      el.style.opacity = p === 0 ? '' : String(1 - p)
    })
    anim.vers(0)
    return () => anim.arreter()
  }, [])

  // Échap quitte le mode (pas pendant un glisser, qu'Échap annule ; pas sous une feuille, qu'Échap ferme).
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useGlisse.getState().source !== null) return
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
