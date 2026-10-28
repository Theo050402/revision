import { useState } from 'react'
import { ajouterJours, jourDe, local, utcVersLocal } from '../../domain/temps'
import { genererIcs, type EvenementIcs } from '../../ics/export'
import { livrerIcs, type MethodeLivraison } from '../../ics/livraison'

const NOM_FICHIER = 'test-revisions.ics'

function evenements(sequence: number, heureTest1: number): EvenementIcs[] {
  const demain = ajouterJours(jourDe(utcVersLocal(new Date())), 1)
  const creneau = (uid: string, heure: number): EvenementIcs => ({
    uid,
    sequence,
    debut: local(demain, heure * 60),
    fin: local(demain, heure * 60 + 60),
    resume: `Test ${uid.slice(0, 6)}`,
    description: 'Événement de test de l’export vers le Calendrier',
    categorie: 'Test',
    rappel: 0,
  })
  return [creneau('test-1@revisions-emma', heureTest1), creneau('test-2@revisions-emma', 14)]
}

const styleBouton = {
  minHeight: 44,
  padding: '10px 16px',
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--accent)',
  color: 'var(--on-accent)',
  font: 'inherit',
  fontSize: 16,
  textAlign: 'left',
  boxSizing: 'border-box',
} as const

const libelles: Record<MethodeLivraison | 'annule', string> = {
  partage: 'Fichier envoyé via la feuille de partage.',
  telechargement: 'Fichier téléchargé.',
  annule: 'Partage annulé.',
}

export function TestExport() {
  const [resultat, setResultat] = useState('')

  async function exporter(sequence: number, heureTest1: number, methode?: MethodeLivraison) {
    const ics = genererIcs(evenements(sequence, heureTest1), new Date())
    setResultat(libelles[await livrerIcs(ics, NOM_FICHIER, methode)])
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Test de l’export vers le Calendrier</h2>
      <p style={{ margin: 0 }}>
        Avant de commencer, crée un calendrier « Test » dans l’app Calendrier. Chaque bouton
        exporte deux événements pour demain, à 10 h et à 14 h. Note le bouton qui ouvre
        l’écran d’import du Calendrier, puis, après l’import, essaie le bouton 3 : l’événement
        de 10 h est-il déplacé à 11 h, ou dupliqué ?
      </p>
      <button type="button" style={styleBouton} onClick={() => exporter(1, 10, 'partage')}>
        1. Exporter (partage)
      </button>
      <button type="button" style={styleBouton} onClick={() => exporter(1, 10, 'telechargement')}>
        2. Exporter (téléchargement)
      </button>
      <button type="button" style={styleBouton} onClick={() => exporter(2, 11)}>
        3. Réexporter modifié
      </button>
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        Après l’import, regarde demain : l’événement de 10h est-il déplacé à 11h ou dupliqué ?
      </p>
      <a
        href={`${location.origin}${location.pathname}#test-export`}
        target="_blank"
        rel="noopener"
        style={{ ...styleBouton, display: 'flex', alignItems: 'center', textDecoration: 'none' }}
      >
        4. Ouvrir dans Safari
      </a>
      <p role="status" style={{ margin: 0, minHeight: 20, color: 'var(--muted)' }}>
        {resultat}
      </p>
    </main>
  )
}
