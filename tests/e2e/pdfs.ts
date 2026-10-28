// PDF fabriqués pour les tests (aucun PDF réel dans le dépôt).
import { PDFDocument, StandardFonts } from 'pdf-lib'

export type FichierTest = { name: string; mimeType: string; buffer: Buffer }

const pdf = (name: string, octets: Uint8Array): FichierTest => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(octets),
})

/** Sommaire de 4 items : « Titre … page » puis « Item N » dessous (pages de début 10, 18, 30, 40). */
export async function pdfSommaire(nom = 'CANCERO 4e college.pdf'): Promise<FichierTest> {
  const doc = await PDFDocument.create()
  const police = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  const blocs: [number, string, number][] = [
    [290, 'Titre un', 10],
    [291, 'Titre deux', 18],
    [292, 'Titre trois', 30],
    [293, 'Titre quatre', 40],
  ]
  blocs.forEach(([numero, titre, pageDebut], i) => {
    const haut = 100 + 50 * i
    const opts = { size: 10, font: police }
    page.drawText(titre, { ...opts, x: 125, y: 842 - haut })
    page.drawText('.......', { ...opts, x: 400, y: 842 - haut })
    page.drawText(String(pageDebut), { ...opts, x: 515, y: 842 - haut })
    page.drawText(`Item ${numero}`, { ...opts, x: 125, y: 842 - haut - 12 })
  })
  return pdf(nom, await doc.save())
}

/** PDF valide sans aucun texte : seulement un rectangle dessiné. */
export async function pdfSansTexte(nom = 'VIDE.pdf'): Promise<FichierTest> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  page.drawRectangle({ x: 100, y: 100, width: 200, height: 100 })
  return pdf(nom, await doc.save())
}

/** Octets quelconques nommés .pdf. */
export function pdfCorrompu(nom = 'CASSE.pdf'): FichierTest {
  const octets = Buffer.alloc(2048)
  for (let i = 0; i < octets.length; i++) octets[i] = (i * 73 + 41) % 251
  return { name: nom, mimeType: 'application/pdf', buffer: octets }
}
