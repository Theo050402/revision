// Copie flottante du glisser (spec §C.1–C.3) : l'objet saisi, soulevé, collé au doigt 1:1 en respectant le point
// de saisie, sans recentrage ni saut, et sans magnétisme (l'emplacement d'atterrissage est magnétisé, voir
// Atterrissage.tsx). Rendue dans un portail (les zones qui défilent sont `contain: strict`) :
//
//   .copie        boîte sans taille posée sur le doigt (`translate3d`, écrite à chaque image, sans rendu React) ;
//   .copie-porteur  soulèvement autour du doigt : échelle 1,04 par ressort, frémissement ± 1,5° puis −1,5° ;
//     .copie-carte  la carte saisie (clone de la carte de la bibliothèque ou du bac, à sa taille réelle) ;
//     .copie-bloc   le créneau tel qu'il est dans la grille (même contenu, même mise en page que `BlocCreneau`) ;
//   .copie-heure  étiquette d'heure, accrochée au-dessus de la copie, jamais inclinée.
//
// Une carte qui survole la grille prend la forme du créneau (taille de l'emplacement) par un ressort « m » :
// les deux couches occupent le même rectangle, interpolé entre la carte et le bloc autour du doigt, en fondu
// enchaîné. Au lâcher, des ressorts X et Y indépendants amènent ce rectangle sur l'emplacement (ou sur l'origine)
// avec la vitesse du doigt ; à l'arrivée, le vrai créneau est déjà dessous, à l'identique, et la copie s'efface
// par-dessus (relais sans saut). Tout le mouvement est impératif (`transform`, `opacity`).
import { useCallback, useLayoutEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import type { Creneau, Item } from '../../domain/types'
import { ContenuBloc, miseEnPageBloc } from '../calendrier/Bloc'
import { animerValeur, mouvementReduit, RESSORT_DOUX, RESSORT_RAPIDE, type Anim } from '../mouvement/ressort'
import { emplacementPrincipal, etiquetteHeure, useGlisse } from './glisse'

/** Échelle de l'objet soulevé, et au-dessus de la corbeille. */
const ECHELLE_SOULEVEE = 1.04
const ECHELLE_CORBEILLE = 0.82
/** Frémissement à la saisie : une oscillation de ± 1,5° pendant 250 ms, puis repos à −1,5°. */
const AMPLITUDE_FRISSON = 1.5
const DUREE_FRISSON_MS = 250
const ANGLE_REPOS = -1.5
/** Écart (px) entre l'étiquette d'heure et le haut de la copie. */
const ECART_ETIQUETTE = 8

export type Taille = { largeur: number; hauteur: number }

/** Ce que montre la copie, fixé à la saisie. `dx`, `dy` : point de saisie dans l'objet saisi (px). */
export type ContenuCopie = {
  /** Le créneau représenté (déplacé, ou première partie du prochain tour) ; `null` : item disparu. */
  creneau: Creneau | null
  item: Item | undefined
  couleur: number
  /** Carte saisie (bibliothèque, bac) : clone inerte et taille réelle. `null` : bloc de la grille. */
  carte: { el: HTMLElement; taille: Taille } | null
  /** Plusieurs items glissés ensemble : leur nombre, en pastille. */
  nombre: number
  dx: number
  dy: number
}

const useCopie = create<{ contenu: ContenuCopie | null; bloc: Taille | null }>()(() => ({ contenu: null, bloc: null }))

/**
 * Clone inerte d'une carte de la bibliothèque ou du bac : même apparence, sans identifiants ni cibles de glisser
 * (`data-item-id`, `data-creneau-id`, `id`), hors de l'ordre de tabulation.
 */
export function clonerCarte(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement
  for (const n of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    n.removeAttribute('id')
    n.removeAttribute('data-item-id')
    n.removeAttribute('data-creneau-id')
    n.removeAttribute('data-testid')
  }
  clone.setAttribute('inert', '')
  return clone
}

// ───────────────── Mouvement (impératif) ─────────────────

type Phase = 'repos' | 'glisser' | 'vol' | 'relais' | 'fondu'
type Ressort = { anim: Anim; cible: number }

const c = {
  boite: null as HTMLDivElement | null,
  porteur: null as HTMLDivElement | null,
  carte: null as HTMLDivElement | null,
  bloc: null as HTMLDivElement | null,
  etiquette: null as HTMLSpanElement | null,
  nombre: null as HTMLSpanElement | null,
  /** Point d'ancrage (le doigt pendant le geste), écran. */
  fx: 0,
  fy: 0,
  echelle: 1,
  angle: 0,
  opacite: 1,
  /** Forme : 0 = carte, 1 = bloc. */
  m: 1,
  /** Point de saisie dans la carte (a0) et dans le bloc (a1). */
  a0x: 0,
  a0y: 0,
  a1x: 0,
  a1y: 0,
  /** Tailles de la carte et du bloc (0 : absente). */
  wc: 0,
  hc: 0,
  wb: 0,
  hb: 0,
  estCarte: false,
  ressortEchelle: null as Anim | null,
  ressortForme: null as Anim | null,
  frisson: 0,
  vol: null as { ressorts: Ressort[]; fini: () => void; apres: (() => void) | null } | null,
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Rectangle de la copie, relatif au doigt et avant soulèvement, pour la forme `m`. */
function rectangle(m: number) {
  return {
    l: -lerp(c.a0x, c.a1x, m),
    t: -lerp(c.a0y, c.a1y, m),
    w: lerp(c.wc, c.wb, m),
    h: lerp(c.hc, c.hb, m),
  }
}

function ecrireBoite(): void {
  if (!c.boite) return
  c.boite.style.transform = `translate3d(${c.fx}px, ${c.fy}px, 0)`
  c.boite.style.opacity = c.opacite === 1 ? '' : String(c.opacite)
}

function ecrirePorteur(): void {
  if (c.porteur) c.porteur.style.transform = `scale(${c.echelle}) rotate(${c.angle}deg)`
}

/** Les deux couches remplissent le même rectangle ; fondu enchaîné (la couche d'arrivée est opaque dès mi-course). */
function ecrireCouches(): void {
  const r = rectangle(c.m)
  if (c.carte && c.wc > 0) {
    c.carte.style.transform = `translate(${r.l}px, ${r.t}px) scale(${r.w / c.wc}, ${r.h / c.hc})`
    c.carte.style.opacity = String(Math.min(1, 2 * (1 - c.m)))
  }
  if (c.bloc && c.wb > 0) {
    c.bloc.style.transform = `translate(${r.l}px, ${r.t}px) scale(${r.w / c.wb}, ${r.h / c.hb})`
    c.bloc.style.opacity = String(Math.min(1, 2 * c.m))
  }
  if (c.etiquette) c.etiquette.style.transform = `translate(${r.l}px, ${r.t * c.echelle - ECART_ETIQUETTE}px)`
  // Pastille du nombre d'items : à cheval sur le coin haut droit.
  if (c.nombre) c.nombre.style.transform = `translate(${r.l + r.w}px, ${r.t}px) translate(-60%, -40%)`
}

function phase(p: Phase): void {
  if (c.boite && c.boite.dataset.phase !== p) c.boite.dataset.phase = p
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
      ecrirePorteur()
      return
    }
    c.angle = AMPLITUDE_FRISSON * Math.sin(1.5 * Math.PI * p)
    ecrirePorteur()
    c.frisson = requestAnimationFrame(image)
  }
  c.frisson = requestAnimationFrame(image)
}

