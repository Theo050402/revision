// Vue d'un jour pour le moteur de placement (spec §9.4) : tout en minutes depuis minuit.
import type { Intervalle, Pose } from './cascade'
import { ajouterJours, hm, jourDe, minutesDe } from './temps'
import type { Etat } from './types'

export type VueJour = { poses: Pose[]; verrous: Intervalle[]; bornes: Intervalle }

/**
 * Photographie d'un jour : créneaux posés (sans `exclureId`), indisponibilités qui le
 * touchent (découpées sur [0, 1440)) et bornes de la journée (réglages).
 */
export function vueJour(e: Etat, jour: string, exclureId?: string): VueJour {
  const poses: Pose[] = []
  for (const c of Object.values(e.creneaux)) {
    if (c.debut === null || c.id === exclureId || jourDe(c.debut) !== jour) continue
    poses.push({ id: c.id, debut: minutesDe(c.debut), duree: c.duree })
  }

  // Les heures locales `YYYY-MM-DDTHH:mm` se comparent comme des chaînes.
  const debutJour = `${jour}T00:00`
  const finJour = `${ajouterJours(jour, 1)}T00:00`
  const verrous: Intervalle[] = []
  for (const i of Object.values(e.indispos)) {
    if (i.debut >= finJour || i.fin <= debutJour) continue
    verrous.push({
      debut: i.debut < debutJour ? 0 : minutesDe(i.debut),
      fin: i.fin >= finJour ? 1440 : minutesDe(i.fin),
    })
  }

  return {
    poses,
    verrous,
    bornes: { debut: hm(e.reglages.journee.debut), fin: hm(e.reglages.journee.fin) },
  }
}
