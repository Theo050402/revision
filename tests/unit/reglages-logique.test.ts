import { describe, expect, it } from 'vitest'
import { REGLAGES_DEFAUT, etatVide } from '../../src/domain/defaults'
import type { Creneau, Etat, Indispo } from '../../src/domain/types'
import {
  apercuDurees,
  libelleConflit,
  lireFichierIcs,
  nomSauvegarde,
  phraseIgnores,
  resumerConflits,
} from '../../src/ui/screens/reglagesLogique'

describe('apercuDurees', () => {
  it('rythme par défaut', () => {
    expect(apercuDurees(REGLAGES_DEFAUT, 18)).toBe('Item de 18 p → T1 : 2h15 · T2 : 1h15 · T3 : 45 min')
  })
  it('60 min pour 6 pages', () => {
    const r = { ...REGLAGES_DEFAUT, rythme: { minutes: 60, pages: 6 } }
    expect(apercuDurees(r, 18)).toBe('Item de 18 p → T1 : 3h00 · T2 : 1h30 · T3 : 1h00')
  })
})

describe('nomSauvegarde', () => {
  it('utilise la date de Paris', () => {
    expect(nomSauvegarde(new Date('2026-11-04T09:30:00Z'))).toBe('revisions-2026-11-04.json')
    // 23 h 30 UTC = 0 h 30 le lendemain à Paris.
    expect(nomSauvegarde(new Date('2026-11-04T23:30:00Z'))).toBe('revisions-2026-11-05.json')
  })
})

describe('lireFichierIcs', () => {
  const AUJ = '2026-11-04'
  it('refuse un fichier sans VCALENDAR', () => {
    expect(lireFichierIcs('hello', AUJ)).toEqual({ ok: false })
    expect(lireFichierIcs('', AUJ)).toEqual({ ok: false })
  })
  it('lit un calendrier valide', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20261110T080000',
      'DTEND:20261110T100000',
      'SUMMARY:Cours',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const r = lireFichierIcs(ics, AUJ)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.evenements).toEqual([{ titre: 'Cours', debut: '2026-11-10T08:00', fin: '2026-11-10T10:00' }])
      expect(r.ignores).toBe(0)
    }
  })
  it('compte les règles non prises en charge', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART:20261110T080000',
      'DTEND:20261110T100000',
      'RRULE:FREQ=MONTHLY',
      'SUMMARY:Mensuel',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const r = lireFichierIcs(ics, AUJ)
    expect(r.ok && r.ignores).toBe(1)
  })
})

describe('phraseIgnores', () => {
  it('accorde au singulier et au pluriel', () => {
    expect(phraseIgnores(1)).toBe('1 règle de répétition non prise en charge, ignorée')
    expect(phraseIgnores(3)).toBe('3 règles de répétition non prises en charge, ignorées')
  })
})

describe('resumerConflits', () => {
  const cr = (id: string, debut: string, duree = 60): Creneau => ({
    id,
    itemId: 'c1:300',
    tour: 1,
    partie: null,
    debut,
    duree,
    dureePerso: false,
    fait: false,
    note: '',
    version: 1,
    versionExportee: null,
  })
  const ind = (id: string, titre: string, debut: string, fin: string): Indispo => ({
    id,
    titre,
    source: 'ponctuelle',
    sourceId: null,
    debut,
    fin,
  })
  const etat = (creneaux: Creneau[], indispos: Indispo[]): Etat => ({
    ...etatVide(),
    creneaux: Object.fromEntries(creneaux.map((c) => [c.id, c])),
    indispos: Object.fromEntries(indispos.map((i) => [i.id, i])),
  })

  it('regroupe par titre et compte les créneaux distincts', () => {
    const e = etat(
      [cr('a', '2026-11-04T09:00'), cr('b', '2026-11-05T09:00'), cr('c', '2026-11-05T14:00')],
      [
        ind('i1', 'Stage', '2026-11-04T08:00', '2026-11-04T13:00'),
        ind('i2', 'Stage', '2026-11-05T08:00', '2026-11-05T13:00'),
        ind('i3', 'Stage', '2026-11-05T08:30', '2026-11-05T09:30'),
      ],
    )
    const r = resumerConflits(e)
    expect(r).toHaveLength(1)
    expect(r[0].titre).toBe('Stage')
    expect([...r[0].creneauIds].sort()).toEqual(['a', 'b'])
  })
  it('aucun conflit : liste vide', () => {
    const e = etat([cr('a', '2026-11-04T14:00')], [ind('i1', 'Stage', '2026-11-04T08:00', '2026-11-04T13:00')])
    expect(resumerConflits(e)).toEqual([])
  })
  it('libelleConflit accorde le verbe', () => {
    expect(libelleConflit({ titre: 'Stage', creneauIds: ['a'] })).toBe('1 créneau chevauche “Stage”')
    expect(libelleConflit({ titre: 'Stage', creneauIds: ['a', 'b'] })).toBe('2 créneaux chevauchent “Stage”')
  })
})