/** Point de saisie dans le bloc pour une carte : même proportion horizontale, haut du bloc sous le doigt. */
function saisieBloc(): void {
  if (!c.estCarte || c.wc === 0) return
  c.a1x = Math.min(Math.max((c.a0x * c.wb) / c.wc, 6), Math.max(6, c.wb - 6))
  c.a1y = 0
}

/** Taille du bloc (emplacement de la grille) : rendue par React, utilisée tout de suite par le mouvement. */
function definirBloc(t: Taille | null): void {
  c.wb = t?.largeur ?? 0
  c.hb = t?.hauteur ?? 0
  saisieBloc()
  const avant = useCopie.getState().bloc
  if (avant?.largeur !== t?.largeur || avant?.hauteur !== t?.hauteur) useCopie.setState({ bloc: t })
  ecrireCouches()
}

/**
 * La copie apparaît exactement sur l'objet saisi (même place, même taille, même contenu), puis se soulève autour
 * du doigt. `bloc` : taille du créneau dans la grille (celle du bloc saisi, ou d'un emplacement pour une carte).
 */
export function souleverCopie(contenu: ContenuCopie, px: number, py: number, bloc: Taille | null): void {
  arreterCopie()
  c.estCarte = contenu.carte !== null
  c.wc = contenu.carte?.taille.largeur ?? 0
  c.hc = contenu.carte?.taille.hauteur ?? 0
  c.a0x = contenu.dx
  c.a0y = contenu.dy
  c.a1x = contenu.dx
  c.a1y = contenu.dy
  c.m = c.estCarte ? 0 : 1
  c.fx = px
  c.fy = py
  c.echelle = 1
  c.angle = 0
  c.opacite = 1
  useCopie.setState({ contenu })
  definirBloc(bloc)
  ecrireBoite()
  ecrirePorteur()
  ecrireCouches()
  phase('glisser')
  if (c.boite) c.boite.dataset.surCorbeille = 'false'
  c.ressortEchelle = animerValeur(1, RESSORT_DOUX, (v) => {
    c.echelle = v
    ecrirePorteur()
    ecrireCouches()
  })
  c.ressortEchelle.vers(ECHELLE_SOULEVEE)
  c.ressortForme = animerValeur(c.m, RESSORT_DOUX, (v) => {
    c.m = v
    ecrireCouches()
  })
  // Mouvement réduit : ni frémissement ni inclinaison.
  if (!mouvementReduit()) fremir()
}

