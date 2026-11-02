// Copie flottante du glisser (spec §C.1–C.3) : l'objet saisi, soulevé, collé au doigt 1:1 en respectant le point
// de saisie, sans aucun magnétisme (c'est l'emplacement d'atterrissage qui est magnétisé, voir Atterrissage.tsx).
//
// Deux boîtes, rendues dans un portail (les zones qui défilent sont `contain: strict`) :
// - la boîte extérieure suit le doigt (`translate3d`, écrite par la boucle d'image du glisser, sans rendu React) ;
// - le corps se soulève autour du point de saisie (échelle 1,04, ressort doux), frémit (± 1,5° pendant 250 ms puis
//   −1,5°) et rétrécit au-dessus de la corbeille.
// Au lâcher, la copie rejoint l'emplacement (ou revient à son origine) par ressorts X et Y indépendants, en héritant
// de la vitesse du doigt, puis disparaît. React ne gère que le contenu ; tout le mouvement est impératif.
import { useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import type { Creneau, Etat } from '../../domain/types'
import { etiquetteCreneau } from '../calendrier/etiquette'
import { animerValeur, mouvementReduit, RESSORT_DOUX, type Anim } from '../mouvement/ressort'
import type { Source } from './apercu'
import { emplacementPrincipal, etiquetteHeure, useGlisse } from './glisse'

/** Échelle de l'objet soulevé, et au-dessus de la corbeille. */
const ECHELLE_SOULEVEE = 1.04
const ECHELLE_CORBEILLE = 0.82
/** Frémissement à la saisie : une oscillation de ± 1,5° pendant 250 ms, puis repos à −1,5°. */
const AMPLITUDE_FRISSON = 1.5
const DUREE_FRISSON_MS = 250
const ANGLE_REPOS = -1.5
/** Largeur maximale de la copie d'une carte (bibliothèque, bac) : elle survole la grille sans la masquer. */
const LARGEUR_CARTE_MAX = 260

/** Forme et contenu de la copie, fixés à la saisie. `dx`, `dy` : point de saisie dans la copie (px). */
export type ContenuCopie = {
  forme: 'bloc' | 'carte'
  titre: string
  meta: string
  couleur: number
  largeur: number
  /** `null` : hauteur du contenu (carte). */
  hauteur: number | null
  dx: number
  dy: number
}

const useCopie = create<{ contenu: ContenuCopie | null }>()(() => ({ contenu: null }))

const borner = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))

/**
 * Contenu de la copie pour une source saisie dans `origine` (rectangle `r`) au point `(px, py)` : un bloc de la grille
 * garde sa taille ; une carte devient une carte d'au plus 260 px, le doigt gardant sa prise.
 */
export function contenuCopie(
  e: Etat,
  source: Source,
  cr: Creneau | null,
  forme: 'bloc' | 'carte',
  r: { left: number; top: number; width: number; height: number },
  px: number,
  py: number,
): ContenuCopie {
  const item = cr ? e.items[cr.itemId] : undefined
  const couleur = item ? (e.colleges[item.collegeId]?.couleur ?? 0) : 0
  const n = source.type === 'item' ? source.itemIds.length : 1
  const { titre, meta } = cr ? etiquetteCreneau(cr, item) : { titre: '', meta: '' }
  const texte = n > 1 && source.type === 'item' ? { titre: `${n} items`, meta: listeNumeros(e, source.itemIds) } : { titre, meta }
  if (forme === 'bloc') {
    return { forme, ...texte, couleur, largeur: r.width, hauteur: r.height, dx: px - r.left, dy: py - r.top }
  }
  const largeur = Math.min(r.width, LARGEUR_CARTE_MAX)
  return { forme, ...texte, couleur, largeur, hauteur: null, dx: borner(px - r.left, 12, largeur - 12), dy: borner(py - r.top, 8, 44) }
}

