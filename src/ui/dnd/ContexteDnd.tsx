// Glisser-déposer (spec §9.3–9.5, §13.3). dnd-kit fournit le capteur (appui long de 150 ms, tolérance 6 px)
// et le cycle du geste ; la cible, l'aperçu et le fantôme sont gérés ici :
// - un seul `useDraggable` par conteneur (bibliothèque, grille) : la carte ou le bloc saisi est trouvé au
//   `pointerdown` (délégation), les 367 cartes mémoïsées ne se redessinent donc pas au début du geste ;
// - le doigt est lu par `pointermove` puis traité une fois par image (rAF) : lecture de la cible, défilement
//   au bord, position du fantôme flottant (écrite dans le DOM, sans rendu React) ;
// - l'aperçu (`apercu`) n'est recalculé, et l'état `useGlisse` écrit, que si la minute magnétisée, le jour,
//   le créneau visé ou la moitié changent ;
// - le lâcher rejoue les mêmes actions (`deposer`) par `appliquer` : une seule étape d'annulation.
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { supprimerCreneau } from '../../domain/actions-creneaux'
import type { Etat } from '../../domain/types'
import { etiquetteCreneau } from '../calendrier/etiquette'
import { useStore } from '../store'
import { toast } from '../Toast'
import { trembler } from '../trembler'
import { apercu, cibleMois, creneauFantome, deposer, type Apercu, type Source } from './apercu'
import { cleSurvol, lire } from './cibles'
import { bloquerDefilement, GLISSE_VIDE, marquerGeste, useGlisse, type Survol } from './glisse'
import './dnd.css'

/** Ce que la source donne au `pointerdown` ; lu par dnd-kit au début du geste. */
export type DonneesSource = { source: Source; prise: number; depuisFeuille: boolean }
type Porteur = { courant: DonneesSource | null }

/** Marge (px) au bord haut / bas de la grille où elle défile pendant le geste, et vitesse maximale (px / image). */
const BORD_DEFILEMENT = 56
const VITESSE_DEFILEMENT = 14
/** Le doigt tient le fantôme flottant par ce point (px depuis son coin haut gauche). */
const PRISE_FLOTTANT = { x: 28, y: 22 }

export function texteVersBac(n: number): string {
  return n > 1 ? `${n} items mis dans À placer` : '1 item mis dans À placer'
}

const ANNONCES = {
  onDragStart: () => 'Glisser commencé.',
  onDragOver: () => undefined,
  onDragMove: () => undefined,
  onDragEnd: () => 'Déposé.',
  onDragCancel: () => 'Glisser annulé.',
}

type Props = {
  children: ReactNode
  /** Après un dépôt réussi ; `depuisFeuille` : la source était dans la feuille de la bibliothèque (iPhone). */
  onDepose?: (depuisFeuille: boolean) => void
}

