// Bord de défilement (audit M3, M15) : tant qu'une zone est en haut, son en-tête collant prolonge le chrome, opaque et
// sans filet ; dès que le contenu passe dessous, `data-bord-haut` est posé sur la zone et l'en-tête prend le matériau
// translucide et une ombre de bord (ui.css, « Matériaux »). L'attribut n'est écrit qu'au franchissement du seuil, pas
// à chaque événement : la zone du calendrier est sous `contain: strict` et défile pendant les glisser.
import { useEffect, type RefObject } from 'react'

/** Suit le défilement de la zone `ref` (ou de celle que `zone` trouve depuis elle). */
export function useBordHaut(ref: RefObject<HTMLElement | null>, zone?: (el: HTMLElement) => HTMLElement | null): void {
  useEffect(() => {
    const depart = ref.current
    const el = depart && zone ? zone(depart) : depart
    if (!el) return
    let pose = false
    const maj = () => {
      const p = el.scrollTop > 0
      if (p === pose) return
      pose = p
      el.toggleAttribute('data-bord-haut', p)
    }
    maj()
    el.addEventListener('scroll', maj, { passive: true })
    return () => {
      el.removeEventListener('scroll', maj)
      el.removeAttribute('data-bord-haut')
    }
    // `zone` est une fonction de recherche fixe (déclarée hors du composant) : seul l'élément compte.
  }, [ref])
}
