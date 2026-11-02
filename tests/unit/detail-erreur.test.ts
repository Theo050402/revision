import { describe, expect, test } from 'vitest'
import { ErreurPdf, descriptionTechnique } from '../../src/import/lirePdf'

describe('descriptionTechnique', () => {
  test('remonte la chaîne des causes avec nom et message', () => {
    const e = new ErreurPdf('illisible', { cause: new Error('InvalidPDFException : Invalid PDF structure.') })
    expect(descriptionTechnique(e)).toBe('ErreurPdf illisible ← Error : InvalidPDFException : Invalid PDF structure.')
  })

  test("décrit une erreur de lecture du fichier (DOMException)", () => {
    const e = new ErreurPdf('illisible', { cause: new DOMException('The file could not be read', 'NotReadableError') })
    expect(descriptionTechnique(e)).toBe('ErreurPdf illisible ← NotReadableError : The file could not be read')
  })

  test("décrit un ErrorEvent de worker (message, fichier, ligne)", () => {
    const ev = { type: 'error', message: 'TypeError: x is not a function', filename: 'https://a/b/pdf.worker.js', lineno: 12 }
    const e = new ErreurPdf('illisible', { cause: ev })
    expect(descriptionTechnique(e)).toBe('ErreurPdf illisible ← error : TypeError: x is not a function (pdf.worker.js:12)')
  })

  test('valeur quelconque', () => {
    expect(descriptionTechnique('boum')).toBe('boum')
  })
})
