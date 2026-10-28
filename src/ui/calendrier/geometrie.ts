// Géométrie du calendrier (spec §9.1) : fonctions pures qui relient minutes, pixels et colonnes.
// Le glisser-déposer (tâche 18) s'appuie sur ces mêmes fonctions : une seule source de vérité
// pour passer d'une position à l'écran à une heure magnétisée, et inversement.
//
// ÉCHELLE : `pxHeure` est le nombre de pixels CSS pour 60 minutes. Il vaut 48 sur iPad et 56 pour la
// vue Jour de l'iPhone (constantes ci-dessous). La grille le publie en `data-px-heure`, avec
// `data-plage-debut` et `data-plage-fin` (minutes depuis minuit) ; chaque colonne `[data-jour]` commence
// à `plage.debut` : y = (clientY - colonne.getBoundingClientRect().top), puis `yVersMinutes(y, …)`.
import type { Intervalle } from '../../domain/cascade'
import { ajouterJours, hm, jourDe, minutesDe } from '../../domain/temps'
import type { Creneau, Etat, Indispo, Reglages } from '../../domain/types'

/** Pixels par heure sur iPad (toutes les vues) et sur iPhone en vue Jour. */
export const PX_HEURE_IPAD = 48
export const PX_HEURE_IPHONE = 56

export type Colonne = { jour: string; gauche: number; largeur: number }

/**
 * Plage verticale de la grille : union des bornes de la journée (réglages) et des blocs fournis,
 * alignée sur l'heure et bornée au jour civil. Un créneau resté hors des bornes après un
 * rétrécissement des réglages reste donc visible (et déplaçable).
 */
export function plageAffichee(r: Reglages, debutsFins: Intervalle[]): Intervalle {
  let debut = hm(r.journee.debut)
  let fin = hm(r.journee.fin)
  for (const iv of debutsFins) {
    debut = Math.min(debut, iv.debut)
    fin = Math.max(fin, iv.fin)
  }
  debut = Math.max(0, Math.floor(debut / 60) * 60)
  fin = Math.min(1440, Math.ceil(fin / 60) * 60)
  // Réglages incohérents (fin avant début) : au moins une heure, jamais une plage vide.
  if (fin <= debut) fin = Math.min(1440, debut + 60)
  if (fin <= debut) debut = fin - 60
  return { debut, fin }
}

/** Position verticale (px) d'une heure, depuis le haut de la plage. */
export function minutesVersY(min: number, plage: Intervalle, pxHeure: number): number {
  return ((min - plage.debut) * pxHeure) / 60
}

/**
 * Heure (minutes depuis minuit) correspondant à `y` px depuis le haut de la plage, magnétisée au
 * pas de la grille. Pas de bornage : l'appelant (placement, cascade) décide d'un refus hors bornes.
 */
export function yVersMinutes(y: number, plage: Intervalle, pxHeure: number, pas: number): number {
  const brut = plage.debut + (y * 60) / pxHeure
  return Math.round(brut / pas) * pas
}

/** Jour de la colonne qui contient l'abscisse `x` (bord gauche inclus, bord droit exclu), sinon null. */
export function jourSousX(x: number, colonnes: Colonne[]): string | null {
  for (const c of colonnes) {
    if (x >= c.gauche && x < c.gauche + c.largeur) return c.jour
  }
  return null
}

/** Minutes planifiées un jour donné (créneaux posés, hors bac « À placer »). */
export function chargeJour(e: Pick<Etat, 'creneaux'>, jour: string): number {
  return chargesDesJours(e, [jour])[jour]
}

/** Charge de plusieurs jours en un seul parcours des créneaux. */
export function chargesDesJours(e: Pick<Etat, 'creneaux'>, jours: string[]): Record<string, number> {
  const charges: Record<string, number> = {}
  for (const j of jours) charges[j] = 0
  for (const c of Object.values(e.creneaux)) {
    if (c.debut === null) continue
    const j = jourDe(c.debut)
    if (j in charges) charges[j] += c.duree
  }
  return charges
}

export type IndispoDuJour = { indispo: Indispo; debut: number; fin: number }
export type BlocsDuJour = { creneaux: Creneau[]; indispos: IndispoDuJour[] }

/**
 * Blocs à dessiner pour les seuls jours affichés (un seul parcours de l'état). Créneaux triés par heure ;
 * les indisponibilités sont découpées sur [0, 1440) de chaque jour qu'elles touchent.
 */
export function blocsDesJours(e: Pick<Etat, 'creneaux' | 'indispos'>, jours: string[]): Record<string, BlocsDuJour> {
  const blocs: Record<string, BlocsDuJour> = {}
  for (const j of jours) blocs[j] = { creneaux: [], indispos: [] }
  for (const c of Object.values(e.creneaux)) {
    if (c.debut === null) continue
    blocs[jourDe(c.debut)]?.creneaux.push(c)
  }
  for (const b of Object.values(blocs)) b.creneaux.sort((a, z) => (a.debut as string).localeCompare(z.debut as string))
  for (const j of jours) {
    const debutJour = `${j}T00:00`
    const finJour = `${ajouterJours(j, 1)}T00:00`
    for (const i of Object.values(e.indispos)) {
      if (i.debut >= finJour || i.fin <= debutJour) continue
      blocs[j].indispos.push({
        indispo: i,
        debut: i.debut < debutJour ? 0 : minutesDe(i.debut),
        fin: i.fin >= finJour ? 1440 : minutesDe(i.fin),
      })
    }
  }
  return blocs
}

/**
 * Plage commune à tous les jours affichés : bornes de la journée ∪ tous les créneaux. Les
 * indisponibilités n'étirent pas la grille (elles sont rognées à la plage).
 */
export function plageDesJours(r: Reglages, blocs: Record<string, BlocsDuJour>): Intervalle {
  const ivs: Intervalle[] = []
  for (const b of Object.values(blocs)) {
    for (const c of b.creneaux) {
      const debut = minutesDe(c.debut as string)
      ivs.push({ debut, fin: Math.min(1440, debut + c.duree) })
    }
  }
  return plageAffichee(r, ivs)
}
