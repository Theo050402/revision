// Enregistrer un réglage qui change les durées, puis recalculer les créneaux à venir (spec « Améliorations après
// recette », B.1 et B.4) : une seule transition d'état, hors historique d'annulation.
import { messageRecalcul, recalculerCreneaux, type PorteeRecalcul } from '../domain/recalcul'
import type { Etat } from '../domain/types'
import { aujourdhuiParis } from './calendrier/maintenant'
import { useStore } from './store'
import { toast } from './Toast'

type Options = {
  /**
   * Portée du recalcul, fixe ou calculée d'après l'état avant et après le changement ; `null` = pas de recalcul.
   * Absente = tous les créneaux.
   */
  portee?: PorteeRecalcul | null | ((avant: Etat, apres: Etat) => PorteeRecalcul | null)
  /** Vider l'historique même si aucun créneau n'a changé (réimport d'un collège). */
  viderHistorique?: boolean
}

/**
 * Applique `changement` puis recalcule les créneaux concernés, en un seul état. L'historique n'est vidé que si le
 * recalcul a effectivement changé des créneaux : annuler ramènerait sinon d'anciennes durées sous les nouveaux
 * réglages. Affiche le résumé du recalcul s'il y en a un. Renvoie `false` si rien n'a été appliqué.
 */
export function appliquerEtRecalculer(changement: (e: Etat) => Etat | null, options: Options = {}): boolean {
  const avant = useStore.getState().etat
  const apres = changement(avant)
  if (apres === null) return false
  const portee = typeof options.portee === 'function' ? options.portee(avant, apres) : (options.portee ?? {})
  const recalcul = portee === null ? null : recalculerCreneaux(apres, aujourdhuiParis(), portee)
  const suivant = recalcul?.etat ?? apres
  const creneauxChanges = suivant !== apres
  const ok = useStore
    .getState()
    .appliquerSansHistorique(() => suivant, { viderHistorique: creneauxChanges || options.viderHistorique === true })
  if (!ok) return false
  const message = recalcul ? messageRecalcul(recalcul.bilan) : null
  if (message !== null) toast(message)
  return true
}
