import { describe, expect, it } from 'vitest'
import { lireIcs } from '../../src/ics/import'

const AUJ = '2026-10-28'

function ics(...evenements: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...evenements, 'END:VCALENDAR', ''].join('\r\n')
}
function vevent(...lignes: string[]): string {
  return ['BEGIN:VEVENT', 'UID:x@y', ...lignes, 'END:VEVENT'].join('\r\n')
}
const jours = (r: ReturnType<typeof lireIcs>): string[] => r.evenements.map((v) => v.debut.slice(0, 10))

describe('lireIcs', () => {
  it('lit un événement simple (TZID Europe/Paris)', () => {
    const r = lireIcs(
      ics(
        vevent(
          'SUMMARY:Cours',
          'DTSTART;TZID=Europe/Paris:20261103T080000',
          'DTEND;TZID=Europe/Paris:20261103T100000',
        ),
      ),
      AUJ,
    )
    expect(r).toEqual({
      evenements: [{ titre: 'Cours', debut: '2026-11-03T08:00', fin: '2026-11-03T10:00' }],
      ignores: 0,
    })
  })

  it('convertit un DTSTART en Z en heure de Paris (hiver et été)', () => {
    const r = lireIcs(
      ics(
        vevent('SUMMARY:Hiver', 'DTSTART:20261103T080000Z', 'DTEND:20261103T090000Z'),
        vevent('SUMMARY:Été', 'DTSTART:20260703T080000Z', 'DTEND:20260703T090000Z'),
      ),
      AUJ,
    )
    expect(r.evenements).toEqual([
      { titre: 'Hiver', debut: '2026-11-03T09:00', fin: '2026-11-03T10:00' },
      { titre: 'Été', debut: '2026-07-03T10:00', fin: '2026-07-03T11:00' },
    ])
  })

  it('heure flottante prise telle quelle ; fins de ligne LF acceptées', () => {
    const texte = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Flottant',
      'DTSTART:20261103T080000',
      'DTEND:20261103T093000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(lireIcs(texte, AUJ).evenements).toEqual([
      { titre: 'Flottant', debut: '2026-11-03T08:00', fin: '2026-11-03T09:30' },
    ])
  })

  it('journée entière : de 00:00 au lendemain 00:00', () => {
    const r = lireIcs(
      ics(vevent('SUMMARY:Férié', 'DTSTART;VALUE=DATE:20261111', 'DTEND;VALUE=DATE:20261112')),
      AUJ,
    )
    expect(r.evenements).toEqual([{ titre: 'Férié', debut: '2026-11-11T00:00', fin: '2026-11-12T00:00' }])
    const sansFin = lireIcs(ics(vevent('SUMMARY:Un jour', 'DTSTART;VALUE=DATE:20261111')), AUJ)
    expect(sansFin.evenements[0].fin).toBe('2026-11-12T00:00')
  })

  it('déplie les lignes repliées et déséchappe le titre', () => {
    const r = lireIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'SUMMARY:Cours de cardio\\, partie 1\\; salle B\\\\2\\nsuite',
          'DTSTART:20261103T080000',
          'DTEND:20261103T',
          ' 090000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      AUJ,
    )
    expect(r.evenements[0].titre).toBe('Cours de cardio, partie 1; salle B\\2\nsuite')
    expect(r.evenements[0].fin).toBe('2026-11-03T09:00')
  })

  it('déplie aussi un repli au milieu du titre', () => {
    const r = lireIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'SUMMARY:Anatomie pa',
          ' thologique',
          'DTSTART:20261103T080000',
          'DTEND:20261103T090000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      AUJ,
    )
    expect(r.evenements[0].titre).toBe('Anatomie pathologique')
  })

  it('RRULE WEEKLY BYDAY=MO,WE;UNTIL est développée', () => {
    const r = lireIcs(
      ics(
        vevent(
          'SUMMARY:TD',
          'DTSTART;TZID=Europe/Paris:20261102T090000',
          'DTEND;TZID=Europe/Paris:20261102T110000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T235959Z',
        ),
      ),
      AUJ,
    )
    expect(r.ignores).toBe(0)
    expect(r.evenements.map((v) => v.debut)).toEqual([
      '2026-11-02T09:00',
      '2026-11-04T09:00',
      '2026-11-09T09:00',
      '2026-11-11T09:00',
      '2026-11-16T09:00',
      '2026-11-18T09:00',
      '2026-11-23T09:00',
      '2026-11-25T09:00',
      '2026-11-30T09:00',
    ])
    expect(r.evenements[0].fin).toBe('2026-11-02T11:00')
  })

  it('UNTIL en date seule est inclusif', () => {
    const r = lireIcs(
      ics(
        vevent(
          'SUMMARY:A',
          'DTSTART:20261102T090000',
          'DTEND:20261102T100000',
          'RRULE:FREQ=DAILY;UNTIL=20261104',
        ),
      ),
      AUJ,
    )
    expect(jours(r)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })

  it('FREQ=MONTHLY est ignoré (compté)', () => {
    const r = lireIcs(
      ics(
        vevent('SUMMARY:Mensuel', 'DTSTART:20261102T090000', 'DTEND:20261102T100000', 'RRULE:FREQ=MONTHLY'),
        vevent('SUMMARY:Simple', 'DTSTART:20261103T090000', 'DTEND:20261103T100000'),
      ),
      AUJ,
    )
    expect(r.ignores).toBe(1)
    expect(r.evenements.map((v) => v.titre)).toEqual(['Simple'])
  })

  it('COUNT=3 donne 3 occurrences ; INTERVAL=2 est respecté', () => {
    const rr = (regle: string) =>
      lireIcs(
        ics(vevent('SUMMARY:A', 'DTSTART:20261102T090000', 'DTEND:20261102T100000', `RRULE:${regle}`)),
        AUJ,
      )
    expect(jours(rr('FREQ=DAILY;COUNT=3'))).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
    expect(jours(rr('FREQ=DAILY;INTERVAL=2;COUNT=3'))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
    expect(jours(rr('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU;COUNT=4'))).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-16',
      '2026-11-17',
    ])
  })

  it('WEEKLY sans BYDAY : le jour de DTSTART', () => {
    const r = lireIcs(
      ics(
        vevent('SUMMARY:A', 'DTSTART:20261104T090000', 'DTEND:20261104T100000', 'RRULE:FREQ=WEEKLY;COUNT=3'),
      ),
      AUJ,
    )
    expect(jours(r)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18'])
  })

  it("le développement s'arrête à 12 mois après aujourd'hui", () => {
    const r = lireIcs(
      ics(
        vevent('SUMMARY:Quotidien', 'DTSTART:20261028T090000', 'DTEND:20261028T100000', 'RRULE:FREQ=DAILY'),
      ),
      AUJ,
    )
    const j = jours(r)
    expect(j[0]).toBe('2026-10-28')
    expect(j.at(-1)).toBe('2027-10-28')
    expect(j).toHaveLength(366)
  })

  it('EXDATE retire une occurrence', () => {
    const r = lireIcs(
      ics(
        vevent(
          'SUMMARY:A',
          'DTSTART;TZID=Europe/Paris:20261102T090000',
          'DTEND;TZID=Europe/Paris:20261102T100000',
          'RRULE:FREQ=DAILY;COUNT=3',
          'EXDATE;TZID=Europe/Paris:20261103T090000',
        ),
      ),
      AUJ,
    )
    expect(jours(r)).toEqual(['2026-11-02', '2026-11-04'])
  })

  it('ignore les propriétés des VALARM imbriquées', () => {
    const r = lireIcs(
      ics(
        vevent(
          'SUMMARY:Vrai',
          'DTSTART:20261103T090000',
          'DTEND:20261103T100000',
          'BEGIN:VALARM',
          'SUMMARY:Alarme',
          'TRIGGER:-PT15M',
          'END:VALARM',
        ),
      ),
      AUJ,
    )
    expect(r.evenements.map((v) => v.titre)).toEqual(['Vrai'])
  })
})
