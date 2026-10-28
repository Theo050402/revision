import type { Intervalle } from './cascade'

export type EntreeSerie = {
  occupes: Intervalle[]
  bornes: Intervalle
  t: number
  durees: { id: string; duree: number }[]
  pause: number
}

export type ResultatSerie = {
  places: { id: string; debut: number }[]
  restants: string[]
}

/**
 * Dépôt multiple (§9.5) : place les créneaux l'un après l'autre à partir de t,
 * chacun dans le premier intervalle libre suffisant, sans jamais pousser
 * l'existant. Dès qu'un créneau ne tient pas avant bornes.fin, lui et les
 * suivants vont dans `restants` (ordre conservé).
 */
export function deposerSerie(e: EntreeSerie): ResultatSerie {
  const occupes = [...e.occupes].sort((a, b) => a.debut - b.debut)
  const places: ResultatSerie['places'] = []
  let curseur = Math.max(e.t, e.bornes.debut)

  for (let i = 0; i < e.durees.length; i++) {
    const { id, duree } = e.durees[i]
    // Occupés triés par début : un seul passage suffit, même s'ils se chevauchent.
    for (const o of occupes) {
      if (o.fin <= curseur) continue
      if (o.debut >= curseur + duree) break
      curseur = o.fin
    }
    if (curseur + duree > e.bornes.fin) {
      return { places, restants: e.durees.slice(i).map((d) => d.id) }
    }
    places.push({ id, debut: curseur })
    curseur += duree + e.pause
  }
  return { places, restants: [] }
}
