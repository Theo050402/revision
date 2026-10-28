import { ajouterJours, jourSemaine } from '../domain/temps'

const formatMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })

/** `2026-10-28` → « Octobre ». */
export function nomDuMois(jour: string): string {
  const [a, m] = jour.split('-').map(Number)
  const nom = formatMois.format(new Date(Date.UTC(a, m - 1, 1)))
  return nom.charAt(0).toUpperCase() + nom.slice(1)
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function numeroSemaine(jour: string): number {
  const jeudi = ajouterJours(jour, 4 - jourSemaine(jour))
  const [a, m, j] = jeudi.split('-').map(Number)
  const rang = (Date.UTC(a, m - 1, j) - Date.UTC(a, 0, 1)) / 86_400_000
  return Math.floor(rang / 7) + 1
}

const formatJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })
const formatJourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const formatJourMois = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const formatMoisAnnee = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const enUtc = (jour: string): Date => {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j))
}

/** Lundi de la semaine (ISO) qui contient `jour`. */
export function lundiDe(jour: string): string {
  return ajouterJours(jour, 1 - jourSemaine(jour))
}

/** Les sept jours (lundi → dimanche) de la semaine qui contient `jour`. */
export function joursDeLaSemaine(jour: string): string[] {
  const lundi = lundiDe(jour)
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i))
}

/** Ajoute `n` mois ; le jour est ramené au dernier jour du mois d'arrivée si besoin (31 janv. + 1 → 28 févr.). */
export function ajouterMois(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number)
  const rang = a * 12 + (m - 1) + n
  const annee = Math.floor(rang / 12)
  const mois = (rang % 12) + 1
  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate()
  return `${annee}-${String(mois).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`
}

/** Tous les jours affichés par la vue Mois (`YYYY-MM`) : semaines entières, du lundi au dimanche. */
export function joursDuMois(mois: string): string[] {
  const premier = `${mois}-01`
  const dernier = ajouterJours(ajouterMois(premier, 1), -1)
  const debut = lundiDe(premier)
  const fin = ajouterJours(lundiDe(dernier), 6)
  const jours: string[] = []
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) jours.push(j)
  return jours
}

/** `2026-11-04` → { nom: 'mer.', numero: 4 }. */
export function libelleJourCourt(jour: string): { nom: string; numero: number } {
  return { nom: formatJourCourt.format(enUtc(jour)), numero: Number(jour.slice(8, 10)) }
}

/** Libellé de la période affichée : « Novembre 2026 », « mercredi 4 novembre », « 2 – 8 nov. 2026 »… */
export function libellePeriode(vue: 'semaine' | 'jour' | 'mois', jours: string[]): string {
  const premier = jours[0]
  if (vue === 'mois') {
    const nom = formatMoisAnnee.format(enUtc(premier))
    return nom.charAt(0).toUpperCase() + nom.slice(1)
  }
  if (jours.length === 1) return formatJourLong.format(enUtc(premier))
  const dernier = jours[jours.length - 1]
  const [a1, m1] = premier.split('-')
  const [a2, m2] = dernier.split('-')
  const nombre = (j: string) => String(Number(j.slice(8, 10)))
  if (a1 !== a2) return `${formatJourMois.format(enUtc(premier))} ${a1} – ${formatJourMois.format(enUtc(dernier))} ${a2}`
  if (m1 !== m2) return `${formatJourMois.format(enUtc(premier))} – ${formatJourMois.format(enUtc(dernier))} ${a2}`
  return `${nombre(premier)} – ${formatJourMois.format(enUtc(dernier))} ${a2}`
}
