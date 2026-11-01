import { describe, expect, test, vi } from 'vitest'
import { rechargerSiAuRepos, type DepsMiseAJour } from '../../src/pwa/miseAJour'

function deps(p: Partial<DepsMiseAJour> = {}): DepsMiseAJour & { recharger: ReturnType<typeof vi.fn> } {
  return {
    feuilleOuverte: () => false,
    importOuvert: () => false,
    attendreEcritures: async () => {},
    recharger: vi.fn(),
    ...p,
  } as DepsMiseAJour & { recharger: ReturnType<typeof vi.fn> }
}

describe('rechargerSiAuRepos', () => {
  test('au repos : attend les écritures puis recharge', async () => {
    const ordre: string[] = []
    const d = deps({
      attendreEcritures: async () => {
        ordre.push('écritures')
      },
      recharger: vi.fn(() => ordre.push('recharge')),
    })
    expect(await rechargerSiAuRepos(d)).toBe(true)
    expect(ordre).toEqual(['écritures', 'recharge'])
  })

  test('une feuille ouverte : pas de rechargement, les écritures ne sont même pas attendues', async () => {
    const attendre = vi.fn(async () => {})
    const d = deps({ feuilleOuverte: () => true, attendreEcritures: attendre })
    expect(await rechargerSiAuRepos(d)).toBe(false)
    expect(d.recharger).not.toHaveBeenCalled()
    expect(attendre).not.toHaveBeenCalled()
  })

  test('un import ouvert ou en cours : pas de rechargement', async () => {
    const d = deps({ importOuvert: () => true })
    expect(await rechargerSiAuRepos(d)).toBe(false)
    expect(d.recharger).not.toHaveBeenCalled()
  })

  test("une feuille ouverte pendant l'attente des écritures annule le rechargement", async () => {
    let feuille = false
    const d = deps({
      feuilleOuverte: () => feuille,
      attendreEcritures: async () => {
        feuille = true
      },
    })
    expect(await rechargerSiAuRepos(d)).toBe(false)
    expect(d.recharger).not.toHaveBeenCalled()
  })
})
