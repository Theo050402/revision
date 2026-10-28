// Modèle de données (spec §4). Toutes les heures sont des heures locales
// (Europe/Paris) au format `YYYY-MM-DDTHH:mm`. Les durées sont en minutes.

export type College = {
  id: string // uuid
  nom: string // « Cancérologie », modifiable
  couleur: number // index dans la palette des surligneurs
  coefficient: number // 1.0 par défaut
  importeLe: string
}

export type Item = {
  id: string // `${collegeId}:${numero}`
  collegeId: string
  numero: number // 1..367
  titre: string // titre officiel (liste EDN)
  pageDebut: number // page imprimée dans le livre
  pages: number // >= 1
  aVerifier: boolean // anomalie détectée à l'import
}

export type Creneau = {
  id: string // uuid, sert aussi d'UID dans le .ics
  itemId: string
  tour: number // 1, 2, 3…
  partie: { i: number; n: number } | null // découpage, ex. 1/2
  debut: string | null // null = dans le bac « À placer »
  duree: number
  dureePerso: boolean // true après redimensionnement manuel
  fait: boolean
  note: string
  version: number // incrémentée à chaque modification exportable
  versionExportee: number | null
}

export type Indispo = {
  id: string
  titre: string
  source: 'ponctuelle' | 'recurrente' | 'ics'
  sourceId: string | null // id de la récurrence ou du fichier .ics
  debut: string
  fin: string
}

export type Recurrence = {
  id: string
  titre: string
  jours: number[] // 1 = lundi … 7 = dimanche
  heureDebut: string // « 08:00 »
  heureFin: string
  du: string // date de début (incluse)
  au: string // date de fin (incluse)
}

export type SuppressionEnAttente = {
  creneauId: string
  libelle: string // « 300 · T1 · mardi 5 nov. 14h »
}

export type Reglages = {
  rythme: { minutes: number; pages: number } // 60 min pour 8 pages
  dureeMin: number // 30
  dureeMax: number // 180
  coefsTours: number[] // [1, 0.5, 0.35, 0.25], le dernier vaut pour les tours suivants
  pauseMultiple: number // 10
  journee: { debut: string; fin: string } // 07:00 – 23:00
  pas: 5 | 10 | 15 // 15
  rappel: 0 | 5 | 15 | 30 // 0 = aucun
  theme: 'auto' | 'clair' | 'sombre'
}

export type Etat = {
  colleges: Record<string, College>
  items: Record<string, Item>
  creneaux: Record<string, Creneau>
  indispos: Record<string, Indispo>
  recurrences: Record<string, Recurrence>
  suppressions: Record<string, SuppressionEnAttente> // indexé par creneauId
  reglages: Reglages
  premierExportFait: boolean
}
