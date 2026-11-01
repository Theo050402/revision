// Contrastes WCAG des couleurs de l'interface (spec §13, tâche 21). Usage : node scripts/contraste.mjs
// Sortie non nulle si un rapport est inférieur à 4,5:1.
const surligneurs = { jaune: '#FFE45C', rose: '#FF9AC8', vert: '#94E08F', orange: '#FFB25C', bleu: '#7FD3FF', violet: '#C6A6FF' }
const ENCRE = '#1E2A5A'
const FOND_CLAIR = '#FCFCFA'
const OPACITE_MIN = Number(process.argv[2] ?? 0.6) // opacité du bas du dégradé des blocs (--bloc-a2)

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lineaire = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (c) => 0.2126 * lineaire(c[0]) + 0.7152 * lineaire(c[1]) + 0.0722 * lineaire(c[2])
const rapport = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
const melange = (dessus, dessous, alpha) => dessus.map((v, i) => v * alpha + dessous[i] * (1 - alpha))

let echec = false
const ligne = (nom, r, indicatif = false) => {
  const ok = r >= 4.5
  if (!ok && !indicatif) echec = true
  console.log(`${ok ? 'OK    ' : indicatif ? 'AVIS  ' : 'ECHEC '} ${nom.padEnd(52)} ${r.toFixed(2)}:1`)
}

for (const [nom, hex] of Object.entries(surligneurs)) {
  ligne(`encre ${ENCRE} sur ${nom} ${hex}`, rapport(rgb(ENCRE), rgb(hex)))
}
for (const [nom, hex] of Object.entries(surligneurs)) {
  const bas = melange(rgb(hex), rgb(FOND_CLAIR), OPACITE_MIN)
  ligne(`encre sur ${nom} à ${OPACITE_MIN} sur ${FOND_CLAIR} (bas du dégradé)`, rapport(rgb(ENCRE), bas))
}
ligne('sombre : #E6E6FA sur la carte #33264A', rapport(rgb('#E6E6FA'), rgb('#33264A')))
ligne('sombre : #E6E6FA sur le fond #2B1E3E', rapport(rgb('#E6E6FA'), rgb('#2B1E3E')))
// Texte secondaire (--muted) : à titre indicatif, sans effet sur le code de sortie.
ligne('clair : muted #6B7493 sur le fond #FCFCFA', rapport(rgb('#6B7493'), rgb(FOND_CLAIR)), true)
ligne('clair : muted #6B7493 sur la carte #FFFFFF', rapport(rgb('#6B7493'), rgb('#FFFFFF')), true)
ligne('clair : muted #6B7493 sur un champ #F1F4F9', rapport(rgb('#6B7493'), rgb('#F1F4F9')), true)
ligne('sombre : muted #A99BC4 sur la carte #33264A', rapport(rgb('#A99BC4'), rgb('#33264A')), true)
ligne('sombre : muted #A99BC4 sur le fond #2B1E3E', rapport(rgb('#A99BC4'), rgb('#2B1E3E')), true)
process.exit(echec ? 1 : 0)
