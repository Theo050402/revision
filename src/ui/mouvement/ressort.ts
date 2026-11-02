/**
 * Ressorts (spec §C.4) : amortissement + réponse, interruptibles, avec transmission de vitesse.
 * Les valeurs sont en unités quelconques (px, opacité...) et en secondes ; on n'anime que
 * `transform` et `opacity`, jamais une propriété qui déclenche la mise en page.
 */

/** `amortissement` : 1 = critique (aucun dépassement), < 1 = rebond. `reponse` : en secondes (pas une durée). */
export type ParamsRessort = { amortissement: number; reponse: number }

/** Réglage par défaut : posé, sans rebond. */
export const RESSORT_DOUX: ParamsRessort = { amortissement: 1, reponse: 0.25 }
/** Petits déplacements vifs (emplacement d'atterrissage, cascade). */
export const RESSORT_RAPIDE: ParamsRessort = { amortissement: 1, reponse: 0.18 }
/** Feuilles et gestes lancés : un léger rebond, car le geste portait de l'élan. */
export const RESSORT_FEUILLE: ParamsRessort = { amortissement: 0.8, reponse: 0.3 }

/** Pas d'intégration fixe : 1/120 s. */
const PAS = 1 / 120
/** Au-delà, une image trop longue (onglet en veille) est écrêtée pour ne pas faire sauter le mouvement. */
const DT_MAX = 0.05
/** Seuils de repos : sous ces écarts, la valeur est posée exactement sur la cible. */
const EPSILON_POSITION = 0.01
const EPSILON_VITESSE = 0.01

/**
 * Un pas d'intégration semi-implicite (Euler symplectique, masse 1) :
 * raideur `k = (2π/réponse)²`, amortissement `c = 4π·ζ/réponse`. Un `dt` supérieur à 1/120 s
 * est découpé en sous-pas égaux ≤ 1/120 s, de sorte que le résultat ne dépend pas du rythme d'affichage.
 */
export function pasRessort(
  x: number,
  v: number,
  cible: number,
  p: ParamsRessort,
  dt: number,
): { x: number; v: number } {
  const omega = (2 * Math.PI) / p.reponse
  const k = omega * omega
  const c = 4 * Math.PI * p.amortissement / p.reponse
  const n = Math.max(1, Math.ceil(dt / PAS - 1e-9))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    v += (-k * (x - cible) - c * v) * h
    x += v * h
  }
  return { x, v }
}

/**
 * Distance que parcourrait un élément lancé à `vitesse` (px/s) avant de s'arrêter, avec la
 * décélération du défilement iOS : `(v/1000)·d/(1−d)`. À ajouter à la position de relâchement
 * pour choisir la cible la plus proche du point projeté.
 */
export function projeter(vitesse: number, deceleration = 0.998): number {
  return (vitesse / 1000) * deceleration / (1 - deceleration)
}

/** Horloge injectable : en test, les images sont pilotées à la main. */
export type Horloge = {
  requestAnimationFrame: (cb: (ts: number) => void) => number
  cancelAnimationFrame: (id: number) => void
  /** Temps en millisecondes, sur la même échelle que l'horodatage passé aux rappels. */
  maintenant: () => number
}

const HORLOGE_NAVIGATEUR: Horloge = {
  requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
  maintenant: () => performance.now(),
}

export type Anim = {
  /** Anime vers `cible` depuis la valeur courante ; sans `vitesse`, l'élan en cours est conservé. */
  vers(cible: number, vitesse?: number): void
  /** Fige la valeur courante, élan annulé. */
  arreter(): void
  valeur(): number
}

/** Vrai quand l'utilisateur demande moins de mouvement ; faux si `matchMedia` n'existe pas. */
export function mouvementReduit(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Ressort animé sur `requestAnimationFrame`. Interruptible : `vers` pendant un mouvement repart
 * de la valeur et de la vitesse courantes (ni saut, ni arrêt brusque). `appliquer` reçoit la
 * valeur à chaque image, et une dernière fois la cible exacte au repos. En mouvement réduit,
 * `vers` saute directement à la cible.
 */
export function animerValeur(
  depart: number,
  p: ParamsRessort,
  appliquer: (x: number) => void,
  horloge: Horloge = HORLOGE_NAVIGATEUR,
): Anim {
  let x = depart
  let v = 0
  let cible = depart
  let id: number | null = null
  let dernier = 0

  const image = (ts: number) => {
    id = null
    const dt = Math.min(Math.max((ts - dernier) / 1000, 0), DT_MAX)
    dernier = ts
    ;({ x, v } = pasRessort(x, v, cible, p, dt))
    if (Math.abs(x - cible) < EPSILON_POSITION && Math.abs(v) < EPSILON_VITESSE) {
      x = cible
      v = 0
      appliquer(x)
      return
    }
    appliquer(x)
    id = horloge.requestAnimationFrame(image)
  }

  const arreter = () => {
    if (id !== null) horloge.cancelAnimationFrame(id)
    id = null
    v = 0
  }

  return {
    vers(nouvelleCible, vitesse) {
      cible = nouvelleCible
      if (mouvementReduit()) {
        arreter()
        x = cible
        appliquer(x)
        return
      }
      if (vitesse !== undefined) v = vitesse
      if (id === null) {
        dernier = horloge.maintenant()
        id = horloge.requestAnimationFrame(image)
      }
    },
    arreter,
    valeur: () => x,
  }
}
