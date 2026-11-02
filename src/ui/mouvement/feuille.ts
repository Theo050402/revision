/**
 * Mouvement d'une feuille (spec §C.6), hors de React : le DOM est écrit image par image (`transform`, `opacity`).
 *
 * - iPhone (feuille du bas) : entre et sort par le bas, par ressort `RESSORT_FEUILLE` ; se tire vers le bas par
 *   sa tête (poignée + titre) en suivant le doigt 1:1, avec une résistance élastique vers le haut ; au relâchement
 *   elle se ferme si sa position projetée par la vitesse passe 30 % de sa hauteur, sinon elle revient.
 * - iPad (popover centré) : grandit de 0,9 à 1 avec l'opacité depuis le bouton qui l'a ouverte (`transform-origin`),
 *   et y retourne en se fermant.
 * - Mouvement réduit : ni échelle, ni glissement, ni ressort : un fondu de 150 ms.
 *
 * Tout est interruptible : un doigt posé sur la feuille en mouvement l'arrête et la reprend (un ressort relancé
 * repart de la position et de la vitesse courantes).
 */
import { pointDeclencheur } from './appui'
import { creerSuiviVitesse, doitFermer, elastique, fondu, type Fondu } from './geste'
import { animerValeur, mouvementReduit, RESSORT_FEUILLE, type Anim } from './ressort'

export type MouvementFeuille = {
  /** Sortie animée, puis `surFermee`. Sans effet si elle est déjà en cours. */
  fermer(): void
  /** Un doigt se pose sur la tête de la feuille : tirage possible (feuille du bas seulement). */
  prendre(pointerId: number, clientY: number): void
  detruire(): void
}

/** Déplacement (px) à partir duquel un appui sur la tête devient un tirage (en deçà : un simple appui). */
const SEUIL_TIRAGE = 6
/** Échelle de départ du popover. */
const ECHELLE_POPOVER = 0.9
/** Sous cette avancée du ressort de sortie, le popover est refermé. */
const AVANCE_FERMEE = 0.02

const borne = (v: number) => Math.min(1, Math.max(0, v))

