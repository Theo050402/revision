import { OFFICIELS } from './catalog'

export type Officiel = { numero: number; titre: string }

/** Minuscules sans accents, ligatures éclatées : « Œsophage » et « oesophage » se valent (œ → oe, æ → ae). */
export function normaliser(s: string): string {
  return s
    .toLowerCase()
    .replace(/\u0153/g, 'oe')
    .replace(/\u00e6/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

let index: { numero: number; titre: string; norme: string }[] | undefined

/**
 * Items officiels correspondant à la saisie : un nombre cherche par début de numéro, sinon tous les mots
 * doivent apparaître dans l'intitulé (sans tenir compte des accents ni de la casse). Triés par numéro.
 */
export function chercherOfficiels(saisie: string, officiels: Map<number, string> = OFFICIELS): Officiel[] {
  const q = normaliser(saisie).trim()
  const base =
    officiels === OFFICIELS
      ? (index ??= [...OFFICIELS].map(([numero, titre]) => ({ numero, titre, norme: normaliser(titre) })))
      : [...officiels].map(([numero, titre]) => ({ numero, titre, norme: normaliser(titre) }))
  let trouves = base
  if (q !== '') {
    if (/^\d+$/.test(q)) trouves = base.filter((i) => String(i.numero).startsWith(q))
    else {
      const mots = q.split(/\s+/)
      trouves = base.filter((i) => mots.every((m) => i.norme.includes(m)))
    }
  }
  return trouves.sort((a, b) => a.numero - b.numero).map(({ numero, titre }) => ({ numero, titre }))
}
