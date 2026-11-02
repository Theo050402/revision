/**
 * Retour dès l'appui (spec §C.6) : au `pointerdown` (pas au relâchement), l'élément touchable reçoit `data-presse`
 * et le CSS le réduit (échelle 0,97, 100 ms) ou le fonce (blocs, cartes : ils se glissent). Safari iOS n'applique
 * `:active` que de façon inégale ; le drapeau posé ici marche pareil au doigt, au stylet et à la souris, et se
 * retire au relâchement, à l'annulation du navigateur (début d'un défilement) ou quand le doigt s'éloigne.
 *
 * Même point d'entrée : on retient le dernier élément touché, d'où une feuille « grandit » (popover iPad) — Safari
 * ne donne pas le focus au bouton touché, `document.activeElement` ne dit donc pas qui l'a ouverte.
 */

/** Ce qui réagit à l'appui. Les éléments désactivés sont écartés ensuite. */
const TOUCHABLES = 'button, [role="button"], a[href], summary, .bloc-creneau, .bloc-indispo, label.carte-case'
/** Marge (px) autour de l'élément où le doigt peut glisser sans que l'appui s'annule. */
const MARGE = 10
/** Au-delà (ms), le dernier élément touché n'est plus « ce qui vient d'ouvrir » une feuille. */
const FRAICHEUR = 2000

let presse: Element | null = null
let dernier: { el: Element; x: number; y: number; t: number } | null = null

function retirer(): void {
  presse?.removeAttribute('data-presse')
  presse = null
}

function dedans(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect()
  return x >= r.left - MARGE && x <= r.right + MARGE && y >= r.top - MARGE && y <= r.bottom + MARGE
}

/** Branche les écouteurs sur le document ; renvoie leur retrait. */
export function installerAppui(): () => void {
  const bas = (e: PointerEvent) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const cible = e.target instanceof Element ? e.target : null
    retirer()
    const el = cible?.closest(TOUCHABLES) ?? null
    if (cible) dernier = { el: el ?? cible, x: e.clientX, y: e.clientY, t: performance.now() }
    if (el && !el.matches(':disabled, [aria-disabled="true"]')) {
      el.setAttribute('data-presse', '')
      presse = el
    }
  }
  const bouge = (e: PointerEvent) => {
    if (!presse || !e.isPrimary) return
    const dans = dedans(presse, e.clientX, e.clientY)
    if (dans) presse.setAttribute('data-presse', '')
    else presse.removeAttribute('data-presse')
  }
  // Un deuxième doigt qui se lève ne relâche pas l'appui du premier.
  const fin = (e: Event) => {
    if (e instanceof PointerEvent && !e.isPrimary) return
    retirer()
  }
  document.addEventListener('pointerdown', bas, true)
  document.addEventListener('pointermove', bouge, true)
  document.addEventListener('pointerup', fin, true)
  document.addEventListener('pointercancel', fin, true)
  document.addEventListener('dragstart', fin, true)
  window.addEventListener('blur', fin)
  return () => {
    document.removeEventListener('pointerdown', bas, true)
    document.removeEventListener('pointermove', bouge, true)
    document.removeEventListener('pointerup', fin, true)
    document.removeEventListener('pointercancel', fin, true)
    document.removeEventListener('dragstart', fin, true)
    window.removeEventListener('blur', fin)
    retirer()
  }
}

/** L'élément qui vient d'ouvrir une feuille : le dernier touché, sinon celui qui a le focus (ouverture au clavier). */
export function elementDeclencheur(): HTMLElement | null {
  if (dernier && performance.now() - dernier.t <= FRAICHEUR && dernier.el instanceof HTMLElement) return dernier.el
  const actif = document.activeElement
  return actif instanceof HTMLElement && actif !== document.body && !actif.closest('[role="dialog"]') ? actif : null
}

/** Point (px écran) d'où une feuille s'ouvre : le centre de l'élément touché s'il est petit, sinon le doigt. */
export function pointDeclencheur(): { x: number; y: number } | null {
  if (dernier && performance.now() - dernier.t <= FRAICHEUR) {
    const { el, x, y } = dernier
    if (!el.isConnected) return { x, y }
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.width <= 200 && r.height <= 200) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    return { x, y }
  }
  // Ouverture au clavier : le bouton qui a le focus.
  const actif = document.activeElement
  if (actif instanceof HTMLElement && actif !== document.body && !actif.closest('[role="dialog"]')) {
    const r = actif.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return null
}