export function animerFeuille(
  { fond, voile, feuille }: { fond: HTMLElement; voile: HTMLElement; feuille: HTMLElement },
  surFermee: () => void,
): MouvementFeuille {
  /** Le CSS fait de la feuille étroite un popover centré sur iPad : on lit le résultat plutôt que de le deviner. */
  const popover = () => getComputedStyle(fond).alignItems === 'center'
  const suivi = creerSuiviVitesse()

  let anim: Anim | null = null
  let fade: Fondu | null = null
  let sortie = false
  let fermee = false
  let detruit = false
  let hauteur = feuille.offsetHeight
  /** Décalage vertical courant de la feuille du bas (px), et avancée du popover (0 = réduit, 1 = posé). */
  let y = 0
  let p = 0
  let tirage: { id: number; y0: number; base: number; tire: boolean } | null = null

  const marquer = (actif: boolean) => (actif ? feuille.setAttribute('data-anime', '') : feuille.removeAttribute('data-anime'))

  // ---------- écriture ----------

  const ecrireBas = (v: number) => {
    y = v
    feuille.style.transform = `translateY(${v}px)`
    voile.style.opacity = String(hauteur > 0 ? borne(1 - v / hauteur) : 1)
  }
  const ecrirePopover = (v: number) => {
    p = v
    feuille.style.transform = `scale(${ECHELLE_POPOVER + (1 - ECHELLE_POPOVER) * v})`
    feuille.style.opacity = String(borne(v / 0.7))
    voile.style.opacity = String(borne(v))
  }
  /** Au repos, plus rien d'inline : un `transform` posé en permanence ferait de la feuille le bloc conteneur de ses enfants fixes. */
  const repos = () => {
    feuille.style.transform = ''
    feuille.style.opacity = ''
    voile.style.opacity = ''
    marquer(false)
  }

  /** Le popover grandit depuis le bouton qui l'a ouvert (relevé à l'ouverture, gardé jusqu'à la fermeture). */
  const placerOrigine = () => {
    const point = pointDeclencheur()
    if (!point) return
    const boite = feuille.getBoundingClientRect() // au repos : la boîte de mise en page, sans `transform`
    feuille.style.transformOrigin = `${point.x - boite.left}px ${point.y - boite.top}px`
  }

  const terminer = () => {
    if (fermee || detruit) return
    fermee = true
    surFermee()
    // Le parent a gardé la feuille (fermeture refusée) : elle ne reste pas cachée hors de l'écran, elle revient.
    setTimeout(() => {
      if (detruit) return
      fermee = false
      sortie = false
      if (mouvementReduit()) {
        fondre(opaciteCourante(), 1, repos)
      } else if (popover()) {
        anim = ressortPopover(p)
        anim.vers(1)
      } else {
        anim = ressortBas(y)
        anim.vers(0)
      }
    }, 120)
  }

  // ---------- ressorts ----------

  function ressortBas(depart: number): Anim {
    return animerValeur(depart, RESSORT_FEUILLE, (v) => {
      ecrireBas(v)
      if (sortie) {
        if (v >= hauteur - 1) terminer()
      } else if (v === 0) repos()
    })
  }

  function ressortPopover(depart: number): Anim {
    return animerValeur(depart, RESSORT_FEUILLE, (v) => {
      ecrirePopover(v)
      if (sortie) {
        if (v <= AVANCE_FERMEE) terminer()
      } else if (v === 1) repos()
    })
  }

  function fondre(de: number, vers: number, fin?: () => void): void {
    fade?.arreter()
    fade = fondu(
      (o) => {
        feuille.style.opacity = String(o)
        voile.style.opacity = String(o)
      },
      de,
      vers,
      150,
      fin,
    )
  }
  function opaciteCourante(): number {
    return feuille.style.opacity === '' ? 1 : Number(feuille.style.opacity)
  }

  // ---------- ouverture ----------

  marquer(true)
  if (mouvementReduit()) {
    fondre(0, 1, repos)
  } else if (popover()) {
    placerOrigine()
    ecrirePopover(0)
    anim = ressortPopover(0)
    anim.vers(1)
  } else {
    ecrireBas(hauteur)
    anim = ressortBas(hauteur)
    anim.vers(0)
  }

  // ---------- fermeture ----------

  function fermer(): void {
    if (fermee || detruit || (sortie && !tirage)) return
    sortie = true
    marquer(true)
    if (tirage) {
      // Fermeture demandée pendant un tirage (Échap) : le tirage est abandonné, la feuille repart d'où elle est.
      document.removeEventListener('pointermove', surMouvement)
      document.removeEventListener('pointerup', surRelache)
      document.removeEventListener('pointercancel', surRelache)
      tirage = null
      anim = null
    }
    hauteur = feuille.offsetHeight
    if (mouvementReduit()) {
      anim?.arreter()
      fondre(opaciteCourante(), 0, terminer)
    } else if (popover()) {
      anim ??= ressortPopover(p)
      anim.vers(0)
    } else {
      anim ??= ressortBas(y)
      anim.vers(hauteur)
    }
  }

  // ---------- tirage (feuille du bas) ----------

  function surMouvement(e: PointerEvent): void {
    if (!tirage || e.pointerId !== tirage.id) return
    const dy = e.clientY - tirage.y0
    if (!tirage.tire) {
      if (Math.abs(dy) < SEUIL_TIRAGE) return
      tirage.tire = true
    }
    suivi.ajouter(e.clientY, performance.now())
    const brut = tirage.base + dy
    ecrireBas(brut >= 0 ? brut : -elastique(-brut, hauteur))
  }

  function surRelache(e: PointerEvent): void {
    if (!tirage || e.pointerId !== tirage.id) return
    const { tire } = tirage
    const v = e.type === 'pointercancel' ? 0 : suivi.vitesse(performance.now())
    tirage = null
    document.removeEventListener('pointermove', surMouvement)
    document.removeEventListener('pointerup', surRelache)
    document.removeEventListener('pointercancel', surRelache)
    if (detruit) return
    if (!tire) {
      // Un simple appui : la feuille reprend sa course là où il l'avait arrêtée (la position n'a pas changé).
      anim?.vers(sortie ? hauteur : 0)
      return
    }
    const ferme = doitFermer(y, v, hauteur)
    sortie = ferme
    if (mouvementReduit()) {
      if (ferme) {
        fondre(opaciteCourante(), 0, terminer)
      } else {
        ecrireBas(0)
        repos()
      }
      return
    }
    anim = ressortBas(y)
    anim.vers(ferme ? hauteur : 0, v)
  }

  function prendre(pointerId: number, clientY: number): void {
    if (detruit || fermee || popover()) return
    if (tirage) return
    hauteur = feuille.offsetHeight
    // Le doigt arrête la feuille en mouvement ; une sortie en cours est suspendue tant qu'il n'a pas relâché.
    anim?.arreter()
    sortie = false
    suivi.effacer()
    suivi.ajouter(clientY, performance.now())
    tirage = { id: pointerId, y0: clientY, base: y, tire: false }
    marquer(true)
    document.addEventListener('pointermove', surMouvement)
    document.addEventListener('pointerup', surRelache)
    document.addEventListener('pointercancel', surRelache)
  }

  return {
    fermer,
    prendre,
    detruire() {
      detruit = true
      anim?.arreter()
      fade?.arreter()
      // Remontage (StrictMode) : la feuille repart d'une page blanche, sa boîte se mesure sans `transform`.
      feuille.style.transform = ''
      feuille.style.opacity = ''
      document.removeEventListener('pointermove', surMouvement)
      document.removeEventListener('pointerup', surRelache)
      document.removeEventListener('pointercancel', surRelache)
    },
  }
}
