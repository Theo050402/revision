// Gestes de la grille hors dnd-kit (spec §9.3) : tap et appui long sur un emplacement libre, poignée de
// redimensionnement. Écouteurs posés sur `window` le temps du geste ; aucun état écrit à chaque mouvement
// du pointeur, seulement quand la minute magnétisée change.
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Intervalle } from '../../domain/cascade'
import { redimensionner } from '../../domain/actions-creneaux'
import { marquerGeste, useRedim } from '../dnd/glisse'
import { useStore } from '../store'
import { yVersMinutes } from './geometrie'

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

export type Trace = { jour: string; debut: number; fin: number; fini: boolean }

/**
 * Emplacement libre d'une colonne : un tap appelle `onTap(jour, t)` ; un appui long (150 ms) suivi d'un
 * étirement vertical dessine une indisponibilité (`onTrace`, puis `fini: true` au lâcher).
 */
export function useAppuiVide(
  jour: string,
  g: Geometrie,
  onTap: (jour: string, t: number) => void,
  onTrace: (t: Trace | null) => void,
) {
  const geo = useRef(g)
  geo.current = g
  const rappels = useRef({ onTap, onTrace })
  rappels.current = { onTap, onTrace }

  return useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary || e.button !== 0) return
      if ((e.target as HTMLElement).closest('.bloc, .poignee-redim, .fantome, .trace-indispo')) return
      const col = e.currentTarget
      const x0 = e.clientX
      const y0 = e.clientY
      const yCol = (y: number) => y - col.getBoundingClientRect().top
      const ancre = minuteTouchee(yCol(y0), geo.current)
      let actif = false
      // Étendue tracée : de l'emplacement touché jusqu'au doigt, vers le haut ou vers le bas, au moins un pas.
      const etendue = (y: number): [number, number] => {
        const { plage, pxHeure, pas } = geo.current
        const t = yVersMinutes(yCol(y), plage, pxHeure, pas)
        return [Math.min(ancre, t), Math.max(ancre + pas, t)]
      }
      let dernier = etendue(y0)

      const borner = (debut: number, f: number): Trace => {
        const { plage } = geo.current
        return { jour, debut: Math.max(plage.debut, debut), fin: Math.min(plage.fin, f), fini: false }
      }

      const minuterie = setTimeout(() => {
        actif = true
        marquerGeste(true)
        navigator.vibrate?.(8)
        rappels.current.onTrace(borner(...dernier))
      }, DELAI_APPUI_LONG)

      const arreter = suivrePointeur(e.pointerId, {
        move(m) {
          if (!actif) {
            if (Math.hypot(m.clientX - x0, m.clientY - y0) > TOLERANCE) {
              clearTimeout(minuterie)
              arreter()
            }
            return
          }
          const [d, f] = etendue(m.clientY)
          if (d === dernier[0] && f === dernier[1]) return
          dernier = [d, f]
          rappels.current.onTrace(borner(d, f))
        },
        up(u) {
          clearTimeout(minuterie)
          arreter()
          if (!actif) {
            rappels.current.onTap(jour, ancre)
            return
          }
          marquerGeste(false)
          rappels.current.onTrace({ ...borner(...etendue(u.clientY)), fini: true })
        },
        cancel() {
          clearTimeout(minuterie)
          arreter()
          if (actif) {
            marquerGeste(false)
            rappels.current.onTrace(null)
          }
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
    if (!e.isPrimary || e.button !== 0) return
    // Ni glisser du bloc (dnd-kit), ni tracé, ni balayage : la poignée garde le geste pour elle.
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
