import type { Etat, Reglages } from './types'

/** Réglages par défaut (spec §11). Ne pas muter : `etatVide` en fait une copie. */
export const REGLAGES_DEFAUT: Reglages = {
  rythme: { minutes: 60, pages: 8 },
  dureeMin: 30,
  dureeMax: 180,
  coefsTours: [1, 0.5, 0.35, 0.25],
  pauseMultiple: 10,
  journee: { debut: '07:00', fin: '23:00' },
  pas: 15,
  rappel: 0,
  theme: 'auto',
}

/** État initial. Renvoie des objets neufs à chaque appel (aucune référence partagée). */
export function etatVide(): Etat {
  return {
    colleges: {},
    items: {},
    creneaux: {},
    indispos: {},
    recurrences: {},
    suppressions: {},
    reglages: {
      ...REGLAGES_DEFAUT,
      rythme: { ...REGLAGES_DEFAUT.rythme },
      coefsTours: [...REGLAGES_DEFAUT.coefsTours],
      journee: { ...REGLAGES_DEFAUT.journee },
    },
    premierExportFait: false,
  }
}
