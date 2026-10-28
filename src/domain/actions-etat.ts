// Collèges, indisponibilités, réglages et suivi de l'export (spec §5.7, §10, §11, §12) :
// transitions d'état pures. Chaque fonction renvoie un nouvel `Etat` ; ce qui n'est pas touché
// garde sa référence.
import type { EvenementIcs } from '../ics/export'
import type { ItemExtrait } from '../import/catalog'
import { libelleSuppression } from './actions-creneaux'
import { ajouterJours, ajouterMinutes, hm, jourSemaine, local, utcVersLocal } from './temps'
import type {
  College,
  Creneau,
  Etat,
  Indispo,
  Item,
  Recurrence,
  Reglages,
  SuppressionEnAttente,
} from './types'

type GenId = () => string
const idParDefaut: GenId = () => crypto.randomUUID()

function enItem(collegeId: string, x: ItemExtrait): Item {
  return {
    id: `${collegeId}:${x.numero}`,
    collegeId,
    numero: x.numero,
    titre: x.titre,
    pageDebut: x.pageDebut,
    pages: x.pages,
    aVerifier: x.aVerifier,
  }
}

function itemsDe(collegeId: string, items: ItemExtrait[]): Record<string, Item> {
  const r: Record<string, Item> = {}
  for (const x of items) r[`${collegeId}:${x.numero}`] = enItem(collegeId, x)
  return r
}

/** Garde les entrées dont la valeur satisfait `garder`. */
function filtrer<T>(table: Record<string, T>, garder: (v: T) => boolean): Record<string, T> {
  const r: Record<string, T> = {}
  for (const [k, v] of Object.entries(table)) if (garder(v)) r[k] = v
  return r
}

// ───────────────────────────── Collèges ─────────────────────────────

/** Crée un collège et ses items ; la couleur suit le nombre de collèges existants (modulo 6). */
export function ajouterCollege(
  e: Etat,
  nom: string,
  items: ItemExtrait[],
  id: GenId = idParDefaut,
  maintenant: Date = new Date(),
): Etat {
  const collegeId = id()
  const college: College = {
    id: collegeId,
    nom,
    couleur: Object.keys(e.colleges).length % 6,
    coefficient: 1,
    importeLe: utcVersLocal(maintenant),
  }
  return {
    ...e,
    colleges: { ...e.colleges, [collegeId]: college },
    items: { ...e.items, ...itemsDe(collegeId, items) },
  }
}

/**
 * Réimport (§5.7) : les items du collège sont remplacés, rapprochés par numéro. Les créneaux ne
 * sont pas touchés, y compris ceux dont le numéro a disparu (l'interface les signale).
 */
export function reimporterCollege(e: Etat, collegeId: string, items: ItemExtrait[]): Etat {
  if (!e.colleges[collegeId]) return e
  const autres = filtrer(e.items, (it) => it.collegeId !== collegeId)
  return { ...e, items: { ...autres, ...itemsDe(collegeId, items) } }
}

export function modifierCollege(
  e: Etat,
  collegeId: string,
  champs: Partial<Pick<College, 'nom' | 'couleur' | 'coefficient'>>,
): Etat {
  const c = e.colleges[collegeId]
  if (!c) return e
  return { ...e, colleges: { ...e.colleges, [collegeId]: { ...c, ...champs } } }
}

/**
 * Supprime le collège, ses items et tous ses créneaux. Ceux déjà exportés laissent une
 * suppression en attente (§12.1) ; le libellé est calculé avant toute suppression.
 */
export function supprimerCollege(e: Etat, collegeId: string): Etat {
  if (!e.colleges[collegeId]) return e
  const appartient = (itemId: string): boolean => itemId.startsWith(`${collegeId}:`)

  const suppressions = { ...e.suppressions }
  for (const c of Object.values(e.creneaux)) {
    if (appartient(c.itemId) && c.versionExportee !== null) {
      suppressions[c.id] = { creneauId: c.id, libelle: libelleSuppression(e, c) }
    }
  }
  return {
    ...e,
    colleges: filtrer(e.colleges, (c) => c.id !== collegeId),
    items: filtrer(e.items, (it) => it.collegeId !== collegeId),
    creneaux: filtrer(e.creneaux, (c) => !appartient(c.itemId)),
    suppressions,
  }
}

