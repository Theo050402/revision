// Validation des formulaires de Réglages et des fiches (spec §10, §11). Fonctions pures : l'interface garde les
// champs en texte (ce que tape Emma) et ne les convertit qu'ici ; un champ invalide ne produit aucune valeur,
// seulement un message en français affiché sous le champ.
import { arrondiPas } from './duration'
import { hm } from './temps'
import type { Reglages } from './types'

type Erreurs = Record<string, string>

const ENTIER = /^\d+$/
const DECIMAL = /^\d+([.,]\d+)?$/
const HEURE = /^\d{2}:\d{2}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const MSG_ENTIER = 'Un nombre entier, au moins 1.'
const MSG_HEURES = 'Choisis une heure de début et de fin.'
const MSG_FIN_HEURE = 'La fin doit suivre le début.'

const entier = (s: string): number | null => (ENTIER.test(s.trim()) ? Number(s.trim()) : null)
const decimal = (s: string): number | null => (DECIMAL.test(s.trim()) ? Number(s.trim().replace(',', '.')) : null)

// ───────────────────────────── Durées ─────────────────────────────

/** Champs de la section « Durées », tels que tapés (les coefficients en pourcentage). */
export type BrutDurees = {
  minutes: string
  pages: string
  dureeMin: string
  dureeMax: string
  coefs: string[]
  pause: string
}

export type ValeursDurees = Pick<Reglages, 'rythme' | 'dureeMin' | 'dureeMax' | 'coefsTours' | 'pauseMultiple'>

export type LectureDurees = { ok: true; valeurs: ValeursDurees } | { ok: false; erreurs: Erreurs }

/** Pourcentage affiché d'un coefficient : 0,35 → « 35 » (sans artefact de virgule flottante). */
const enPourcent = (c: number): string => String(Math.round(c * 10000) / 100)

export function brutDurees(r: Reglages): BrutDurees {
  return {
    minutes: String(r.rythme.minutes),
    pages: String(r.rythme.pages),
    dureeMin: String(r.dureeMin),
    dureeMax: String(r.dureeMax),
    coefs: r.coefsTours.map(enPourcent),
    pause: String(r.pauseMultiple),
  }
}

/**
 * Lit la section « Durées ». Règles : rythme entier ≥ 1 ; durée min multiple du pas et ≥ pas ; durée max multiple du
 * pas et ≥ durée min ; au moins un tour, chacun dans ]0 ; 100] % ; pause entière ≥ 0. Clés d'erreur : `minutes`,
 * `pages`, `dureeMin`, `dureeMax`, `coefs` (liste vide), `coef<i>` (tour i, 0-based), `pause`.
 */
export function lireDurees(b: BrutDurees, pas: number): LectureDurees {
  const erreurs: Erreurs = {}

  const minutes = entier(b.minutes)
  if (minutes === null || minutes < 1) erreurs.minutes = MSG_ENTIER
  const pages = entier(b.pages)
  if (pages === null || pages < 1) erreurs.pages = MSG_ENTIER

  const min = entier(b.dureeMin)
  if (min === null || min < 1) erreurs.dureeMin = MSG_ENTIER
  else if (min < pas) erreurs.dureeMin = `Au moins un pas de la grille (${pas} min).`
  else if (min % pas !== 0) erreurs.dureeMin = `Doit être un multiple de ${pas} min.`

  const max = entier(b.dureeMax)
  if (max === null || max < 1) erreurs.dureeMax = MSG_ENTIER
  else if (max % pas !== 0) erreurs.dureeMax = `Doit être un multiple de ${pas} min.`
  else if (min !== null && erreurs.dureeMin === undefined && max < min) erreurs.dureeMax = 'Au moins égale à la durée minimale.'

  const coefs: number[] = []
  if (b.coefs.length === 0) erreurs.coefs = 'Ajoute au moins un tour.'
  b.coefs.forEach((c, i) => {
    const p = decimal(c)
    if (p === null || p <= 0 || p > 100) erreurs[`coef${i}`] = 'Entre 1 et 100 %.'
    else coefs.push(p / 100)
  })

  const pause = entier(b.pause)
  if (pause === null) erreurs.pause = 'Un nombre entier de minutes, 0 ou plus.'

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs }
  return {
    ok: true,
    valeurs: {
      rythme: { minutes: minutes as number, pages: pages as number },
      dureeMin: min as number,
      dureeMax: max as number,
      coefsTours: coefs,
      pauseMultiple: pause as number,
    },
  }
}

