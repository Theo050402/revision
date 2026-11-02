// Sélection par zone et dépôt de groupe (spec amélioration D.1, D.3, D.4) : fonctions pures.
// Tout est en minutes depuis minuit : le défilement de la grille n'intervient jamais ici.
import { retirer, vueJour, type Res } from './actions-creneaux'
import { ajouterJours, jourDe, local, minutesDe } from './temps'
import type { Creneau, Etat } from './types'

/** Rectangle du lasso : jours inclus, minutes depuis minuit. */
export type Zone = { jourDebut: string; jourFin: string; debut: number; fin: number }

/**
 * Créneaux placés qui touchent la zone (jamais d'indisponibilité), triés par début puis id.
 * Un créneau qui touche la zone en un seul point (fin = bord, début = bord) compte.
 */
export function creneauxDansZone(e: Etat, z: Zone): string[] {
  // Les jours `YYYY-MM-DD` et les heures locales se comparent comme des chaînes.
  const [j1, j2] = z.jourDebut <= z.jourFin ? [z.jourDebut, z.jourFin] : [z.jourFin, z.jourDebut]
  const [m1, m2] = z.debut <= z.fin ? [z.debut, z.fin] : [z.fin, z.debut]

  const touches: Creneau[] = []
  for (const c of Object.values(e.creneaux)) {
    if (c.debut === null) continue
    const jour = jourDe(c.debut)
    if (jour < j1 || jour > j2) continue
    const debut = minutesDe(c.debut)
    if (debut <= m2 && debut + c.duree >= m1) touches.push(c)
  }
  touches.sort((a, b) => (a.debut! < b.debut! ? -1 : a.debut! > b.debut! ? 1 : a.id < b.id ? -1 : 1))
  return touches.map((c) => c.id)
}

/**
 * Décale un groupe de créneaux placés de `decalageJours` jours et `decalageMinutes` minutes.
 * Accepté seulement si chaque membre tient librement à sa nouvelle place : dans les bornes de
 * la journée, hors indisponibilité, hors créneau non sélectionné (intervalles semi-ouverts).
 * Les membres peuvent se suivre ou prendre la place l'un de l'autre. Pas de poussée en cascade.
 */
export function deplacerGroupe(
  e: Etat,
  ids: string[],
  decalageJours: number,
  decalageMinutes: number,
): Res {
  const membres: Creneau[] = []
  const vus = new Set<string>()
  for (const id of ids) {
    const c = e.creneaux[id]
    if (!c || c.debut === null || vus.has(id)) continue
    vus.add(id)
    membres.push(c)
  }
  if (membres.length === 0 || (decalageJours === 0 && decalageMinutes === 0)) {
    return { ok: true, etat: e, versBac: 0 }
  }

  const vues = new Map<string, ReturnType<typeof vueJour>>()
  const vueDe = (jour: string) => {
    let v = vues.get(jour)
    if (!v) vues.set(jour, (v = vueJour(e, jour)))
    return v
  }

  const maj: Record<string, Creneau> = {}
  for (const c of membres) {
    const jour = ajouterJours(jourDe(c.debut!), decalageJours)
    const debut = minutesDe(c.debut!) + decalageMinutes
    const fin = debut + c.duree
    const { poses, verrous, bornes } = vueDe(jour)
    if (debut < bornes.debut || fin > bornes.fin) return { ok: false }
    if (verrous.some((v) => debut < v.fin && fin > v.debut)) return { ok: false }
    if (poses.some((p) => !vus.has(p.id) && debut < p.debut + p.duree && fin > p.debut)) {
      return { ok: false }
    }
    const nouveau = local(jour, debut)
    if (nouveau !== c.debut) maj[c.id] = { ...c, debut: nouveau, version: c.version + 1 }
  }

  // Les membres gardent leurs écarts relatifs : on ne juge pas leurs chevauchements entre eux.
  if (Object.keys(maj).length === 0) return { ok: true, etat: e, versBac: 0 }
  return { ok: true, etat: { ...e, creneaux: { ...e.creneaux, ...maj } }, versBac: 0 }
}

/** Supprime un groupe de créneaux ; les exportés passent en suppression en attente (§12.1). */
export function supprimerGroupe(e: Etat, ids: string[]): Etat {
  const cibles = [...new Set(ids)].map((id) => e.creneaux[id]).filter((c): c is Creneau => !!c)
  if (cibles.length === 0) return e
  const etat: Etat = { ...e, creneaux: { ...e.creneaux } }
  for (const c of cibles) retirer(etat, e, c)
  return etat
}