// ───────────────────────── Indisponibilités ─────────────────────────

export function ajouterIndispo(
  e: Etat,
  titre: string,
  debut: string,
  fin: string,
  id: GenId = idParDefaut,
): Etat {
  const indispo: Indispo = { id: id(), titre, source: 'ponctuelle', sourceId: null, debut, fin }
  return { ...e, indispos: { ...e.indispos, [indispo.id]: indispo } }
}

export function modifierIndispo(
  e: Etat,
  id: string,
  champs: Partial<Pick<Indispo, 'titre' | 'debut' | 'fin'>>,
): Etat {
  const i = e.indispos[id]
  if (!i) return e
  return { ...e, indispos: { ...e.indispos, [id]: { ...i, ...champs } } }
}

export function supprimerIndispo(e: Etat, id: string): Etat {
  if (!e.indispos[id]) return e
  return { ...e, indispos: filtrer(e.indispos, (i) => i.id !== id) }
}

/** Une indispo par jour de la récurrence (du/au inclus) dont le jour de semaine correspond. */
function materialiser(r: Recurrence): Record<string, Indispo> {
  const sortie: Record<string, Indispo> = {}
  const debut = hm(r.heureDebut)
  const fin = hm(r.heureFin)
  for (let jour = r.du; jour <= r.au; jour = ajouterJours(jour, 1)) {
    if (!r.jours.includes(jourSemaine(jour))) continue
    const id = `${r.id}:${jour}`
    sortie[id] = {
      id,
      titre: r.titre,
      source: 'recurrente',
      sourceId: r.id,
      debut: local(jour, debut),
      fin: local(jour, fin),
    }
  }
  return sortie
}

/** Crée ou remplace la récurrence et régénère tous ses blocs (§10). */
export function enregistrerRecurrence(e: Etat, r: Recurrence): Etat {
  const autres = filtrer(e.indispos, (i) => !(i.source === 'recurrente' && i.sourceId === r.id))
  return {
    ...e,
    recurrences: { ...e.recurrences, [r.id]: r },
    indispos: { ...autres, ...materialiser(r) },
  }
}

export function supprimerRecurrence(e: Etat, id: string): Etat {
  return {
    ...e,
    recurrences: filtrer(e.recurrences, (r) => r.id !== id),
    indispos: filtrer(e.indispos, (i) => !(i.source === 'recurrente' && i.sourceId === id)),
  }
}

/** Importe des blocs `.ics` ; un nouvel import du même fichier remplace le précédent. */
export function importerIndisposIcs(
  e: Etat,
  nomFichier: string,
  evts: { titre: string; debut: string; fin: string }[],
): Etat {
  const autres = filtrer(e.indispos, (i) => !(i.source === 'ics' && i.sourceId === nomFichier))
  const nouvelles: Record<string, Indispo> = {}
  evts.forEach((v, k) => {
    const id = `ics:${nomFichier}:${k}`
    nouvelles[id] = { id, titre: v.titre, source: 'ics', sourceId: nomFichier, debut: v.debut, fin: v.fin }
  })
  return { ...e, indispos: { ...autres, ...nouvelles } }
}

