// Suggestions de la bibliothèque (spec §8) : « À planifier ensuite » et « Pour combler ce trou ».
import { dureeTour } from '../../domain/duration'
import { vueJour } from '../../domain/jour'
import { dernierTourParItem } from '../../domain/tours'
import type { Etat, Item } from '../../domain/types'

const parNumero = (a: Item, b: Item): number => a.numero - b.numero || a.collegeId.localeCompare(b.collegeId)

/** Durée du prochain tour de l'item (avant découpage), d'après les tours déjà posés. */
export function dureeProchainTour(e: Etat, it: Item, derniers: Map<string, number>): number {
  const college = e.colleges[it.collegeId]
  return dureeTour(it.pages, college?.coefficient ?? 1, (derniers.get(it.id) ?? 0) + 1, e.reglages)
}

/**
 * « À planifier ensuite » : pour chaque collège, ses `n` premiers items non vus (aucun créneau, placé ou
 * dans le bac) par numéro croissant, puis fusion de tous les collèges triée par numéro.
 */
export function aPlanifier(e: Etat, n = 5): Item[] {
  const vus = new Set<string>()
  for (const c of Object.values(e.creneaux)) vus.add(c.itemId)
  const parCollege = new Map<string, Item[]>()
  for (const it of Object.values(e.items)) {
    if (vus.has(it.id) || !e.colleges[it.collegeId]) continue
    const liste = parCollege.get(it.collegeId)
    if (liste) liste.push(it)
    else parCollege.set(it.collegeId, [it])
  }
  const res: Item[] = []
  for (const liste of parCollege.values()) res.push(...liste.sort(parNumero).slice(0, Math.max(0, n)))
  return res.sort(parNumero)
}

/**
 * Minutes libres à partir de `t` (minutes depuis minuit) : jusqu'au prochain créneau ou à la prochaine
 * indisponibilité, ou à la fin de la journée. 0 si `t` est dans un bloc ou hors de la journée.
 */
export function trouLibre(e: Etat, jour: string, t: number): number {
  const { poses, verrous, bornes } = vueJour(e, jour)
  if (t < bornes.debut || t >= bornes.fin) return 0
  let limite = bornes.fin
  const blocs = [...poses.map((p) => ({ debut: p.debut, fin: p.debut + p.duree })), ...verrous]
  for (const b of blocs) {
    if (b.debut <= t && t < b.fin) return 0
    if (b.debut > t && b.debut < limite) limite = b.debut
  }
  return limite - t
}

/**
 * « Pour combler ce trou » : items dont la durée du prochain tour tient dans le trou touché, du plus long
 * (celui qui le remplit le mieux) au plus court ; à durée égale, par numéro.
 */
export function pourCombler(e: Etat, jour: string, t: number): Item[] {
  const trou = trouLibre(e, jour, t)
  if (trou <= 0) return []
  const derniers = dernierTourParItem(Object.values(e.creneaux))
  const res: { it: Item; duree: number }[] = []
  for (const it of Object.values(e.items)) {
    if (!e.colleges[it.collegeId]) continue
    const duree = dureeProchainTour(e, it, derniers)
    if (duree <= trou) res.push({ it, duree })
  }
  return res.sort((a, b) => b.duree - a.duree || parNumero(a.it, b.it)).map((x) => x.it)
}