function listeNumeros(e: Etat, ids: string[]): string {
  return ids
    .map((id) => e.items[id]?.numero)
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b)
    .join(' · ')
}

// ───────────────── Mouvement (impératif) ─────────────────

/** Ressort en vol vers sa cible : le vol est fini quand chacun y est posé exactement. */
type Vol = { ressorts: { anim: Anim; cible: number }[]; fini: () => void }

const c = {
  boite: null as HTMLDivElement | null,
  corps: null as HTMLDivElement | null,
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
  echelle: 1,
  angle: 0,
  opacite: 1,
  ressortEchelle: null as Anim | null,
  frisson: 0,
  vol: null as Vol | null,
}

function ecrireBoite(): void {
  if (c.boite) c.boite.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`
}

function ecrireCorps(): void {
  if (c.corps) c.corps.style.transform = `scale(${c.echelle}) rotate(${c.angle}deg)`
}

function ecrireOpacite(): void {
  if (c.boite) c.boite.style.opacity = c.opacite === 1 ? '' : String(c.opacite)
}

function arreterFrisson(): void {
  if (c.frisson) cancelAnimationFrame(c.frisson)
  c.frisson = 0
}

/** Frémissement : θ(t) = 1,5°·sin(1,5π·t/250 ms) passe par +1,5°, 0 puis −1,5°, où il s'arrête sans à-coup. */
function fremir(): void {
  const debut = performance.now()
  const image = (t: number) => {
    const p = Math.max(0, (t - debut) / DUREE_FRISSON_MS)
    if (p >= 1) {
      c.frisson = 0
      c.angle = ANGLE_REPOS
      ecrireCorps()
      return
    }
    c.angle = AMPLITUDE_FRISSON * Math.sin(1.5 * Math.PI * p)
    ecrireCorps()
    c.frisson = requestAnimationFrame(image)
  }
  c.frisson = requestAnimationFrame(image)
}

/** La copie apparaît sur l'objet saisi (même place, même taille) et se soulève. */
export function souleverCopie(contenu: ContenuCopie, px: number, py: number): void {
  arreterCopie()
  c.dx = contenu.dx
  c.dy = contenu.dy
  c.x = px - c.dx
  c.y = py - c.dy
  c.echelle = 1
  c.angle = 0
  c.opacite = 1
  ecrireBoite()
  ecrireCorps()
  ecrireOpacite()
  if (c.boite) c.boite.dataset.surCorbeille = 'false'
  useCopie.setState({ contenu })
  c.ressortEchelle = animerValeur(1, RESSORT_DOUX, (v) => {
    c.echelle = v
    ecrireCorps()
  })
  c.ressortEchelle.vers(ECHELLE_SOULEVEE)
  // Mouvement réduit : ni frémissement ni inclinaison.
  if (!mouvementReduit()) fremir()
}

/** Le doigt bouge : la copie le suit 1:1 (appelé une fois par image). */
export function suivreCopie(px: number, py: number): void {
  if (c.vol) return
  c.x = px - c.dx
  c.y = py - c.dy
  ecrireBoite()
}

/** Au-dessus de la corbeille, la copie rétrécit autour du doigt et se cercle de rouge. */
export function survolCorbeille(oui: boolean): void {
  c.ressortEchelle?.vers(oui ? ECHELLE_CORBEILLE : ECHELLE_SOULEVEE)
  if (c.boite) c.boite.dataset.surCorbeille = String(oui)
}

/**
 * Lâcher : la copie rejoint `but` (coin haut gauche, écran) par ressorts X et Y en héritant de la vitesse du doigt
 * (px/s), se repose (échelle 1, angle 0) et disparaît ; `fondre` l'efface en chemin. Sans `but` (corbeille, vue
 * Mois), elle s'efface sur place. `fini` est appelé à l'arrivée, dans la même image que sa disparition.
 */
export function poserCopie(
  but: { x: number; y: number; fondre?: boolean } | null,
  vitesse: { vx: number; vy: number },
  fini: () => void = () => {},
): void {
  arreterFrisson()
  c.ressortEchelle?.arreter()
  c.ressortEchelle = null
  if (c.vol) terminerVol()
  const vol: Vol = { ressorts: [], fini }
  let lance = false
  const verifier = () => {
    if (lance && c.vol === vol && vol.ressorts.every((r) => r.anim.valeur() === r.cible)) terminerVol()
  }
  const lancers: (() => void)[] = []
  const ressort = (depart: number, cible: number, appliquer: (v: number) => void, v?: number) => {
    const anim = animerValeur(depart, RESSORT_DOUX, (x) => {
      appliquer(x)
      verifier()
    })
    vol.ressorts.push({ anim, cible })
    lancers.push(() => anim.vers(cible, v))
  }
  if (but) {
    ressort(c.x, but.x, (v) => ((c.x = v), ecrireBoite()), vitesse.vx)
    ressort(c.y, but.y, (v) => ((c.y = v), ecrireBoite()), vitesse.vy)
  }
  ressort(c.echelle, but ? 1 : 0.6, (v) => ((c.echelle = v), ecrireCorps()))
  ressort(c.angle, 0, (v) => ((c.angle = v), ecrireCorps()))
  if (!but || but.fondre) ressort(c.opacite, 0, (v) => ((c.opacite = v), ecrireOpacite()))
  c.vol = vol
  for (const l of lancers) l()
  lance = true
  verifier() // mouvement réduit : tout est déjà posé
}

function terminerVol(): void {
  const vol = c.vol
  if (!vol) return
  c.vol = null
  for (const r of vol.ressorts) r.anim.arreter()
  useCopie.setState({ contenu: null })
  vol.fini()
}

/** Tout s'arrête (nouveau geste, démontage) : un vol en cours se termine aussitôt. */
export function arreterCopie(): void {
  arreterFrisson()
  c.ressortEchelle?.arreter()
  c.ressortEchelle = null
  if (c.vol) terminerVol()
  else if (useCopie.getState().contenu) useCopie.setState({ contenu: null })
}

// ───────────────── Rendu ─────────────────

const teinte = (couleur: number): string => `var(--c${((couleur % 6) + 6) % 6})`

/** Étiquette d'heure : où le lâcher poserait le créneau, tant que le doigt vise une heure. */
function useEtiquette(): string | null {
  return useGlisse((s) => {
    const e = emplacementPrincipal(s)
    return e ? etiquetteHeure(e) : null
  })
}

export function CopieFlottante() {
  const contenu = useCopie((s) => s.contenu)
  const etiquette = useEtiquette()
  const boite = useCallback((el: HTMLDivElement | null) => {
    c.boite = el
    if (el) {
      ecrireBoite()
      ecrireOpacite()
    }
  }, [])
  const corps = useCallback((el: HTMLDivElement | null) => {
    c.corps = el
    if (el) ecrireCorps()
  }, [])

  const style = contenu ? ({ width: contenu.largeur, '--teinte': teinte(contenu.couleur) } as CSSProperties) : undefined
  const styleCorps = contenu
    ? ({ height: contenu.hauteur ?? undefined, transformOrigin: `${contenu.dx}px ${contenu.dy}px` } as CSSProperties)
    : undefined
  return createPortal(
    <div ref={boite} className="copie" data-copie="" data-visible={contenu !== null} style={style} aria-hidden="true">
      <div ref={corps} className="copie-corps" data-forme={contenu?.forme} style={styleCorps}>
        {contenu && (
          <>
            <b>{contenu.titre}</b>
            <small>{contenu.meta}</small>
          </>
        )}
      </div>
      {contenu && etiquette && (
        <span className="copie-heure" data-etiquette-heure="">
          {etiquette}
        </span>
      )}
    </div>,
    document.body,
  )
}
