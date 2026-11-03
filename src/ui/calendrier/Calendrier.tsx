// Zone du calendrier : barre de navigation (précédent / Aujourd'hui / suivant), balayage horizontal
// pour changer de période (la vue suit le doigt puis se pose par ressort, spec §C.6), et la vue choisie
// (Semaine, Jour ou Mois).
import { useEffect, useMemo, useRef, useSyncExternalStore, type PointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { ajouterJours } from '../../domain/temps'
import { abonnerHalo, enregistrerChangementPeriode, lireHalo } from '../dnd/bords'
import { Corbeille } from '../dnd/Corbeille'
import { gesteDepuis } from '../dnd/glisse'
import type { Vue } from '../ecran'
import { creerSuiviVitesse, fondu, type Fondu } from '../mouvement/geste'
import { animerValeur, mouvementReduit, projeter, RESSORT_DOUX, type Anim } from '../mouvement/ressort'
import { ajouterMois, joursDeLaSemaine, libellePeriode } from '../periode'
import { BarreSelection } from '../selection/BarreSelection'
import type { Disposition } from '../useDisposition'
import { Grille } from './Grille'
import { PX_HEURE_IPAD, PX_HEURE_IPHONE } from './geometrie'
import { useAujourdhui } from './maintenant'
import { VueMois } from './VueMois'
import './calendrier.css'

type Props = {
  vue: Vue
  /** Jour affiché (pilote le titre de la barre du haut). */
  jour: string
  disposition: Disposition
  onJour: (jour: string) => void
  /** Ouvre un jour dans la vue Jour (tap sur un carreau du mois). */
  onOuvrirJour: (jour: string) => void
  /** Tap sur un emplacement libre de la grille (« Pour combler ce trou »). */
  onTapTrou?: (jour: string, t: number) => void
  /** Tap sur un créneau ou une indisponibilité (fiches : tâche 19). */
  onOuvrirCreneau?: (id: string) => void
  onOuvrirIndispo?: (id: string) => void
  /** Bouton « + Indisponibilité » de la barre : ouvre la feuille de création (spec §D.5). */
  onNouvelleIndispo?: () => void
}

/** iPhone en paysage : la vue Jour montre trois jours (spec §9.1). */
const requetePaysage = '(orientation: landscape) and (min-width: 600px) and (max-width: 899px)'

function abonnerPaysage(rappel: () => void): () => void {
  const media = window.matchMedia(requetePaysage)
  media.addEventListener('change', rappel)
  return () => media.removeEventListener('change', rappel)
}

/** Déplacement (px) à partir duquel le sens du geste est tranché : horizontal (balayage) ou vertical (défilement). */
const VERROU = 10
/** Distance minimale (px) d'un balayage : en deçà, la vue revient même si le geste était vif. */
const DISTANCE_MIN = 32
/** Part de la largeur à dépasser, en position projetée par la vitesse du doigt, pour changer de période. */
const PART_LARGEUR = 0.25

type Doigt = { id: number; x: number; y: number; t: number; base: number; mode: 'attente' | 'horizontal' | 'abandon' }

/**
 * Balayage horizontal au doigt ou au stylet (spec §C.6). Le conteneur déclare `touch-action: pan-y` : le navigateur
 * ne garde que le défilement vertical, les mouvements horizontaux arrivent ici. La piste (le contenu de la vue)
 * suit le doigt 1:1 ; au relâchement, au-delà de 25 % de la largeur (position projetée par la vitesse), elle sort
 * par ressort, la période change et la nouvelle entre du côté opposé ; sinon elle revient. Un geste de la grille
 * (glisser un créneau, redimensionner, lasso) commencé après le `pointerdown` l'annule. Interruptible : un doigt
 * posé sur la piste en mouvement l'arrête et la reprend. Mouvement réduit : la piste ne bouge pas, la nouvelle
 * période apparaît en fondu de 150 ms.
 */
function creerBalayage(piste: () => HTMLElement | null, aller: (sens: -1 | 1) => void) {
  const suivi = creerSuiviVitesse()
  let doigt: Doigt | null = null
  let anim: Anim | null = null
  let fade: Fondu | null = null
  let x = 0
  let largeur = 0

  const ecrire = (v: number) => {
    x = v
    const el = piste()
    if (el) el.style.transform = `translateX(${v}px)`
  }
  const repos = () => {
    x = 0
    anim = null
    const el = piste()
    if (el) {
      el.style.transform = ''
      el.style.willChange = ''
    }
  }

  /** Fin de geste sans mouvement en cours : plus rien d'inline sur la piste (ni `transform`, ni `will-change`). */
  const nettoyer = () => {
    if (anim) return
    const el = piste()
    if (el) {
      el.style.transform = ''
      el.style.willChange = ''
    }
    x = 0
  }

  /** La piste revient à sa place par ressort, avec la vitesse du doigt. */
  const revenir = (vitesse: number) => {
    anim?.arreter()
    anim = animerValeur(x, RESSORT_DOUX, (v) => {
      ecrire(v)
      if (v === 0) repos()
    })
    anim.vers(0, vitesse)
  }

  /** La période actuelle sort du côté du doigt ; la nouvelle entre du côté opposé. */
  const changer = (sens: -1 | 1, vitesse: number) => {
    anim?.arreter()
    let sortie = false
    anim = animerValeur(x, RESSORT_DOUX, (v) => {
      ecrire(v)
      if (sortie || Math.abs(v) < largeur) return
      sortie = true
      anim?.arreter()
      // Rendue tout de suite : la nouvelle période est posée de l'autre côté dans la même image.
      flushSync(() => aller(sens))
      ecrire(sens * largeur)
      anim = animerValeur(sens * largeur, RESSORT_DOUX, (w) => {
        ecrire(w)
        if (w === 0) repos()
      })
      anim.vers(0)
    })
    // La cible est un peu au-delà du bord : le ressort y passe vite sans traîner à l'approche asymptotique.
    anim.vers(-sens * largeur * 1.1, vitesse)
  }

  const abandonner = () => {
    if (!doigt) return
    doigt.mode = 'abandon'
    if (x !== 0) revenir(0)
    else nettoyer()
  }

  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' || !e.isPrimary) return
      // Un doigt sur la piste en mouvement l'arrête (elle est reprise à l'endroit où elle est).
      const enMouvement = x !== 0
      anim?.arreter()
      anim = null
      fade?.arreter()
      fade = null
      const el = piste()
      if (el) el.style.opacity = ''
      largeur = el?.parentElement?.clientWidth ?? 0
      doigt = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), base: x, mode: enMouvement ? 'horizontal' : 'attente' }
      suivi.effacer()
      suivi.ajouter(e.clientX, doigt.t)
    },
    onPointerMove(e: PointerEvent) {
      if (!doigt || e.pointerId !== doigt.id || doigt.mode === 'abandon') return
      if (gesteDepuis(doigt.t)) return abandonner()
      const dx = e.clientX - doigt.x
      const dy = e.clientY - doigt.y
      if (doigt.mode === 'attente') {
        if (Math.abs(dx) < VERROU && Math.abs(dy) < VERROU) return
        if (Math.abs(dx) < VERROU || Math.abs(dx) < 1.5 * Math.abs(dy)) {
          doigt.mode = 'abandon'
          return
        }
        doigt.mode = 'horizontal'
        const el = piste()
        if (el && !mouvementReduit()) el.style.willChange = 'transform'
      }
      suivi.ajouter(e.clientX, performance.now())
      if (!mouvementReduit()) ecrire(doigt.base + dx)
    },
    onPointerUp(e: PointerEvent) {
      const d = doigt
      doigt = null
      if (!d || d.id !== e.pointerId) return
      if (gesteDepuis(d.t) || d.mode === 'abandon') {
        if (x !== 0) revenir(0)
        else nettoyer()
        return
      }
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      // Aucun mouvement relevé avant le relâchement (geste très bref) : le sens se tranche sur le déplacement total.
      if (d.mode === 'attente' && (Math.abs(dx) < VERROU || Math.abs(dx) < 1.5 * Math.abs(dy))) return nettoyer()
      const maintenant = performance.now()
      suivi.ajouter(e.clientX, maintenant)
      const pos = d.base + dx
      const v = suivi.vitesse(maintenant)
      const projete = pos + projeter(v, 0.99)
      const sens: -1 | 1 = pos < 0 ? 1 : -1
      // Le doigt doit avoir bougé, et dans le sens où la piste s'éloigne de sa place : une piste saisie en plein
      // mouvement puis relâchée sur place (ou ramenée vers sa place) se pose, elle ne rechange pas de période.
      const intention = dx + projeter(v, 0.99)
      const change =
        Math.abs(dx) >= VERROU &&
        Math.sign(intention) === Math.sign(pos) &&
        Math.abs(pos) >= DISTANCE_MIN &&
        Math.sign(projete) === Math.sign(pos) &&
        Math.abs(projete) > PART_LARGEUR * largeur
      if (mouvementReduit()) {
        if (!change) return nettoyer()
        const el = piste()
        aller(sens)
        if (el) fade = fondu((o) => (el.style.opacity = String(o)), 0, 1, 150, () => (el.style.opacity = ''))
        return nettoyer()
      }
      ecrire(pos)
      if (change) changer(sens, v)
      else revenir(v)
    },
    onPointerCancel() {
      doigt = null
      if (x !== 0) revenir(0)
      else nettoyer()
    },
    detruire() {
      anim?.arreter()
      fade?.arreter()
    },
  }
}

