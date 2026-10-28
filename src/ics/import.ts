// Lecture d'un fichier .ics d'indisponibilités (spec §10) : VEVENT simples et RRULE
// FREQ=DAILY|WEEKLY (BYDAY, UNTIL, COUNT, INTERVAL) développées sur 12 mois au plus.
// Les autres règles sont ignorées et comptées. Aucune dépendance : lecteur volontairement minimal.
import { ajouterJours, ajouterMinutes, jourDe, jourSemaine, local, minutesDe, utcVersLocal } from '../domain/temps'

export type EvenementLu = { titre: string; debut: string; fin: string }

const JOURS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }

type Prop = { nom: string; params: Record<string, string>; valeur: string }

/** Date ICS lue : `local` est toujours `YYYY-MM-DDTHH:mm` (00:00 pour une journée entière). */
type DateIcs = { local: string; journeeEntiere: boolean }

function deplier(texte: string): string[] {
  return texte.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function lireProp(ligne: string): Prop | null {
  // Le premier « : » hors guillemets sépare le nom (et ses paramètres) de la valeur.
  let guillemets = false
  let sep = -1
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') guillemets = !guillemets
    else if (c === ':' && !guillemets) {
      sep = i
      break
    }
  }
  if (sep < 0) return null
  const [nom, ...parts] = ligne.slice(0, sep).split(';')
  const params: Record<string, string> = {}
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/"/g, '')
  }
  return { nom: nom.toUpperCase(), params, valeur: ligne.slice(sep + 1) }
}

function deseschapper(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

/** `20261103`, `20261103T080000`, `20261103T080000Z` → heure locale Europe/Paris. */
function lireDate(valeur: string, params: Record<string, string>): DateIcs | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(valeur.trim())
  if (!m) return null
  const [, a, mo, j, hh, mi, , z] = m
  if (hh === undefined || params.VALUE === 'DATE') {
    return { local: `${a}-${mo}-${j}T00:00`, journeeEntiere: true }
  }
  if (z) {
    return { local: utcVersLocal(new Date(Date.UTC(+a, +mo - 1, +j, +hh, +mi))), journeeEntiere: false }
  }
  // Heure flottante ou TZID : prise telle quelle (les fichiers d'Emma sont en Europe/Paris).
  return { local: `${a}-${mo}-${j}T${hh}:${mi}`, journeeEntiere: false }
}

/** Écart en minutes entre deux heures locales naïves. */
function ecartMinutes(de: string, a: string): number {
  const ms = (l: string): number => {
    const [an, mo, j] = jourDe(l).split('-').map(Number)
    return Date.UTC(an, mo - 1, j, 0, minutesDe(l))
  }
  return Math.round((ms(a) - ms(de)) / 60000)
}

/** Écart en jours entre deux jours `YYYY-MM-DD`. */
function ecartJours(de: string, a: string): number {
  return Math.round(ecartMinutes(`${de}T00:00`, `${a}T00:00`) / 1440)
}

/** `P1D`, `PT1H30M`, `P1W` → minutes. */
function lireDuree(valeur: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(valeur.trim())
  if (!m) return null
  const [, w, d, h, mi] = m.map((x) => (x === undefined ? 0 : Number(x)))
  return w * 10080 + d * 1440 + h * 60 + mi
}

type Regle = {
  freq: 'DAILY' | 'WEEKLY'
  interval: number
  count: number | null
  until: string | null // heure locale
  jours: number[]
}

/** Même jour un an plus tard (borne de comparaison de chaînes : un 29 février fictif est sans effet). */
function plus12Mois(jour: string): string {
  return `${Number(jour.slice(0, 4)) + 1}${jour.slice(4)}`
}

