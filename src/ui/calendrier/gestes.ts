// Gestes de la grille hors dnd-kit (spec §9.3, §D.1) : tap et appui long (lasso) sur un emplacement libre, poignée de
// redimensionnement. Écouteurs posés sur `window` le temps du geste ; aucun état écrit à chaque mouvement
// du pointeur, seulement quand la minute magnétisée change.
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Intervalle } from '../../domain/cascade'
import { redimensionner } from '../../domain/actions-creneaux'
import { marquerGeste, pointeurOccupe, useRedim } from '../dnd/glisse'
import { commencerLasso, type ControleLasso } from '../selection/zoneLasso'
import { useStore } from '../store'

/** Appui long (spec : 150 ms) et tolérance de mouvement avant activation (px), comme le capteur dnd-kit. */
export const DELAI_APPUI_LONG = 150
export const TOLERANCE = 6

type Geometrie = { plage: Intervalle; pxHeure: number; pas: number }

/** Créneau horaire touché : le pas qui contient `yCol` (et non le plus proche). */
function minuteTouchee(yCol: number, g: Geometrie): number {
  return g.plage.debut + Math.floor((yCol * 60) / g.pxHeure / g.pas) * g.pas
}

/** Écoute le reste d'un geste de pointeur sur `window` ; renvoie de quoi tout retirer. */
function suivrePointeur(
  id: number,
  h: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void },
): () => void {
  const move = (e: PointerEvent) => e.pointerId === id && h.move(e)
  const up = (e: PointerEvent) => e.pointerId === id && h.up(e)
  const cancel = (e: PointerEvent) => e.pointerId === id && h.cancel()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  return () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
  }
}

/**
 * Emplacement libre d'une colonne : un tap appelle `onTap(jour, t)` ; un appui long (150 ms) suivi d'un glisser trace
 * un lasso de sélection (spec §D.1, voir selection/zoneLasso.ts). Un doigt qui bouge avant l'appui long défile : rien.
 */
export function useAppuiVide(jour: string, g: Geometrie, onTap: (jour: string, t: number) => void) {
  const geo = useRef(g)
  geo.current = g
  const rappel = useRef(onTap)
  rappel.current = onTap

  return useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary || e.button !== 0 || pointeurOccupe()) return
      if ((e.target as HTMLElement).closest('.bloc, .poignee-redim, .atterrissage')) return
      const col = e.currentTarget
      const id = e.pointerId
      const x0 = e.clientX
      const y0 = e.clientY
      const ancre = minuteTouchee(y0 - col.getBoundingClientRect().top, geo.current)
      let lasso: ControleLasso | null = null

      const minuterie = setTimeout(() => {
        lasso = commencerLasso(col, x0, y0, id)
      }, DELAI_APPUI_LONG)

      const arreter = suivrePointeur(id, {
        move(m) {
          if (lasso) return lasso.deplacer(m.clientX, m.clientY)
          if (Math.hypot(m.clientX - x0, m.clientY - y0) > TOLERANCE) {
            clearTimeout(minuterie)
            arreter()
          }
        },
        up(u) {
          clearTimeout(minuterie)
          arreter()
          if (lasso) lasso.finir(u.clientX, u.clientY)
          else rappel.current(jour, ancre)
        },
        cancel() {
          clearTimeout(minuterie)
          arreter()
          lasso?.annuler()
        },
      })
    },
    [jour],
  )
}

/**
 * Poignée du bord bas d'un créneau : la durée suit le doigt au pas de la grille, bornée comme au lâcher
 * (`redimensionner` : au moins un pas, jusqu'au bloc suivant ou à la fin de la journée). Rien n'est écrit
 * avant le lâcher, qui passe par `appliquer` (une étape d'annulation).
 */
export function useRedimension(g: Geometrie) {
  const geo = useRef(g)
  geo.current = g
  return useCallback((e: ReactPointerEvent<HTMLElement>, id: string, duree0: number) => {
    if (!e.isPrimary || e.button !== 0 || pointeurOccupe()) return
    // Ni glisser du bloc (dnd-kit), ni lasso, ni balayage : la poignée garde le geste pour elle.
    e.stopPropagation()
    e.preventDefault()
    const y0 = e.clientY
    let duree = duree0
    marquerGeste(true)
    useRedim.setState({ id, duree })

    const arreter = suivrePointeur(e.pointerId, {
      move(m) {
        const { pxHeure, pas } = geo.current
        const voulue = duree0 + Math.round(((m.clientY - y0) * 60) / pxHeure / pas) * pas
        const etat = useStore.getState().etat
        const d = redimensionner(etat, id, voulue).creneaux[id]?.duree ?? duree0
        if (d === duree) return
        duree = d
        useRedim.setState({ id, duree })
      },
      up() {
        arreter()
        marquerGeste(false)
        if (duree !== duree0) useStore.getState().appliquer((s) => redimensionner(s, id, duree))
        useRedim.setState({ id: null, duree: 0 })
      },
      cancel() {
        arreter()
        marquerGeste(false)
        useRedim.setState({ id: null, duree: 0 })
      },
    })
  }, [])
}