function useBalayage(piste: RefObject<HTMLDivElement | null>, aller: (sens: -1 | 1) => void) {
  const allerRef = useRef(aller)
  allerRef.current = aller
  const balayage = useMemo(() => creerBalayage(() => piste.current, (s) => allerRef.current(s)), [piste])
  useEffect(() => balayage.detruire, [balayage])
  return {
    onPointerDown: balayage.onPointerDown,
    onPointerMove: balayage.onPointerMove,
    onPointerUp: balayage.onPointerUp,
    onPointerCancel: balayage.onPointerCancel,
  }
}

export function Calendrier({ vue, jour, disposition, onJour, onOuvrirJour, onTapTrou, onOuvrirCreneau, onOuvrirIndispo, onNouvelleIndispo }: Props) {
  const aujourdhui = useAujourdhui()
  const paysage = useSyncExternalStore(abonnerPaysage, () => window.matchMedia(requetePaysage).matches)

  const nbJours = vue === 'semaine' ? 7 : vue === 'jour' ? (disposition === 'iphone' && paysage ? 3 : 1) : 0
  const jours = useMemo(
    () => (vue === 'semaine' ? joursDeLaSemaine(jour) : vue === 'jour' ? Array.from({ length: nbJours }, (_, i) => ajouterJours(jour, i)) : [jour]),
    [vue, jour, nbJours],
  )
  // 48 px/h partout, 56 en vue Jour sur iPhone (voir geometrie.ts).
  const pxHeure = disposition === 'iphone' && vue === 'jour' ? PX_HEURE_IPHONE : PX_HEURE_IPAD

  const decaler = (sens: 1 | -1) =>
    onJour(vue === 'mois' ? ajouterMois(jour, sens) : ajouterJours(jour, sens * (vue === 'semaine' ? 7 : nbJours)))
  const precedent = () => decaler(-1)
  const suivant = () => decaler(1)
  const piste = useRef<HTMLDivElement>(null)
  const balayage = useBalayage(piste, decaler)
  // Bord gauche ou droit tenu pendant un glisser : la bande lumineuse se remplit jusqu'au changement (bords.ts).
  const halo = useSyncExternalStore(abonnerHalo, lireHalo)

  // Pendant un glisser, le doigt tenu contre le bord gauche ou droit de la grille change de période (spec §C.2) :
  // une semaine en vue Semaine, un jour en vue Jour (même sur trois jours : on avance jour par jour) ; rien en vue Mois.
  const deplacer = useRef((_sens: 1 | -1) => {})
  deplacer.current = (sens) => onJour(ajouterJours(jour, sens * (vue === 'semaine' ? 7 : 1)))
  useEffect(() => enregistrerChangementPeriode(vue === 'mois' ? null : (sens) => deplacer.current(sens)), [vue])

  const unite = vue === 'semaine' ? 'semaine' : vue === 'jour' ? (nbJours > 1 ? 'période' : 'jour') : 'mois'
  const genre = unite === 'semaine' || unite === 'période' ? ['précédente', 'suivante'] : ['précédent', 'suivant']
  const aujourdhuiVisible = vue === 'mois' ? jour.slice(0, 7) === aujourdhui.slice(0, 7) : jours.includes(aujourdhui)

  return (
    <section className="calendrier" aria-label="Calendrier" data-vue={vue}>
      <div className="calendrier-barre">
        <button type="button" className="btn-icone" aria-label={`${capitale(unite)} ${genre[0]}`} onClick={precedent}>
          <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <button type="button" className="btn-aujourdhui" data-actif={aujourdhuiVisible} onClick={() => onJour(aujourdhui)}>
          Aujourd'hui
        </button>
        <button type="button" className="btn-icone" aria-label={`${capitale(unite)} ${genre[1]}`} onClick={suivant}>
          <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <button type="button" className="btn-nouvelle-indispo" aria-label="+ Indisponibilité" onClick={onNouvelleIndispo}>
          <span aria-hidden="true">+</span>
          <span className="btn-nouvelle-indispo-texte" aria-hidden="true">
            {' '}
            Indisponibilité
          </span>
        </button>
        <p className="calendrier-periode" aria-live="polite">
          {libellePeriode(vue, jours)}
        </p>
      </div>

      <div className="calendrier-vue">
        <div className="calendrier-defilement" {...balayage}>
          <div className="calendrier-piste" ref={piste}>
            {vue === 'mois' ? (
              <VueMois mois={jour.slice(0, 7)} onOuvrirJour={onOuvrirJour} />
            ) : (
              // La clé fait repartir le défilement à zéro (ou sur « maintenant ») quand on change de vue.
              <Grille
                key={`${vue}-${nbJours}`}
                jours={jours}
                pxHeure={pxHeure}
                onTapTrou={onTapTrou}
                onOuvrirCreneau={onOuvrirCreneau}
                onOuvrirIndispo={onOuvrirIndispo}
              />
            )}
          </div>
        </div>
        {halo && vue !== 'mois' && (
          <div key={halo.id} className="bord-halo" data-bord-halo={halo.cote < 0 ? 'gauche' : 'droite'} aria-hidden="true" />
        )}
      </div>
      <Corbeille />
      {vue !== 'mois' && <BarreSelection jours={jours} />}
    </section>
  )
}

const capitale = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