// ───────────────────────────── Journée ─────────────────────────────

export function lireJournee(
  debut: string,
  fin: string,
): { ok: true; valeurs: Reglages['journee'] } | { ok: false; erreur: string } {
  if (!HEURE.test(debut) || !HEURE.test(fin)) return { ok: false, erreur: MSG_HEURES }
  if (hm(debut) >= hm(fin)) return { ok: false, erreur: 'Le début doit précéder la fin.' }
  return { ok: true, valeurs: { debut, fin } }
}

/**
 * Change le pas de la grille. Les durées min et max sont recalées sur des multiples du nouveau pas (au plus proche),
 * sans quoi un créneau pourrait tomber hors de la grille ; min ≥ pas et max ≥ min restent vrais.
 */
export function reglagesPourPas(r: Reglages, pas: Reglages['pas']): Reglages {
  const dureeMin = Math.max(pas, arrondiPas(r.dureeMin, pas))
  const dureeMax = Math.max(dureeMin, arrondiPas(r.dureeMax, pas))
  return { ...r, pas, dureeMin, dureeMax }
}

// ───────────────────────── Récurrence, indisponibilité ─────────────────────────

export type BrutRecurrence = {
  titre: string
  jours: number[]
  heureDebut: string
  heureFin: string
  du: string
  au: string
}

const jourEnMs = (j: string): number => {
  const [a, m, d] = j.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/** Longueur maximale d'une récurrence, en jours (du et au inclus). */
export const JOURS_MAX_RECURRENCE = 366

/** Clés d'erreur : `titre`, `jours`, `heures`, `dates`. Objet vide = valide. */
export function validerRecurrence(b: BrutRecurrence): Erreurs {
  const e: Erreurs = {}
  if (b.titre.trim() === '') e.titre = 'Donne un titre.'
  if (b.jours.length === 0) e.jours = 'Choisis au moins un jour.'
  if (!HEURE.test(b.heureDebut) || !HEURE.test(b.heureFin)) e.heures = MSG_HEURES
  else if (hm(b.heureFin) <= hm(b.heureDebut)) e.heures = MSG_FIN_HEURE
  if (!DATE.test(b.du) || !DATE.test(b.au)) e.dates = 'Choisis une date de début et de fin.'
  else if (b.au < b.du) e.dates = 'La date de fin doit suivre celle de début.'
  else if ((jourEnMs(b.au) - jourEnMs(b.du)) / 86_400_000 + 1 > JOURS_MAX_RECURRENCE) e.dates = `Au plus ${JOURS_MAX_RECURRENCE} jours.`
  return e
}

/** Édition d'une indisponibilité (heures du même jour) : clés `titre` et `heures`. */
export function validerIndispo(b: { titre: string; debut: string; fin: string }): Erreurs {
  const e: Erreurs = {}
  if (b.titre.trim() === '') e.titre = 'Donne un titre.'
  if (!HEURE.test(b.debut) || !HEURE.test(b.fin)) e.heures = MSG_HEURES
  else if (hm(b.fin) <= hm(b.debut)) e.heures = MSG_FIN_HEURE
  return e
}

// ───────────────────────────── Collèges ─────────────────────────────

/** Coefficient d'un collège : décimal (virgule ou point) entre 0,1 et 5 ; `null` sinon. */
export function lireCoefficient(s: string): number | null {
  const c = decimal(s)
  return c !== null && c >= 0.1 && c <= 5 ? c : null
}
