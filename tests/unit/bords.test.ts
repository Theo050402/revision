import { describe, expect, it, vi } from 'vitest'
import { coteBord, creerMaintienBord, vitesseDefilement, vitesseVerticale } from '../../src/ui/dnd/bords'

describe('vitesseDefilement', () => {
  it('est nulle à la limite de la zone et au-delà (64 px par défaut)', () => {
    expect(vitesseDefilement(64)).toBe(0)
    expect(vitesseDefilement(65)).toBe(0)
    expect(vitesseDefilement(500)).toBe(0)
  })

  it('atteint le maximum au bord (900 px/s) et le garde au-delà du bord', () => {
    expect(vitesseDefilement(0)).toBe(900)
    expect(vitesseDefilement(-20)).toBe(900)
  })

  it('croît en approchant du bord, sans palier', () => {
    let avant = 0
    for (let d = 63; d >= 0; d -= 3) {
      const v = vitesseDefilement(d)
      expect(v).toBeGreaterThan(avant)
      avant = v
    }
  })

  it('respecte la zone et le maximum donnés', () => {
    expect(vitesseDefilement(40, 40, 300)).toBe(0)
    expect(vitesseDefilement(0, 40, 300)).toBe(300)
    expect(vitesseDefilement(20, 40, 300)).toBeGreaterThan(0)
    expect(vitesseDefilement(20, 40, 300)).toBeLessThan(300)
  })
})

describe('coteBord', () => {
  // Colonnes de x = 100 à 1100 (hors colonne des heures), grille visible jusqu'à 1180.
  const g = 100
  const d = 1180
  it('vaut 0 loin des bords et dans la colonne des heures', () => {
    expect(coteBord(600, g, d)).toBe(0)
    expect(coteBord(60, g, d)).toBe(0)
    expect(coteBord(g - 1, g, d)).toBe(0)
  })
  it('vaut -1 dans la bande de 32 px du bord gauche des colonnes, 1 contre le bord droit', () => {
    expect(coteBord(g, g, d)).toBe(-1)
    expect(coteBord(g + 31, g, d)).toBe(-1)
    expect(coteBord(g + 32, g, d)).toBe(0)
    expect(coteBord(d - 32, g, d)).toBe(1)
    expect(coteBord(d, g, d)).toBe(1)
    expect(coteBord(d - 33, g, d)).toBe(0)
  })
})

describe('creerMaintienBord', () => {
  it('change après 600 ms contre le même bord, une seule fois jusqu’aux 600 ms suivantes', () => {
    const f = vi.fn()
    const m = creerMaintienBord(f)
    m.maj(1, 1000)
    m.maj(1, 1500)
    expect(f).not.toHaveBeenCalled()
    m.maj(1, 1600)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenLastCalledWith(1)
    m.maj(1, 2100)
    expect(f).toHaveBeenCalledTimes(1)
    m.maj(1, 2200)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('repart de zéro quand le doigt quitte la bande', () => {
    const f = vi.fn()
    const m = creerMaintienBord(f)
    m.maj(-1, 0)
    m.maj(-1, 500)
    m.maj(0, 550)
    m.maj(-1, 600)
    m.maj(-1, 1100)
    expect(f).not.toHaveBeenCalled()
    m.maj(-1, 1200)
    expect(f).toHaveBeenCalledWith(-1)
  })

  it('repart de zéro en passant d’un bord à l’autre', () => {
    const f = vi.fn()
    const m = creerMaintienBord(f)
    m.maj(-1, 0)
    m.maj(-1, 500)
    m.maj(1, 700)
    m.maj(1, 1200)
    expect(f).not.toHaveBeenCalled()
    m.maj(1, 1300)
    expect(f).toHaveBeenCalledWith(1)
  })

  it('respecte un délai donné et peut être arrêté', () => {
    const f = vi.fn()
    const m = creerMaintienBord(f, 100)
    m.maj(1, 0)
    m.arreter()
    m.maj(1, 150)
    expect(f).not.toHaveBeenCalled()
    m.maj(1, 250)
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('creerMaintienBord : signal pour la bande lumineuse', () => {
  it('signale le départ du décompte contre un bord, son redémarrage après le changement, et son arrêt', () => {
    const cotes: number[] = []
    const m = creerMaintienBord(() => {}, 600, (c) => cotes.push(c))
    m.maj(0, 0)
    expect(cotes).toEqual([])
    m.maj(1, 100)
    expect(cotes).toEqual([1])
    m.maj(1, 400)
    expect(cotes).toEqual([1]) // en cours : rien de nouveau
    m.maj(1, 700) // 600 ms tenues : changement, le décompte suivant repart
    expect(cotes).toEqual([1, 1])
    m.maj(0, 800) // le doigt quitte la bande
    expect(cotes).toEqual([1, 1, 0])
  })

  it('passer d\'un bord à l\'autre relance le décompte, arreter l\'éteint (une fois)', () => {
    const cotes: number[] = []
    const m = creerMaintienBord(() => {}, 600, (c) => cotes.push(c))
    m.maj(-1, 0)
    m.maj(1, 100)
    expect(cotes).toEqual([-1, 1])
    m.arreter()
    m.arreter()
    expect(cotes).toEqual([-1, 1, 0])
  })
})

describe('vitesseVerticale', () => {
  // Bord haut à 100 px (sous l'en-tête des jours), bord bas à 700 px.
  it('nulle au milieu de la grille', () => {
    expect(vitesseVerticale(400, 100, 700)).toBe(0)
  })

  it('vers le haut (négative) près du bord haut, vers le bas (positive) près du bord bas', () => {
    expect(vitesseVerticale(110, 100, 700)).toBe(-vitesseDefilement(10))
    expect(vitesseVerticale(690, 100, 700)).toBe(vitesseDefilement(10))
  })

  it('pleine vitesse un peu au-delà des bords, puis plus rien loin dehors (64 px)', () => {
    expect(vitesseVerticale(80, 100, 700)).toBe(-900)
    expect(vitesseVerticale(740, 100, 700)).toBe(900)
    expect(vitesseVerticale(20, 100, 700)).toBe(0)
    expect(vitesseVerticale(800, 100, 700)).toBe(0)
  })
})
