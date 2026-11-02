// Glisser-déposer (spec §9.3–9.5, §13.3, §C.1–C.3). dnd-kit fournit le capteur (appui long de 150 ms, tolérance
// 6 px) et le cycle du geste ; la cible, l'aperçu, la copie flottante et l'emplacement d'atterrissage sont gérés ici :
// - un seul `useDraggable` par conteneur (bibliothèque, grille) : la carte ou le bloc saisi est trouvé au
//   `pointerdown` (délégation), les 367 cartes mémoïsées ne se redessinent donc pas au début du geste ;
// - le doigt est lu par `pointermove` puis traité une fois par image (rAF) : lecture de la cible, défilement
//   au bord, position de la copie flottante (écrite dans le DOM, sans rendu React, voir CopieFlottante.tsx) ;
// - l'aperçu (`apercu`) n'est recalculé, et l'état `useGlisse` écrit, que si la minute magnétisée, le jour,
//   le créneau visé ou la moitié changent ; l'emplacement d'atterrissage (Atterrissage.tsx) en découle ;
// - le lâcher rejoue les mêmes actions (`deposer`) par `appliquer` : une seule étape d'annulation. La copie rejoint
//   alors l'emplacement par ressort, avec la vitesse du doigt (cinq derniers `pointermove`), ou revient à son origine.
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCallback, useEffect, useId, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { supprimerCreneau } from '../../domain/actions-creneaux'
import type { Etat } from '../../domain/types'
import { haptique } from '../mouvement/haptique'
import { useStore } from '../store'
import { toast } from '../Toast'
import { trembler } from '../trembler'
import { apercu, cibleMois, creneauFantome, deposer, type Apercu, type Source } from './apercu'
import { cibleAtterrissage, oublierAtterrissages } from './Atterrissage'
import { cleSurvol, lire } from './cibles'
import {
  arreterCopie,
  contenuCopie,
  CopieFlottante,
  poserCopie,
  souleverCopie,
  suivreCopie,
  survolCorbeille,
} from './CopieFlottante'
import {
  bloquerDefilement,
  filtrerPointeurs,
  GLISSE_VIDE,
  marquerGeste,
  pointeurOccupe,
  saisirPointeur,
  useGlisse,
  useVol,
  vitesseLacher,
  type Echantillon,
  type Survol,
} from './glisse'
import './dnd.css'

/** L'objet saisi et le point de saisie, relevés au `pointerdown` (avant que le doigt ne bouge). */
type Origine = { el: HTMLElement; r: { left: number; top: number; width: number; height: number }; x: number; y: number }

/** Ce que la source donne au `pointerdown` ; lu par dnd-kit au début du geste. */
export type DonneesSource = { source: Source; prise: number; depuisFeuille: boolean; origine?: Origine | null }
type Porteur = { courant: DonneesSource | null }

