// Aperçu du glisser-déposer (spec §9.3–9.5) : fonctions pures. L'aperçu appelle exactement les actions
// du lâcher (`deposer`), avec des identifiants déterministes, et ne garde que ce qui bouge : rien n'est
// persisté. La grille l'anime (translateY) pendant le geste ; le lâcher rejoue `deposer` via `appliquer`.
import {
  deplacerCreneau,
  deposerItem,
  deposerItemsSerie,
  type Cible,
  type Res,
} from '../../domain/actions-creneaux'
import { decouper, dureeTour } from '../../domain/duration'
import { decalageGroupe, deplacerGroupe } from '../../domain/selection'
import { hm } from '../../domain/temps'
import { prochainTour } from '../../domain/tours'
import type { Creneau, Etat } from '../../domain/types'

/**
 * Ce qui est glissé : un ou plusieurs items de la bibliothèque, un créneau (grille ou bac), ou un groupe de créneaux
 * sélectionnés (spec §D.3) saisi par l'un d'eux, l'ancre, dont la cible donne le décalage de tout le groupe.
 */
export type Source =
  | { type: 'item'; itemIds: string[] }
  | { type: 'creneau'; id: string }
  | { type: 'groupe'; ids: string[]; ancre: string }

export type Apercu = {
  ok: boolean
  /** Créneau → nouveau début (`YYYY-MM-DDTHH:mm`) : créneaux poussés ou déplacés, et nouveaux créneaux posés. */
  positions: Record<string, string>
  /** Nouveaux créneaux posés (identifiants `apercu-N`), triés par début : les fantômes à dessiner. */
  nouveaux: Creneau[]
  /** Créneaux qui iraient dans le bac « À placer ». */
  versBac: number
}

const REFUS: Apercu = { ok: false, positions: {}, nouveaux: [], versBac: 0 }

/**
 * Le lâcher : un item seul passe par la cascade, plusieurs par le dépôt multiple (qui ne pousse jamais) ; un groupe
 * se décale tout entier comme son ancre, sans pousser, ou rien (`deplacerGroupe`).
 */
export function deposer(e: Etat, source: Source, c: Cible, id?: () => string): Res {
  if (source.type === 'creneau') return deplacerCreneau(e, source.id, c)
  if (source.type === 'groupe') {
    const ancre = e.creneaux[source.ancre]
    const d = ancre ? decalageGroupe(ancre, c) : null
    return d ? deplacerGroupe(e, source.ids, d.jours, d.minutes) : { ok: false }
  }
  if (source.itemIds.length === 1) return deposerItem(e, source.itemIds[0], c, id)
  return deposerItemsSerie(e, source.itemIds, c.jour, c.t, id)
}

function idsApercu(): () => string {
  let n = 0
  return () => `apercu-${++n}`
}

/** État projeté du lâcher, réduit à ce qui change. Pur : `e` n'est jamais modifié. */
export function apercu(e: Etat, source: Source, c: Cible): Apercu {
  const r = deposer(e, source, c, idsApercu())
  if (!r.ok) return REFUS
  const positions: Record<string, string> = {}
  const nouveaux: Creneau[] = []
  for (const cr of Object.values(r.etat.creneaux)) {
    if (cr.debut === null) continue
    const avant = e.creneaux[cr.id]
    if (!avant) nouveaux.push(cr)
    if (avant?.debut !== cr.debut) positions[cr.id] = cr.debut
  }
  nouveaux.sort((a, b) => (a.debut as string).localeCompare(b.debut as string))
  return { ok: true, positions, nouveaux, versBac: r.versBac }
}

/**
 * Dépôt sur un jour de la vue Mois : la première heure (depuis le début de la journée, au pas) où le dépôt
 * tient sans pousser aucun créneau existant ; `null` s'il n'y en a pas (refus). Plusieurs items : la série
 * part du début de la journée et cherche elle-même ses intervalles libres.
 */
export function cibleMois(e: Etat, source: Source, jour: string): Cible | null {
  if (source.type === 'groupe') return null // un groupe ne se dépose que dans la grille (la vue Mois quitte la sélection)
  const debut = hm(e.reglages.journee.debut)
  const fin = hm(e.reglages.journee.fin)
  const a = (t: number): Cible => ({ jour, t, cibleId: null, moitie: 'haute' })
  if (source.type === 'item' && source.itemIds.length > 1) return a(debut)

  const propres = new Set(source.type === 'creneau' ? [source.id] : [])
  for (let t = debut; t < fin; t += e.reglages.pas) {
    const r = apercu(e, source, a(t))
    if (!r.ok) continue
    const pousse = Object.keys(r.positions).some((id) => !propres.has(id) && e.creneaux[id] !== undefined)
    if (!pousse) return a(t)
  }
  return null
}

/**
 * Le créneau que représente le fantôme quand l'aperçu n'en donne pas (refus, hors de la grille) : le créneau
 * glissé (l'ancre d'un groupe), ou la première partie du prochain tour du premier item (par numéro). `null` si l'item a disparu.
 */
export function creneauFantome(e: Etat, source: Source): Creneau | null {
  if (source.type === 'creneau') return e.creneaux[source.id] ?? null
  if (source.type === 'groupe') return e.creneaux[source.ancre] ?? null
  const items = source.itemIds.map((id) => e.items[id]).filter((i) => i && e.colleges[i.collegeId])
  if (items.length === 0) return null
  const item = items.reduce((a, b) => (b.numero < a.numero ? b : a))
  const tour = prochainTour(Object.values(e.creneaux), item.id)
  const parts = decouper(dureeTour(item.pages, e.colleges[item.collegeId].coefficient, tour, e.reglages), e.reglages)
  return {
    id: 'apercu-1',
    itemId: item.id,
    tour,
    partie: parts.length > 1 ? { i: 1, n: parts.length } : null,
    debut: null,
    duree: parts[0],
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
  }
}