/** Indispos qui chevauchent (intervalles semi-ouverts) au moins un créneau placé. */
export function conflits(e: Etat): { indispoId: string; creneauIds: string[] }[] {
  const places = Object.values(e.creneaux)
    .filter((c): c is Creneau & { debut: string } => c.debut !== null)
    .map((c) => ({ id: c.id, debut: c.debut, fin: ajouterMinutes(c.debut, c.duree) }))
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.id.localeCompare(b.id))

  const res: { indispoId: string; creneauIds: string[] }[] = []
  const indispos = Object.values(e.indispos).sort(
    (a, b) => a.debut.localeCompare(b.debut) || a.id.localeCompare(b.id),
  )
  for (const i of indispos) {
    const ids = places.filter((c) => c.debut < i.fin && i.debut < c.fin).map((c) => c.id)
    if (ids.length > 0) res.push({ indispoId: i.id, creneauIds: ids })
  }
  return res
}

// ─────────────────────────────── Export ───────────────────────────────

const parDebut = (a: Creneau, b: Creneau): number =>
  (a.debut ?? '').localeCompare(b.debut ?? '') || a.id.localeCompare(b.id)

/**
 * Ce qui reste à exporter (§12.1) : créneaux placés jamais exportés, créneaux placés exportés
 * puis modifiés, et suppressions en attente. Le bac « À placer » n'est jamais exporté.
 */
export function changementsEnAttente(e: Etat): {
  nouveaux: Creneau[]
  modifies: Creneau[]
  suppressions: SuppressionEnAttente[]
} {
  const places = Object.values(e.creneaux)
    .filter((c) => c.debut !== null)
    .sort(parDebut)
  return {
    nouveaux: places.filter((c) => c.versionExportee === null),
    modifies: places.filter((c) => c.versionExportee !== null && c.versionExportee !== c.version),
    suppressions: Object.values(e.suppressions),
  }
}

function enEvenement(e: Etat, c: Creneau & { debut: string }): EvenementIcs | null {
  const item = e.items[c.itemId]
  const college = item && e.colleges[item.collegeId]
  if (!item || !college) return null
  return {
    uid: `${c.id}@revisions-emma`,
    sequence: c.version,
    debut: c.debut,
    fin: ajouterMinutes(c.debut, c.duree),
    resume:
      `📚 ${item.numero} · ${item.titre} · T${c.tour}` + (c.partie ? ` · ${c.partie.i}/${c.partie.n}` : ''),
    description:
      `${college.nom} · p. ${item.pageDebut}–${item.pageDebut + item.pages} (${item.pages} p)` +
      (c.note ? `\n${c.note}` : ''),
    categorie: college.nom,
    rappel: e.reglages.rappel,
  }
}

/**
 * Événements à écrire dans le .ics. Un créneau dont l'item a disparu (réimport) n'est pas
 * exporté : son titre n'est plus connu.
 */
export function evenementsExport(e: Etat, portee: 'nouveaux' | 'modifies' | 'tout'): EvenementIcs[] {
  let creneaux: Creneau[]
  if (portee === 'tout') {
    creneaux = Object.values(e.creneaux)
      .filter((c) => c.debut !== null)
      .sort(parDebut)
  } else {
    const ch = changementsEnAttente(e)
    creneaux = portee === 'nouveaux' ? ch.nouveaux : ch.modifies
  }
  return creneaux
    .map((c) => enEvenement(e, c as Creneau & { debut: string }))
    .filter((v): v is EvenementIcs => v !== null)
}

/** Après la livraison : `versionExportee = version` ; le premier export est fait. */
export function marquerExporte(e: Etat, creneauIds: string[]): Etat {
  const maj: Record<string, Creneau> = {}
  for (const id of creneauIds) {
    const c = e.creneaux[id]
    if (c && c.debut !== null) maj[id] = { ...c, versionExportee: c.version }
  }
  return { ...e, creneaux: { ...e.creneaux, ...maj }, premierExportFait: true }
}

/** « C'est fait » : la liste des suppressions à faire à la main est vidée. */
export function viderSuppressions(e: Etat): Etat {
  return { ...e, suppressions: {} }
}

/** Fusion superficielle ; la validation se fait dans l'écran des réglages. */
export function modifierReglages(e: Etat, champs: Partial<Reglages>): Etat {
  return { ...e, reglages: { ...e.reglages, ...champs } }
}
