// Carte d'item de la bibliothèque (spec §8) : pastille du numéro à la couleur du collège, titre sur deux
// lignes, « 18 p · 2h15 » et points des tours. Un tap ouvre la fiche ; en mode sélection, il coche la carte.
// Glisser-déposer : délégué à la racine de la bibliothèque (`SourceGlisse`, dnd/ContexteDnd.tsx), qui lit `data-item-id` /
// `data-creneau-id` au `pointerdown` ; la carte reste mémoïsée et ne se redessine ni au début ni pendant le geste.
import { memo } from 'react'
import type { EtatTour } from '../../domain/tours'
import type { Item } from '../../domain/types'
import { descriptionTours, pointsTours } from './libelles'

export type CarteItemProps = {
  item: Item
  /** Index de la palette des surligneurs (`college.couleur`). */
  couleur: number
  /** « 18 p · 2h15 » ou « 18 p · T2 1h15 ». */
  meta: string
  etats: EtatTour[]
  /** Mode « Sélectionner » : une case à cocher apparaît et le tap coche. */
  modeSelection?: boolean
  selectionnee?: boolean
  onBasculer?: (itemId: string) => void
  onOuvrir: (itemId: string) => void
  /** Créneau du bac « À placer » : remplace la méta par « T1 · 1h15 · 2/3 » et n'est pas sélectionnable. */
  creneauId?: string
}

export const CarteItem = memo(function CarteItem({
  item,
  couleur,
  meta,
  etats,
  modeSelection = false,
  selectionnee = false,
  onBasculer,
  onOuvrir,
  creneauId,
}: CarteItemProps) {
  const selectionnable = modeSelection && onBasculer !== undefined && creneauId === undefined
  const teinte = `var(--c${((couleur % 6) + 6) % 6})`
  const action = () => (selectionnable ? onBasculer(item.id) : onOuvrir(item.id))
  return (
    <div
      className="carte-item"
      data-item-id={item.id}
      data-creneau-id={creneauId}
      data-selectionnee={selectionnable ? selectionnee : undefined}
    >
      {selectionnable && (
        <label className="carte-case">
          <input
            type="checkbox"
            checked={selectionnee}
            onChange={() => onBasculer(item.id)}
            aria-label={`Sélectionner l'item ${item.numero}, ${item.titre}`}
          />
          <span className="carte-case-visuel" aria-hidden="true">
            <svg viewBox="0 0 12 12" width="12" height="12" focusable="false">
              <path d="M2 6.5 5 9.5 10.5 3" />
            </svg>
          </span>
        </label>
      )}
      <button type="button" className="carte-corps" onClick={action}>
        <span className="carte-pastille" style={{ background: teinte }} aria-hidden="true">
          {item.numero}
          {item.aVerifier && <i className="carte-verifier" />}
        </span>
        <span className="carte-texte">
          <span className="sr-seul">{`Item ${item.numero}, `}</span>
          <span className="carte-titre">{item.titre}</span>
          <span className="carte-meta">
            <span>{meta}</span>
            <span className="carte-points" aria-hidden="true">
              {pointsTours(etats).map((p, i) => (
                <i key={i} className="point-tour" data-etat={p} />
              ))}
            </span>
          </span>
          <span className="sr-seul">
            {`, ${descriptionTours(etats)}`}
            {item.aVerifier ? ', à vérifier' : ''}
          </span>
        </span>
      </button>
    </div>
  )
})
