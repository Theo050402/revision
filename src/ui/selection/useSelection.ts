// Sélection de créneaux (spec §D.1, §D.2) : hors du store de l'application, rien n'est persisté ni annulable. Le mode
// sélection est ouvert tant qu'au moins un créneau est sélectionné ; le vider le referme.
import { create } from 'zustand'
import type { Zone } from '../../domain/selection'

type Selection = {
  ids: ReadonlySet<string>
  /** Ajoute le créneau s'il n'y est pas, le retire sinon (toucher un créneau en mode sélection). */
  basculer: (id: string) => void
  /** Ajoute ces créneaux à la sélection (lâcher d'un lasso : un nouveau lasso ajoute). */
  ajouter: (ids: Iterable<string>) => void
  /** Quitte le mode sélection. */
  vider: () => void
}

const VIDE: ReadonlySet<string> = new Set()

export const useSelection = create<Selection>()((set, get) => ({
  ids: VIDE,
  basculer(id) {
    const ids = new Set(get().ids)
    if (!ids.delete(id)) ids.add(id)
    set({ ids: ids.size === 0 ? VIDE : ids })
  },
  ajouter(nouveaux) {
    const avant = get().ids
    const ids = new Set(avant)
    for (const id of nouveaux) ids.add(id)
    if (ids.size !== avant.size) set({ ids })
  },
  vider() {
    if (get().ids.size > 0) set({ ids: VIDE })
  },
}))

/** Vrai en mode sélection (au moins un créneau sélectionné). */
export const enSelection = (): boolean => useSelection.getState().ids.size > 0

/** Quitte le mode sélection (autre écran, feuille, vue). */
export const quitterSelection = (): void => useSelection.getState().vider()

/** « N sélectionnés », suivi de « · M hors de la vue » quand des sélectionnés sont hors des jours affichés. */
export function texteSelection(n: number, horsVue = 0): string {
  const base = n > 1 ? `${n} sélectionnés` : `${n} sélectionné`
  return horsVue > 0 ? `${base} · ${horsVue} hors de la vue` : base
}

/** Sélectionnés placés hors des jours affichés (`YYYY-MM-DD`). */
export function horsDeLaVue(
  ids: readonly string[],
  creneaux: Readonly<Record<string, { debut: string | null }>>,
  jours: readonly string[],
): number {
  const affiches = new Set(jours)
  let n = 0
  for (const id of ids) {
    const debut = creneaux[id]?.debut
    if (debut != null && !affiches.has(debut.slice(0, 10))) n++
  }
  return n
}

export const texteSuppression = (n: number): string => (n > 1 ? `${n} créneaux supprimés` : `${n} créneau supprimé`)

/**
 * Lasso en cours de tracé : sa zone (jours et minutes, jamais des pixels) et les créneaux qu'il touche, surlignés en
 * direct. Vide hors du tracé. Les créneaux touchés ne rejoignent la sélection qu'au lâcher.
 */
export const useLasso = create<{ zone: Zone | null; touches: readonly string[] }>()(() => ({ zone: null, touches: [] }))
