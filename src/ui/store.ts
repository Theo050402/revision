// Store zustand : l'état de l'application (`Etat` immuable), l'historique d'annulation (en mémoire
// uniquement, 50 niveaux, spec §4 et §9.6) et la persistance IndexedDB.
import { create } from 'zustand'
import { reconcilierExport } from '../domain/actions-etat'
import { etatVide } from '../domain/defaults'
import type { Etat } from '../domain/types'
import { chargerTout, demanderPersistance, enregistrer, remplacerTout } from '../storage/db'

export const NIVEAUX_ANNULATION = 50

/** Message de la spec §14 (échec d'écriture, quota). */
export const MESSAGE_QUOTA = "Plus d'espace pour enregistrer. Sauvegarde tes données puis libère de la place."

export type OptionsSansHistorique = {
  /**
   * Vide aussi l'historique (passe et futur) : pour les opérations après lesquelles un état ancien n'a plus de sens
   * (suppression ou réimport d'un collège : annuler ne doit jamais ressusciter ses créneaux).
   */
  viderHistorique?: boolean
}

type StoreState = {
  etat: Etat
  /** Anciens états, du plus ancien au plus récent (au plus 50). */
  passe: Etat[]
  /** États annulés, le prochain à rétablir en dernier. */
  futur: Etat[]
  pret: boolean
  erreur: string | null
  /** Réponse de `storage.persist()` : `null` tant qu'elle n'est pas connue, `false` si le navigateur la refuse (§14). */
  persistance: boolean | null
  /** `null` ou la même référence = refus : aucun effet, renvoie `false`. Refusé aussi tant que `pret` est faux. */
  appliquer: (f: (e: Etat) => Etat | null) => boolean
  /**
   * Comme `appliquer` (même garde `pret`, même file d'écriture) mais hors historique : n'empile
   * rien dans `passe` et ne vide pas `futur` (sauf `viderHistorique`). Pour les champs non annulables
   * (réglages, collèges, items, spec §9.6).
   */
  appliquerSansHistorique: (f: (e: Etat) => Etat | null, options?: OptionsSansHistorique) => boolean
  annuler: () => void
  retablir: () => void
  /** Remplace tout l'état (restauration d'une sauvegarde) : vide l'historique et persiste. */
  restaurer: (etat: Etat) => void
  initialiser: () => Promise<void>
}

/** Dernier état dont l'écriture en base a réussi : les diffs partent toujours de lui. */
let persiste: Etat = etatVide()
/** Chaîne des écritures : chacune attend la précédente, elles ne s'entrelacent jamais. */
let file: Promise<void> = Promise.resolve()

function estQuota(e: unknown, profondeur = 0): boolean {
  if (profondeur > 4 || typeof e !== 'object' || e === null) return false
  const { name, inner, failures } = e as { name?: unknown; inner?: unknown; failures?: unknown }
  if (name === 'QuotaExceededError') return true
  if (estQuota(inner, profondeur + 1)) return true
  // Dexie `BulkError` (bulkPut / bulkDelete) : les vraies erreurs sont dans `failures`.
  if (typeof failures === 'object' && failures !== null) {
    return Object.values(failures).some((f) => estQuota(f, profondeur + 1))
  }
  return false
}

function messageErreur(e: unknown): string {
  if (estQuota(e)) return MESSAGE_QUOTA
  const detail = e instanceof Error ? e.message : String(e)
  return `Enregistrement impossible : ${detail}`
}

/**
 * Écriture « tire-et-oublie » mais sérialisée. Le diff part du dernier état réellement écrit
 * (et non de l'état précédent en mémoire) : après un échec, l'écriture suivante rattrape ce qui
 * manquait en base. Un échec renseigne `erreur` ; il ne remonte jamais à l'appelant.
 */
function persister(cible: Etat, remplacement = false): void {
  file = file.then(async () => {
    try {
      if (remplacement) await remplacerTout(cible)
      else await enregistrer(persiste, cible)
      persiste = cible
      if (useStore.getState().erreur !== null) useStore.setState({ erreur: null })
    } catch (e) {
      useStore.setState({ erreur: messageErreur(e) })
    }
  })
}

/** Résolu quand toutes les écritures en cours sont terminées (tests, avant un export). */
export function attendreEcritures(): Promise<void> {
  return file
}

/**
 * Un état d'historique rejoué garde les champs non annulables de l'état courant : annuler une
 * opération sur les créneaux ne doit pas ramener d'anciens réglages, ni renommer un collège (spec §9.6). Le suivi de
 * l'export (`versionExportee`, suppressions en attente) suit la même règle : voir `reconcilierExport`.
 */
function rejouer(snapshot: Etat, courant: Etat): Etat {
  return {
    ...reconcilierExport(snapshot, courant),
    reglages: courant.reglages,
    premierExportFait: courant.premierExportFait,
    colleges: courant.colleges,
    items: courant.items,
  }
}

export const useStore = create<StoreState>()((set, get) => ({
  etat: etatVide(),
  passe: [],
  futur: [],
  pret: false,
  erreur: null,
  persistance: null,

  appliquer(f) {
    const { etat, passe, pret } = get()
    if (!pret) return false
    const suivant = f(etat)
    if (suivant === null || suivant === etat) return false
    set({ etat: suivant, passe: [...passe, etat].slice(-NIVEAUX_ANNULATION), futur: [] })
    persister(suivant)
    return true
  },

  appliquerSansHistorique(f, options) {
    const { etat, pret } = get()
    if (!pret) return false
    const suivant = f(etat)
    if (suivant === null || suivant === etat) return false
    set(options?.viderHistorique ? { etat: suivant, passe: [], futur: [] } : { etat: suivant })
    persister(suivant)
    return true
  },

  annuler() {
    const { etat, passe, futur, pret } = get()
    if (!pret) return
    const precedent = passe[passe.length - 1]
    if (precedent === undefined) return
    const cible = rejouer(precedent, etat)
    set({ etat: cible, passe: passe.slice(0, -1), futur: [...futur, etat] })
    persister(cible)
  },

  retablir() {
    const { etat, passe, futur, pret } = get()
    if (!pret) return
    const suivant = futur[futur.length - 1]
    if (suivant === undefined) return
    const cible = rejouer(suivant, etat)
    set({ etat: cible, passe: [...passe, etat].slice(-NIVEAUX_ANNULATION), futur: futur.slice(0, -1) })
    persister(cible)
  },

  restaurer(etat) {
    // Chemin de récupération : permis même si la lecture initiale a échoué. Dans ce cas la base
    // n'a jamais été lue, donc on la remplace en entier plutôt que de la différencier.
    const horsLecture = !get().pret
    set({ etat, passe: [], futur: [], pret: true })
    persister(etat, horsLecture)
  },

  async initialiser() {
    try {
      const etat = await chargerTout()
      persiste = etat
      set({ etat, passe: [], futur: [], pret: true, erreur: null })
      // Une seule demande, au démarrage : la réponse alimente le rappel de Réglages › Données.
      void demanderPersistance().then((ok) => set({ persistance: ok }))
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      // `pret` reste faux : l'interface affiche l'erreur et aucune modification n'est acceptée
      // par-dessus une base non lue (seule `restaurer` reste possible).
      set({ pret: false, erreur: `Lecture impossible : ${detail}` })
    }
  },
}))
