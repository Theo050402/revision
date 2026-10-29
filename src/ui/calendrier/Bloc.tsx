// Blocs de la grille (spec §9.2, §13). Le glisser-déposer est délégué à la grille (un seul `useDraggable`, voir
// dnd/ContexteDnd.tsx) : ici, seulement le tap (`onOuvrir`, fiche de la tâche 19), le décalage de l'aperçu
// (`transform`, jamais `top` pendant le geste) et le fantôme. `data-creneau` / `data-indispo` servent de cibles.
import { memo, type CSSProperties } from 'react'
import { versHm } from '../../domain/temps'
import type { Creneau, Indispo, Item } from '../../domain/types'
import { descriptionCreneau, etiquetteCreneau } from './etiquette'

/** Hauteur minimale (px) pour montrer deux lignes (titre + « T1 · 22 p · 2h45 ») ; en dessous, une seule. */
export const HAUTEUR_DEUX_LIGNES = 34
const HAUTEUR_LIGNE_TITRE = 15
const HAUTEUR_LIGNE_META = 13
const MARGES_VERTICALES = 6
const LIGNES_TITRE_MAX = 3

const teinte = (couleur: number): string => `var(--c${((couleur % 6) + 6) % 6})`

type CreneauProps = {
  creneau: Creneau
  item: Item | undefined
  /** Index de la palette des surligneurs (`college.couleur`). */
  couleur: number
  haut: number
  hauteur: number
  /** Aperçu de cascade : décalage vertical (px) pendant le geste, animé par `transform`. */
  decalage?: number
  /** Créneau en cours de déplacement : il reste à sa place, estompé ; le fantôme montre où il ira. */
  source?: boolean
  /** Tap sans glisser : ouvre la fiche du créneau (tâche 19). */
  onOuvrir?: (id: string) => void
}

export const BlocCreneau = memo(function BlocCreneau({
  creneau,
  item,
  couleur,
  haut,
  hauteur,
  decalage = 0,
  source = false,
  onOuvrir,
}: CreneauProps) {
  const { numero, titre, meta } = etiquetteCreneau(creneau, item)
  const deuxLignes = hauteur >= HAUTEUR_DEUX_LIGNES
  const nonExporte = creneau.versionExportee !== creneau.version
  const marques = (nonExporte ? 1 : 0) + (creneau.fait ? 1 : 0)
  const place = hauteur - MARGES_VERTICALES - (deuxLignes ? HAUTEUR_LIGNE_META : 0)
  const lignes = Math.max(1, Math.min(LIGNES_TITRE_MAX, Math.floor(place / HAUTEUR_LIGNE_TITRE)))
  const style = {
    top: haut,
    height: hauteur,
    '--teinte': teinte(couleur),
    '--lignes': lignes,
    transform: decalage !== 0 ? `translateY(${decalage}px)` : undefined,
  } as CSSProperties
  return (
    <div
      className="bloc bloc-creneau"
      data-creneau={creneau.id}
      data-debut={creneau.debut ?? undefined}
      data-duree={creneau.duree}
      data-duree-perso={creneau.dureePerso}
      data-fait={creneau.fait}
      data-marques={marques}
      data-source={source || undefined}
      style={style}
      role="group"
      aria-label={descriptionCreneau(creneau, item)}
      onClick={onOuvrir && (() => onOuvrir(creneau.id))}
    >
      <span className={lignes === 1 ? 'bloc-titre bloc-titre-une' : 'bloc-titre'}>
        <span className="bloc-numero">{numero}</span>
        <span className="bloc-nom">{titre.slice(numero.length)}</span>
      </span>
      {deuxLignes && <span className="bloc-meta">{meta}</span>}
      {marques > 0 && (
        <span className="bloc-marques" aria-hidden="true">
          {nonExporte && <i className="bloc-point" data-marque="non-exporte" />}
          {creneau.fait && (
            <svg className="bloc-coche" data-marque="fait" viewBox="0 0 12 12" width="12" height="12" focusable="false">
              <path d="M2 6.5 5 9.5 10.5 3" />
            </svg>
          )}
        </span>
      )}
    </div>
  )
})

type IndispoProps = {
  indispo: Indispo
  debut: number
  fin: number
  haut: number
  hauteur: number
  /** Tap : ouvre l'indisponibilité (tâche 19). */
  onOuvrir?: (id: string) => void
}

/** 480 → « 8h », 810 → « 13h30 », 1440 → « 24h ». */
export const heureCourte = (min: number): string =>
  min >= 1440 ? '24h' : versHm(min).replace(/^0/, '').replace(':00', 'h').replace(':', 'h')

export const BlocIndispo = memo(function BlocIndispo({ indispo, debut, fin, haut, hauteur, onOuvrir }: IndispoProps) {
  const deuxLignes = hauteur >= HAUTEUR_DEUX_LIGNES
  return (
    <div
      className="bloc bloc-indispo"
      data-indispo={indispo.id}
      style={{ top: haut, height: hauteur }}
      role="group"
      aria-label={`${indispo.titre}, indisponible de ${heureCourte(debut)} à ${heureCourte(fin)}`}
      onClick={onOuvrir && (() => onOuvrir(indispo.id))}
    >
      <span className="bloc-titre">{indispo.titre}</span>
      {deuxLignes && (
        <span className="bloc-meta">
          {heureCourte(debut)}–{heureCourte(fin)}
        </span>
      )}
    </div>
  )
})

type FantomeProps = {
  creneau: Creneau
  item: Item | undefined
  couleur: number
  haut: number
  hauteur: number
  /** Heure (minutes) où le créneau serait posé. */
  debut: number
  /** Dépôt refusé à cet endroit : teinte rouge, sans message (spec §14). */
  refus: boolean
}

/**
 * Fantôme du glisser (spec §9.3, §13.3) : le bloc à l'heure magnétisée, soulevé (−1,5°, ombre, contour
 * tireté). Sans `data-creneau` : ce n'est pas un créneau et il n'est jamais une cible.
 */
export function BlocFantome({ creneau, item, couleur, haut, hauteur, debut, refus }: FantomeProps) {
  const { titre } = etiquetteCreneau(creneau, item)
  const style = { top: haut, height: hauteur, '--teinte': teinte(couleur) } as CSSProperties
  return (
    <div className="bloc bloc-creneau fantome" data-fantome={creneau.id} data-refus={refus} style={style} aria-hidden="true">
      <span className="bloc-titre bloc-titre-une">{titre}</span>
      {hauteur >= HAUTEUR_DEUX_LIGNES && (
        <span className="bloc-meta">
          {heureCourte(debut)} → {heureCourte(debut + creneau.duree)}
        </span>
      )}
    </div>
  )
}
