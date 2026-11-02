// Bords de la grille pendant un glisser (spec §C.2) : défilement progressif près du haut et du bas, et changement de
// période en maintenant le doigt contre le bord gauche ou droit. Fonctions pures et machine à états sans horloge
// propre : la boucle du glisser (ContexteDnd) donne l'instant, ce qui rend le tout déterministe et testable.
import { useMemo, useRef } from 'react'

/** Zone (px) au bord haut / bas où la grille défile, et vitesse maximale (px/s) au bord. */
const ZONE = 64
const MAX = 900
/** Largeur (px) de la bande tactile au bord gauche / droit, et durée (ms) du maintien avant de changer de période. */
const BANDE = 32
const DELAI = 600

/**
 * Vitesse de défilement (px/s) pour un doigt à `distanceAuBord` px du bord de la grille : nulle hors de la zone,
 * croissante en approchant (progressive, en carré : douce à l'entrée de la zone), maximale au bord et au-delà.
 */
export function vitesseDefilement(distanceAuBord: number, zone = ZONE, max = MAX): number {
  if (distanceAuBord >= zone) return 0
  const p = Math.min(1, (zone - distanceAuBord) / zone)
  return max * p * p
}

/**
 * Bord gauche (-1) ou droit (1) tenu par le doigt, 0 sinon. `gauche` est le bord gauche des colonnes (la colonne des
 * heures n'en fait pas partie), `droite` le bord droit visible de la grille ; la bande fait `bande` px de large.
 */
export function coteBord(x: number, gauche: number, droite: number, bande = BANDE): -1 | 0 | 1 {
  if (x >= gauche && x < gauche + bande) return -1
  if (x >= droite - bande && x <= droite) return 1
  return 0
}

export type MaintienBord = {
  /** À chaque image : le bord tenu (`coteBord`) à l'instant `t` (ms). Appelle `onChange` après `delai` ms de maintien. */
  maj: (cote: -1 | 0 | 1, t: number) => void
  /** Oublie le maintien en cours (fin du geste). */
  arreter: () => void
}

/**
 * Le doigt reste contre un bord : après `delai` ms, `onChange(sens)` ; il faut ensuite `delai` ms de plus pour le
 * changement suivant. Quitter la bande ou passer à l'autre bord repart de zéro.
 *
 * `surCote(cote)`, facultatif, signale que le décompte (re)part contre ce bord (`cote` ±1) ou s'arrête (0) : il
 * pilote la bande lumineuse qui se remplit pendant les `delai` ms.
 */
export function creerMaintienBord(
  onChange: (sens: -1 | 1) => void,
  delai = DELAI,
  surCote?: (cote: -1 | 0 | 1) => void,
): MaintienBord {
  let cote: -1 | 0 | 1 = 0
  let depuis = 0
  return {
    maj(c, t) {
      if (c !== cote) {
        cote = c
        depuis = t
        surCote?.(c)
        return
      }
      if (c !== 0 && t - depuis >= delai) {
        depuis = t
        onChange(c)
        surCote?.(c) // le décompte du changement suivant repart
      }
    },
    arreter() {
      if (cote !== 0) surCote?.(0)
      cote = 0
    },
  }
}

// Bande lumineuse du bord tenu : un identifiant neuf à chaque départ de décompte (la bande se remonte et repart de zéro).
export type Halo = { cote: -1 | 1; id: number } | null
let halo: Halo = null
let compteurHalo = 0
const ecouteursHalo = new Set<() => void>()

/** Le bord dont le décompte court, ou `null`. */
export const lireHalo = (): Halo => halo

/** Abonnement au changement du halo (pour `useSyncExternalStore`). */
export function abonnerHalo(rappel: () => void): () => void {
  ecouteursHalo.add(rappel)
  return () => ecouteursHalo.delete(rappel)
}

function publierHalo(cote: -1 | 0 | 1): void {
  halo = cote === 0 ? null : { cote, id: ++compteurHalo }
  for (const f of ecouteursHalo) f()
}

/** `creerMaintienBord` à durée de vie du composant ; `onChange` est toujours la dernière version passée. */
export function useMaintienBord(onChange: (sens: -1 | 1) => void, delai = DELAI): MaintienBord {
  const rappel = useRef(onChange)
  rappel.current = onChange
  return useMemo(() => creerMaintienBord((s) => rappel.current(s), delai, publierHalo), [delai])
}

// Changement de période : la zone du calendrier enregistre ce qu'« une période de plus ou de moins » veut dire dans la
// vue affichée (semaine, jour) ; rien en vue Mois, où le geste n'a pas lieu.
let changerPeriode: ((sens: -1 | 1) => void) | null = null

/** Enregistre le changement de période de la vue affichée (`null` : aucun) ; renvoie son désenregistrement. */
export function enregistrerChangementPeriode(f: ((sens: -1 | 1) => void) | null): () => void {
  changerPeriode = f
  return () => {
    if (changerPeriode === f) changerPeriode = null
  }
}

/** Le changement de période de la vue affichée, s'il y en a un. */
export const periodeChangeable = (): ((sens: -1 | 1) => void) | null => changerPeriode
