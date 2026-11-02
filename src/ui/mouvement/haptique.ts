/**
 * Retour haptique (spec §C.5). Trois motifs : léger (saisie, changement de jour), succès (lâcher),
 * erreur (deux légers rapprochés).
 *
 * - `navigator.vibrate` quand il existe (Android, navigateurs de bureau) ;
 * - sinon, sur iPhone (iOS 18+), l'astuce de l'interrupteur : un `<input type="checkbox" switch>`
 *   caché dont on bascule la case par programme déclenche le retour haptique du système ;
 * - sinon rien. Ne lève jamais : un retour haptique raté ne doit pas casser un geste.
 */
export type MotifHaptique = 'leger' | 'succes' | 'erreur'

/** Motifs de `navigator.vibrate` (ms) : vibration / pause / vibration. */
const VIBRATIONS: Record<MotifHaptique, number | number[]> = {
  leger: 10,
  succes: [10, 40, 10],
  erreur: [20, 60, 20],
}

/** Nombre de bascules de l'interrupteur par motif (une bascule = un tic). */
const BASCULES: Record<MotifHaptique, number> = { leger: 1, succes: 2, erreur: 2 }

/** Écart entre deux tics d'un motif double. */
const ECART_MS = 60

/** Interrupteur caché, créé au premier besoin puis réutilisé. */
let interrupteur: { click(): void } | null = null

function obtenirInterrupteur(): { click(): void } | null {
  if (interrupteur) return interrupteur
  if (typeof document === 'undefined' || !document) return null
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  Object.assign(label.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  const input = document.createElement('input')
  input.setAttribute('type', 'checkbox')
  input.setAttribute('switch', '')
  input.setAttribute('tabindex', '-1')
  label.appendChild(input)
  const hote = document.body ?? document.documentElement
  if (!hote) return null
  hote.appendChild(label)
  interrupteur = label
  return interrupteur
}

function basculer(): void {
  try {
    obtenirInterrupteur()?.click()
  } catch {
    /* sans effet : pas de retour haptique */
  }
}

export function haptique(motif: MotifHaptique): void {
  try {
    if (typeof navigator !== 'undefined' && navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATIONS[motif])
      return
    }
    basculer()
    for (let i = 1; i < BASCULES[motif]; i++) setTimeout(basculer, i * ECART_MS)
  } catch {
    /* jamais d'exception vers l'appelant */
  }
}
