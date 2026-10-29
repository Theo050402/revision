import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { filtrerPointeurs, pointeurOccupe, saisirPointeur } from '../../src/ui/dnd/glisse'

// Environnement node : `window` est simulé par un EventTarget ; les événements de pointeur par des Event portant
// `pointerId`.
const globale = globalThis as unknown as { window?: EventTarget }
let retirer: () => void = () => {}

function pointeur(type: string, pointerId: number): Event {
  return Object.assign(new Event(type, { cancelable: true }), { pointerId })
}

/** Envoie l'événement et dit s'il a atteint un écouteur posé après le filtre. */
function atteint(e: Event): boolean {
  let vu = false
  const ecouteur = () => {
    vu = true
  }
  window.addEventListener(e.type, ecouteur)
  window.dispatchEvent(e)
  window.removeEventListener(e.type, ecouteur)
  return vu
}

describe('un seul pointeur par geste', () => {
  beforeAll(() => {
    globale.window = new EventTarget()
    retirer = filtrerPointeurs()
  })
  afterEach(() => saisirPointeur(null))
  afterAll(() => {
    retirer()
    delete globale.window
  })

  it('pendant un geste, les autres pointeurs sont arrêtés', () => {
    saisirPointeur(7)
    expect(atteint(pointeur('pointermove', 9))).toBe(false)
    expect(atteint(pointeur('pointerup', 9))).toBe(false)
    expect(pointeurOccupe()).toBe(true)
    expect(atteint(pointeur('pointermove', 7))).toBe(true)
  })

  it('filet de sécurité : le pointeur saisi se lève, il est libéré (et l’événement passe)', () => {
    saisirPointeur(7)
    expect(atteint(pointeur('pointerup', 7))).toBe(true)
    expect(pointeurOccupe()).toBe(false)
    // Plus rien n'est filtré ensuite.
    expect(atteint(pointeur('pointermove', 9))).toBe(true)
  })

  it('filet de sécurité : pointercancel du pointeur saisi le libère aussi', () => {
    saisirPointeur(3)
    window.dispatchEvent(pointeur('pointercancel', 3))
    expect(pointeurOccupe()).toBe(false)
  })

  it('sans geste, rien n’est filtré', () => {
    expect(atteint(pointeur('pointerup', 9))).toBe(true)
  })
})
