// Lasso (spec §D.1) : après un appui long sur un emplacement vide (calendrier/gestes.ts), le doigt trace un rectangle
// sur plusieurs jours et plusieurs heures. Tout est calculé en coordonnées de grille (jour + minutes) : le point sous
// le doigt est relu à chaque image d'après la position courante des colonnes, si bien que le rectangle et les
// créneaux touchés restent justes quand la grille défile (défilement automatique aux bords, comme en §C.2).
import type { Intervalle } from '../../domain/cascade'
import { creneauxDansZone, type Zone } from '../../domain/selection'
import { defilerAuxBords } from '../dnd/bords'
import { marquerGeste, saisirPointeur } from '../dnd/glisse'
import { haptique } from '../mouvement/haptique'
import { useStore } from '../store'
import { useLasso, useSelection } from './useSelection'

/** Colonne de jour telle qu'elle est à l'écran (px, bords gauche et droit). */
export type ColonneEcran = { jour: string; gauche: number; droite: number }
/** Point de la grille : un jour et une minute depuis minuit. */
export type PointGrille = { jour: string; minute: number }

/** Pas d'une image au-delà duquel (onglet en veille) le défilement n'avance pas d'un bond (s). */
const DT_MAX = 0.05

/**
 * Point de grille sous le doigt (`x`, `y` : px écran). `haut` est le haut des colonnes à l'écran à cet instant (il
 * remonte quand la grille défile). Hors des colonnes : le premier ou le dernier jour visible ; minute bornée à la plage
 * affichée et arrondie à la minute.
 */
export function pointSousDoigt(
  x: number,
  y: number,
  colonnes: readonly ColonneEcran[],
  haut: number,
  plage: Intervalle,
  pxHeure: number,
): PointGrille {
  let jour = colonnes[0]?.jour ?? ''
  for (const c of colonnes) {
    if (x >= c.gauche) jour = c.jour
    if (x < c.droite) break
  }
  const minute = Math.round(plage.debut + ((y - haut) * 60) / pxHeure)
  return { jour, minute: Math.min(plage.fin, Math.max(plage.debut, minute)) }
}

/** Rectangle entre deux points de grille, ordonné (jours `YYYY-MM-DD` comparés comme des chaînes). */
export function zoneEntre(a: PointGrille, b: PointGrille): Zone {
  return {
    jourDebut: a.jour <= b.jour ? a.jour : b.jour,
    jourFin: a.jour <= b.jour ? b.jour : a.jour,
    debut: Math.min(a.minute, b.minute),
    fin: Math.max(a.minute, b.minute),
  }
}

/** Créneaux de `apres` absents de `avant` et pas déjà sélectionnés : ceux qui viennent d'être touchés. */
export function ajoutes(avant: readonly string[], apres: readonly string[], deja: ReadonlySet<string>): string[] {
  const vus = new Set(avant)
  return apres.filter((id) => !vus.has(id) && !deja.has(id))
}

export type ControleLasso = {
  /** Le doigt a bougé (px écran) : relu à l'image suivante. */
  deplacer: (x: number, y: number) => void
  /** Lâcher : les créneaux touchés rejoignent la sélection (le mode s'ouvre s'il y en a au moins un). */
  finir: (x: number, y: number) => void
  /** Geste annulé (navigateur, Échap) : rien n'est ajouté. */
  annuler: () => void
}

/**
 * Commence un lasso depuis la colonne `col` au point (`x`, `y`) pour le pointeur `pointeur`. Le geste est marqué
 * (pas de défilement tactile, pas de balayage, un seul pointeur) jusqu'à `finir` ou `annuler`.
 */
export function commencerLasso(col: HTMLElement, x: number, y: number, pointeur: number): ControleLasso {
  const corps = col.parentElement as HTMLElement
  const grille = col.closest<HTMLElement>('.grille')
  const defil = col.closest<HTMLElement>('.calendrier-defilement')
  const pxHeure = Number(grille?.dataset.pxHeure ?? 48)
  const plage = { debut: Number(grille?.dataset.plageDebut ?? 0), fin: Number(grille?.dataset.plageFin ?? 1440) }

  const lire = (px: number, py: number): PointGrille => {
    const colonnes: ColonneEcran[] = []
    for (const c of corps.querySelectorAll<HTMLElement>(':scope > .colonne[data-jour]')) {
      const r = c.getBoundingClientRect()
      colonnes.push({ jour: c.dataset.jour as string, gauche: r.left, droite: r.right })
    }
    return pointSousDoigt(px, py, colonnes, col.getBoundingClientRect().top, plage, pxHeure)
  }

  const ancre = lire(x, y)
  const doigt = { x, y }
  let cle = ''
  let sale = false
  let reste = 0
  let instant = performance.now()
  let image = 0
  let fini = false

  /**
   * Zone sous le doigt et créneaux touchés ; écrit seulement si la zone change. Retour haptique à chaque ajout, sauf
   * à l'activation (`silencieux`), qui a déjà le sien.
   */
  const evaluer = (silencieux = false) => {
    const zone = zoneEntre(ancre, lire(doigt.x, doigt.y))
    const k = `${zone.jourDebut}|${zone.jourFin}|${zone.debut}|${zone.fin}`
    if (k === cle) return
    cle = k
    const touches = creneauxDansZone(useStore.getState().etat, zone)
    if (!silencieux && ajoutes(useLasso.getState().touches, touches, useSelection.getState().ids).length > 0) {
      haptique('leger')
    }
    useLasso.setState({ zone, touches })
  }

  const boucle = () => {
    image = requestAnimationFrame(boucle)
    const maintenant = performance.now()
    const dt = Math.min(DT_MAX, (maintenant - instant) / 1000)
    instant = maintenant
    if (defil) {
      const d = defilerAuxBords(defil, doigt.x, doigt.y, dt, reste)
      reste = d.reste
      if (d.bouge) sale = true
    }
    if (!sale) return
    sale = false
    evaluer()
  }

  const clavier = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation() // Échap annule le tracé seulement, pas le mode sélection
    effacer()
  }

  const effacer = () => {
    if (terminer()) useLasso.setState({ zone: null, touches: [] })
  }

  const terminer = () => {
    if (fini) return false
    fini = true
    cancelAnimationFrame(image)
    window.removeEventListener('keydown', clavier, true)
    marquerGeste(false)
    saisirPointeur(null)
    return true
  }

  marquerGeste(true)
  saisirPointeur(pointeur)
  window.addEventListener('keydown', clavier, true)
  haptique('leger') // l'appui long a pris (spec §C.1, §C.5)
  evaluer(true)
  image = requestAnimationFrame(boucle)

  return {
    deplacer(px, py) {
      doigt.x = px
      doigt.y = py
      sale = true
    },
    finir(px, py) {
      if (fini) return
      doigt.x = px
      doigt.y = py
      evaluer()
      const { touches } = useLasso.getState()
      terminer()
      useSelection.getState().ajouter(touches)
      useLasso.setState({ zone: null, touches: [] })
    },
    annuler: effacer,
  }
}
