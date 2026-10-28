import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DUREE_TOAST_MS, toast, useToasts } from '../../src/ui/Toast'

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToasts.setState({ liste: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('affiche le message puis le retire seul', () => {
    toast('Fait')
    expect(useToasts.getState().liste.map((t) => t.texte)).toEqual(['Fait'])
    vi.advanceTimersByTime(DUREE_TOAST_MS - 1)
    expect(useToasts.getState().liste).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToasts.getState().liste).toHaveLength(0)
  })

  it('garde au plus 3 messages, les plus récents', () => {
    for (const t of ['a', 'b', 'c', 'd']) toast(t)
    expect(useToasts.getState().liste.map((t) => t.texte)).toEqual(['b', 'c', 'd'])
  })
})
