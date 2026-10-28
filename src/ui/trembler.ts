/** Durée du tremblement (spec §13.3), identique à celle de `.tremble` dans ui.css. */
export const DUREE_TREMBLEMENT_MS = 200

/**
 * Retour visuel d'un dépôt refusé : ajoute `.tremble` puis la retire après 200 ms. Une minuterie
 * (et non `animationend`) car en mouvement réduit l'animation est supprimée, mais la teinte
 * rouge de la classe doit quand même disparaître.
 */
export function trembler(el: HTMLElement): void {
  el.classList.remove('tremble')
  void el.offsetWidth // relance l'animation si l'élément tremble déjà
  el.classList.add('tremble')
  window.setTimeout(() => el.classList.remove('tremble'), DUREE_TREMBLEMENT_MS)
}
