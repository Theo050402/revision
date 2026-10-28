import { expect, test } from 'vitest'
import {
  ajouterJours,
  ajouterMinutes,
  hm,
  jourDe,
  jourSemaine,
  local,
  minutesDe,
  utcVersLocal,
  versHm,
  versIcsLocal,
  versIcsUtc,
} from '../../src/domain/temps'

test('hm convertit « 08:30 » en 510 minutes', () => {
  expect(hm('08:30')).toBe(510)
  expect(hm('00:00')).toBe(0)
  expect(hm('23:45')).toBe(1425)
})

test('versHm convertit des minutes en « HH:mm »', () => {
  expect(versHm(510)).toBe('08:30')
  expect(versHm(0)).toBe('00:00')
  expect(versHm(1425)).toBe('23:45')
})

test('jourDe extrait le jour YYYY-MM-DD', () => {
  expect(jourDe('2026-11-05T14:00')).toBe('2026-11-05')
})

test('minutesDe donne les minutes depuis minuit', () => {
  expect(minutesDe('2026-11-05T14:30')).toBe(870)
  expect(minutesDe('2026-11-05T00:00')).toBe(0)
})

test('local assemble un jour et des minutes', () => {
  expect(local('2026-11-05', 870)).toBe('2026-11-05T14:30')
  expect(local('2026-11-05', 5)).toBe('2026-11-05T00:05')
})

test('ajouterMinutes passe minuit', () => {
  expect(ajouterMinutes('2026-11-05T23:30', 45)).toBe('2026-11-06T00:15')
})

test('ajouterMinutes accepte un décalage négatif et franchit un mois et une année', () => {
  expect(ajouterMinutes('2026-11-01T00:10', -20)).toBe('2026-10-31T23:50')
  expect(ajouterMinutes('2026-12-31T23:59', 1)).toBe('2027-01-01T00:00')
})

test("ajouterMinutes ignore le changement d'heure (arithmétique naïve)", () => {
  expect(ajouterMinutes('2027-03-28T01:30', 120)).toBe('2027-03-28T03:30')
})

test('ajouterJours avance et recule, y compris sur un changement de mois', () => {
  expect(ajouterJours('2026-11-05', 3)).toBe('2026-11-08')
  expect(ajouterJours('2026-11-29', 3)).toBe('2026-12-02')
  expect(ajouterJours('2026-11-01', -1)).toBe('2026-10-31')
  expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29')
})

test('jourSemaine : 1 = lundi … 7 = dimanche', () => {
  expect(jourSemaine('2026-11-02')).toBe(1)
  expect(jourSemaine('2026-11-08')).toBe(7)
  expect(jourSemaine('2026-11-05')).toBe(4)
})

test("utcVersLocal convertit en heure d'été (UTC+2)", () => {
  expect(utcVersLocal(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01T14:00')
})

test("utcVersLocal convertit en heure d'hiver (UTC+1)", () => {
  expect(utcVersLocal(new Date('2026-12-01T12:00:00Z'))).toBe('2026-12-01T13:00')
})

test("utcVersLocal : minuit local s'écrit 00:00 et non 24:00", () => {
  expect(utcVersLocal(new Date('2026-12-01T23:00:00Z'))).toBe('2026-12-02T00:00')
})

test('versIcsLocal retire les séparateurs', () => {
  expect(versIcsLocal('2026-11-05T14:00')).toBe('20261105T140000')
})

test('versIcsUtc formate un instant UTC avec Z', () => {
  expect(versIcsUtc(new Date('2026-11-05T13:00:00Z'))).toBe('20261105T130000Z')
})
