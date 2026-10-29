// Champ de formulaire des Réglages : étiquette, saisie en texte (validée à part, voir domain/validation.ts), erreur.
import { useId } from 'react'

type Props = {
  etiquette: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  erreur?: string
  /** Invalide sans message sous le champ (le message est affiché pour le groupe). */
  invalide?: boolean
  /** Texte après le champ (« min », « % »). */
  suffixe?: string
  decimal?: boolean
  /** Étiquette seulement pour les lecteurs d'écran. */
  masquee?: boolean
  type?: 'text' | 'time' | 'date'
}

export function Champ({ etiquette, value, onChange, onBlur, erreur, invalide, suffixe, decimal, masquee, type = 'text' }: Props) {
  const id = useId()
  return (
    <div className="champ-groupe">
      <label className={masquee ? 'sr-only' : 'etiquette'} htmlFor={id}>
        {etiquette}
      </label>
      <div className="champ-ligne">
        <input
          id={id}
          className="champ champ-court"
          type={type}
          inputMode={type === 'text' ? (decimal ? 'decimal' : 'numeric') : undefined}
          autoComplete="off"
          value={value}
          aria-invalid={erreur !== undefined || invalide || undefined}
          aria-describedby={erreur ? `${id}-erreur` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {suffixe && <span className="suffixe">{suffixe}</span>}
      </div>
      {erreur && (
        <p id={`${id}-erreur`} className="message-erreur">
          {erreur}
        </p>
      )}
    </div>
  )
}