/** Marge (px) au bord haut / bas de la grille où elle défile pendant le geste, et vitesse maximale (px / image). */
const BORD_DEFILEMENT = 56
const VITESSE_DEFILEMENT = 14
/** Échantillons de `pointermove` gardés pour la vitesse au lâcher. */
const ECHANTILLONS = 5

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
    /** Élément de la dernière cible évaluée (colonne, carreau du mois, corbeille) : il tremble en cas de refus. */
    el: HTMLElement | null
    /** Objet saisi : la copie y revient en cas de refus ou de lâcher hors cible. */
    origine: HTMLElement | null
    /** Forme de la copie : un bloc de la grille garde sa taille, une carte peut être plus étroite. */
    forme: 'bloc' | 'carte'
    surCorbeille: boolean
    echantillons: Echantillon[]
    image: number
    arreter: () => void
  } | null>(null)

  useEffect(() => bloquerDefilement(), [])
  useEffect(() => filtrerPointeurs(), [])

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
    const { survol, el } = lire(g.x, g.y, g.source, g.prise, e)
    // La copie suit le doigt 1:1, sans magnétisme ; l'emplacement d'atterrissage, lui, se pose à l'heure visée.
    suivreCopie(g.x, g.y)
    const surCorbeille = survol?.type === 'corbeille'
    if (surCorbeille !== g.surCorbeille) {
      g.surCorbeille = surCorbeille
      survolCorbeille(surCorbeille)
    }
    const cle = cleSurvol(survol)
    if (cle === g.cle) return
    g.cle = cle
    g.el = el
    useGlisse.setState(evaluer(e, g.source, survol))
  }, [evaluer])

  const terminer = useCallback(() => {
    saisirPointeur(null)
    const g = geste.current
    geste.current = null
    if (g) {
      cancelAnimationFrame(g.image)
      g.arreter()
    }
    marquerGeste(false)
    return g
  }, [])

  /**
   * Retour à l'origine par ressort (refus, lâcher hors cible ou sur place, Échap) : la copie rejoint l'objet saisi,
   * masqué jusqu'à son arrivée s'il s'agit d'un créneau de la grille. Objet disparu : la copie s'efface sur place.
   */
  const revenir = useCallback((g: NonNullable<typeof geste.current>, v: { vx: number; vy: number }) => {
    const id = g.source.type === 'creneau' ? g.source.id : null
    const el =
      g.origine?.isConnected === true
        ? g.origine
        : id !== null
          ? document.querySelector<HTMLElement>(`.bloc-creneau[data-creneau="${CSS.escape(id)}"]`)
          : null
    const r = el?.getBoundingClientRect()
    if (!el || !r || r.width === 0) {
      poserCopie(null, v)
      return
    }
    const masque = id !== null && el.matches('.bloc-creneau[data-creneau]') ? [id] : []
    if (masque.length > 0) useVol.setState({ caches: masque })
    poserCopie({ x: r.left, y: r.top }, v, () => useVol.setState({ caches: [] }))
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
        g.echantillons.push({ t: m.timeStamp, x: m.clientX, y: m.clientY })
        if (g.echantillons.length > ECHANTILLONS) g.echantillons.shift()
      }
      const defiler = () => {
        if (geste.current) geste.current.sale = true
      }
      window.addEventListener('pointermove', suivre, { passive: true })
      window.addEventListener('scroll', defiler, { capture: true, passive: true })
      const etat = useStore.getState().etat
      const fantome = creneauFantome(etat, d.source)
      const o = d.origine ?? null
      const forme = o?.el.matches('.bloc-creneau[data-creneau]') ? 'bloc' : 'carte'
      geste.current = {
        source: d.source,
        prise: d.prise,
        x: pe.clientX,
        y: pe.clientY,
        sale: true,
        cle: null,
        el: null,
        origine: o?.el ?? null,
        forme,
        surCorbeille: false,
        echantillons: [],
        image: 0,
        arreter: () => {
          window.removeEventListener('pointermove', suivre)
          window.removeEventListener('scroll', defiler, { capture: true })
        },
      }
      marquerGeste(true)
      useVol.setState({ caches: [] })
      oublierAtterrissages()
      // La copie apparaît exactement sur l'objet saisi, puis se soulève : le doigt garde sa prise.
      const r = o?.r ?? { left: pe.clientX - 28, top: pe.clientY - 22, width: 230, height: 0 }
      souleverCopie(contenuCopie(etat, d.source, fantome, forme, r, o?.x ?? pe.clientX, o?.y ?? pe.clientY), o?.x ?? pe.clientX, o?.y ?? pe.clientY)
      useGlisse.setState({
        ...GLISSE_VIDE,
        source: d.source,
        prise: d.prise,
        depuisFeuille: d.depuisFeuille,
        fantome,
      })
      haptique('leger')
      image()
    },
    [image],
  )

  const fin = useCallback(
    (_ev: DragEndEvent) => {
      const g = terminer()
      if (!g) return
      const { depuisFeuille, survol: vu } = useGlisse.getState()
      const { appliquer, etat } = useStore.getState()
      // Le lâcher dépose ce que l'aperçu montrait : le dernier survol évalué, et non une relecture au dernier
      // `pointermove` qu'aucune image n'a encore traité (il pourrait viser une autre minute ou l'autre moitié).
      // Relecture seulement si rien n'a encore été évalué (lâcher avant la première image).
      let survol = vu
      let el = g.el
      if (g.cle === null) {
        const lu = lire(g.x, g.y, g.source, g.prise, etat)
        survol = evaluer(etat, g.source, lu.survol).survol
        el = lu.el
      }
      // Où la copie se pose : l'emplacement d'atterrissage tel qu'il est affiché, lu avant tout rendu.
      const atterrir = survol?.type === 'colonne' ? cibleAtterrissage() : null
      const v = vitesseLacher(g.echantillons, performance.now())

      let reussi = false
      let refus = false
      let versBac = 0
      let poses: string[] = []
      if (survol?.type === 'corbeille' && g.source.type === 'creneau') {
        const id = g.source.id
        reussi = appliquer((e) => supprimerCreneau(e, id))
      } else if (survol?.type === 'colonne' || survol?.type === 'mois') {
        const cible = survol.cible
        refus = cible === null
        if (cible) {
          const source = g.source
          // `appliquer` renvoie faux si rien n'est écrit (refus, lâcher sur place, store pas prêt) : pas de succès.
          reussi = appliquer((e) => {
            const r = deposer(e, source, cible)
            if (!r.ok) {
              refus = true
              return null
            }
            versBac = r.versBac
            // Les créneaux posés restent masqués sous la copie jusqu'à son arrivée.
            poses = source.type === 'creneau' ? [source.id] : Object.keys(r.etat.creneaux).filter((id) => !(id in e.creneaux))
            return r.etat
          })
          if (!reussi) versBac = 0
        }
        // Refus (spec §14) : tremblement et teinte rouge, sans message ; l'état ne change pas.
        if (refus && el) trembler(el)
      }

      if (reussi) {
        haptique('succes')
        if (atterrir) {
          useVol.setState({ caches: poses })
          // Une carte (plus large que le créneau) s'efface en rejoignant l'emplacement ; un bloc s'y pose exactement.
          poserCopie({ x: atterrir.x, y: atterrir.y, fondre: g.forme === 'carte' }, v, () => useVol.setState({ caches: [] }))
        } else {
          poserCopie(null, v) // corbeille, vue Mois : la copie s'efface sur place
        }
      } else {
        if (refus) haptique('erreur')
        revenir(g, v)
      }
      // Même lot de rendu que l'écriture : les blocs prennent leur place quand l'aperçu disparaît.
      useGlisse.setState(GLISSE_VIDE)
      if (versBac > 0) toast(texteVersBac(versBac))
      if (reussi) rappelDepose.current?.(depuisFeuille)
    },
    [evaluer, terminer, revenir],
  )

  const annuler = useCallback(() => {
    const g = terminer()
    if (g) revenir(g, { vx: 0, vy: 0 })
    useGlisse.setState(GLISSE_VIDE)
  }, [terminer, revenir])

  useEffect(
    () => () => {
      terminer()
      arreterCopie()
    },
    [terminer],
  )

  return (
    <DndContext
      sensors={capteurs}
      autoScroll={false}
      onDragStart={debut}
      onDragEnd={fin}
      onDragCancel={annuler}
      // Appui long abandonné (tap, défilement) : le pointeur est libéré.
      onDragAbort={() => saisirPointeur(null)}
      accessibility={{
        announcements: ANNONCES,
        screenReaderInstructions: { draggable: 'Appui long puis glisser pour déplacer.' },
      }}
    >
      {children}
      <CopieFlottante />
    </DndContext>
  )
}