function lireRegle(valeur: string): Regle | 'ignoree' {
  const kv: Record<string, string> = {}
  for (const part of valeur.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) kv[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  const freq = kv.FREQ?.toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return 'ignoree'
  const interval = Math.max(1, Number.parseInt(kv.INTERVAL ?? '1', 10) || 1)
  const count = kv.COUNT !== undefined ? Number.parseInt(kv.COUNT, 10) : null
  let until: string | null = null
  if (kv.UNTIL !== undefined) {
    const d = lireDate(kv.UNTIL, {})
    if (d) until = kv.UNTIL.length === 8 ? `${jourDe(d.local)}T23:59` : d.local
  }
  const jours = (kv.BYDAY ?? '')
    .split(',')
    .map((s) => JOURS[s.replace(/[^A-Za-z]/g, '').toUpperCase()])
    .filter((n): n is number => n !== undefined)
  return { freq, interval, count: Number.isFinite(count) ? count : null, until, jours }
}

/** Débuts des occurrences, de DTSTART jusqu'à la limite (jour inclus). */
function developper(debut: string, r: Regle, limite: string): string[] {
  const jour0 = jourDe(debut)
  const minutes = minutesDe(debut)
  const joursSemaine = r.jours.length > 0 ? r.jours : r.freq === 'WEEKLY' ? [jourSemaine(jour0)] : []
  // Lundi de la semaine de DTSTART (semaine ISO, WKST=MO par défaut).
  const lundi0 = ajouterJours(jour0, -(jourSemaine(jour0) - 1))

  const sorties: string[] = []
  for (let jour = jour0; jour <= limite; jour = ajouterJours(jour, 1)) {
    if (r.count !== null && sorties.length >= r.count) break
    if (joursSemaine.length > 0 && !joursSemaine.includes(jourSemaine(jour))) continue
    const bloc =
      r.freq === 'DAILY'
        ? ecartJours(jour0, jour)
        : Math.floor(ecartJours(lundi0, jour) / 7)
    if (bloc % r.interval !== 0) continue
    const occ = local(jour, minutes)
    if (r.until !== null && occ > r.until) break
    sorties.push(occ)
  }
  return sorties
}

export function lireIcs(
  texte: string,
  aujourdhui: string,
): { evenements: EvenementLu[]; ignores: number } {
  const limite = plus12Mois(jourDe(aujourdhui))
  const evenements: EvenementLu[] = []
  let ignores = 0

  let courant: Prop[] | null = null
  let profondeur = 0 // sous-composants (VALARM…) à l'intérieur du VEVENT
  for (const ligne of deplier(texte)) {
    const p = lireProp(ligne)
    if (!p) continue
    if (p.nom === 'BEGIN') {
      if (p.valeur.toUpperCase() === 'VEVENT' && courant === null) courant = []
      else if (courant !== null) profondeur++
      continue
    }
    if (p.nom === 'END') {
      if (courant === null) continue
      if (profondeur > 0) {
        profondeur--
        continue
      }
      ignores += convertir(courant, limite, evenements)
      courant = null
      continue
    }
    if (courant !== null && profondeur === 0) courant.push(p)
  }
  return { evenements, ignores }
}

/** Convertit un VEVENT ; renvoie 1 si sa règle de récurrence n'est pas gérée. */
function convertir(props: Prop[], limite: string, sortie: EvenementLu[]): number {
  const trouver = (nom: string): Prop | undefined => props.find((p) => p.nom === nom)
  const ps = trouver('DTSTART')
  const debut = ps && lireDate(ps.valeur, ps.params)
  if (!debut) return 0

  const pe = trouver('DTEND')
  const fin = pe && lireDate(pe.valeur, pe.params)
  const pd = trouver('DURATION')
  let duree: number
  if (fin) duree = ecartMinutes(debut.local, fin.local)
  else if (pd && lireDuree(pd.valeur) !== null) duree = lireDuree(pd.valeur) as number
  else duree = debut.journeeEntiere ? 1440 : 0
  if (duree < 0) duree = 0

  const titre = deseschapper(trouver('SUMMARY')?.valeur ?? '').trim() || 'Indisponible'
  const evt = (d: string): EvenementLu => ({ titre, debut: d, fin: ajouterMinutes(d, duree) })

  const rr = trouver('RRULE')
  if (!rr) {
    sortie.push(evt(debut.local))
    return 0
  }
  const regle = lireRegle(rr.valeur)
  if (regle === 'ignoree') return 1

  const exclus = new Set<string>()
  for (const ex of props.filter((p) => p.nom === 'EXDATE')) {
    for (const v of ex.valeur.split(',')) {
      const d = lireDate(v, ex.params)
      if (d) exclus.add(d.local)
    }
  }
  for (const occ of developper(debut.local, regle, limite)) {
    if (!exclus.has(occ)) sortie.push(evt(occ))
  }
  return 0
}
