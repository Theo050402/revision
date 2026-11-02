// Emplacement d'atterrissage et éclairage de la colonne visée (spec §C.2).
//
// L'emplacement est la seule indication visuelle de l'endroit où le lâcher posera le créneau : il est rendu dans la
// colonne du jour visé, à l'heure tirée du même survol et du même aperçu que le lâcher (`apercuColonne`). Il rejoint
// chaque nouvelle position par un ressort rapide, y compris d'un jour à l'autre : une colonne qui reçoit l'emplacement
// le fait partir de la dernière position affichée par la colonne précédente (relevée dans `positions`), en
// coordonnées du corps de la grille, puis le ressort l'amène à zéro. Aucun saut, ni vertical ni horizontal.
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { local } from '../../domain/temps'
import { animerValeur, RESSORT_RAPIDE, type Anim } from '../mouvement/ressort'
import { trembler } from '../trembler'

/** Dernière position affichée d'un emplacement (corps de la grille, px) et sa vitesse (px/s). */
type Suivi = { x: number; y: number; vx: number; vy: number; t: number }

/** Par créneau représenté : survit au démontage, pour que la colonne suivante reparte de là. */
const positions = new Map<string, Suivi>()

/** L'emplacement principal monté, et ce qu'il faut pour connaître sa cible à l'écran. */
let principal: { el: HTMLElement; ax: Anim; ay: Anim; haut: () => number } | null = null

/** Début d'un geste : les emplacements du geste précédent ne servent plus de point de départ. */
export function oublierAtterrissages(): void {
  positions.clear()
}

/**
 * Rectangle (écran) où l'emplacement principal se pose : sa cible, et non sa position en cours de ressort.
 * La copie le rejoint au lâcher. `null` sans emplacement (hors de la grille, vue Mois, corbeille).
 */
export function cibleAtterrissage(): { x: number; y: number; largeur: number; hauteur: number } | null {
  if (!principal || !principal.el.isConnected) return null
  const r = principal.el.getBoundingClientRect()
  return {
    x: r.left - principal.ax.valeur(),
    y: r.top - principal.ay.valeur() + principal.haut(),
    largeur: r.width,
    hauteur: r.height,
  }
}

type Props = {
  /** Identifiant du créneau représenté : la continuité d'une colonne à l'autre suit cette clé. */
  cle: string
  jour: string
  /** Début (minutes depuis minuit) et position (px depuis le haut de la colonne). */
  debut: number
  haut: number
  hauteur: number
  /** Index de la palette des surligneurs (`college.couleur`). */
  couleur: number
  refus: boolean
  principal: boolean
}

const teinte = (couleur: number): string => `var(--c${((couleur % 6) + 6) % 6})`

export function Atterrissage({ cle, jour, debut, haut, hauteur, couleur, refus, principal: estPrincipal }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  const anims = useRef<{ ax: Anim; ay: Anim; opacite: Anim } | null>(null)
  const hautCourant = useRef(haut)
  hautCourant.current = haut

  // Montage : repart de la dernière position affichée (autre colonne, autre heure), sinon apparaît en fondu.
  useLayoutEffect(() => {
    const el = ref.current
    const col = el?.parentElement
    if (!el || !col) return
    const gauche = col.offsetLeft
    const avant = positions.get(cle)
    let dx = avant ? avant.x - gauche : 0
    let y = avant ? avant.y : hautCourant.current
    const ecrire = () => {
      el.style.transform = `translate3d(${dx}px, ${y}px, 0)`
      const t = performance.now()
      const p = positions.get(cle)
      const x = gauche + dx
      // Deux ressorts écrivent dans la même image : la vitesse n'est relevée qu'entre deux images distinctes.
      if (p && t - p.t > 4) positions.set(cle, { x, y, vx: ((x - p.x) * 1000) / (t - p.t), vy: ((y - p.y) * 1000) / (t - p.t), t })
      else positions.set(cle, { x, y, vx: p?.vx ?? 0, vy: p?.vy ?? 0, t: p?.t ?? t })
    }
    const ax = animerValeur(dx, RESSORT_RAPIDE, (v) => {
      dx = v
      ecrire()
    })
    const ay = animerValeur(y, RESSORT_RAPIDE, (v) => {
      y = v
      ecrire()
    })
    const opacite = animerValeur(avant ? 1 : 0, RESSORT_RAPIDE, (o) => {
      el.style.opacity = String(o)
    })
    el.style.opacity = avant ? '1' : '0'
    ecrire()
    anims.current = { ax, ay, opacite }
    ax.vers(0, avant?.vx)
    ay.vers(hautCourant.current, avant?.vy)
    opacite.vers(1)
    return () => {
      ax.arreter()
      ay.arreter()
      opacite.arreter()
      anims.current = null
    }
  }, [cle])

  // Nouvelle heure dans la même colonne : le ressort repart de la position affichée.
  useLayoutEffect(() => {
    anims.current?.ay.vers(haut)
  }, [haut])

  // L'emplacement principal donne sa cible à la copie au lâcher.
  useLayoutEffect(() => {
    const el = ref.current
    const a = anims.current
    if (!estPrincipal || !el || !a) return
    const p = { el, ax: a.ax, ay: a.ay, haut: () => hautCourant.current }
    principal = p
    return () => {
      if (principal === p) principal = null
    }
  }, [estPrincipal, cle])

  // Refus : l'emplacement passe au rouge et tremble (le corps, pas la boîte que le ressort déplace).
  useLayoutEffect(() => {
    if (refus && corps.current) trembler(corps.current)
  }, [refus])

  const style = { height: hauteur, '--teinte': teinte(couleur) } as CSSProperties
  return (
    <div
      ref={ref}
      className="atterrissage"
      data-atterrissage={local(jour, debut)}
      data-refus={refus || undefined}
      data-principal={estPrincipal || undefined}
      style={style}
      aria-hidden="true"
    >
      <div ref={corps} className="atterrissage-corps" />
    </div>
  )
}

/**
 * Teinte d'accent à 8 % sur toute la hauteur de la colonne visée, en fondu par ressort (instantané en mouvement
 * réduit) ; rouge quand la colonne refuse le dépôt.
 */
export function Eclairage({ visee }: { visee: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const anim = useRef<Anim | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!anim.current) {
      if (!visee) return
      anim.current = animerValeur(0, RESSORT_RAPIDE, (o) => {
        el.style.opacity = String(o)
      })
    }
    anim.current.vers(visee ? 1 : 0)
  }, [visee])
  useLayoutEffect(() => () => anim.current?.arreter(), [])
  return <div ref={ref} className="colonne-eclairage" aria-hidden="true" />
}
