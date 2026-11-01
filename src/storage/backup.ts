// Sauvegarde et restauration JSON (spec §11). La lecture valide tout avant de rendre un `Etat` :
// l'appelant n'écrit rien si le résultat est `ok: false`. Validation manuelle, table par table :
// champs obligatoires et types primitifs ; les champs inconnus sont ignorés (et non recopiés).
import { REGLAGES_DEFAUT, etatVide } from '../domain/defaults'
import { brutDurees, lireDurees, lireJournee } from '../domain/validation'
import type {
  College,
  Creneau,
  Etat,
  Indispo,
  Item,
  Recurrence,
  Reglages,
  SuppressionEnAttente,
} from '../domain/types'

export const SCHEMA_VERSION = 1

export type ResultatLecture = { ok: true; etat: Etat } | { ok: false; raison: string }

export function exporterSauvegarde(e: Etat, maintenant: Date = new Date()): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    exporteLe: maintenant.toISOString(),
    colleges: Object.values(e.colleges),
    items: Object.values(e.items),
    creneaux: Object.values(e.creneaux),
    indispos: Object.values(e.indispos),
    recurrences: Object.values(e.recurrences),
    suppressions: Object.values(e.suppressions),
    reglages: e.reglages,
    premierExportFait: e.premierExportFait,
  })
}

type Obj = Record<string, unknown>

const estObjet = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const estTexte = (x: unknown): x is string => typeof x === 'string'
const estNombre = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const estBool = (x: unknown): x is boolean => typeof x === 'boolean'

function college(x: unknown): College | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.id) || !estTexte(x.nom) || !estNombre(x.couleur) || !estNombre(x.coefficient)) return null
  if (!estTexte(x.importeLe)) return null
  return { id: x.id, nom: x.nom, couleur: x.couleur, coefficient: x.coefficient, importeLe: x.importeLe }
}

function item(x: unknown): Item | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.id) || !estTexte(x.collegeId) || !estTexte(x.titre) || !estBool(x.aVerifier)) return null
  if (!estNombre(x.numero) || !estNombre(x.pageDebut) || !estNombre(x.pages)) return null
  return {
    id: x.id,
    collegeId: x.collegeId,
    numero: x.numero,
    titre: x.titre,
    pageDebut: x.pageDebut,
    pages: x.pages,
    aVerifier: x.aVerifier,
  }
}

function creneau(x: unknown): Creneau | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.id) || !estTexte(x.itemId) || !estNombre(x.tour) || !estNombre(x.duree)) return null
  if (!estBool(x.dureePerso) || !estBool(x.fait) || !estTexte(x.note) || !estNombre(x.version)) return null
  if (x.debut !== null && !estTexte(x.debut)) return null
  if (x.versionExportee !== null && !estNombre(x.versionExportee)) return null
  let partie: Creneau['partie'] = null
  if (x.partie !== null) {
    if (!estObjet(x.partie) || !estNombre(x.partie.i) || !estNombre(x.partie.n)) return null
    partie = { i: x.partie.i, n: x.partie.n }
  }
  return {
    id: x.id,
    itemId: x.itemId,
    tour: x.tour,
    partie,
    debut: x.debut,
    duree: x.duree,
    dureePerso: x.dureePerso,
    fait: x.fait,
    note: x.note,
    version: x.version,
    versionExportee: x.versionExportee,
  }
}

function indispo(x: unknown): Indispo | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.id) || !estTexte(x.titre) || !estTexte(x.debut) || !estTexte(x.fin)) return null
  if (x.source !== 'ponctuelle' && x.source !== 'recurrente' && x.source !== 'ics') return null
  if (x.sourceId !== null && !estTexte(x.sourceId)) return null
  return { id: x.id, titre: x.titre, source: x.source, sourceId: x.sourceId, debut: x.debut, fin: x.fin }
}

function recurrence(x: unknown): Recurrence | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.id) || !estTexte(x.titre) || !estTexte(x.heureDebut) || !estTexte(x.heureFin)) return null
  if (!estTexte(x.du) || !estTexte(x.au)) return null
  if (!Array.isArray(x.jours) || !x.jours.every(estNombre)) return null
  return {
    id: x.id,
    titre: x.titre,
    jours: [...(x.jours as number[])],
    heureDebut: x.heureDebut,
    heureFin: x.heureFin,
    du: x.du,
    au: x.au,
  }
}

function suppression(x: unknown): SuppressionEnAttente | null {
  if (!estObjet(x)) return null
  if (!estTexte(x.creneauId) || !estTexte(x.libelle)) return null
  return { creneauId: x.creneauId, libelle: x.libelle }
}

