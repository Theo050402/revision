// Préremplissage de la feuille « + Indisponibilité » (spec §D.5) : l'emplacement libre touché en dernier s'il y en a
// un, sinon aujourd'hui à l'heure pleine suivante ; une heure, au pas, sans passer la fin de la journée.
import { arrondiPas } from '../../domain/duration'
import { hm, jourDe, minutesDe, versHm } from '../../domain/temps'
import type { Trou } from '../trou'

export type Prefill = { jour: string; debut: string; fin: string }

const DERNIERE_MINUTE = 23 * 60 + 59

/**
 * `maintenant` : heure locale `YYYY-MM-DDTHH:mm` (Paris). La fin ne dépasse pas la fin de la journée des réglages
 * (ou 23:59 si le début la dépasse déjà) ; le début recule d'un pas avant cette borne si besoin : fin > début, même jour.
 */
export function prefillIndispo(
  trou: Trou | null,
  maintenant: string,
  pas: number,
  journee: { debut: string; fin: string },
): Prefill {
  const jour = trou?.jour ?? jourDe(maintenant)
  const voulu = trou ? arrondiPas(trou.t, pas) : (Math.floor(minutesDe(maintenant) / 60) + 1) * 60
  const finJournee = hm(journee.fin)
  const borne = voulu > finJournee ? DERNIERE_MINUTE : finJournee
  const debut = Math.max(0, Math.min(voulu, borne - pas))
  return { jour, debut: versHm(debut), fin: versHm(Math.min(debut + 60, borne)) }
}
