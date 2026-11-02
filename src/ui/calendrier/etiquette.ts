// Texte des blocs du calendrier (spec §9.2) : « 300 · titre », puis « T1 · 22 p · 2h45 » (+ « · 1/2 »).
import { ajouterMinutes, minutesDe, versHm } from '../../domain/temps'
import type { Creneau, Item } from '../../domain/types'
import { formaterDuree } from '../duree'

export function etiquetteCreneau(c: Creneau, item: Item | undefined): { numero: string; titre: string; meta: string } {
  // Item disparu (ne devrait pas arriver) : le numéro est la fin de l'identifiant `${collegeId}:${numero}`.
  const numero = item ? String(item.numero) : c.itemId.slice(c.itemId.lastIndexOf(':') + 1)
  const parts = [`T${c.tour}`]
  if (item) parts.push(`${item.pages} p`)
  parts.push(formaterDuree(c.duree))
  if (c.partie) parts.push(`${c.partie.i}/${c.partie.n}`)
  return { numero, titre: item ? `${numero} · ${item.titre}` : numero, meta: parts.join(' · ') }
}

const heure = (local: string): string => {
  const m = minutesDe(local)
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** Phrase pour les lecteurs d'écran : titre, détail, horaire et état (fait / à exporter). */
export function descriptionCreneau(c: Creneau, item: Item | undefined): string {
  const { titre, meta } = etiquetteCreneau(c, item)
  const debut = c.debut as string
  const etats: string[] = []
  if (c.fait) etats.push('fait')
  if (c.versionExportee !== c.version) etats.push('pas encore exporté')
  const horaire = `de ${heure(debut)} à ${heure(ajouterMinutes(debut, c.duree))}`
  return [titre, meta, horaire, ...etats].join(', ')
}

/** 480 → « 8h », 810 → « 13h30 », 1440 → « 24h ». */
export const heureCourte = (min: number): string =>
  min >= 1440 ? '24h' : versHm(min).replace(/^0/, '').replace(':00', 'h').replace(':', 'h')
