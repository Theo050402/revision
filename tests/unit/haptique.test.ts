import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Noeud = {
  tag: string
  attrs: Record<string, string>
  style: Record<string, string>
  enfants: Noeud[]
  clics: number
  isConnected: boolean
  setAttribute(k: string, v: string): void
  appendChild(n: Noeud): Noeud
  click(): void
}

function noeud(tag: string): Noeud {
  const n: Noeud = {
    tag,
    attrs: {},
    style: {},
    enfants: [],
    clics: 0,
    isConnected: tag === 'body',
    setAttribute(k, v) {
      n.attrs[k] = v
    },
    appendChild(e) {
      n.enfants.push(e)
      e.isConnected = n.isConnected
      return e
    },
    click() {
      n.clics++
    },
  }
  return n
}

/** Document minimal : `createElement` et `body.appendChild` suffisent. */
function documentSimule() {
  const crees: Noeud[] = []
  const body = noeud('body')
  return {
    crees,
    body,
    createElement: (tag: string) => {
      const n = noeud(tag)
      crees.push(n)
      return n
    },
  }
}

/** Module neuf à chaque test : l'interrupteur caché est mémorisé au niveau du module. */
async function charger() {
  vi.resetModules()
  return (await import('../../src/ui/mouvement/haptique')).haptique
}

describe('haptique : navigator.vibrate', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['leger', 10],
    ['succes', [10, 40, 10]],
    ['erreur', [20, 60, 20]],
  ] as const)('%s → vibrate(%j)', async (motif, attendu) => {
    const vibrate = vi.fn(() => true)
    const doc = documentSimule()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('document', doc)
    const haptique = await charger()
    haptique(motif)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(attendu)
    expect(doc.crees).toHaveLength(0) // aucun interrupteur quand vibrate existe
  })

  it("n'élève aucune exception si vibrate échoue", async () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('refusé')
      },
    })
    vi.stubGlobal('document', documentSimule())
    const haptique = await charger()
    expect(() => haptique('succes')).not.toThrow()
  })
})

describe("haptique : interrupteur caché (iOS)", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function installer() {
    const doc = documentSimule()
    vi.stubGlobal('navigator', {}) // pas de vibrate : Safari iPhone
    vi.stubGlobal('document', doc)
    return doc
  }

  it('crée un <label> aria-hidden, hors écran, qui enveloppe <input type="checkbox" switch>', async () => {
    const doc = installer()
    const haptique = await charger()
    haptique('leger')
    const label = doc.crees.find((n) => n.tag === 'label')
    const input = doc.crees.find((n) => n.tag === 'input')
    expect(label).toBeDefined()
    expect(input).toBeDefined()
    expect(label!.attrs['aria-hidden']).toBe('true')
    expect(input!.attrs.type).toBe('checkbox')
    expect(input!.attrs).toHaveProperty('switch')
    expect(input!.attrs.tabindex).toBe('-1')
    expect(label!.enfants).toContain(input)
    expect(doc.body.enfants).toContain(label)
    expect(label!.style.position).toBe('fixed')
    expect(parseInt(label!.style.left, 10)).toBeLessThan(-1000)
    expect(label!.style.pointerEvents).toBe('none')
  })

  it('léger : une seule bascule', async () => {
    const doc = installer()
    const haptique = await charger()
    haptique('leger')
    vi.advanceTimersByTime(500)
    expect(doc.crees.find((n) => n.tag === 'label')!.clics).toBe(1)
  })

  it.each(['succes', 'erreur'] as const)('%s : deux bascules à 60 ms d’écart', async (motif) => {
    const doc = installer()
    const haptique = await charger()
    haptique(motif)
    const label = doc.crees.find((n) => n.tag === 'label')!
    expect(label.clics).toBe(1)
    vi.advanceTimersByTime(59)
    expect(label.clics).toBe(1)
    vi.advanceTimersByTime(1)
    expect(label.clics).toBe(2)
    vi.advanceTimersByTime(500)
    expect(label.clics).toBe(2)
  })

  it("crée l'interrupteur une seule fois et le réutilise", async () => {
    const doc = installer()
    const haptique = await charger()
    haptique('leger')
    haptique('succes')
    haptique('erreur')
    vi.advanceTimersByTime(500)
    expect(doc.crees.filter((n) => n.tag === 'label')).toHaveLength(1)
    expect(doc.crees.filter((n) => n.tag === 'input')).toHaveLength(1)
    expect(doc.body.enfants).toHaveLength(1)
    expect(doc.crees.find((n) => n.tag === 'label')!.clics).toBe(1 + 2 + 2)
  })

  it("recrée l'interrupteur s'il a été retiré du document", async () => {
    const doc = installer()
    const haptique = await charger()
    haptique('leger')
    const premier = doc.crees.find((n) => n.tag === 'label')!
    premier.isConnected = false // retiré (re-rendu de body, test…)
    haptique('leger')
    const labels = doc.crees.filter((n) => n.tag === 'label')
    expect(labels).toHaveLength(2)
    expect(labels[1].isConnected).toBe(true)
    expect(labels[1].clics).toBe(1)
    expect(premier.clics).toBe(1)
  })

  it('ne lève jamais, même sans document ni navigator', async () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('document', undefined)
    const haptique = await charger()
    expect(() => haptique('leger')).not.toThrow()
    expect(() => haptique('erreur')).not.toThrow()
    vi.advanceTimersByTime(500)
  })

  it('ne lève pas si la bascule échoue', async () => {
    const doc = installer()
    doc.createElement = (tag: string) => {
      const n = noeud(tag)
      n.click = () => {
        throw new Error('boom')
      }
      return n
    }
    const haptique = await charger()
    expect(() => haptique('succes')).not.toThrow()
    expect(() => vi.advanceTimersByTime(500)).not.toThrow()
  })
})
