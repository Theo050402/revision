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

/** Première couleur 0..5 qu'aucun collège n'utilise ; si toutes le sont, on tourne (nombre de collèges modulo 6). */
export function couleurLibre(colleges: Record<string, College>): number {
  const prises = new Set(Object.values(colleges).map((c) => c.couleur))
  for (let k = 0; k < 6; k++) if (!prises.has(k)) return k
  return Object.keys(colleges).length % 6
}

/** Crée un collège et ses items ; la couleur est la première libre (0..5), sinon on tourne. */
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
    couleur: couleurLibre(e.colleges),
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
 * sont pas touchés. Un item absent du nouvel import est conservé, titre figé et `aVerifier`
 * à true, tant qu'au moins un créneau le référence ; sinon il est retiré.
 */
export function reimporterCollege(e: Etat, collegeId: string, items: ItemExtrait[]): Etat {
  if (!e.colleges[collegeId]) return e
  const nouveaux = itemsDe(collegeId, items)
  const references = new Set(Object.values(e.creneaux).map((c) => c.itemId))
  const autres = filtrer(e.items, (it) => it.collegeId !== collegeId)
  const figes: Record<string, Item> = {}
  for (const it of Object.values(e.items)) {
    if (it.collegeId === collegeId && !(it.id in nouveaux) && references.has(it.id)) {
      figes[it.id] = { ...it, aVerifier: true }
    }
  }
  return { ...e, items: { ...autres, ...figes, ...nouveaux } }
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

type Place = Creneau & { debut: string }

/**
 * Créneaux placés (hors bac) dont l'item et le collège sont connus, triés par début. Source
 * unique du compteur de changements et du fichier exporté : ils ne peuvent pas diverger.
 */
function placesExportables(e: Etat): Place[] {
  const res: Place[] = []
  for (const c of Object.values(e.creneaux)) {
    const item = e.items[c.itemId]
    if (c.debut !== null && item && e.colleges[item.collegeId]) res.push({ ...c, debut: c.debut })
  }
  return res.sort(parDebut)
}

/**
 * Ce qui reste à exporter (§12.1) : créneaux placés jamais exportés, créneaux placés exportés
 * puis modifiés, et suppressions en attente. Le bac « À placer » n'est jamais exporté.
 */
export function changementsEnAttente(e: Etat): {
  nouveaux: Creneau[]
  modifies: Creneau[]
  suppressions: SuppressionEnAttente[]
} {
  return { ...partage(placesExportables(e)), suppressions: Object.values(e.suppressions) }
}

function partage(places: Place[]): { nouveaux: Place[]; modifies: Place[] } {
  return {
    nouveaux: places.filter((c) => c.versionExportee === null),
    modifies: places.filter((c) => c.versionExportee !== null && c.versionExportee !== c.version),
  }
}

function enEvenement(e: Etat, c: Place): EvenementIcs {
  const item = e.items[c.itemId]
  const college = e.colleges[item.collegeId]
  // Item ajouté à la main : pas de pages connues (pageDebut 0), donc pas de plage.
  const plage =
    item.pageDebut > 0
      ? `p. ${item.pageDebut}–${item.pageDebut + item.pages} (${item.pages} p)`
      : `${item.pages} p`
  return {
    uid: `${c.id}@revisions-emma`,
    sequence: c.version,
    debut: c.debut,
    fin: ajouterMinutes(c.debut, c.duree),
    resume:
      `📚 ${item.numero} · ${item.titre} · T${c.tour}` + (c.partie ? ` · ${c.partie.i}/${c.partie.n}` : ''),
    description:
      `${college.nom} · ${plage}` + (c.note ? `\n${c.note}` : ''),
    categorie: college.nom,
    rappel: e.reglages.rappel,
  }
}

type Portee = 'nouveaux' | 'modifies' | 'tout'

function retenus(e: Etat, portee: Portee): Place[] {
  const places = placesExportables(e)
  if (portee === 'tout') return places
  const ch = partage(places)
  return portee === 'nouveaux' ? ch.nouveaux : ch.modifies
}

/** Événements à écrire dans le .ics, sur le même ensemble de créneaux que `changementsEnAttente`. */
export function evenementsExport(e: Etat, portee: Portee): EvenementIcs[] {
  return retenus(e, portee).map((c) => enEvenement(e, c))
}

/** Identifiants des créneaux de `evenementsExport(e, portee)`, dans le même ordre. */
export function creneauxExportes(e: Etat, portee: Portee): string[] {
  return retenus(e, portee).map((c) => c.id)
}

/** Un créneau écrit dans le fichier, avec la version qui y figure (`SEQUENCE`). */
export type Envoye = { id: string; version: number }

/**
 * Après la livraison : `versionExportee = version` pour les créneaux envoyés, et seulement si leur version courante
 * est encore celle du fichier (un créneau modifié entre-temps reste « modifié »). Le premier export est fait.
 */
export function marquerExporte(e: Etat, envoyes: Envoye[]): Etat {
  const maj: Record<string, Creneau> = {}
  for (const { id, version } of envoyes) {
    const c = e.creneaux[id]
    if (c && c.debut !== null && c.version === version) maj[id] = { ...c, versionExportee: version }
  }
  return { ...e, creneaux: { ...e.creneaux, ...maj }, premierExportFait: true }
}

/**
 * Annuler / rétablir : l'instantané rejoué donne les créneaux, mais le suivi de l'export (hors historique) doit
 * survivre. Ce qui est déjà parti dans Calendrier ne repart pas, et ce qui y est resté est signalé :
 * - créneau présent dans les deux états : la `versionExportee` la plus récente l'emporte, et `version` ne descend jamais
 *   sous elle (sinon `versionExportee + 1`) ;
 * - créneau ressuscité dont la suppression est encore en attente : la suppression est retirée (l'événement est
 *   toujours dans Calendrier), `versionExportee` est gardée ;
 * - créneau ressuscité sans suppression en attente (« C'est fait » confirmé : l'événement a été effacé de Calendrier) :
 *   `versionExportee = null`, il repartira comme nouveau ;
 * - créneau exporté que l'annulation retire : une suppression est ajoutée (comme `supprimerCreneau`).
 */
export function reconcilierExport(instantane: Etat, courant: Etat): Etat {
  const creneaux: Record<string, Creneau> = {}
  const suppressions = { ...courant.suppressions }
  for (const c of Object.values(instantane.creneaux)) {
    const actuel = courant.creneaux[c.id]
    if (actuel) {
      const v = Math.max(c.versionExportee ?? -1, actuel.versionExportee ?? -1)
      const versionExportee = v < 0 ? null : v
      // Annulé sous la version déjà envoyée : Calendrier garde un `SEQUENCE` plus haut, un réexport en version plus
      // basse serait ignoré, et revenir ensuite à la version exportée passerait pour « non modifié ». On repart au-dessus.
      const version = versionExportee !== null && c.version < versionExportee ? versionExportee + 1 : c.version
      creneaux[c.id] =
        versionExportee === c.versionExportee && version === c.version ? c : { ...c, versionExportee, version }
    } else if (c.id in suppressions) {
      delete suppressions[c.id]
      creneaux[c.id] = c
    } else {
      creneaux[c.id] = c.versionExportee === null ? c : { ...c, versionExportee: null }
    }
  }
  for (const actuel of Object.values(courant.creneaux)) {
    if (!(actuel.id in instantane.creneaux) && actuel.versionExportee !== null) {
      suppressions[actuel.id] = { creneauId: actuel.id, libelle: libelleSuppression(courant, actuel) }
    }
  }
  return { ...instantane, creneaux, suppressions }
}

/** « C'est fait » : la liste des suppressions à faire à la main est vidée. */
export function viderSuppressions(e: Etat): Etat {
  return { ...e, suppressions: {} }
}

/** Fusion superficielle ; la validation se fait dans l'écran des réglages. */
export function modifierReglages(e: Etat, champs: Partial<Reglages>): Etat {
  return { ...e, reglages: { ...e.reglages, ...champs } }
}