const REFUS_MOIS: Apercu = { ok: false, positions: {}, nouveaux: [], versBac: 0 }

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
  trouver: (cible: HTMLElement, e: PointerEvent) => Omit<DonneesSource, 'depuisFeuille' | 'origine'> | null
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
      // Un deuxième doigt pendant un geste ne remplace pas ce qui est saisi.
      if (pointeurOccupe()) return
      const cible = e.target as HTMLElement
      const d = rappel.current(cible, e)
      if (!d) return
      // L'objet saisi et le point de saisie : la copie flottante apparaîtra exactement dessus.
      const el = cible.closest<HTMLElement>('.bloc-creneau[data-creneau], .carte-item')
      const r = el?.getBoundingClientRect()
      porteur.courant = {
        ...d,
        depuisFeuille: cible.closest('.feuille') !== null,
        origine: el && r ? { el, r: { left: r.left, top: r.top, width: r.width, height: r.height }, x: e.clientX, y: e.clientY } : null,
      }
      listeners?.onPointerDown?.(e)
      // Le capteur a pris ce pointeur : les autres sont ignorés jusqu'à la fin (voir `filtrerPointeurs`).
      if ((e.nativeEvent as globalThis.PointerEvent & { dndKit?: unknown }).dndKit) saisirPointeur(e.pointerId)
    },
    [listeners, porteur],
  )

  return (
    <div ref={setNodeRef} className={className} style={style} onPointerDown={onPointerDown}>
      {children}
    </div>
  )
}
