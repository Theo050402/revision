// Données d'essai du calendrier : écrites directement dans IndexedDB (API native, Dexie n'est pas exposé),
// puis la page est rechargée pour que l'app les lise. Le « maintenant » est figé : mercredi 4 nov. 2026, 10 h 30 à Paris.
import type { Page } from '@playwright/test'

/** 10 h 30 à Paris (UTC+1 début novembre). */
export const MAINTENANT = new Date('2026-11-04T09:30:00Z')
export const AUJOURDHUI = '2026-11-04'

type Ligne = Record<string, unknown>

const college = (id: string, nom: string, couleur: number): Ligne => ({
  id,
  nom,
  couleur,
  coefficient: 1,
  importeLe: '2026-10-01T10:00',
})

const item = (collegeId: string, numero: number, titre: string, pages: number): Ligne => ({
  id: `${collegeId}:${numero}`,
  collegeId,
  numero,
  titre,
  pageDebut: numero,
  pages,
  aVerifier: false,
})

export function creneau(
  id: string,
  itemId: string,
  debut: string | null,
  duree: number,
  extra: Ligne = {},
): Ligne {
  return {
    id,
    itemId,
    tour: 1,
    partie: null,
    debut,
    duree,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...extra,
  }
}

const stage = (id: string, jour: string): Ligne => ({
  id,
  titre: 'Stage',
  source: 'ponctuelle',
  sourceId: null,
  debut: `${jour}T08:00`,
  fin: `${jour}T13:00`,
})

export const DONNEES = {
  colleges: [college('c1', 'Cancérologie', 0), college('c2', 'Gynécologie', 1), college('c3', 'Hépato-gastro', 2)],
  items: [
    item('c2', 300, 'Tumeurs du col utérin', 22),
    item('c3', 301, 'Côlon et rectum', 18),
    item('c1', 290, 'Épidémiologie des cancers', 14),
    item('c1', 291, 'Cancérogenèse, oncogénétique', 18),
    item('c1', 292, 'Diagnostic et dépistage des cancers', 16),
    item('c3', 304, 'Foie', 20),
  ],
  creneaux: [
    // Mardi : 300 (non exporté, point) de 14 h à 16 h 45.
    creneau('cr-a', 'c2:300', '2026-11-03T14:00', 165),
    // Mercredi (jour courant) : une partie « fait » exportée, et deux autres créneaux.
    creneau('cr-b', 'c1:291', '2026-11-04T09:00', 60, {
      tour: 2,
      partie: { i: 1, n: 2 },
      fait: true,
      versionExportee: 1,
    }),
    creneau('cr-c', 'c1:290', '2026-11-04T08:00', 45, { versionExportee: 1 }),
    creneau('cr-d', 'c1:292', '2026-11-04T13:30', 120, { versionExportee: 1 }),
    // Jeudi et vendredi.
    creneau('cr-e', 'c3:304', '2026-11-05T14:00', 150, { versionExportee: 1 }),
    creneau('cr-f', 'c3:301', '2026-11-06T14:00', 135),
    creneau('cr-g', 'c1:291', '2026-11-06T17:00', 30, { tour: 3, versionExportee: 1 }),
    // Un peu de charge sur les autres semaines, pour la vue Mois.
    creneau('cr-m1', 'c3:301', '2026-11-09T09:00', 240, { versionExportee: 1 }),
    creneau('cr-m2', 'c3:304', '2026-11-09T14:00', 270, { versionExportee: 1 }),
    creneau('cr-m3', 'c1:292', '2026-11-10T09:00', 180, { versionExportee: 1 }),
    creneau('cr-m4', 'c2:300', '2026-11-12T14:00', 120, { versionExportee: 1 }),
    creneau('cr-m5', 'c1:290', '2026-11-16T10:00', 90, { versionExportee: 1 }),
    creneau('cr-m6', 'c3:301', '2026-11-17T09:00', 480, { versionExportee: 1 }),
    creneau('cr-m7', 'c2:300', '2026-10-29T15:00', 150, { versionExportee: 1 }),
    creneau('cr-m8', 'c1:291', '2026-11-24T15:00', 60, { versionExportee: 1 }),
  ] as Ligne[],
  indispos: [
    stage('in-stage', '2026-11-02'),
    stage('in-stage-2', '2026-11-03'),
    stage('in-stage-3', '2026-11-05'),
    stage('in-stage-4', '2026-11-06'),
  ],
}

/**
 * Écrit les tables dans IndexedDB, puis recharge la page. Attend d'abord que l'app ait créé son schéma
 * (Dexie le fait à l'ouverture de la base) : on n'ouvre jamais la base avant, ce qui en créerait une vide.
 */
export async function semer(page: Page, extra: { creneaux?: Ligne[]; reglages?: Ligne } = {}): Promise<void> {
  await page.getByRole('region', { name: 'Calendrier' }).waitFor()
  const donnees = { ...DONNEES, creneaux: [...DONNEES.creneaux, ...(extra.creneaux ?? [])] }
  await page.evaluate(
    async ([d, reglages]) => {
      const tables = ['colleges', 'items', 'creneaux', 'indispos', 'meta'] as const
      const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const ouvrir = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const o = indexedDB.open('revisions')
          o.onerror = () => reject(o.error)
          o.onsuccess = () => resolve(o.result)
        })
      let base: IDBDatabase | null = null
      for (let essai = 0; essai < 100 && base === null; essai++) {
        const existe = (await indexedDB.databases()).some((b) => b.name === 'revisions')
        if (existe) {
          const ouverte = await ouvrir()
          if (tables.every((t) => ouverte.objectStoreNames.contains(t))) base = ouverte
          else ouverte.close()
        }
        if (base === null) await attendre(100)
      }
      if (base === null) throw new Error("le schéma de la base « revisions » n'a pas été créé")
      const ouverte = base
      await new Promise<void>((resolve, reject) => {
        const tx = ouverte.transaction([...tables], 'readwrite')
        for (const t of ['colleges', 'items', 'creneaux', 'indispos'] as const) {
          for (const ligne of (d as Record<string, unknown[]>)[t]) tx.objectStore(t).put(ligne)
        }
        if (reglages) tx.objectStore('meta').put({ cle: 'reglages', valeur: reglages })
        tx.oncomplete = () => {
          ouverte.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      })
    },
    [donnees, extra.reglages ?? null] as const,
  )
  await page.reload()
}