/** Réglages : valeurs absentes complétées par les défauts (réglage ajouté plus tard) ; présentes mais invalides → null. */
function reglages(x: unknown): Reglages | null {
  if (x === undefined) return structuredClone(REGLAGES_DEFAUT)
  if (!estObjet(x)) return null
  const m = { ...REGLAGES_DEFAUT, ...x } as Obj
  const { rythme, journee, coefsTours } = m
  if (!estObjet(rythme) || !estNombre(rythme.minutes) || !estNombre(rythme.pages)) return null
  if (!estObjet(journee) || !estTexte(journee.debut) || !estTexte(journee.fin)) return null
  if (!Array.isArray(coefsTours) || coefsTours.length === 0 || !coefsTours.every(estNombre)) return null
  if (!estNombre(m.dureeMin) || !estNombre(m.dureeMax) || !estNombre(m.pauseMultiple)) return null
  if (m.pas !== 5 && m.pas !== 10 && m.pas !== 15) return null
  if (m.rappel !== 0 && m.rappel !== 5 && m.rappel !== 15 && m.rappel !== 30) return null
  if (m.theme !== 'auto' && m.theme !== 'clair' && m.theme !== 'sombre') return null
  const lus: Reglages = {
    rythme: { minutes: rythme.minutes, pages: rythme.pages },
    dureeMin: m.dureeMin,
    dureeMax: m.dureeMax,
    coefsTours: [...(coefsTours as number[])],
    pauseMultiple: m.pauseMultiple,
    journee: { debut: journee.debut, fin: journee.fin },
    pas: m.pas,
    rappel: m.rappel,
    theme: m.theme,
  }
  // Mêmes bornes que l'écran des réglages : un fichier retouché à la main (`rythme.pages: 0`) ne doit pas donner des
  // durées infinies ou une grille impossible.
  if (!lireDurees(brutDurees(lus), lus.pas).ok) return null
  if (!lireJournee(lus.journee.debut, lus.journee.fin).ok) return null
  return lus
}

/** Valide une table (tableau obligatoire) et l'indexe ; `null` si la table ou une ligne est invalide. */
function table<T>(brut: unknown, lire: (x: unknown) => T | null, cle: (x: T) => string): Record<string, T> | null {
  if (!Array.isArray(brut)) return null
  const r: Record<string, T> = {}
  for (const ligne of brut) {
    const v = lire(ligne)
    if (v === null) return null
    r[cle(v)] = v
  }
  return r
}

/** Intégrité référentielle : une sauvegarde valide ne doit pas laisser de référence pendante. */
function referencesCoherentes(
  colleges: Record<string, College>,
  items: Record<string, Item>,
  creneaux: Record<string, Creneau>,
  indispos: Record<string, Indispo>,
  recurrences: Record<string, Recurrence>,
  suppressions: Record<string, SuppressionEnAttente>,
): boolean {
  for (const it of Object.values(items)) {
    if (!Object.hasOwn(colleges, it.collegeId) || it.id !== `${it.collegeId}:${it.numero}`) return false
  }
  for (const c of Object.values(creneaux)) {
    if (!Object.hasOwn(items, c.itemId)) return false
  }
  for (const [cle, s] of Object.entries(suppressions)) {
    if (cle !== s.creneauId) return false
  }
  for (const i of Object.values(indispos)) {
    if (i.source === 'recurrente' && (i.sourceId === null || !Object.hasOwn(recurrences, i.sourceId))) return false
  }
  return true
}

const echec = (raison: string): ResultatLecture => ({ ok: false, raison })

export function lireSauvegarde(texte: string): ResultatLecture {
  let racine: unknown
  try {
    racine = JSON.parse(texte)
  } catch {
    return echec('fichier illisible')
  }
  if (!estObjet(racine) || !estNombre(racine.schemaVersion)) return echec('fichier illisible')
  if (racine.schemaVersion !== SCHEMA_VERSION) return echec('version non prise en charge')

  const colleges = table(racine.colleges, college, (x) => x.id)
  if (!colleges) return echec('collège invalide')
  const items = table(racine.items, item, (x) => x.id)
  if (!items) return echec('item invalide')
  const creneaux = table(racine.creneaux, creneau, (x) => x.id)
  if (!creneaux) return echec('créneau invalide')
  const indispos = table(racine.indispos, indispo, (x) => x.id)
  if (!indispos) return echec('indisponibilité invalide')
  const recurrences = table(racine.recurrences, recurrence, (x) => x.id)
  if (!recurrences) return echec('récurrence invalide')
  const suppressions = table(racine.suppressions, suppression, (x) => x.creneauId)
  if (!suppressions) return echec('suppression en attente invalide')
  const reglagesLus = reglages(racine.reglages)
  if (!reglagesLus) return echec('réglages invalides')

  const premierExportFait = racine.premierExportFait ?? etatVide().premierExportFait
  if (!estBool(premierExportFait)) return echec('premierExportFait invalide')

  if (!referencesCoherentes(colleges, items, creneaux, indispos, recurrences, suppressions)) {
    return echec('références incohérentes')
  }

  return {
    ok: true,
    etat: { colleges, items, creneaux, indispos, recurrences, suppressions, reglages: reglagesLus, premierExportFait },
  }
}
