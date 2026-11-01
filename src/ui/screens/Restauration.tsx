// Restauration d'une sauvegarde (spec §11, §14) : le fichier est validé avant toute écriture ; invalide, il est
// refusé avec la raison et rien ne change ; valide, il remplace tout après confirmation.
import { useRef, useState } from 'react'
import type { Etat } from '../../domain/types'
import { lireSauvegarde } from '../../storage/backup'
import { FeuilleConfirmation } from '../feuilles/FeuilleConfirmation'
import { useStore } from '../store'
import { toast } from '../Toast'

/** Après une restauration, Calendrier peut contenir autre chose que l'état restauré. */
export const INDICE_CALENDRIER = "Si ton Calendrier ne correspond plus, utilise « Repartir d'un calendrier vide » dans Exporter."

export function Restauration() {
  const champ = useRef<HTMLInputElement>(null)
  const [refus, setRefus] = useState<string | null>(null)
  const [propose, setPropose] = useState<Etat | null>(null)

  const choisi = async (fichier: File | undefined) => {
    if (champ.current) champ.current.value = '' // permet de rechoisir le même fichier
    if (!fichier) return
    setRefus(null)
    let texte = ''
    try {
      texte = await fichier.text()
    } catch {
      /* texte vide : « fichier illisible » ci-dessous */
    }
    const lecture = lireSauvegarde(texte)
    if (lecture.ok) setPropose(lecture.etat)
    else
      setRefus(
        `Ce fichier n'est pas une sauvegarde de Révisions (${lecture.raison}). Tes données n'ont pas été modifiées.`,
      )
  }

  const remplacer = () => {
    if (propose === null) return
    useStore.getState().restaurer(propose)
    setPropose(null)
    toast('Données restaurées.')
    toast(INDICE_CALENDRIER)
  }

  return (
    <div className="restauration">
      <button type="button" className="btn-ajout" onClick={() => champ.current?.click()}>
        Restaurer une sauvegarde
      </button>
      <input
        ref={champ}
        type="file"
        accept=".json,application/json"
        hidden
        data-champ="restauration"
        onChange={(e) => void choisi(e.target.files?.[0])}
      />
      {refus !== null && (
        <p className="message-erreur" role="alert">
          {refus}
        </p>
      )}
      {propose !== null && (
        <FeuilleConfirmation
          titre="Remplacer toutes les données ?"
          confirmer="Remplacer"
          onConfirmer={remplacer}
          onAnnuler={() => setPropose(null)}
        >
          Les collèges, créneaux, indisponibilités et réglages actuels seront remplacés par ceux de la sauvegarde.
          Cette action ne peut pas être annulée.
        </FeuilleConfirmation>
      )}
    </div>
  )
}
