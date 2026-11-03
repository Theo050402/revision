// Blocs de la grille (spec §9.2, §13). Le glisser-déposer est délégué à la grille (un seul `useDraggable`, voir
// dnd/ContexteDnd.tsx) : ici, seulement le tap (`onOuvrir`, fiche de la tâche 19) et le décalage de l'aperçu de
// cascade (`transform` animé par ressort, jamais `top` pendant le geste). `data-creneau` / `data-indispo` servent
// de cibles. L'emplacement d'atterrissage du glisser est dans dnd/Atterrissage.tsx.
import { memo, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import type { Creneau, Indispo, Item } from '../../domain/types'
import { useVol } from '../dnd/glisse'
import { animerValeur, RESSORT_RAPIDE, type Anim } from '../mouvement/ressort'
import { useLasso, useSelection } from '../selection/useSelection'
import { descriptionCreneau, etiquetteCreneau, heureCourte } from './etiquette'

export { heureCourte }

/** Hauteur minimale (px) pour montrer deux lignes (titre + « T1 · 22 p · 2h45 ») ; en dessous, une seule. */
export const HAUTEUR_DEUX_LIGNES = 34
const HAUTEUR_LIGNE_TITRE = 15
const HAUTEUR_LIGNE_META = 13
const MARGES_VERTICALES = 6
const LIGNES_TITRE_MAX = 3

/** Entrée ou espace sur un bloc : même effet qu'un tap (la fiche s'ouvre, le focus y revient à la fermeture). */
function ouvrirAuClavier(ev: KeyboardEvent, ouvrir: () => void): void {
  if (ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return
  ev.preventDefault()
  ouvrir()
}

const teinte = (couleur: number): string => `var(--c${((couleur % 6) + 6) % 6})`

type CreneauProps = {
  creneau: Creneau
  item: Item | undefined
  /** Index de la palette des surligneurs (`college.couleur`). */
  couleur: number
  haut: number
  hauteur: number
  /** Aperçu de cascade : décalage vertical (px) pendant le geste, animé par ressort sur `transform`. */
  decalage?: number
  /** Créneau en cours de déplacement : il reste à sa place, estompé ; l'emplacement montre où il ira. */
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
  const ref = useRef<HTMLDivElement>(null)
  useDecalage(ref, haut, decalage)
  const enVol = useVol((s) => s.caches.includes(creneau.id))
  // Sélectionné (mode sélection) ou touché par le lasso en cours de tracé (spec §D.1, §D.2).
  const selectionne = useSelection((s) => s.ids.has(creneau.id))
  const touche = useLasso((s) => s.touches.includes(creneau.id))
  const marque = selectionne || touche
  const { marques, lignes } = miseEnPageBloc(creneau, hauteur)
  const style = {
    top: haut,
    height: hauteur,
    '--teinte': teinte(couleur),
    '--lignes': lignes,
  } as CSSProperties
  return (
    <div
      ref={ref}
      className="bloc bloc-creneau"
      data-creneau={creneau.id}
      data-debut={creneau.debut ?? undefined}
      data-duree={creneau.duree}
      data-duree-perso={creneau.dureePerso}
      data-fait={creneau.fait}
      data-marques={marques}
      data-source={source || undefined}
      data-vol={enVol || undefined}
      data-selectionne={marque ? '' : undefined}
      style={style}
      role="group"
      aria-label={marque ? `${descriptionCreneau(creneau, item)}, sélectionné` : descriptionCreneau(creneau, item)}
      tabIndex={onOuvrir ? 0 : undefined}
      onKeyDown={onOuvrir && ((ev) => ouvrirAuClavier(ev, () => onOuvrir(creneau.id)))}
      onClick={onOuvrir && (() => onOuvrir(creneau.id))}
    >
      <ContenuBloc creneau={creneau} item={item} hauteur={hauteur} />
      {marque && (
        <span className="bloc-selection" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="10" height="10" focusable="false">
            <path d="M2 6.5 5 9.5 10.5 3" />
          </svg>
        </span>
      )}
    </div>
  )
})

/** Mise en page d'un bloc de créneau de `hauteur` px : deux lignes ou une, lignes de titre, marques. */
export function miseEnPageBloc(creneau: Creneau, hauteur: number) {
  const deuxLignes = hauteur >= HAUTEUR_DEUX_LIGNES
  const nonExporte = creneau.versionExportee !== creneau.version
  const marques = (nonExporte ? 1 : 0) + (creneau.fait ? 1 : 0)
  const place = hauteur - MARGES_VERTICALES - (deuxLignes ? HAUTEUR_LIGNE_META : 0)
  const lignes = Math.max(1, Math.min(LIGNES_TITRE_MAX, Math.floor(place / HAUTEUR_LIGNE_TITRE)))
  return { deuxLignes, nonExporte, marques, lignes }
}

/**
 * Contenu d'un bloc (titre, méta, marques), partagé avec la copie flottante du glisser : la copie a exactement la
 * mise en page du bloc, rien ne se réarrange à la saisie ni à l'atterrissage. Le conteneur porte `--lignes` et
 * `data-marques` (voir `miseEnPageBloc`).
 */
export function ContenuBloc({ creneau, item, hauteur }: { creneau: Creneau; item: Item | undefined; hauteur: number }) {
  const { numero, titre, meta } = etiquetteCreneau(creneau, item)
  const { deuxLignes, nonExporte, marques, lignes } = miseEnPageBloc(creneau, hauteur)
  return (
    <>
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
    </>
  )
}

/**
 * Décalage de l'aperçu de cascade (spec §C.2) : les créneaux poussés glissent par ressort, interruptibles (une
 * nouvelle cible repart de leur position à l'écran). Au lâcher, le bloc prend sa vraie place (`haut` change du
 * même coup que le décalage retombe à 0) : sa position à l'écran est conservée et le ressort finit le trajet en
 * cours, sans saut ni second mouvement. La source d'un déplacement (aucun décalage) se pose directement.
 */
function useDecalage(ref: RefObject<HTMLDivElement | null>, haut: number, decalage: number): void {
  const anim = useRef<Anim | null>(null)
  const avant = useRef({ haut, decalage })
  useLayoutEffect(() => {
    const el = ref.current
    const p = avant.current
    avant.current = { haut, decalage }
    if (!el) return
    const ecrire = (x: number) => {
      el.style.transform = x === 0 ? '' : `translateY(${x}px)`
    }
    if (!anim.current) {
      if (decalage === 0) return
      anim.current = animerValeur(0, RESSORT_RAPIDE, ecrire)
    }
    if (haut !== p.haut) {
      // Le bloc a vraiment bougé : on garde sa position affichée (s'il était poussé) et on repart de là.
      const ecran = p.decalage !== 0 ? anim.current.valeur() - (haut - p.haut) : decalage
      anim.current.arreter()
      anim.current = animerValeur(ecran, RESSORT_RAPIDE, ecrire)
      ecrire(ecran)
    }
    anim.current.vers(decalage)
  }, [ref, haut, decalage])
  useLayoutEffect(() => () => anim.current?.arreter(), [])
}

type IndispoProps = {
  indispo: Indispo
  debut: number
  fin: number
  haut: number
  hauteur: number
  /** Tap : ouvre l'indisponibilité (tâche 19). */
  onOuvrir?: (id: string) => void
}

export const BlocIndispo = memo(function BlocIndispo({ indispo, debut, fin, haut, hauteur, onOuvrir }: IndispoProps) {
  const deuxLignes = hauteur >= HAUTEUR_DEUX_LIGNES
  return (
    <div
      className="bloc bloc-indispo"
      data-indispo={indispo.id}
      style={{ top: haut, height: hauteur }}
      role="group"
      aria-label={`${indispo.titre}, indisponible de ${heureCourte(debut)} à ${heureCourte(fin)}`}
      tabIndex={onOuvrir ? 0 : undefined}
      onKeyDown={onOuvrir && ((ev) => ouvrirAuClavier(ev, () => onOuvrir(indispo.id)))}
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