/** Le doigt bouge : la copie le suit 1:1 (appelé une fois par image). */
export function suivreCopie(px: number, py: number): void {
  if (c.vol) return
  c.fx = px
  c.fy = py
  ecrireBoite()
}

/** Une carte au-dessus d'une colonne prend la forme du créneau ; ailleurs, elle redevient carte. */
export function survolGrille(oui: boolean): void {
  if (!c.estCarte || c.vol) return
  c.ressortForme?.vers(oui && c.wb > 0 ? 1 : 0)
}

/** Au-dessus de la corbeille, la copie rétrécit autour du doigt et se cercle de rouge. */
export function survolCorbeille(oui: boolean): void {
  c.ressortEchelle?.vers(oui ? ECHELLE_CORBEILLE : ECHELLE_SOULEVEE)
  if (c.boite) c.boite.dataset.surCorbeille = String(oui)
}

/** But du lâcher : coin haut gauche (écran) et forme d'arrivée ; `taille` : rectangle exact de l'emplacement. */
export type But = { x: number; y: number; forme: 'bloc' | 'carte'; taille?: Taille }

/**
 * Lâcher : la copie rejoint `but` par ressorts X et Y en héritant de la vitesse du doigt (px/s), reprend la forme
 * d'arrivée, se repose (échelle 1, angle 0), puis `relais` est appelé (le vrai objet apparaît dessous, identique)
 * et la copie s'efface par-dessus. Sans `but` (corbeille, vue Mois), elle s'efface sur place.
 */
export function poserCopie(but: But | null, vitesse: { vx: number; vy: number }, relais: () => void = () => {}): void {
  arreterFrisson()
  c.ressortEchelle?.arreter()
  c.ressortForme?.arreter()
  c.ressortEchelle = null
  c.ressortForme = null
  if (c.vol) terminerVol()

  const ressorts: Ressort[] = []
  const lancers: (() => void)[] = []
  let lance = false
  const vol = { ressorts, fini: () => {}, apres: relais as (() => void) | null }
  const verifier = () => {
    if (lance && c.vol === vol && ressorts.every((r) => r.anim.valeur() === r.cible)) vol.fini()
  }
  const ressort = (p: typeof RESSORT_DOUX, depart: number, cible: number, appliquer: (v: number) => void, v?: number) => {
    const anim = animerValeur(depart, p, (x) => {
      appliquer(x)
      verifier()
    })
    ressorts.push({ anim, cible })
    lancers.push(() => anim.vers(cible, v))
  }

  if (but) {
    if (but.forme === 'bloc' && but.taille) definirBloc(but.taille)
    const m = but.forme === 'bloc' ? 1 : 0
    const ax = lerp(c.a0x, c.a1x, m)
    const ay = lerp(c.a0y, c.a1y, m)
    phase('vol')
    ressort(RESSORT_DOUX, c.fx, but.x + ax, (v) => ((c.fx = v), ecrireBoite()), vitesse.vx)
    ressort(RESSORT_DOUX, c.fy, but.y + ay, (v) => ((c.fy = v), ecrireBoite()), vitesse.vy)
    ressort(RESSORT_DOUX, c.m, m, (v) => ((c.m = v), ecrireCouches()))
    ressort(RESSORT_DOUX, c.echelle, 1, (v) => ((c.echelle = v), ecrirePorteur(), ecrireCouches()))
    ressort(RESSORT_DOUX, c.angle, 0, (v) => ((c.angle = v), ecrirePorteur()))
    // Arrivée : le vrai objet est dessous, à l'identique ; la copie s'efface par-dessus (fondu enchaîné).
    vol.fini = () => {
      if (vol.apres) {
        const apres = vol.apres
        vol.apres = null
        apres()
      }
      phase('relais')
      for (const r of ressorts) r.anim.arreter()
      ressorts.length = 0
      ressort(RESSORT_RAPIDE, c.opacite, 0, (v) => ((c.opacite = v), ecrireBoite()))
      vol.fini = terminerVol
      for (const l of lancers.splice(0)) l()
      verifier()
    }
  } else {
    phase('fondu')
    ressort(RESSORT_DOUX, c.echelle, 0.6, (v) => ((c.echelle = v), ecrirePorteur(), ecrireCouches()))
    ressort(RESSORT_DOUX, c.opacite, 0, (v) => ((c.opacite = v), ecrireBoite()))
    vol.fini = terminerVol
  }
  c.vol = vol
  for (const l of lancers.splice(0)) l()
  lance = true
  verifier() // mouvement réduit : tout est déjà posé
}

