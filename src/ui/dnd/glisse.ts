// État du geste en cours (glisser-déposer, redimensionnement, lasso), hors du store de
// l'application : rien ici n'est persisté ni annulable. La grille et la corbeille s'y abonnent ; seul l'aperçu
// change pendant le geste, et uniquement quand la minute magnétisée, la cible ou la moitié changent.
import { create } from 'zustand'
import type { Cible } from '../../domain/actions-creneaux'
import { decalageGroupe } from '../../domain/selection'
import { ajouterJours, jourDe, minutesDe } from '../../domain/temps'
import type { Creneau } from '../../domain/types'
import { heureCourte } from '../calendrier/etiquette'
import { libelleJourCourt } from '../periode'
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
  /** Groupe (spec §D.3) : ses créneaux placés, relevés au début ; chacun a son emplacement. Vide sinon. */
  membres: readonly Creneau[]
}

export const GLISSE_VIDE: Glisse = {
  source: null,
  depuisFeuille: false,
  prise: 0,
  survol: null,
  apercu: null,
  fantome: null,
  membres: [],
}

/** Créneaux déplacés par le geste (estompés à leur place d'origine) : le créneau glissé, ou tout le groupe. */
export function idsSource(source: Source | null): string[] {
  if (source?.type === 'creneau') return [source.id]
  if (source?.type === 'groupe') return source.ids
  return []
}

/** Le créneau qui porte l'emplacement principal : le créneau glissé, l'ancre d'un groupe ; `null` pour des items. */
export function idPrincipal(source: Source | null): string | null {
  return source?.type === 'creneau' ? source.id : source?.type === 'groupe' ? source.ancre : null
}

export const useGlisse = create<Glisse>()(() => GLISSE_VIDE)

/** Redimensionnement en cours : la durée prévue s'affiche, rien n'est écrit avant le lâcher. */
export const useRedim = create<{ id: string | null; duree: number }>()(() => ({ id: null, duree: 0 }))

/**
 * Créneaux masqués pendant le vol de la copie après le lâcher (spec §C.3) : le créneau posé (ou la source qui
 * revient à son origine) n'apparaît qu'à l'arrivée de la copie, qui « cède la place au vrai créneau ».
 */
export const useVol = create<{ caches: readonly string[] }>()(() => ({ caches: [] }))

// ───────────────── Geste en cours (balayage, défilement) ─────────────────

let gesteActif = false
let dernierGeste = -Infinity

/**
 * Un geste (glisser, redimensionnement, lasso) commence ou finit. Pendant qu'il dure, le défilement tactile
 * est bloqué (voir `bloquerDefilement`) ; après, le balayage horizontal de la grille l'ignore.
 */
