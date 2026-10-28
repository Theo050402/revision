// Données communes aux tests de la bibliothèque : deux collèges, des items 290–305, des créneaux à la demande.
import { etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Item } from '../../src/domain/types'

let seq = 0

export function creneau(p: Partial<Creneau> & { itemId: string }): Creneau {
  seq += 1
  return {
    id: `cr${seq}`,
    tour: 1,
    partie: null,
    debut: null,
    duree: 60,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
    ...p,
  }
}

export function item(collegeId: string, numero: number, titre: string, pages: number, extra: Partial<Item> = {}): Item {
  return { id: `${collegeId}:${numero}`, collegeId, numero, titre, pageDebut: numero, pages, aVerifier: false, ...extra }
}

export const ITEMS: Item[] = [
  item('c1', 290, 'Épidémiologie des cancers', 14),
  item('c1', 291, 'Cancérogenèse, oncogénétique', 18),
  item('c1', 292, 'Diagnostic et dépistage des cancers', 9),
  item('c1', 293, "Cancer de l'enfant", 10),
  item('c1', 294, 'Tumeurs de la cavité buccale', 21),
  item('c1', 295, 'Cancer du sein', 20),
  item('c1', 296, 'Mélanome cutané', 8),
  item('c1', 297, 'Cancer du poumon', 15),
  item('c3', 300, 'Tumeurs du col utérin', 22),
  item('c3', 301, 'Côlon et rectum', 18),
  item('c3', 302, 'Tumeurs du foie', 12),
  item('c3', 303, "Tumeurs de l'estomac", 16),
  item('c3', 304, 'Cancer du pancréas', 14),
  item('c3', 305, "Tumeurs de l'œsophage", 12),
]

/** Deux collèges (coefficient 1) et les items ci-dessus ; `creneaux` en plus. */
export function etatBib(creneaux: Partial<Creneau>[] = []): Etat {
  const e = etatVide()
  e.colleges = {
    c1: { id: 'c1', nom: 'Cancérologie', couleur: 0, coefficient: 1, importeLe: '2026-10-01T10:00' },
    c3: { id: 'c3', nom: 'Hépato-gastro', couleur: 2, coefficient: 1, importeLe: '2026-10-01T10:00' },
  }
  e.items = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
  for (const c of creneaux) {
    const cr = creneau(c as Partial<Creneau> & { itemId: string })
    e.creneaux[cr.id] = cr
  }
  return e
}
