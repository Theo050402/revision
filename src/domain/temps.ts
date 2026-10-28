// Heures locales : chaînes naïves `YYYY-MM-DDTHH:mm` qui désignent l'heure
// murale Europe/Paris. Toute l'arithmétique passe par Date.UTC sur les champs
// naïfs, jamais par le fuseau de la machine. Seul `utcVersLocal` convertit un
// vrai instant.

const p2 = (n: number): string => String(n).padStart(2, '0')

/** Date.UTC à partir d'un jour `YYYY-MM-DD` et de minutes depuis minuit. */
function utcDe(jour: string, minutes: number): number {
  const [a, m, j] = jour.split('-').map(Number)
  return Date.UTC(a, m - 1, j, 0, minutes)
}

/** Formate un instant UTC « naïf » en `YYYY-MM-DDTHH:mm`. */
function naifVersLocal(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
  )
}

/** « 08:30 » → 510. */
export function hm(h: string): number {
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

/** 510 → « 08:30 ». */
export function versHm(min: number): string {
  return `${p2(Math.floor(min / 60))}:${p2(min % 60)}`
}

/** `2026-11-05T14:00` → `2026-11-05`. */
export function jourDe(local: string): string {
  return local.slice(0, 10)
}

/** Minutes depuis minuit. */
export function minutesDe(local: string): number {
  return hm(local.slice(11, 16))
}

/** Assemble un jour et des minutes depuis minuit en heure locale. */
export function local(jour: string, minutes: number): string {
  return naifVersLocal(utcDe(jour, minutes))
}

/** Ajoute (ou retire) des minutes à une heure locale, sans tenir compte des changements d'heure. */
export function ajouterMinutes(l: string, min: number): string {
  return naifVersLocal(utcDe(jourDe(l), minutesDe(l) + min))
}

/** Ajoute (ou retire) des jours à un jour `YYYY-MM-DD`. */
export function ajouterJours(jour: string, n: number): string {
  return jourDe(naifVersLocal(utcDe(jour, n * 1440)))
}

/** 1 = lundi … 7 = dimanche. */
export function jourSemaine(jour: string): number {
  const dow = new Date(utcDe(jour, 0)).getUTCDay() // 0 = dimanche
  return dow === 0 ? 7 : dow
}

const formatParis = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Convertit un vrai instant en heure locale Europe/Paris. */
export function utcVersLocal(d: Date): string {
  const parts: Record<string, string> = {}
  for (const { type, value } of formatParis.formatToParts(d)) parts[type] = value
  // Certains moteurs rendent « 24 » pour minuit malgré h23 : on normalise.
  const heure = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${heure}:${parts.minute}`
}

/** `2026-11-05T14:00` → `20261105T140000`. */
export function versIcsLocal(l: string): string {
  return `${l.slice(0, 4)}${l.slice(5, 7)}${l.slice(8, 10)}T${l.slice(11, 13)}${l.slice(14, 16)}00`
}

/** Instant UTC → `20261105T130000Z`. */
export function versIcsUtc(d: Date): string {
  return `${versIcsLocal(naifVersLocal(d.getTime()))}Z`
}