export function ContexteDnd({ children, onDepose }: Props) {
  const capteurs = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 6 } }))
  const flottant = useRef<HTMLDivElement>(null)
  const rappelDepose = useRef(onDepose)
  rappelDepose.current = onDepose

  // Geste en cours : tout est dans une ref, rien ne déclenche de rendu sauf le changement d'aperçu.
  const geste = useRef<{
    source: Source
    prise: number
    x: number
    y: number
    sale: boolean
    cle: string | null
    /** Inclinaison de −1,5° du fantôme flottant, sauf en mouvement réduit. */
    incliner: boolean
    image: number
    arreter: () => void
  } | null>(null)

  useEffect(() => bloquerDefilement(), [])

  /** Survol complet (avec la première heure libre d'un jour du mois) et aperçu correspondant. */
  const evaluer = useCallback((e: Etat, source: Source, survol: Survol) => {
    if (survol?.type === 'mois') survol = { ...survol, cible: cibleMois(e, source, survol.jour) }
    const cible = survol?.type === 'colonne' ? survol.cible : survol?.type === 'mois' ? survol.cible : null
    const vu = cible ? apercu(e, source, cible) : survol?.type === 'mois' ? REFUS_MOIS : null
    return { survol, apercu: vu }
  }, [])

  const image = useCallback(() => {
    const g = geste.current
    if (!g) return
    g.image = requestAnimationFrame(image)

    // Défilement au bord de la grille (pas au-dessus de la corbeille, posée près du bord bas).
    const defil = document.querySelector<HTMLElement>('.calendrier-defilement')
    if (defil && g.cle !== 'corbeille') {
      const r = defil.getBoundingClientRect()
      if (g.x >= r.left && g.x <= r.right) {
        const haut = g.y - r.top
        const bas = r.bottom - g.y
        let v = 0
        if (haut < BORD_DEFILEMENT && haut > -BORD_DEFILEMENT) v = -VITESSE_DEFILEMENT * (1 - Math.max(0, haut) / BORD_DEFILEMENT)
        else if (bas < BORD_DEFILEMENT && bas > -BORD_DEFILEMENT) v = VITESSE_DEFILEMENT * (1 - Math.max(0, bas) / BORD_DEFILEMENT)
        if (v !== 0) {
          const avant = defil.scrollTop
          defil.scrollTop += v
          if (defil.scrollTop !== avant) g.sale = true
        }
      }
    }
    if (!g.sale) return
    g.sale = false

    const e = useStore.getState().etat
    const { survol } = lire(g.x, g.y, g.source, g.prise, e)
    const f = flottant.current
    if (f) {
      const pos = `translate3d(${g.x - PRISE_FLOTTANT.x}px, ${g.y - PRISE_FLOTTANT.y}px, 0)`
      f.style.transform = g.incliner ? `${pos} rotate(-1.5deg)` : pos
      // Au-dessus d'une colonne, le fantôme se pose dans la grille à l'heure magnétisée : le flottant s'efface.
      f.dataset.cache = String(survol?.type === 'colonne')
      f.dataset.surCorbeille = String(survol?.type === 'corbeille')
    }
    const cle = cleSurvol(survol)
    if (cle === g.cle) return
    g.cle = cle
    useGlisse.setState(evaluer(e, g.source, survol))
  }, [evaluer])

  const terminer = useCallback(() => {
    const g = geste.current
    geste.current = null
    // Le fantôme flottant n'est pas piloté par React : il repart caché au prochain geste.
    if (flottant.current) flottant.current.dataset.cache = 'true'
    if (g) {
      cancelAnimationFrame(g.image)
      g.arreter()
    }
    marquerGeste(false)
    return g
  }, [])

  const debut = useCallback(
    (ev: DragStartEvent) => {
      const porteur = ev.active.data.current as Porteur | undefined
      const d = porteur?.courant
      if (!d) return
      const pe = ev.activatorEvent as globalThis.PointerEvent
      const suivre = (m: globalThis.PointerEvent) => {
        const g = geste.current
        if (!g || m.pointerId !== pe.pointerId) return // seul le doigt qui a saisi compte
        g.x = m.clientX
        g.y = m.clientY
        g.sale = true
      }
      const defiler = () => {
        if (geste.current) geste.current.sale = true
      }
      window.addEventListener('pointermove', suivre, { passive: true })
      window.addEventListener('scroll', defiler, { capture: true, passive: true })
      geste.current = {
        source: d.source,
        prise: d.prise,
        x: pe.clientX,
        y: pe.clientY,
        sale: true,
        cle: null,
        incliner: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        image: 0,
        arreter: () => {
          window.removeEventListener('pointermove', suivre)
          window.removeEventListener('scroll', defiler, { capture: true })
        },
      }
      marquerGeste(true)
      useGlisse.setState({
        ...GLISSE_VIDE,
        source: d.source,
        prise: d.prise,
        depuisFeuille: d.depuisFeuille,
        fantome: creneauFantome(useStore.getState().etat, d.source),
      })
      navigator.vibrate?.(8)
      image()
    },
    [image],
  )

  const fin = useCallback(
    (_ev: DragEndEvent) => {
      const g = terminer()
      if (!g) return
      const depuisFeuille = useGlisse.getState().depuisFeuille
      const { appliquer, etat } = useStore.getState()
      // Lecture au point du lâcher (pas celle de la dernière image : le doigt a pu bouger depuis).
      const { survol: brut, el } = lire(g.x, g.y, g.source, g.prise, etat)
      const { survol } = evaluer(etat, g.source, brut)

      let reussi = false
      let versBac = 0
      if (survol?.type === 'corbeille' && g.source.type === 'creneau') {
        const id = g.source.id
        reussi = appliquer((e) => supprimerCreneau(e, id))
      } else if (survol?.type === 'colonne' || survol?.type === 'mois') {
        const cible = survol.cible
        let refus = cible === null
        if (cible) {
          const source = g.source
          appliquer((e) => {
            const r = deposer(e, source, cible)
            if (!r.ok) {
              refus = true
              return null
            }
            versBac = r.versBac
            return r.etat
          })
          reussi = !refus
        }
        // Refus (spec §14) : tremblement et teinte rouge, sans message ; l'état ne change pas.
        if (refus && el) trembler(el)
      }
      // Même lot de rendu que l'écriture : les transitions s'arrêtent au moment où les blocs prennent leur place.
      useGlisse.setState(GLISSE_VIDE)
      if (versBac > 0) toast(texteVersBac(versBac))
      if (reussi) rappelDepose.current?.(depuisFeuille)
    },
    [evaluer, terminer],
  )

  const annuler = useCallback(() => {
    terminer()
    useGlisse.setState(GLISSE_VIDE)
  }, [terminer])

  useEffect(() => () => void terminer(), [terminer])

  return (
    <DndContext
      sensors={capteurs}
      autoScroll={false}
      onDragStart={debut}
      onDragEnd={fin}
      onDragCancel={annuler}
      accessibility={{
        announcements: ANNONCES,
        screenReaderInstructions: { draggable: 'Appui long puis glisser pour déplacer.' },
      }}
    >
      {children}
      <Flottant ref={flottant} />
    </DndContext>
  )
}

