// Actions sur les créneaux (spec §6, §7, §9.3–9.5, §12.1, §12.3) : transitions d'état pures.
// Chaque fonction prend l'`Etat` entier et en renvoie un nouveau (ou un refus) ; les
// sous-objets inchangés gardent leur référence.
import { placer } from './cascade'
import { decouper, dureeTour } from './duration'
import { vueJour } from './jour'
import { deposerSerie } from './multidrop'
import { jourDe, local, minutesDe } from './temps'
import { prochainTour } from './tours'
import type { Creneau, Etat, Item } from './types'

export { vueJour } from './jour'

export type Res = { ok: true; etat: Etat; versBac: number } | { ok: false }
export type Cible = { jour: string; t: number; cibleId: string | null; moitie: 'haute' | 'basse' }

type GenId = () => string
const idParDefaut: GenId = () => crypto.randomUUID()

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** 14:00 → « 14h », 14:30 → « 14h30 », 07:05 → « 7h05 ». */
export function libelleHeure(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`
}

/** « 300 · T1 · mardi 5 nov. 14h » (spec §4, SuppressionEnAttente.libelle). */
export function libelleSuppression(e: Etat, c: Creneau): string {
  // Item disparu (réimport) : le numéro est la fin de l'itemId, jamais l'identifiant complet.
  const numero = e.items[c.itemId]?.numero ?? c.itemId.slice(c.itemId.lastIndexOf(':') + 1)
  const tete = `${numero} · T${c.tour}`
  if (c.debut === null) return `${tete} · à placer`
  const [a, m, j] = jourDe(c.debut).split('-').map(Number)
  const date = fmtDate.format(new Date(Date.UTC(a, m - 1, j)))
  return `${tete} · ${date} ${libelleHeure(minutesDe(c.debut))}`
}

/** Remplace des créneaux dans l'état (les autres gardent leur référence). */
function avecCreneaux(e: Etat, maj: Record<string, Creneau>): Etat {
  return { ...e, creneaux: { ...e.creneaux, ...maj } }
}

function nouveauCreneau(
  item: Item,
  id: string,
  tour: number,
  duree: number,
  partie: Creneau['partie'],
): Creneau {
  return {
    id,
    itemId: item.id,
    tour,
    partie,
    debut: null,
    duree,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
  }
}

/** Applique les débuts calculés par `placer` aux créneaux existants poussés (version + 1). */
function pousses(
  e: Etat,
  jour: string,
  debuts: Record<string, number>,
  sauf: string,
): Record<string, Creneau> {
  const maj: Record<string, Creneau> = {}
  for (const [id, m] of Object.entries(debuts)) {
    if (id === sauf) continue
    const c = e.creneaux[id]
    const debut = local(jour, m)
    if (c && c.debut !== debut) maj[id] = { ...c, debut, version: c.version + 1 }
  }
  return maj
}

/** Dépose un item de la bibliothèque : tour suivant, découpage, partie 1 placée, le reste au bac. */
export function deposerItem(e: Etat, itemId: string, c: Cible, id: GenId = idParDefaut): Res {
  const item = e.items[itemId]
  const college = item && e.colleges[item.collegeId]
  if (!item || !college) return { ok: false }

  const tour = prochainTour(Object.values(e.creneaux), itemId)
  const parts = decouper(dureeTour(item.pages, college.coefficient, tour, e.reglages), e.reglages)
  const n = parts.length

  const vue = vueJour(e, c.jour)
  const premierId = id()
  const r = placer({
    ...vue,
    nouveau: { id: premierId, duree: parts[0] },
    t: c.t,
    cibleId: c.cibleId,
    moitie: c.moitie,
  })
  if (!r.ok) return { ok: false }

  const maj = pousses(e, c.jour, r.debuts, premierId)
  maj[premierId] = {
    ...nouveauCreneau(item, premierId, tour, parts[0], n > 1 ? { i: 1, n } : null),
    debut: local(c.jour, r.debuts[premierId]),
  }
  for (let i = 1; i < n; i++) {
    const pid = id()
    maj[pid] = nouveauCreneau(item, pid, tour, parts[i], { i: i + 1, n })
  }
  return { ok: true, etat: avecCreneaux(e, maj), versBac: n - 1 }
}

/** Déplace un créneau posé, ou en sort un du bac (`debut` null), avec le même moteur de placement. */
export function deplacerCreneau(e: Etat, creneauId: string, c: Cible): Res {
  const cr = e.creneaux[creneauId]
  if (!cr) return { ok: false }

  const vue = vueJour(e, c.jour, creneauId)
  const r = placer({
    ...vue,
    nouveau: { id: creneauId, duree: cr.duree },
    t: c.t,
    cibleId: c.cibleId,
    moitie: c.moitie,
  })
  if (!r.ok) return { ok: false }

  const maj = pousses(e, c.jour, r.debuts, creneauId)
  const debut = local(c.jour, r.debuts[creneauId])
  if (debut !== cr.debut) maj[creneauId] = { ...cr, debut, version: cr.version + 1 }
  return { ok: true, etat: Object.keys(maj).length ? avecCreneaux(e, maj) : e, versBac: 0 }
}

/** Dépôt multiple (§9.5) : numéros croissants, sans jamais pousser l'existant. */
export function deposerItemsSerie(
  e: Etat,
  itemIds: string[],
  jour: string,
  t: number,
  id: GenId = idParDefaut,
): Res {
  const items: Item[] = []
  for (const itemId of itemIds) {
    const it = e.items[itemId]
    if (!it || !e.colleges[it.collegeId]) return { ok: false }
    items.push(it)
  }
  items.sort(
    (a, b) =>
      a.numero - b.numero ||
      e.colleges[a.collegeId].nom.localeCompare(e.colleges[b.collegeId].nom, 'fr'),
  )

  const maj: Record<string, Creneau> = {}
  const durees: { id: string; duree: number }[] = []
  for (const item of items) {
    // Les créneaux déjà créés dans cette série comptent pour le tour (même item déposé deux fois).
    const tour = prochainTour([...Object.values(e.creneaux), ...Object.values(maj)], item.id)
    const parts = decouper(
      dureeTour(item.pages, e.colleges[item.collegeId].coefficient, tour, e.reglages),
      e.reglages,
    )
    parts.forEach((duree, k) => {
      const cid = id()
      maj[cid] = nouveauCreneau(
        item,
        cid,
        tour,
        duree,
        parts.length > 1 ? { i: k + 1, n: parts.length } : null,
      )
      durees.push({ id: cid, duree })
    })
  }
  if (durees.length === 0) return { ok: true, etat: e, versBac: 0 }

  const vue = vueJour(e, jour)
  const { places, restants } = deposerSerie({
    occupes: [...vue.poses.map((p) => ({ debut: p.debut, fin: p.debut + p.duree })), ...vue.verrous],
    bornes: vue.bornes,
    t,
    durees,
    pause: e.reglages.pauseMultiple,
  })
  for (const p of places) maj[p.id] = { ...maj[p.id], debut: local(jour, p.debut) }
  return { ok: true, etat: avecCreneaux(e, maj), versBac: restants.length }
}

/**
 * Redimensionne (§9.3) : bornée par le bloc suivant du jour (créneau ou indisponibilité) et la
 * fin de journée, au moins un pas. `dureePerso` passe à true ; version + 1 si la durée change.
 */
export function redimensionner(e: Etat, creneauId: string, duree: number): Etat {
  const c = e.creneaux[creneauId]
  if (!c) return e
  const pas = e.reglages.pas

  let nouvelle = Math.max(pas, duree)
  if (c.debut !== null) {
    const vue = vueJour(e, jourDe(c.debut), creneauId)
    const debut = minutesDe(c.debut)
    let limite = vue.bornes.fin
    for (const p of vue.poses) if (p.debut > debut && p.debut < limite) limite = p.debut
    for (const v of vue.verrous) if (v.debut > debut && v.debut < limite) limite = v.debut
    nouvelle = Math.max(pas, Math.min(nouvelle, limite - debut))
  }

  if (nouvelle === c.duree && c.dureePerso) return e
  const version = nouvelle !== c.duree ? c.version + 1 : c.version
  return avecCreneaux(e, { [c.id]: { ...c, duree: nouvelle, dureePerso: true, version } })
}

/** Retire un créneau de `etat` (muté : copie locale) ; exporté, sa suppression est mise en attente (§12.1). */
function retirer(etat: Etat, ancien: Etat, c: Creneau): void {
  delete etat.creneaux[c.id]
  if (c.versionExportee !== null) {
    etat.suppressions = {
      ...etat.suppressions,
      [c.id]: { creneauId: c.id, libelle: libelleSuppression(ancien, c) },
    }
  }
}

/** Supprime un créneau ; s'il a déjà été exporté, la suppression est mise en attente (§12.1). */
export function supprimerCreneau(e: Etat, creneauId: string): Etat {
  const c = e.creneaux[creneauId]
  if (!c) return e
  const etat: Etat = { ...e, creneaux: { ...e.creneaux } }
  retirer(etat, e, c)
  return etat
}

/** Vide le planning (Réglages › Données) : tous les créneaux, placés ou à placer, comme `supprimerCreneau`. */
export function viderPlanning(e: Etat): Etat {
  const tous = Object.values(e.creneaux)
  if (tous.length === 0) return e
  const etat: Etat = { ...e, creneaux: { ...e.creneaux } }
  for (const c of tous) retirer(etat, e, c)
  return etat
}

/** Coche / décoche « Fait » : ne modifie pas `version` (§12.3). */
export function basculerFait(e: Etat, creneauId: string): Etat {
  const c = e.creneaux[creneauId]
  if (!c) return e
  return avecCreneaux(e, { [creneauId]: { ...c, fait: !c.fait } })
}

/** Change la note ; version + 1 seulement si le texte change. */
export function modifierNote(e: Etat, creneauId: string, note: string): Etat {
  const c = e.creneaux[creneauId]
  if (!c || c.note === note) return e
  return avecCreneaux(e, { [creneauId]: { ...c, note, version: c.version + 1 } })
}
