// Persistance IndexedDB (Dexie). L'état entier est un `Etat` immuable : on écrit uniquement
// ce qui a changé, en comparant les objets par identité (les actions du domaine gardent la
// référence de tout ce qu'elles ne touchent pas).
import Dexie, { type Table } from 'dexie'
import { REGLAGES_DEFAUT, etatVide } from '../domain/defaults'
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

export type EntreeMeta =
  | { cle: 'reglages'; valeur: Reglages }
  | { cle: 'premierExportFait'; valeur: boolean }

export class RevisionsDB extends Dexie {
  colleges!: Table<College, string>
  items!: Table<Item, string>
  creneaux!: Table<Creneau, string>
  indispos!: Table<Indispo, string>
  recurrences!: Table<Recurrence, string>
  suppressions!: Table<SuppressionEnAttente, string>
  meta!: Table<EntreeMeta, string>

  constructor(nom = 'revisions') {
    super(nom)
    this.version(1).stores({
      colleges: 'id',
      items: 'id',
      creneaux: 'id',
      indispos: 'id',
      recurrences: 'id',
      suppressions: 'creneauId',
      meta: 'cle',
    })
  }
}

export const db = new RevisionsDB()

/** Tables « un enregistrement par clé du Record » de l'état, dans l'ordre de l'écriture. */
const TABLES_RECORD = [
  'colleges',
  'items',
  'creneaux',
  'indispos',
  'recurrences',
  'suppressions',
] as const satisfies readonly (keyof Etat)[]

export type DiffTable = { table: string; puts: unknown[]; deletes: string[] }

/**
 * Différence entre deux états, par identité d'objet : un id dont l'objet a changé de référence
 * ou qui est nouveau → put ; un id absent de `apres` → delete. Une table dont le Record est
 * identique est ignorée sans être parcourue. Fonction pure.
 */
export function diff(avant: Etat, apres: Etat): DiffTable[] {
  const resultat: DiffTable[] = []
  for (const table of TABLES_RECORD) {
    const a = avant[table] as Record<string, unknown>
    const b = apres[table] as Record<string, unknown>
    if (a === b) continue
    const puts: unknown[] = []
    const deletes: string[] = []
    for (const id of Object.keys(b)) {
      if (!(id in a) || a[id] !== b[id]) puts.push(b[id])
    }
    for (const id of Object.keys(a)) {
      if (!(id in b)) deletes.push(id)
    }
    if (puts.length > 0 || deletes.length > 0) resultat.push({ table, puts, deletes })
  }
  const meta: EntreeMeta[] = []
  if (avant.reglages !== apres.reglages) meta.push({ cle: 'reglages', valeur: apres.reglages })
  if (avant.premierExportFait !== apres.premierExportFait) {
    meta.push({ cle: 'premierExportFait', valeur: apres.premierExportFait })
  }
  if (meta.length > 0) resultat.push({ table: 'meta', puts: meta, deletes: [] })
  return resultat
}

/** Applique `diff(avant, apres)` en une seule transaction (tout ou rien). */
export async function enregistrer(avant: Etat, apres: Etat): Promise<void> {
  const changements = diff(avant, apres)
  if (changements.length === 0) return
  const tables = changements.map((c) => db.table(c.table))
  await db.transaction('rw', tables, async () => {
    for (const c of changements) {
      const t = db.table(c.table)
      if (c.deletes.length > 0) await t.bulkDelete(c.deletes)
      if (c.puts.length > 0) await t.bulkPut(c.puts)
    }
  })
}

/** Remplace tout le contenu de la base par `etat` (restauration quand la base n'a pas pu être lue). */
export async function remplacerTout(etat: Etat): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await enregistrer(etatVide(), etat)
  })
}

/** Réglages lus en base, complétés par les valeurs par défaut (réglage ajouté dans une version ultérieure). */
function reglagesComplets(stockes: Partial<Reglages> | undefined): Reglages {
  const d = REGLAGES_DEFAUT
  const s = stockes ?? {}
  return {
    ...d,
    ...s,
    rythme: { ...d.rythme, ...s.rythme },
    coefsTours: [...(s.coefsTours ?? d.coefsTours)],
    journee: { ...d.journee, ...s.journee },
  }
}

function enRecord<T>(lignes: T[], cle: (x: T) => string): Record<string, T> {
  const r: Record<string, T> = {}
  for (const x of lignes) r[cle(x)] = x
  return r
}

/** Lit toute la base ; une base vide donne `etatVide()`. */
export async function chargerTout(): Promise<Etat> {
  return db.transaction('r', db.tables, async () => {
    const [colleges, items, creneaux, indispos, recurrences, suppressions, meta] = await Promise.all([
      db.colleges.toArray(),
      db.items.toArray(),
      db.creneaux.toArray(),
      db.indispos.toArray(),
      db.recurrences.toArray(),
      db.suppressions.toArray(),
      db.meta.toArray(),
    ])
    const vide = etatVide()
    let reglages: Partial<Reglages> | undefined
    let premierExportFait = vide.premierExportFait
    for (const m of meta) {
      if (m.cle === 'reglages') reglages = m.valeur
      else if (m.cle === 'premierExportFait') premierExportFait = m.valeur
    }
    return {
      colleges: enRecord(colleges, (x) => x.id),
      items: enRecord(items, (x) => x.id),
      creneaux: enRecord(creneaux, (x) => x.id),
      indispos: enRecord(indispos, (x) => x.id),
      recurrences: enRecord(recurrences, (x) => x.id),
      suppressions: enRecord(suppressions, (x) => x.creneauId),
      reglages: reglagesComplets(reglages),
      premierExportFait,
    }
  })
}

/** Demande au navigateur de ne pas purger les données (`storage.persist()`). `false` si refusé ou indisponible. */
export async function demanderPersistance(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
