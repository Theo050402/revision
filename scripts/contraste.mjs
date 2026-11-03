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
}

// ---------- Passe de design (tâche 15, audit-design.md) ----------
// Jetons de theme/tokens.css. `rougeTexte` : clair = --now assombri de 12 % (color-mix vers le noir), sombre = --now.
// `surRouge` : texte posé sur ce rouge. `surface` : --surface-haute (feuilles, cartes, barre de sélection) ; `champHaut`
// et `carteHaute` : champs et cartes posés dessus.
const DESIGN = {
  clair: {
    ...THEMES.clair,
    muted: MUTED_CLAIR,
    field: '#F1F4F9',
    surface: '#FFFFFF',
    champHaut: '#F1F4F9',
    carteHaute: '#FFFFFF',
    margin: '#F3B9B4',
    rougeTexte: melange(rgb('#D9473F'), [0, 0, 0], 0.88),
    surRouge: rgb('#FFFFFF'),
    chargeEncre: '#1E2A5A',
    chargeMax: 1,
  },
  sombre: {
    ...THEMES.sombre,
    muted: MUTED_SOMBRE,
    field: '#3A2D53',
    surface: '#33264A',
    champHaut: '#1A1027',
    carteHaute: '#241934',
    margin: '#B86F6A',
    rougeTexte: rgb('#F29E8E'),
    surRouge: rgb('#2B1E3E'),
    chargeEncre: '#A490C2',
    chargeMax: 0.55,
  },
}
/** Repère de surface (non normatif) : l'écart entre un champ ou une carte et la surface qui le porte. */
const ligneRepere = (nom, r, seuil) => ligne(`${nom} (repère ≥ ${seuil})`, r, seuil)

for (const [nom, t] of Object.entries(DESIGN)) {
  // H1 : texte rouge (jour courant, erreurs en ligne, « Supprimer » texte) sur ses fonds.
  for (const [fond, hex] of [['le fond', t.bg], ['le panneau', t.panel], ['la surface haute', t.surface], ['un champ', t.field]]) {
    ligne(`${nom} : texte rouge (--rouge-texte) sur ${fond}`, rapport(t.rougeTexte, rgb(hex)))
  }
  // H1 : texte posé sur le rouge (badge « À placer », pastille du nombre glissé, « Supprimer » plein, ligne glissée).
  ligne(`${nom} : --sur-rouge sur --rouge-texte (badges, boutons rouges)`, rapport(t.surRouge, t.rougeTexte))
  // Barre de sélection : matériau épais (surface haute à 82 %) sur le fond.
  const fondBarre = melange(rgb(t.surface), rgb(t.bg), 0.82)
  ligne(`${nom} : texte de la barre de sélection (surface haute 82 %)`, rapport(rgb(t.ink), fondBarre))
  ligne(`${nom} : muted sur la barre de sélection`, rapport(rgb(t.muted), fondBarre))
  // H3 / M8 : texte sur la surface haute, champs et cartes posés dessus.
  ligne(`${nom} : encre sur la surface haute`, rapport(rgb(t.ink), rgb(t.surface)))
  ligne(`${nom} : muted sur la surface haute`, rapport(rgb(t.muted), rgb(t.surface)))
  ligne(`${nom} : encre sur un champ d'une surface haute`, rapport(rgb(t.ink), rgb(t.champHaut)))
  ligne(`${nom} : muted (indications) sur un champ d'une surface haute`, rapport(rgb(t.muted), rgb(t.champHaut)))
  ligne(`${nom} : muted sur une carte d'une surface haute`, rapport(rgb(t.muted), rgb(t.carteHaute)))
  if (nom === 'sombre') {
    // En sombre, les champs s'encastrent dans la surface haute : au moins l'écart d'avant (champ sur panneau, 1,33:1).
    ligneRepere('sombre : champ encastré / surface haute', rapport(rgb(t.champHaut), rgb(t.surface)), 1.3)
    ligneRepere('sombre : carte intérieure / surface haute (+ bord)', rapport(rgb(t.carteHaute), rgb(t.surface)), 1.2)
    // H3 : la feuille se détache de la page assombrie par le voile (rgb(10 6 22 / 0.6)).
    const voile = melange([10, 6, 22], rgb(t.bg), 0.6)
    ligneRepere('sombre : feuille / page sous le voile', rapport(rgb(t.surface), voile), 1.3)
  }
  // M9 : encarts (trait au ton, fond à 10 % du ton sur la surface haute). Texte à l'encre ; du texte secondaire
  // (muted) n'est posé que dans l'encart info (bac « À placer », méta des cartes).
  for (const [ton, hex] of [['info', t.margin], ['avertissement', '#FFB25C'], ['erreur', t.now]]) {
    const fond = melange(rgb(hex), rgb(t.surface), 0.1)
    ligne(`${nom} : encre sur l'encart ${ton}`, rapport(rgb(t.ink), fond))
    if (ton === 'info') ligne(`${nom} : muted sur l'encart ${ton}`, rapport(rgb(t.muted), fond))
  }
  // M3 : en-tête des jours en matériau fin (fond à 82 %, --materiau-fin) au-dessus d'un bloc. Pire cas : le bloc plein sous le flou
  // (clair : surligneur à 85 % sur le fond ; sombre : carte). Textes : nom du jour (muted, ou rouge aujourd'hui) et
  // numéro (encre).
  const sousEntete =
    nom === 'clair'
      ? Object.entries(surligneurs).map(([n, hex]) => [n, melange(rgb(hex), rgb(t.bg), 0.85)])
      : [['carte', rgb('#33264A')], ['champ', rgb('#3A2D53')]]
  for (const [n, dessous] of sousEntete) {
    const fond = melange(rgb(t.bg), dessous, 0.82)
    ligne(`${nom} : en-tête translucide sur ${n} : muted`, rapport(rgb(t.muted), fond))
    ligne(`${nom} : en-tête translucide sur ${n} : rouge du jour`, rapport(t.rougeTexte, fond))
  }
  // H4 : vue Mois, carreau le plus chargé ; les pastilles (numéro, charge) restent pleines sur --panel, encre dessus.
  const carreau = melange(rgb(t.chargeEncre), rgb(t.panel), t.chargeMax)
  ligne(`${nom} : pastille du mois (encre sur panneau)`, rapport(rgb(t.ink), rgb(t.panel)))
  ligneRepere(`${nom} : pastille / carreau le plus chargé`, rapport(rgb(t.panel), carreau), 1.5)
}
process.exit(echec ? 1 : 0)