function terminerVol(): void {
  const vol = c.vol
  if (!vol) return
  c.vol = null
  for (const r of vol.ressorts) r.anim.arreter()
  if (vol.apres) vol.apres()
  phase('repos')
  useCopie.setState({ contenu: null, bloc: null })
}

/** Tout s'arrête (nouveau geste, démontage) : un vol en cours se termine aussitôt. */
export function arreterCopie(): void {
  arreterFrisson()
  c.ressortEchelle?.arreter()
  c.ressortForme?.arreter()
  c.ressortEchelle = null
  c.ressortForme = null
  if (c.vol) terminerVol()
  else if (useCopie.getState().contenu) {
    phase('repos')
    useCopie.setState({ contenu: null, bloc: null })
  }
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
  const bloc = useCopie((s) => s.bloc)
  const etiquette = useEtiquette()
  // Refus : la copie, qui recouvre l'emplacement, se cercle de rouge elle aussi.
  const refus = useGlisse((s) => emplacementPrincipal(s)?.refus === true)
  const boite = useCallback((el: HTMLDivElement | null) => {
    c.boite = el
    if (el) ecrireBoite()
  }, [])
  const porteur = useCallback((el: HTMLDivElement | null) => {
    c.porteur = el
    if (el) ecrirePorteur()
  }, [])
  const refCarte = useCallback((el: HTMLDivElement | null) => {
    c.carte = el
    if (el) ecrireCouches()
  }, [])
  const refBloc = useCallback((el: HTMLDivElement | null) => {
    c.bloc = el
    if (el) ecrireCouches()
  }, [])
  const refNombre = useCallback((el: HTMLSpanElement | null) => {
    c.nombre = el
    if (el) ecrireCouches()
  }, [])
  const refEtiquette = useCallback((el: HTMLSpanElement | null) => {
    c.etiquette = el
    if (el) ecrireCouches()
  }, [])

  // La carte saisie est un clone de l'original : posé dans sa couche à chaque nouvelle saisie.
  const clone = contenu?.carte?.el ?? null
  useLayoutEffect(() => {
    if (c.carte) c.carte.replaceChildren(...(clone ? [clone] : []))
  }, [clone])

  const style = contenu ? ({ '--teinte': teinte(contenu.couleur) } as CSSProperties) : undefined
  const mise = contenu?.creneau && bloc ? miseEnPageBloc(contenu.creneau, bloc.hauteur) : null
  return createPortal(
    <div
      ref={boite}
      className="copie"
      data-copie=""
      data-visible={contenu !== null}
      data-refus={(contenu !== null && refus) || undefined}
      style={style}
      aria-hidden="true"
    >
      <div ref={porteur} className="copie-porteur">
        {contenu?.carte && (
          <div
            ref={refCarte}
            className="copie-carte"
            style={{ width: contenu.carte.taille.largeur, height: contenu.carte.taille.hauteur }}
          />
        )}
        {contenu?.creneau && bloc && mise && (
          <div
            ref={refBloc}
            className="bloc bloc-creneau copie-bloc"
            data-marques={mise.marques}
            style={{ width: bloc.largeur, height: bloc.hauteur, '--lignes': mise.lignes } as CSSProperties}
          >
            <ContenuBloc creneau={contenu.creneau} item={contenu.item} hauteur={bloc.hauteur} />
          </div>
        )}
        {contenu && contenu.nombre > 1 && (
          <span ref={refNombre} className="copie-nombre">
            {contenu.nombre}
          </span>
        )}
      </div>
      {contenu && etiquette && (
        <span ref={refEtiquette} className="copie-heure" data-etiquette-heure="">
          {etiquette}
        </span>
      )}
    </div>,
    document.body,
  )
}
