import { afterEach, describe, expect, it, vi } from 'vitest'
import { DUREE_TREMBLEMENT_MS, trembler } from '../../src/ui/trembler'

/** Élément minimal : seules `classList` et `offsetWidth` servent. */
function element(): HTMLElement {
  const classes = new Set<string>()
  return {
    offsetWidth: 0,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
  } as unknown as HTMLElement
}

describe('trembler', () => {
  afterEach(() => vi.useRealTimers())

  it('ajoute .tremble puis la retire après 200 ms', () => {
    vi.useFakeTimers()
    const el = element()
    trembler(el)
    expect(el.classList.contains('tremble')).toBe(true)
    vi.advanceTimersByTime(DUREE_TREMBLEMENT_MS - 1)
    expect(el.classList.contains('tremble')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(el.classList.contains('tremble')).toBe(false)
  })

  it('un second appel dans les 200 ms ré-arme la minuterie (la première ne le coupe pas)', () => {
    vi.useFakeTimers()
    const el = element()
    trembler(el)
    vi.advanceTimersByTime(150)
    trembler(el)
    vi.advanceTimersByTime(100) // 250 ms après le premier appel
    expect(el.classList.contains('tremble')).toBe(true)
    vi.advanceTimersByTime(100)
    expect(el.classList.contains('tremble')).toBe(false)
  })
})
