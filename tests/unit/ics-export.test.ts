import { describe, expect, test } from 'vitest'
import { genererIcs, type EvenementIcs } from '../../src/ics/export'

const e: EvenementIcs = {
  uid: 'abc@revisions-emma',
  sequence: 2,
  debut: '2026-11-05T14:00',
  fin: '2026-11-05T16:45',
  resume: '📚 300 · Tumeurs du col utérin, tumeurs du corps utérin · T1',
  description: 'Cancérologie · p. 153–175 (22 p)\nrelire; tableau, TNM',
  categorie: 'Cancérologie',
  rappel: 15,
}
const maintenant = new Date('2026-11-01T10:00:00Z')
const ics = genererIcs([e], maintenant)

/** Déplie les lignes repliées (CRLF + espace). */
const deplie = (s: string) => s.replace(/\r\n /g, '')

describe('genererIcs', () => {
  test('lignes CRLF, aucune ligne > 75 octets', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    // aucun LF ou CR isolé : sans les CRLF, il ne reste ni CR ni LF
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    const lignes = ics.split('\r\n')
    lignes.pop() // chaîne vide après le dernier CRLF
    expect(lignes.length).toBeGreaterThan(10)
    for (const l of lignes) {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75)
    }
  })

  test('repli sans couper un caractère multi-octets', () => {
    // 80 « é » (2 octets chacun) derrière « SUMMARY: » (8 octets) : la coupe tombe au milieu d'un caractère
    const resume = 'é'.repeat(80)
    const sortie = genererIcs([{ ...e, resume }], maintenant)
    const lignes = sortie.split('\r\n')
    expect(lignes.some((l) => l.startsWith(' '))).toBe(true)
    expect(sortie).not.toContain('�')
    for (const l of lignes) expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75)
    // une fois dépliée, la ligne vaut SUMMARY:<resume>
    const ligne = deplie(sortie).split('\r\n').find((l) => l.startsWith('SUMMARY:'))!
    expect(ligne).toBe(`SUMMARY:${resume}`)
  })

  test("le résumé de l'exemple, une fois déplié, vaut SUMMARY:<resume> (virgules échappées)", () => {
    const ligne = deplie(ics).split('\r\n').find((l) => l.startsWith('SUMMARY:'))!
    expect(ligne).toBe(`SUMMARY:${e.resume.replace(/,/g, '\\,')}`)
  })

  test('repli sur un texte entièrement multi-octets : aucun point de code coupé', () => {
    const long = '📚'.repeat(60)
    const sortie = genererIcs([{ ...e, resume: long }], maintenant)
    for (const l of sortie.split('\r\n')) {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75)
    }
    expect(deplie(sortie)).toContain(`SUMMARY:${long}\r\n`)
  })

  test('VTIMEZONE Europe/Paris avec DAYLIGHT et STANDARD', () => {
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Paris\r\n')
    expect(ics).toContain('END:VTIMEZONE')
    expect(ics).toContain(
      'BEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nEND:DAYLIGHT',
    )
    expect(ics).toContain(
      'BEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nEND:STANDARD',
    )
  })

  test('DTSTART;TZID=Europe/Paris:20261105T140000 et DTEND …T164500', () => {
    expect(ics).toContain('\r\nDTSTART;TZID=Europe/Paris:20261105T140000\r\n')
    expect(ics).toContain('\r\nDTEND;TZID=Europe/Paris:20261105T164500\r\n')
  })

  test('UID, SEQUENCE:2, DTSTAMP:20261101T100000Z, METHOD:PUBLISH', () => {
    expect(ics).toContain('\r\nUID:abc@revisions-emma\r\n')
    expect(ics).toContain('\r\nSEQUENCE:2\r\n')
    expect(ics).toContain('\r\nDTSTAMP:20261101T100000Z\r\n')
    expect(ics).toContain('\r\nMETHOD:PUBLISH\r\n')
  })

  test('structure : VCALENDAR, VERSION, PRODID, un seul VEVENT, CATEGORIES', () => {
    expect(
      ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Revisions Emma//FR\r\n'),
    ).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(deplie(ics)).toContain('\r\nCATEGORIES:Cancérologie\r\n')
  })

  test('un VEVENT par événement', () => {
    const deux = genererIcs([e, { ...e, uid: 'def@revisions-emma' }], maintenant)
    expect(deux.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(deux.match(/END:VEVENT/g)).toHaveLength(2)
    expect(deux).toContain('UID:def@revisions-emma')
  })

  test('échappement : DESCRIPTION contient "\\nrelire\\; tableau\\, TNM"', () => {
    expect(deplie(ics)).toContain('\\nrelire\\; tableau\\, TNM')
    // pas de retour à la ligne brut dans la description
    expect(deplie(ics)).not.toContain('(22 p)\r\nrelire')
  })

  test('échappement de la barre oblique inverse', () => {
    const s = genererIcs([{ ...e, description: 'a\\b' }], maintenant)
    expect(deplie(s)).toContain('DESCRIPTION:a\\\\b\r\n')
  })

  test('VALARM TRIGGER:-PT15M seulement si rappel > 0', () => {
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics).toContain('ACTION:DISPLAY')
    const sans = genererIcs([{ ...e, rappel: 0 }], maintenant)
    expect(sans).not.toContain('VALARM')
    expect(sans).not.toContain('TRIGGER')
  })

  test("changement d'heure : 2027-03-28T14:00 → DTSTART;TZID=Europe/Paris:20270328T140000", () => {
    const s = genererIcs(
      [{ ...e, debut: '2027-03-28T14:00', fin: '2027-03-28T16:00' }],
      maintenant,
    )
    expect(s).toContain('DTSTART;TZID=Europe/Paris:20270328T140000')
    expect(s).toContain('DTEND;TZID=Europe/Paris:20270328T160000')
  })
})
