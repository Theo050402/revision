// Notifications éphémères (confirmations discrètes). Les erreurs persistantes, elles, restent
// affichées dans un bandeau tant qu'elles durent : voir `App.tsx`.
// Un toast entre en montant (CSS, `monter-toast`) et sort par où il est venu : fondu et 8 px de glissement en 150 ms
// (fondu seul en mouvement réduit), puis il quitte le DOM (audit M12). Feuille ouverte : il est en haut, entre et
// sort par le haut.
import { useLayoutEffect, useRef } from 'react'
import { create } from 'zustand'
import { fondu } from './mouvement/geste'
import { mouvementReduit } from './mouvement/ressort'

export type MessageToast = { id: number; texte: string; sortie?: boolean }

/** Durée d'affichage : assez longue pour être lue sans se presser. */
export const DUREE_TOAST_MS = 5000
const MAX_AFFICHES = 3
/** Sortie : fondu et glissement de 8 px. */
const DUREE_SORTIE_MS = 150
const COURSE_SORTIE = 8

export const useToasts = create<{ liste: MessageToast[] }>(() => ({ liste: [] }))

let compteur = 0

/** Demande la sortie d'un toast : il reste affiché le temps de son animation. */
function retirer(id: number): void {
  useToasts.setState((s) => ({ liste: s.liste.map((t) => (t.id === id && !t.sortie ? { ...t, sortie: true } : t)) }))
}

function effacer(id: number): void {
  useToasts.setState((s) => ({ liste: s.liste.filter((t) => t.id !== id) }))
}

/** Affiche un message court, qui disparaît seul. */
export function toast(texte: string): void {
  const id = ++compteur
  useToasts.setState((s) => ({ liste: [...s.liste, { id, texte }].slice(-MAX_AFFICHES) }))
  setTimeout(() => retirer(id), DUREE_TOAST_MS)
}

function UnToast({ t }: { t: MessageToast }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!t.sortie) return
    const el = ref.current
    if (!el) return effacer(t.id)
    // En haut quand une feuille est ouverte (ui.css) : il repart vers le haut.
    const sens = document.querySelector('.feuille-fond:not([data-fantome])') ? -1 : 1
    const glisse = !mouvementReduit()
    el.style.animation = 'none'
    const f = fondu(
      (o) => {
        el.style.opacity = String(o)
        if (glisse) el.style.transform = `translateY(${(1 - o) * COURSE_SORTIE * sens}px)`
      },
      1,
      0,
      DUREE_SORTIE_MS,
      () => effacer(t.id),
    )
    return () => f.arreter()
  }, [t.sortie, t.id])

  return (
    <div ref={ref} className="toast" data-sortie={t.sortie || undefined} aria-hidden={t.sortie || undefined}>
      <span>{t.texte}</span>
      <button type="button" className="toast-fermer" aria-label="Fermer le message" onClick={() => retirer(t.id)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  )
}

export function Toasts() {
  const liste = useToasts((s) => s.liste)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {liste.map((t) => (
        <UnToast key={t.id} t={t} />
      ))}
    </div>
  )
}
