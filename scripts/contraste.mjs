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
const ligne = (nom, r, seuil = 4.5) => {
  const ok = r >= seuil
  if (!ok) echec = true
  console.log(`${ok ? 'OK    ' : 'ECHEC '} ${nom.padEnd(52)} ${r.toFixed(2)}:1`)
}
/** Élément graphique (bord, anneau) : 3:1. */
const ligneGraphique = (nom, r) => ligne(nom, r, 3)

for (const [nom, hex] of Object.entries(surligneurs)) {
  ligne(`encre ${ENCRE} sur ${nom} ${hex}`, rapport(rgb(ENCRE), rgb(hex)))
}
for (const [nom, hex] of Object.entries(surligneurs)) {
  const bas = melange(rgb(hex), rgb(FOND_CLAIR), OPACITE_MIN)
  ligne(`encre sur ${nom} à ${OPACITE_MIN} sur ${FOND_CLAIR} (bas du dégradé)`, rapport(rgb(ENCRE), bas))
}
ligne('sombre : #E6E6FA sur la carte #33264A', rapport(rgb('#E6E6FA'), rgb('#33264A')))
ligne('sombre : #E6E6FA sur le fond #2B1E3E', rapport(rgb('#E6E6FA'), rgb('#2B1E3E')))
// Texte secondaire (--muted) sur chaque fond où il est posé : même seuil, un échec fait échouer le script.
const MUTED_CLAIR = '#646D8C'
const MUTED_SOMBRE = '#A99BC4'
for (const [nom, fond] of [['le fond', FOND_CLAIR], ['la carte', '#FFFFFF'], ['un champ', '#F1F4F9'], ['un bloc verrouillé', '#EEF2F8']]) {
  ligne(`clair : muted ${MUTED_CLAIR} sur ${nom} ${fond}`, rapport(rgb(MUTED_CLAIR), rgb(fond)))
}
for (const [nom, fond] of [['la carte', '#33264A'], ['le fond', '#2B1E3E'], ['un champ', '#3A2D53'], ['le panneau', '#241934']]) {
  ligne(`sombre : muted ${MUTED_SOMBRE} sur ${nom} ${fond}`, rapport(rgb(MUTED_SOMBRE), rgb(fond)))
}
// Sélection par zone (tâche 11 des améliorations, selection.css). Les fonds translucides sont composés sur le fond de
// la page (`color-mix` en sRGB = mélange linéaire des composantes).
const THEMES = {
  clair: { bg: '#FCFCFA', panel: '#FFFFFF', ink: '#1E2A5A', accent: '#1E2A5A', onAccent: '#FFFFFF', now: '#D9473F' },
  sombre: { bg: '#2B1E3E', panel: '#241934', ink: '#E6E6FA', accent: '#A490C2', onAccent: '#241934', now: '#F29E8E' },
}
for (const [nom, t] of Object.entries(THEMES)) {
  const fondLasso = melange(rgb(t.accent), rgb(t.bg), 0.12)
  ligne(`${nom} : encre sous le lasso (accent 12 % sur le fond)`, rapport(rgb(t.ink), fondLasso))
  // Bord du lasso et anneau de sélection : élément graphique, 3:1 suffit (WCAG 1.4.11).
  ligneGraphique(`${nom} : bord du lasso (accent) sur le fond`, rapport(rgb(t.accent), rgb(t.bg)))
  ligneGraphique(`${nom} : bord du lasso sur son propre fond`, rapport(rgb(t.accent), fondLasso))
  ligne(`${nom} : coche (on-accent) sur la pastille d'accent`, rapport(rgb(t.onAccent), rgb(t.accent)))
  const fondBarre = melange(rgb(t.panel), rgb(t.bg), 0.78)
  ligne(`${nom} : texte de la barre de sélection (panel 78 %)`, rapport(rgb(t.ink), fondBarre))
  const rouge = melange(rgb(t.now), [0, 0, 0], 0.88)
  ligne(`${nom} : « Supprimer » (fond sur --now assombri 12 %)`, rapport(rgb(t.bg), rouge))
}
process.exit(echec ? 1 : 0)
