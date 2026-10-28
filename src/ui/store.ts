// Store zustand : l'état de l'application (`Etat` immuable), l'historique d'annulation (en mémoire
// uniquement, 50 niveaux, spec §4 et §9.6) et la persistance IndexedDB.
import { create } from 'zustand'
import { etatVide } from '../domain/defaults'
import type { Etat } from '../domain/types'
import { chargerTout, demanderPersistance, enregistrer } from '../storage/db'

export const NIVEAUX_ANNULATION = 50

/** Message de la spec §14 (échec d'écriture, quota). */
export const MESSAGE_QUOTA = "Plus d'espace pour enregistrer. Sauvegarde tes données puis libère de la place."

type StoreState = {
  etat: Etat
  /** Anciens états, du plus ancien au plus récent (au plus 50). */
  passe: Etat[]
  /** États annulés, le prochain à rétablir en dernier. */
  futur: Etat[]
  pret: boolean
  erreur: string | null
  /** `null` ou la même référence = refus : aucun effet, renvoie `false`. */
  appliquer: (f: (e: Etat) => Etat | null) => boolean
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

function estQuota(e: unknown): boolean {
  let x: unknown = e
  for (let n = 0; n < 4 && typeof x === 'object' && x !== null; n++) {
    if ((x as { name?: unknown }).name === 'QuotaExceededError') return true
    x = (x as { inner?: unknown }).inner
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
function persister(cible: Etat): void {
  file = file.then(async () => {
    try {
      await enregistrer(persiste, cible)
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

export const useStore = create<StoreState>()((set, get) => ({
  etat: etatVide(),
  passe: [],
  futur: [],
  pret: false,
  erreur: null,

  appliquer(f) {
    const { etat, passe } = get()
    const suivant = f(etat)
    if (suivant === null || suivant === etat) return false
    set({ etat: suivant, passe: [...passe, etat].slice(-NIVEAUX_ANNULATION), futur: [] })
    persister(suivant)
    return true
  },

  annuler() {
    const { etat, passe, futur } = get()
    const precedent = passe[passe.length - 1]
    if (precedent === undefined) return
    set({ etat: precedent, passe: passe.slice(0, -1), futur: [...futur, etat] })
    persister(precedent)
  },

  retablir() {
    const { etat, passe, futur } = get()
    const suivant = futur[futur.length - 1]
    if (suivant === undefined) return
    set({ etat: suivant, passe: [...passe, etat].slice(-NIVEAUX_ANNULATION), futur: futur.slice(0, -1) })
    persister(suivant)
  },

  restaurer(etat) {
    set({ etat, passe: [], futur: [] })
    persister(etat)
  },

  async initialiser() {
    try {
      const etat = await chargerTout()
      persiste = etat
      set({ etat, passe: [], futur: [], pret: true, erreur: null })
      void demanderPersistance()
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      set({ pret: true, erreur: `Lecture impossible : ${detail}` })
    }
  },
}))
