/** Durée du tremblement (spec §13.3), identique à celle de `.tremble` dans ui.css. */
export const DUREE_TREMBLEMENT_MS = 200

/** Minuterie en cours par élément : un second refus dans les 200 ms ré-arme la sienne au lieu d'être coupé. */
const minuteries = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/**
 * Retour visuel d'un dépôt refusé : ajoute `.tremble` puis la retire après 200 ms. Une minuterie
 * (et non `animationend`) car en mouvement réduit l'animation est supprimée, mais la teinte
 * rouge de la classe doit quand même disparaître.
 */
export function trembler(el: HTMLElement): void {
  const enCours = minuteries.get(el)
  if (enCours !== undefined) clearTimeout(enCours)
  el.classList.remove('tremble')
  void el.offsetWidth // relance l'animation si l'élément tremble déjà
  el.classList.add('tremble')
  minuteries.set(
    el,
    setTimeout(() => {
      minuteries.delete(el)
      el.classList.remove('tremble')
    }, DUREE_TREMBLEMENT_MS),
  )
}
