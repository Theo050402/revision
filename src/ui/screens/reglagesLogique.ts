// Logique pure de l'écran Réglages : aperçu des durées, nom de la sauvegarde, lecture d'un fichier .ics,
// conflits entre créneaux et indisponibilités. Testée dans tests/unit/reglages-logique.test.ts.
import { conflits } from '../../domain/actions-etat'
import { dureeTour } from '../../domain/duration'
import { utcVersLocal } from '../../domain/temps'
import type { Etat, Reglages } from '../../domain/types'
import { lireIcs, type EvenementLu } from '../../ics/import'

/** « 45 min », « 2h15 », « 3h00 » : l'aperçu garde toujours les minutes pour que les durées s'alignent. */
function dureeApercu(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

/** « Item de 18 p → T1 : 2h15 · T2 : 1h15 · T3 : 45 min » (collège de coefficient 1). */
export function apercuDurees(r: Reglages, pages = 18): string {
  const tours = [1, 2, 3].map((t) => `T${t} : ${dureeApercu(dureeTour(pages, 1, t, r))}`)
  return `Item de ${pages} p → ${tours.join(' · ')}`
}

/** `revisions-AAAA-MM-JJ.json`, la date étant celle de Paris. */
export function nomSauvegarde(maintenant: Date = new Date()): string {
  return `revisions-${utcVersLocal(maintenant).slice(0, 10)}.json`
}

export type LectureFichierIcs = { ok: true; evenements: EvenementLu[]; ignores: number } | { ok: false }

/** Un fichier sans `BEGIN:VCALENDAR` n'est pas un calendrier : illisible. */
export function lireFichierIcs(texte: string, aujourdhui: string): LectureFichierIcs {
  if (!/BEGIN:VCALENDAR/i.test(texte)) return { ok: false }
  try {
    return { ok: true, ...lireIcs(texte, aujourdhui) }
  } catch {
    return { ok: false }
  }
}

/** « 1 règle de répétition non prise en charge, ignorée » / « 3 règles … prises en charge, ignorées ». */
export function phraseIgnores(n: number): string {
  return n === 1
    ? '1 règle de répétition non prise en charge, ignorée'
    : `${n} règles de répétition non prises en charge, ignorées`
}

export type Conflit = { titre: string; creneauIds: string[] }

/** Créneaux en conflit, regroupés par titre d'indisponibilité (les créneaux ne sont comptés qu'une fois). */
export function resumerConflits(e: Etat): Conflit[] {
  const parTitre = new Map<string, Set<string>>()
  for (const { indispoId, creneauIds } of conflits(e)) {
    const titre = e.indispos[indispoId].titre
    const ensemble = parTitre.get(titre) ?? new Set<string>()
    for (const id of creneauIds) ensemble.add(id)
    parTitre.set(titre, ensemble)
  }
  return [...parTitre].map(([titre, ids]) => ({ titre, creneauIds: [...ids] }))
}

/** « 2 créneaux chevauchent “Stage” » (spec §10). */
export function libelleConflit(c: Conflit): string {
  const n = c.creneauIds.length
  return n === 1 ? `1 créneau chevauche “${c.titre}”` : `${n} créneaux chevauchent “${c.titre}”`
}
