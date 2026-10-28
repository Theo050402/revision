// Notifications éphémères (confirmations discrètes). Les erreurs persistantes, elles, restent
// affichées dans un bandeau tant qu'elles durent : voir `App.tsx`.
import { create } from 'zustand'

export type MessageToast = { id: number; texte: string }

/** Durée d'affichage : assez longue pour être lue sans se presser. */
export const DUREE_TOAST_MS = 5000
const MAX_AFFICHES = 3

export const useToasts = create<{ liste: MessageToast[] }>(() => ({ liste: [] }))

let compteur = 0

function retirer(id: number): void {
  useToasts.setState((s) => ({ liste: s.liste.filter((t) => t.id !== id) }))
}

/** Affiche un message court, qui disparaît seul. */
export function toast(texte: string): void {
  const id = ++compteur
  useToasts.setState((s) => ({ liste: [...s.liste, { id, texte }].slice(-MAX_AFFICHES) }))
  setTimeout(() => retirer(id), DUREE_TOAST_MS)
}

export function Toasts() {
  const liste = useToasts((s) => s.liste)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {liste.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.texte}</span>
          <button type="button" className="toast-fermer" aria-label="Fermer le message" onClick={() => retirer(t.id)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
