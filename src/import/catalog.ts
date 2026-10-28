import items from './items-edn.json'

export type EntreeSommaire = { numeros: number[]; pageDebut: number }

export type ItemExtrait = {
  numero: number
  titre: string
  pageDebut: number
  pages: number
  aVerifier: boolean
  raison: string | null
}

/** Liste officielle des 367 items de connaissance de l'EDN : numéro → intitulé. */
export const OFFICIELS: Map<number, string> = new Map(
  (items as { numero: number; titre: string }[]).map((i) => [i.numero, i.titre]),
)

const PAGES_MAX = 60

/** Médiane ; pour un nombre pair de valeurs, moyenne des deux valeurs centrales, arrondie. */
function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const t = [...valeurs].sort((a, b) => a - b)
  const m = t.length >> 1
  return t.length % 2 === 1 ? t[m] : Math.round((t[m - 1] + t[m]) / 2)
}

type Brut = { numero: number; pageDebut: number; pages: number; dernier: boolean }

export function construireItems(
  entrees: EntreeSommaire[],
  officiels: Map<number, string> = OFFICIELS,
): ItemExtrait[] {
  const triees = [...entrees].sort((a, b) => a.pageDebut - b.pageDebut)

  // 1. Pages de chaque entrée (répartition équitable pour un chapitre à plusieurs items).
  const bruts: Brut[] = []
  triees.forEach((entree, k) => {
    const suivante = triees[k + 1]
    const dernier = suivante === undefined
    const n = entree.numeros.length
    const ecart = dernier ? 0 : suivante.pageDebut - entree.pageDebut
    const parItem = ecart <= 0 ? Math.min(0, Math.round(ecart / n)) || 0 : Math.max(1, Math.round(ecart / n))
    for (const numero of entree.numeros) {
      bruts.push({ numero, pageDebut: entree.pageDebut, pages: parItem, dernier })
    }
  })

  // 2. Doublons : on garde la première occurrence (dans l'ordre des pages de début).
  const vus = new Set<number>()
  const uniques = bruts.filter((b) => {
    if (vus.has(b.numero)) return false
    vus.add(b.numero)
    return true
  })

  // 3. Dernier item : médiane des longueurs des autres items.
  const med = mediane(uniques.filter((b) => !b.dernier).map((b) => b.pages))

  return uniques.map((b) => {
    const pages = b.dernier ? med : b.pages
    const titre = officiels.get(b.numero)
    let raison: string | null = null
    if (titre === undefined) raison = 'hors liste officielle'
    else if (pages <= 0) raison = 'pages ≤ 0'
    else if (pages > PAGES_MAX) raison = 'plus de 60 pages'
    else if (b.dernier) raison = 'dernier item'
    return {
      numero: b.numero,
      titre: titre ?? `Item ${b.numero}`,
      pageDebut: b.pageDebut,
      pages,
      aVerifier: raison !== null,
      raison,
    }
  })
}

const ABREVIATIONS: Record<string, string> = {
  CANCERO: 'Cancérologie',
  CARDIO: 'Cardiologie',
  PNEUMO: 'Pneumologie',
  GYNECO: 'Gynécologie-obstétrique',
  HGE: 'Hépato-gastro-entérologie',
  HEPATO: 'Hépato-gastro-entérologie',
  GASTRO: 'Hépato-gastro-entérologie',
  NEURO: 'Neurologie',
  PEDIATRIE: 'Pédiatrie',
  PEDIA: 'Pédiatrie',
  DERMATO: 'Dermatologie',
  URO: 'Urologie',
  NEPHRO: 'Néphrologie',
  ENDOCRINO: 'Endocrinologie',
  ENDO: 'Endocrinologie',
  RHUMATO: 'Rhumatologie',
  ORL: 'ORL',
  OPHTALMO: 'Ophtalmologie',
  OPH: 'Ophtalmologie',
  PSYCHIATRIE: 'Psychiatrie',
  PSY: 'Psychiatrie',
  INFECTIO: 'Maladies infectieuses',
  MIT: 'Maladies infectieuses',
  HEMATO: 'Hématologie',
  GERIATRIE: 'Gériatrie',
  URGENCES: "Médecine d'urgence",
  SP: 'Santé publique',
  ANAPATH: 'Anatomie pathologique',
  IMMUNO: 'Immunologie',
  GENETIQUE: 'Génétique',
  NUTRITION: 'Nutrition',
  PHARMACO: 'Pharmacologie',
}

/** Nom de collège proposé à partir du nom du fichier PDF (premier mot, abréviations usuelles). */
export function nomDepuisFichier(nomFichier: string): string {
  const sansExt = nomFichier.replace(/\.pdf$/i, '')
  const mot = sansExt.split(/[\s_\-.()]+/).find((m) => m.length > 0) ?? ''
  if (mot === '') return 'Collège'
  const cle = mot.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const connu = ABREVIATIONS[cle]
  if (connu !== undefined) return connu
  return mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()
}
