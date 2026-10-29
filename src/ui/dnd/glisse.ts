// État du geste en cours (glisser-déposer, redimensionnement, tracé d'indisponibilité), hors du store de
// l'application : rien ici n'est persisté ni annulable. La grille et la corbeille s'y abonnent ; seul l'aperçu
// change pendant le geste, et uniquement quand la minute magnétisée, la cible ou la moitié changent.
import { create } from 'zustand'
import type { Cible } from '../../domain/actions-creneaux'
import { jourDe, minutesDe } from '../../domain/temps'
import type { Creneau } from '../../domain/types'
import type { Apercu, Source } from './apercu'

export type { Source } from './apercu'

/** Ce qui est sous le doigt. */
export type Survol =
  | { type: 'colonne'; cible: Cible }
  | { type: 'mois'; jour: string; cible: Cible | null }
  | { type: 'corbeille' }
  | null

export type Glisse = {
  /** Source du glisser en cours (null : aucun). */
  source: Source | null
  /** Le glisser est parti de la feuille de la bibliothèque (iPhone) : elle s'efface pendant le geste. */
  depuisFeuille: boolean
  /** Décalage vertical (px) entre le doigt et le haut du bloc saisi : le bloc ne saute pas sous le doigt. */
  prise: number
  survol: Survol
  apercu: Apercu | null
  /** Créneau que dessine le fantôme quand l'aperçu n'en donne pas (refus) : calculé une fois au début. */
  fantome: Creneau | null
}

export const GLISSE_VIDE: Glisse = { source: null, depuisFeuille: false, prise: 0, survol: null, apercu: null, fantome: null }

export const useGlisse = create<Glisse>()(() => GLISSE_VIDE)

/** Redimensionnement en cours : la durée prévue s'affiche, rien n'est écrit avant le lâcher. */
export const useRedim = create<{ id: string | null; duree: number }>()(() => ({ id: null, duree: 0 }))

// ───────────────── Geste en cours (balayage, défilement) ─────────────────

let gesteActif = false
let dernierGeste = -Infinity

/**
 * Un geste (glisser, redimensionnement, tracé) commence ou finit. Pendant qu'il dure, le défilement tactile
 * est bloqué (voir `bloquerDefilement`) ; après, le balayage horizontal de la grille l'ignore.
 */
export function marquerGeste(actif: boolean): void {
  gesteActif = actif
  dernierGeste = performance.now()
}

/** Vrai si un geste a eu lieu (ou dure encore) depuis l'instant `t` (`performance.now()`). */
export function gesteDepuis(t: number): boolean {
  return gesteActif || dernierGeste >= t
}

/**
 * iOS Safari : une fois le geste activé (après l'appui long), le premier `touchmove` est annulé pour que le
 * navigateur ne fasse pas défiler la grille ou la bibliothèque (ce qui enverrait `pointercancel`). L'écouteur
 * doit être non passif ; il ne fait rien hors d'un geste.
 */
export function bloquerDefilement(): () => void {
  const bloquer = (e: TouchEvent) => {
    if (gesteActif && e.cancelable) e.preventDefault()
  }
  window.addEventListener('touchmove', bloquer, { passive: false })
  return () => window.removeEventListener('touchmove', bloquer)
}

// ───────────────── Un seul pointeur par geste ─────────────────

/** Pointeur qui a saisi (appui long en attente ou glisser en cours) ; null : aucun. */
let pointeurSaisi: number | null = null

export function saisirPointeur(id: number | null): void {
  pointeurSaisi = id
}

/**
 * Le capteur de dnd-kit écoute tous les pointeurs du document : un deuxième doigt, la paume ou un trackpad qui
 * bouge annulerait l'appui long (tolérance dépassée), et un pointeur levé terminerait le glisser. Pendant un geste,
 * les événements des autres pointeurs sont arrêtés à la capture sur `window`, avant d'atteindre le document.
 */
export function filtrerPointeurs(): () => void {
  const filtrer = (e: PointerEvent) => {
    if (pointeurSaisi !== null && e.pointerId !== pointeurSaisi) e.stopImmediatePropagation()
  }
  const types = ['pointermove', 'pointerup', 'pointercancel'] as const
  for (const t of types) window.addEventListener(t, filtrer, { capture: true })
  return () => {
    for (const t of types) window.removeEventListener(t, filtrer, { capture: true })
  }
}

/** Un pointeur a déjà saisi : un autre `pointerdown` ne doit rien démarrer ni remplacer. */
export function pointeurOccupe(): boolean {
  return pointeurSaisi !== null
}

// ───────────────── Aperçu vu depuis une colonne ─────────────────

export type FantomeColonne = { creneau: Creneau; debut: number; refus: boolean }
export type ApercuColonne = {
  /** Créneau glissé (estompé à sa place d'origine), quel que soit le jour visé. */
  idSource: string | null
  /** Créneaux de ce jour qui s'écartent : nouveau début (minutes). */
  debuts: Record<string, number>
  fantomes: FantomeColonne[]
  refus: boolean
}

/**
 * Ce que l'aperçu change dans une colonne : les créneaux de ce jour qui s'écartent, les fantômes posés ce jour-là
 * (sinon, en cas de refus, le créneau glissé à l'heure visée) et la teinte de refus.
 */
export function apercuColonne(s: Glisse, jour: string): ApercuColonne {
  const { source, apercu: vu, fantome } = s
  const idSource = source?.type === 'creneau' ? source.id : null
  const debuts: Record<string, number> = {}
  const fantomes: FantomeColonne[] = []
  const survol = s.survol?.type === 'colonne' && s.survol.cible.jour === jour ? s.survol : null
  if (vu?.ok) {
    for (const [id, debut] of Object.entries(vu.positions)) {
      if (id !== idSource && jourDe(debut) === jour && !id.startsWith('apercu-')) debuts[id] = minutesDe(debut)
    }
  }
  if (survol && source) {
    if (vu?.ok) {
      if (idSource !== null) {
        const debut = vu.positions[idSource] ?? fantome?.debut
        if (fantome && debut && jourDe(debut) === jour) fantomes.push({ creneau: fantome, debut: minutesDe(debut), refus: false })
      } else {
        for (const n of vu.nouveaux) {
          if (jourDe(n.debut as string) === jour) fantomes.push({ creneau: n, debut: minutesDe(n.debut as string), refus: false })
        }
      }
    } else if (fantome) {
      fantomes.push({ creneau: fantome, debut: survol.cible.t, refus: vu !== null })
    }
  }
  return { idSource, debuts, fantomes, refus: survol !== null && vu !== null && !vu.ok }
}

/**
 * Résumé (chaîne) de `apercuColonne` : une colonne ne se redessine que si ce qui la concerne change, et non à
 * chaque changement d'aperçu dans un autre jour.
 */
export function cleColonne(s: Glisse, jour: string): string {
  const a = apercuColonne(s, jour)
  const d = Object.entries(a.debuts).map(([id, m]) => `${id}@${m}`).sort().join(',')
  const f = a.fantomes.map((x) => `${x.creneau.id}@${x.debut}${x.refus ? '!' : ''}`).join(',')
  return `${a.idSource ?? ''}|${d}|${f}|${a.refus}`
}
