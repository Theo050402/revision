/** Placement et poussée en cascade (spec §9.4). Minutes depuis minuit, intervalles semi-ouverts [debut, fin). */

export type Intervalle = { debut: number; fin: number }
export type Pose = { id: string; debut: number; duree: number }
export type EntreePlacement = {
  poses: Pose[]
  verrous: Intervalle[]
  bornes: Intervalle
  nouveau: { id: string; duree: number }
  t: number
  cibleId: string | null
  moitie: 'haute' | 'basse'
}
export type ResultatPlacement = { ok: true; debuts: Record<string, number> } | { ok: false }

const chevauche = (a: Intervalle, b: Intervalle): boolean => a.debut < b.fin && b.debut < a.fin

/**
 * Place `nouveau` à `t`. Renvoie les débuts du nouveau créneau et des seules poses dont le début change.
 * L'appelant retire au préalable le créneau déplacé de `poses`.
 */
export function placer(e: EntreePlacement): ResultatPlacement {
  const { poses, verrous, bornes, nouveau, t } = e
  const S: Intervalle = { debut: t, fin: t + nouveau.duree }
  const iv = (p: Pose): Intervalle => ({ debut: p.debut, fin: p.debut + p.duree })

  if (S.debut < bornes.debut || S.fin > bornes.fin) return { ok: false }
  if (verrous.some((v) => chevauche(S, v))) return { ok: false }

  const chevauchees = poses.filter((p) => chevauche(S, iv(p))).sort((a, b) => a.debut - b.debut)
  if (chevauchees.length === 0) return { ok: true, debuts: { [nouveau.id]: t } }

  let C = e.cibleId === null ? undefined : chevauchees.find((p) => p.id === e.cibleId)
  let moitie = e.moitie
  if (!C) {
    C = chevauchees[0]
    moitie = 'haute'
  }

  const avant =
    moitie === 'haute' ? poses.filter((p) => p.debut < C.debut) : poses.filter((p) => p.debut <= C.debut)
  const idsAvant = new Set(avant.map((p) => p.id))
  const apres = poses.filter((p) => !idsAvant.has(p.id))

  const debuts: Record<string, number> = { [nouveau.id]: t }

  // Poussée vers le bas
  let curseur = S.fin
  for (const p of [...apres].sort((a, b) => a.debut - b.debut)) {
    let nd = p.debut
    if (p.debut < curseur) {
      nd = curseur
      for (let v = verrous.find((x) => chevauche({ debut: nd, fin: nd + p.duree }, x)); v; ) {
        nd = v.fin
        v = verrous.find((x) => chevauche({ debut: nd, fin: nd + p.duree }, x))
      }
    }
    if (nd !== p.debut) {
      if (nd + p.duree > bornes.fin) return { ok: false }
      debuts[p.id] = nd
    }
    curseur = nd + p.duree
  }

  // Poussée vers le haut (symétrique)
  curseur = S.debut
  for (const p of [...avant].sort((a, b) => b.debut - a.debut)) {
    const fin0 = p.debut + p.duree
    let nf = fin0
    if (fin0 > curseur) {
      nf = curseur
      for (let v = verrous.find((x) => chevauche({ debut: nf - p.duree, fin: nf }, x)); v; ) {
        nf = v.debut
        v = verrous.find((x) => chevauche({ debut: nf - p.duree, fin: nf }, x))
      }
    }
    if (nf !== fin0) {
      if (nf - p.duree < bornes.debut) return { ok: false }
      debuts[p.id] = nf - p.duree
    }
    curseur = nf - p.duree
  }

  return { ok: true, debuts }
}
