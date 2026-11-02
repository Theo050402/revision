/**
 * Briques des gestes tirés au doigt (feuilles, balayage de semaine) : résistance élastique aux bords, vitesse du
 * doigt relevée sur ses derniers mouvements, décision de fermeture au relâchement et fondu court (mouvement réduit).
 */
import { projeter } from './ressort'

/**
 * Résistance élastique (Apple) : plus le doigt dépasse la limite, moins l'objet le suit, et il n'ira jamais
 * au-delà de `dimension`. Signe conservé ; `constante` 0,55 comme UIScrollView.
 */
export function elastique(depassement: number, dimension: number, constante = 0.55): number {
  const d = Math.abs(depassement)
  if (d === 0 || dimension <= 0) return 0
  return Math.sign(depassement) * ((d * dimension * constante) / (dimension + constante * d))
}

export type SuiviVitesse = {
  /** Note la position `x` du doigt à l'instant `t` (ms). */
  ajouter(x: number, t: number): void
  /** Vitesse (unités/s) sur les `fenetre` dernières ms avant `t` ; 0 si le doigt s'est arrêté avant de se lever. */
  vitesse(t: number): number
  effacer(): void
}

/**
 * Vitesse du doigt sur une courte fenêtre glissante. Un doigt resté immobile plus de `fenetre` ms avant de se lever
 * ne lance rien (vitesse nulle). `dtMin` borne la durée : des échantillons simultanés ne donnent pas une vitesse infinie.
 */
export function creerSuiviVitesse(fenetre = 100, dtMin = 16): SuiviVitesse {
  let echantillons: { x: number; t: number }[] = []
  return {
    ajouter(x, t) {
      echantillons.push({ x, t })
      if (echantillons.length > 16) echantillons.shift()
    },
    vitesse(t) {
      const recents = echantillons.filter((e) => t - e.t <= fenetre)
      if (recents.length < 2) return 0
      const a = recents[0]
      const b = recents[recents.length - 1]
      return ((b.x - a.x) / Math.max(b.t - a.t, dtMin)) * 1000
    },
    effacer() {
      echantillons = []
    },
  }
}

/** Part de la hauteur (ou de la largeur) au-delà de laquelle le relâchement ferme / change de page. */
export const SEUIL_FERMETURE = 0.3

/**
 * Faut-il fermer une feuille relâchée à `decalage` px (vers le bas) avec `vitesse` px/s ? La position d'arrivée
 * projetée (décélération 0,99, plus vive que le défilement) doit dépasser 30 % de la hauteur : un coup vers le bas
 * ferme même court, un coup vers le haut ramène la feuille même si elle était très tirée.
 */
export function doitFermer(decalage: number, vitesse: number, hauteur: number, seuil = SEUIL_FERMETURE): boolean {
  return decalage + projeter(vitesse, 0.99) > hauteur * seuil
}

export type Fondu = { arreter(): void }

/**
 * Fondu linéaire court (150 ms par défaut) sur `requestAnimationFrame` : ce que remplace le ressort en mouvement
 * réduit (spec §C.6). `fin` est appelé une fois, à l'arrivée ; `arreter` l'annule sans l'appeler.
 */
export function fondu(appliquer: (opacite: number) => void, de: number, vers: number, duree = 150, fin?: () => void): Fondu {
  const debut = performance.now()
  let id = 0
  let actif = true
  appliquer(de)
  const tour = () => {
    if (!actif) return
    const p = Math.min(1, Math.max(0, (performance.now() - debut) / duree))
    appliquer(de + (vers - de) * p)
    if (p < 1) id = requestAnimationFrame(tour)
    else {
      actif = false
      fin?.()
    }
  }
  id = requestAnimationFrame(tour)
  return {
    arreter() {
      actif = false
      cancelAnimationFrame(id)
    },
  }
}
