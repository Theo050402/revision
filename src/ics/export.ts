import { versIcsLocal, versIcsUtc } from '../domain/temps'

export type EvenementIcs = {
  uid: string
  sequence: number
  /** Heure locale Europe/Paris `YYYY-MM-DDTHH:mm`. */
  debut: string
  fin: string
  resume: string
  description: string
  categorie: string
  /** Minutes avant le début ; 0 = pas de rappel. */
  rappel: number
}

const encodeur = new TextEncoder()
const octetsDe = (s: string): number => encodeur.encode(s).length
const CRLF = '\r\n'
const LIMITE_OCTETS = 75

/** Échappement des valeurs TEXT : `\` `;` `,` et retours à la ligne. */
function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Replie une ligne à 75 octets UTF-8 au plus (espace de continuation compris),
 * sans jamais couper un point de code.
 */
function replier(ligne: string): string {
  if (octetsDe(ligne) <= LIMITE_OCTETS) return ligne
  const morceaux: string[] = []
  let courant = ''
  let octets = 0
  for (const c of [...ligne]) {
    const n = octetsDe(c)
    // Les lignes de suite commencent par une espace, qui compte dans les 75 octets.
    const max = morceaux.length === 0 ? LIMITE_OCTETS : LIMITE_OCTETS - 1
    if (octets + n > max) {
      morceaux.push(courant)
      courant = ''
      octets = 0
    }
    courant += c
    octets += n
  }
  morceaux.push(courant)
  return morceaux.join(CRLF + ' ')
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'END:VTIMEZONE',
]

function evenement(e: EvenementIcs, dtstamp: string): string[] {
  const lignes = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Europe/Paris:${versIcsLocal(e.debut)}`,
    `DTEND;TZID=Europe/Paris:${versIcsLocal(e.fin)}`,
    `SUMMARY:${echapper(e.resume)}`,
    `DESCRIPTION:${echapper(e.description)}`,
    `CATEGORIES:${echapper(e.categorie)}`,
  ]
  if (e.rappel > 0) {
    lignes.push(
      'BEGIN:VALARM',
      `TRIGGER:-PT${e.rappel}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${echapper(e.resume)}`,
      'END:VALARM',
    )
  }
  lignes.push('END:VEVENT')
  return lignes
}

/** Génère un calendrier RFC 5545 (fins de ligne CRLF, lignes repliées à 75 octets). */
export function genererIcs(evts: EvenementIcs[], maintenant: Date): string {
  const dtstamp = versIcsUtc(maintenant)
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Revisions Emma//FR',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
    ...evts.flatMap((e) => evenement(e, dtstamp)),
    'END:VCALENDAR',
  ]
  return lignes.map(replier).join(CRLF) + CRLF
}
