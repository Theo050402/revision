// Ce qui est sous le doigt pendant un glisser (spec §9.3–9.4) : lecture du DOM, sans écriture.
// Le jour vient de `jourSousX` sur les en-têtes des jours, l'heure de `yVersMinutes` (magnétisée au pas), le
// créneau visé (`data-creneau`) et sa moitié de la position du doigt par rapport au milieu du bloc.
//
// Pourquoi pas `elementFromPoint` ni le rectangle de la colonne : dans WebKit, une colonne dont un enfant change
// pendant le geste (fantôme incliné, bloc estompé, poignées masquées) peut garder une boîte périmée (largeur de
// la grille, hauteur nulle) ; `elementFromPoint` la traverse alors et renvoie son parent, et la cible clignotait
// d'une image à l'autre. Les en-têtes des jours et le corps de la grille ne changent jamais pendant le geste.
// Les blocs sont repérés par leurs heures (`data-debut`, `data-duree`) et non par leur boîte : un bloc qui s'écarte
// sous le doigt (aperçu, `transform`) ne change pas la cible, l'aperçu ne peut donc pas osciller.
import type { Cible } from '../../domain/actions-creneaux'
import type { Intervalle } from '../../domain/cascade'
import { minutesDe } from '../../domain/temps'
import type { Etat } from '../../domain/types'
import { jourSousX, yVersMinutes } from '../calendrier/geometrie'
import type { Source } from './apercu'
import type { Survol } from './glisse'

export type Lecture = { survol: Survol; el: HTMLElement | null }

/** Un bloc ne descend jamais sous cette hauteur à l'écran (voir Grille.tsx) : sa zone de prise non plus. */
const HAUTEUR_MIN_BLOC = 14

/**
 * Heure (magnétisée) et cible dans une colonne de jour, pour un doigt à `yCol` px du haut de la colonne.
 * `prise` : distance entre le doigt et le haut du bloc glissé (0 pour une carte de la bibliothèque).
 */
export function cibleColonne(
  col: HTMLElement,
  yCol: number,
  prise: number,
  plage: Intervalle,
  pxHeure: number,
  pas: number,
  ignorer: string | null,
): Cible {
  const t = yVersMinutes(yCol - prise, plage, pxHeure, pas)
  const doigt = plage.debut + (yCol * 60) / pxHeure

  let cibleId: string | null = null
  let moitie: Cible['moitie'] = 'haute'
  for (const b of col.querySelectorAll<HTMLElement>('.bloc-creneau[data-creneau]')) {
    const id = b.dataset.creneau as string
    if (id === ignorer || !b.dataset.debut) continue
    const debut = minutesDe(b.dataset.debut)
    const duree = Math.max(Number(b.dataset.duree), (HAUTEUR_MIN_BLOC * 60) / pxHeure)
    if (doigt >= debut && doigt < debut + duree) {
      cibleId = id
      moitie = doigt < debut + duree / 2 ? 'haute' : 'basse'
      break
    }
  }
  return { jour: col.dataset.jour as string, t, cibleId, moitie }
}

const contient = (r: DOMRect, x: number, y: number): boolean =>
  x >= r.left && x < r.right && y >= r.top && y < r.bottom

const RIEN: Lecture = { survol: null, el: null }

/** Lecture au point (x, y) : corbeille, colonne de jour, jour du mois (sans sa cible) ou rien. */
export function lire(x: number, y: number, source: Source, prise: number, e: Etat): Lecture {
  const corbeille = document.querySelector<HTMLElement>('[data-corbeille][data-visible="true"]')
  if (corbeille && contient(corbeille.getBoundingClientRect(), x, y)) {
    return { survol: source.type === 'creneau' ? { type: 'corbeille' } : null, el: corbeille }
  }

  // Seule la partie visible de la zone qui défile compte, sous l'en-tête collant des jours.
  const defil = document.querySelector<HTMLElement>('.calendrier-defilement')
  if (!defil || !contient(defil.getBoundingClientRect(), x, y)) return RIEN
  const tete = defil.querySelector<HTMLElement>('.grille-tete, .mois-entete')
  if (tete && y < tete.getBoundingClientRect().bottom) return RIEN

  const grille = defil.querySelector<HTMLElement>('.grille')
  const corps = grille?.querySelector<HTMLElement>('.grille-corps')
  if (grille && corps) {
    const rc = corps.getBoundingClientRect()
    if (y < rc.top || y >= rc.bottom) return RIEN
    const cols = [...corps.querySelectorAll<HTMLElement>('.colonne[data-jour]')]
    const tetes = grille.querySelectorAll<HTMLElement>('.jour-tete')
    const colonnes = cols.map((c, i) => {
      const r = tetes[i].getBoundingClientRect()
      return { jour: c.dataset.jour as string, gauche: r.left, largeur: r.width }
    })
    const jour = jourSousX(x, colonnes)
    const col = cols.find((c) => c.dataset.jour === jour)
    if (!col) return RIEN
    const pxHeure = Number(grille.dataset.pxHeure)
    const plage = { debut: Number(grille.dataset.plageDebut), fin: Number(grille.dataset.plageFin) }
    const ignorer = source.type === 'creneau' ? source.id : source.type === 'groupe' ? source.ancre : null
    const cible = cibleColonne(col, y - rc.top, prise, plage, pxHeure, e.reglages.pas, ignorer)
    return { survol: { type: 'colonne', cible }, el: col }
  }

  for (const c of defil.querySelectorAll<HTMLElement>('.mois-jour[data-jour]')) {
    if (!contient(c.getBoundingClientRect(), x, y)) continue
    // La première heure libre (`cibleMois`) n'est cherchée que quand le jour survolé change : voir ContexteDnd.
    return { survol: { type: 'mois', jour: c.dataset.jour as string, cible: null }, el: c }
  }
  return RIEN
}

/** Clé d'un survol : l'aperçu n'est recalculé que si elle change (minute, jour, cible, moitié). */
export function cleSurvol(s: Survol): string {
  if (s === null) return ''
  if (s.type === 'corbeille') return 'corbeille'
  if (s.type === 'mois') return `mois|${s.jour}`
  const c = s.cible
  return `col|${c.jour}|${c.t}|${c.cibleId ?? ''}|${c.moitie}`
}