const REFUS_MOIS: Apercu = { ok: false, positions: {}, nouveaux: [], versBac: 0 }

/** Fantôme qui suit le doigt hors de la grille (bibliothèque, corbeille) : la carte soulevée, −1,5°. */
const Flottant = forwardRef<HTMLDivElement>(function Flottant(_props, ref) {
  const source = useGlisse((s) => s.source)
  const cr = useGlisse((s) => s.fantome)
  const etat = useStore((s) => (source ? s.etat : null))
  if (!source || !etat) return <div ref={ref} className="glisse-flottant" hidden />

  const item = cr ? etat.items[cr.itemId] : undefined
  const couleur = item ? (etat.colleges[item.collegeId]?.couleur ?? 0) : 0
  const n = source.type === 'item' ? source.itemIds.length : 1
  const { titre, meta } = cr ? etiquetteCreneau(cr, item) : { titre: '', meta: '' }
  const style = { '--teinte': `var(--c${((couleur % 6) + 6) % 6})` } as CSSProperties
  return (
    // Deux boîtes : l'extérieure suit le doigt (`transform` écrit à chaque image) ; l'intérieure rétrécit au-dessus
    // de la corbeille (la propriété `scale` sur l'extérieure multiplierait aussi la translation).
    <div ref={ref} className="glisse-flottant" style={style} aria-hidden="true">
      <div className="glisse-carte">
        <b>{n > 1 ? `${n} items` : titre}</b>
        <small>{n > 1 ? source.type === 'item' && listeNumeros(etat, source.itemIds) : meta}</small>
      </div>
    </div>
  )
})

function listeNumeros(e: Etat, ids: string[]): string {
  return ids
    .map((id) => e.items[id]?.numero)
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b)
    .join(' · ')
}

/**
 * Source de glisser déléguée : un seul `useDraggable` pour tout un conteneur. `trouver` reçoit le
 * `pointerdown` et renvoie ce qui est saisi (ou `null` : pas de glisser, le geste reste libre pour un tap,
 * le défilement ou un autre geste).
 */
export function SourceGlisse({
  trouver,
  className,
  style,
  children,
}: {
  trouver: (cible: HTMLElement, e: PointerEvent) => Omit<DonneesSource, 'depuisFeuille'> | null
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const id = useId()
  const porteur = useRef<Porteur>({ courant: null }).current
  const { setNodeRef, listeners } = useDraggable({ id, data: porteur })
  const rappel = useRef(trouver)
  rappel.current = trouver

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const cible = e.target as HTMLElement
      const d = rappel.current(cible, e)
      if (!d) return
      porteur.courant = { ...d, depuisFeuille: cible.closest('.feuille') !== null }
      listeners?.onPointerDown?.(e)
    },
    [listeners, porteur],
  )

  return (
    <div ref={setNodeRef} className={className} style={style} onPointerDown={onPointerDown}>
      {children}
    </div>
  )
}
