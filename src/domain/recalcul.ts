// Recalcul des créneaux à venir après un changement de réglage de durée, puis
// replacement jour par jour (spec « Améliorations après recette », B.2 et B.3).
import { libelleSuppression } from './actions-creneaux'
import { arrondiPas, dureeTour } from './duration'
import { jourDe, local, minutesDe } from './temps'
import type { Creneau, Etat } from './types'
import { vueJour } from './jour'

/** Portée du recalcul ; absente = tous les créneaux. */
export type PorteeRecalcul = { collegeId?: string; itemIds?: string[] }

export type BilanRecalcul = { recalcules: number; deplaces: number; versBac: number }

type Patch = { debut: string | null; duree: number }

/**
 * Recalcule les durées des créneaux concernés, puis replace chaque jour touché :
 * curseur à minuit, chaque créneau à `max(son heure, curseur)`, saut des
 * indisponibilités, et « À placer » pour un créneau changé qui dépasse la fin de journée.
 * Un créneau déjà exporté mis « À placer » laisse son événement dans Calendrier : sa suppression est mise en attente
 * (libellé à son ancienne heure) et il garde sa `versionExportee` ; `deplacerCreneau` la retire s'il est replacé.
 * Renvoie le même état si rien ne change ; seuls les créneaux changés sont de nouveaux objets.
 */
export function recalculerCreneaux(
  e: Etat,
  aujourdhui: string,
  portee: PorteeRecalcul = {},
): { etat: Etat; bilan: BilanRecalcul } {
  const r = e.reglages
  const bilan: BilanRecalcul = { recalcules: 0, deplaces: 0, versBac: 0 }

  // 1. Nouvelles durées.
  const durees = new Map<string, number>()
  const joursTouches = new Set<string>()
  for (const c of Object.values(e.creneaux)) {
    if (c.fait || c.dureePerso) continue
    if (c.debut !== null && jourDe(c.debut) < aujourdhui) continue
    const it = e.items[c.itemId]
    const college = it && e.colleges[it.collegeId]
    if (!it || !college) continue
    if (portee.collegeId !== undefined && it.collegeId !== portee.collegeId) continue
    if (portee.itemIds !== undefined && !portee.itemIds.includes(c.itemId)) continue

    const total = dureeTour(it.pages, college.coefficient, c.tour, r)
    const n = c.partie?.n ?? 1
    const duree = Math.max(r.dureeMin, arrondiPas(total / n, r.pas))
    if (duree === c.duree) continue
    durees.set(c.id, duree)
    bilan.recalcules++
    if (c.debut !== null) joursTouches.add(jourDe(c.debut))
  }

  // 2. Replacement des jours touchés.
  const patchs = new Map<string, Patch>()
  for (const jour of joursTouches) {
    const { verrous, bornes } = vueJour(e, jour)
    const duJour = Object.values(e.creneaux)
      .filter((c): c is Creneau & { debut: string } => c.debut !== null && jourDe(c.debut) === jour)
      .sort((a, b) => minutesDe(a.debut) - minutesDe(b.debut) || (a.id < b.id ? -1 : 1))

    let curseur = 0
    for (const c of duJour) {
      const duree = durees.get(c.id) ?? c.duree
      const avant = minutesDe(c.debut)
      let debut = Math.max(avant, curseur)
      // Un créneau ni recalculé ni poussé reste en place, même sur une indisponibilité
      // (le conflit est signalé par `conflits`, pas résolu en silence).
      if (debut !== avant || duree !== c.duree) {
        for (;;) {
          const v = verrous.find((x) => x.debut < debut + duree && x.fin > debut)
          if (!v) break
          debut = v.fin
        }
      }
      const change = debut !== avant || duree !== c.duree
      if (change && debut + duree > bornes.fin) {
        patchs.set(c.id, { debut: null, duree })
        bilan.versBac++
        continue
      }
      if (debut !== avant) {
        patchs.set(c.id, { debut: local(jour, debut), duree })
        bilan.deplaces++
      } else if (duree !== c.duree) {
        patchs.set(c.id, { debut: c.debut, duree })
      }
      curseur = debut + duree
    }
  }

  // Les créneaux du bac changent de durée sans être placés.
  for (const [id, duree] of durees) {
    if (!patchs.has(id) && e.creneaux[id].debut === null) patchs.set(id, { debut: null, duree })
  }

  if (patchs.size === 0) return { etat: e, bilan }

  const creneaux = { ...e.creneaux }
  let suppressions = e.suppressions
  for (const [id, p] of patchs) {
    const c = e.creneaux[id]
    creneaux[id] = { ...c, debut: p.debut, duree: p.duree, version: c.version + 1 }
    if (p.debut === null && c.debut !== null && c.versionExportee !== null) {
      suppressions = { ...suppressions, [id]: { creneauId: id, libelle: libelleSuppression(e, c) } }
    }
  }
  return { etat: { ...e, creneaux, suppressions }, bilan }
}

/** Résumé affiché après un recalcul ; `null` si rien n'a changé. */
export function messageRecalcul(b: BilanRecalcul): string | null {
  const parties: string[] = []
  if (b.recalcules > 0) {
    parties.push(`${b.recalcules} créneau${b.recalcules > 1 ? 'x' : ''} recalculé${b.recalcules > 1 ? 's' : ''}`)
  }
  if (b.deplaces > 0) parties.push(`${b.deplaces} déplacé${b.deplaces > 1 ? 's' : ''}`)
  if (b.versBac > 0) parties.push(`${b.versBac} mis dans À placer`)
  return parties.length > 0 ? parties.join(' · ') : null
}
