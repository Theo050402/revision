import { beforeEach, describe, expect, it } from 'vitest'
import { ajoutes, pointSousDoigt, zoneEntre, type ColonneEcran } from '../../src/ui/selection/zoneLasso'
import { texteSelection, texteSuppression, useSelection } from '../../src/ui/selection/useSelection'

// Trois colonnes de 100 px à partir de x = 50 ; plage 7 h – 23 h, 48 px par heure.
const COLONNES: ColonneEcran[] = [
  { jour: '2026-11-02', gauche: 50, droite: 150 },
  { jour: '2026-11-03', gauche: 150, droite: 250 },
  { jour: '2026-11-04', gauche: 250, droite: 350 },
]
const PLAGE = { debut: 7 * 60, fin: 23 * 60 }
const PX = 48

describe('pointSousDoigt', () => {
  it('jour de la colonne sous le doigt, minutes depuis le haut des colonnes', () => {
    // Haut des colonnes à 200 px : 96 px plus bas = 2 h après 7 h.
    expect(pointSousDoigt(170, 296, COLONNES, 200, PLAGE, PX)).toEqual({ jour: '2026-11-03', minute: 9 * 60 })
    expect(pointSousDoigt(260, 200 + 36, COLONNES, 200, PLAGE, PX)).toEqual({ jour: '2026-11-04', minute: 7 * 60 + 45 })
  })

  it('la grille a défilé : même doigt, haut des colonnes plus haut, minute plus tardive', () => {
    expect(pointSousDoigt(170, 296, COLONNES, 200 - 240, PLAGE, PX)).toEqual({ jour: '2026-11-03', minute: 14 * 60 })
  })

  it('hors des colonnes : borné au premier ou au dernier jour visible, et à la plage affichée', () => {
    expect(pointSousDoigt(10, 296, COLONNES, 200, PLAGE, PX).jour).toBe('2026-11-02')
    expect(pointSousDoigt(900, 296, COLONNES, 200, PLAGE, PX).jour).toBe('2026-11-04')
    expect(pointSousDoigt(170, 0, COLONNES, 200, PLAGE, PX).minute).toBe(7 * 60)
    expect(pointSousDoigt(170, 5000, COLONNES, 200, PLAGE, PX).minute).toBe(23 * 60)
  })
})

describe('zoneEntre', () => {
  it('rectangle ordonné quel que soit le sens du tracé', () => {
    const a = { jour: '2026-11-04', minute: 15 * 60 }
    const b = { jour: '2026-11-02', minute: 14 * 60 }
    const z = { jourDebut: '2026-11-02', jourFin: '2026-11-04', debut: 14 * 60, fin: 15 * 60 }
    expect(zoneEntre(a, b)).toEqual(z)
    expect(zoneEntre(b, a)).toEqual(z)
  })
})

describe('ajoutes', () => {
  it('créneaux nouvellement touchés, hors de ceux déjà sélectionnés', () => {
    expect(ajoutes(['a'], ['a', 'b', 'c'], new Set(['c']))).toEqual(['b'])
    expect(ajoutes(['a', 'b'], ['a'], new Set())).toEqual([])
    expect(ajoutes([], [], new Set())).toEqual([])
  })
})

describe('textes', () => {
  it('« N sélectionnés », au singulier pour un', () => {
    expect(texteSelection(1)).toBe('1 sélectionné')
    expect(texteSelection(2)).toBe('2 sélectionnés')
  })

  it('« N créneaux supprimés », au singulier pour un', () => {
    expect(texteSuppression(1)).toBe('1 créneau supprimé')
    expect(texteSuppression(3)).toBe('3 créneaux supprimés')
  })
})

describe('useSelection', () => {
  beforeEach(() => useSelection.getState().vider())

  it('ajouter réunit, basculer ajoute ou retire, vider efface', () => {
    const s = () => useSelection.getState()
    s().ajouter(['a', 'b'])
    s().ajouter(['b', 'c'])
    expect([...s().ids]).toEqual(['a', 'b', 'c'])
    s().basculer('b')
    expect([...s().ids]).toEqual(['a', 'c'])
    s().basculer('d')
    expect(s().ids.has('d')).toBe(true)
    s().vider()
    expect(s().ids.size).toBe(0)
  })

  it('rien à changer : même objet (aucun rendu inutile)', () => {
    const avant = useSelection.getState().ids
    useSelection.getState().vider()
    useSelection.getState().ajouter([])
    expect(useSelection.getState().ids).toBe(avant)
  })
})