export function marquerGeste(actif: boolean): void {
  gesteActif = actif
  dernierGeste = performance.now()
  // Repère pour la feuille de style : pendant le geste, l'en-tête des jours renonce au flou (ui.css, « Matériaux »).
  // Posé une fois au début et retiré à la fin, jamais pendant le geste.
  if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-geste', actif)
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
    if (pointeurSaisi === null) return
    if (e.pointerId !== pointeurSaisi) {
      e.stopImmediatePropagation()
      return
    }
    // Filet de sécurité : le doigt du geste se lève ou est annulé. Si la source a disparu pendant l'appui long,
    // dnd-kit ne prévient pas (son `onAbort` sort tôt) et le pointeur resterait saisi ; tout geste serait refusé.
    // L'événement poursuit sa route : le capteur le traite normalement.
    if (e.type === 'pointerup' || e.type === 'pointercancel') pointeurSaisi = null
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

/** Emplacement d'atterrissage dans une colonne. `principal` : celui que rejoint la copie au lâcher. */
export type FantomeColonne = { creneau: Creneau; debut: number; refus: boolean; principal: boolean }
export type ApercuColonne = {
  /** Créneaux glissés (estompés à leur place d'origine), quel que soit le jour visé. */
  sources: string[]
  /** Créneaux de ce jour qui s'écartent : nouveau début (minutes). */
  debuts: Record<string, number>
  /** Emplacements d'atterrissage posés ce jour-là. */
  fantomes: FantomeColonne[]
  refus: boolean
  /** Le doigt vise ce jour : la colonne et son en-tête s'éclairent. */
  visee: boolean
}

/**
 * Ce que l'aperçu change dans une colonne : les créneaux de ce jour qui s'écartent, les emplacements posés ce
 * jour-là (sinon, en cas de refus, le créneau glissé à l'heure visée), la teinte de refus et l'éclairage.
 * Un groupe a un emplacement par membre, dans le jour de sa nouvelle place, rouges en cas de refus.
 */
export function apercuColonne(s: Glisse, jour: string): ApercuColonne {
  const { source, apercu: vu, fantome } = s
  const sources = idsSource(source)
  const debuts: Record<string, number> = {}
  const fantomes: FantomeColonne[] = []
  const survol = s.survol?.type === 'colonne' && s.survol.cible.jour === jour ? s.survol : null
  if (vu?.ok) {
    for (const [id, debut] of Object.entries(vu.positions)) {
      if (!sources.includes(id) && jourDe(debut) === jour && !id.startsWith('apercu-')) debuts[id] = minutesDe(debut)
    }
  }
  if (source?.type === 'groupe') {
    if (s.survol?.type === 'colonne' && vu) fantomes.push(...emplacementsGroupe(s, s.survol.cible, jour, !vu.ok))
  } else if (survol && source) {
    if (vu?.ok) {
      if (source.type === 'creneau') {
        const debut = vu.positions[source.id] ?? fantome?.debut
        if (fantome && debut && jourDe(debut) === jour) {
          fantomes.push({ creneau: fantome, debut: minutesDe(debut), refus: false, principal: true })
        }
      } else {
        const principal = vu.nouveaux[0]?.id
        for (const n of vu.nouveaux) {
          if (jourDe(n.debut as string) === jour) {
            fantomes.push({ creneau: n, debut: minutesDe(n.debut as string), refus: false, principal: n.id === principal })
          }
        }
      }
    } else if (fantome) {
      fantomes.push({ creneau: fantome, debut: survol.cible.t, refus: vu !== null, principal: true })
    }
  }
  return { sources, debuts, fantomes, refus: survol !== null && vu !== null && !vu.ok, visee: survol !== null }
}

/**
 * Emplacements des membres d'un groupe qui tombent le jour `jour` : chacun décalé comme l'ancre (`decalageGroupe`,
 * le même calcul que le lâcher). Un membre poussé hors de sa journée (avant minuit, après minuit) n'en a pas.
 */
function emplacementsGroupe(s: Glisse, cible: Cible, jour: string, refus: boolean): FantomeColonne[] {
  const ancre = s.fantome
  const d = ancre ? decalageGroupe(ancre, cible) : null
  if (!d || s.source?.type !== 'groupe') return []
  const principal = s.source.ancre
  const fantomes: FantomeColonne[] = []
  for (const m of s.membres) {
    if (m.debut === null || ajouterJours(jourDe(m.debut), d.jours) !== jour) continue
    const debut = minutesDe(m.debut) + d.minutes
    if (debut < 0 || debut >= 1440) continue
    fantomes.push({ creneau: m, debut, refus, principal: m.id === principal })
  }
  return fantomes
}

/**
 * Résumé (chaîne) de `apercuColonne` : une colonne ne se redessine que si ce qui la concerne change, et non à
 * chaque changement d'aperçu dans un autre jour.
 */
export function cleColonne(s: Glisse, jour: string): string {
  const a = apercuColonne(s, jour)
  const d = Object.entries(a.debuts).map(([id, m]) => `${id}@${m}`).sort().join(',')
  const f = a.fantomes.map((x) => `${x.creneau.id}@${x.debut}${x.refus ? '!' : ''}${x.principal ? '*' : ''}`).join(',')
  return `${a.sources.join(',')}|${d}|${f}|${a.refus}|${a.visee}`
}

// ───────────────── Emplacement principal ─────────────────

/** Où le lâcher poserait le créneau glissé (l'ancre d'un groupe, ou le premier des nouveaux), minutes depuis minuit. */
export type Emplacement = { creneau: Creneau; jour: string; debut: number; refus: boolean }

/**
 * L'emplacement d'atterrissage principal, tiré du même survol et du même aperçu que le lâcher (« lâcher = aperçu ») :
 * le créneau déplacé à sa position projetée, ou le premier nouveau créneau ; en cas de refus, le créneau glissé à
 * l'heure visée. `null` hors d'une cible (ou sur un jour du mois sans heure libre).
 */
export function emplacementPrincipal(s: Glisse): Emplacement | null {
  const { source, apercu: vu, fantome, survol } = s
  const cible = survol?.type === 'colonne' || survol?.type === 'mois' ? survol.cible : null
  if (!source || !cible) return null
  if (vu?.ok) {
    const id = idPrincipal(source)
    if (id !== null) {
      const debut = vu.positions[id] ?? fantome?.debut
      return fantome && debut ? { creneau: fantome, jour: jourDe(debut), debut: minutesDe(debut), refus: false } : null
    }
    const n = vu.nouveaux[0]
    return n?.debut ? { creneau: n, jour: jourDe(n.debut), debut: minutesDe(n.debut), refus: false } : null
  }
  return fantome ? { creneau: fantome, jour: cible.jour, debut: cible.t, refus: vu !== null } : null
}

/** Étiquette d'heure accrochée à la copie (spec §C.2) : « mer. 4 · 14h30 → 15h30 ». */
export function etiquetteHeure(e: Emplacement): string {
  const { nom, numero } = libelleJourCourt(e.jour)
  return `${nom} ${numero} · ${heureCourte(e.debut)} → ${heureCourte(e.debut + e.creneau.duree)}`
}

// ───────────────── Vitesse au lâcher ─────────────────

/** Un `pointermove` du doigt qui glisse : horodatage (ms, `performance.now()`) et position (px). */
export type Echantillon = { t: number; x: number; y: number }

/** Au-delà, le doigt était immobile au lâcher (ms). */
const IMMOBILE_MS = 80
/** Vitesse transmise au ressort du lâcher, bornée (px/s). */
const VITESSE_MAX = 4000

/**
 * Vitesse du doigt au lâcher (px/s), sur les derniers `pointermove` (les cinq derniers, voir ContexteDnd) ; nulle
 * si le doigt était immobile (dernier mouvement plus vieux que 80 ms) ou faute d'échantillons. Bornée à 4 000 px/s.
 */
export function vitesseLacher(ech: readonly Echantillon[], maintenant: number): { vx: number; vy: number } {
  if (ech.length < 2) return { vx: 0, vy: 0 }
  const a = ech[0]
  const b = ech[ech.length - 1]
  const dt = (b.t - a.t) / 1000
  if (maintenant - b.t > IMMOBILE_MS || dt <= 0) return { vx: 0, vy: 0 }
  const borne = (v: number) => Math.max(-VITESSE_MAX, Math.min(VITESSE_MAX, v))
  return { vx: borne((b.x - a.x) / dt), vy: borne((b.y - a.y) / dt) }
}
