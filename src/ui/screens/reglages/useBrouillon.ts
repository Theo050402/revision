// Brouillon d'une section de Réglages. Il repart des valeurs enregistrées quand CELLES-CI changent et que la section
// n'a pas de saisie en cours : enregistrer une autre section ne remonte jamais celle-ci (ni brouillon ni focus perdus).
import { useState } from 'react'

const memes = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

type Interne<T> = { brouillon: T; base: T; cle: string }

/**
 * @param enregistre valeurs actuellement enregistrées de la section
 * @param cle identifie ces valeurs (ex. `JSON.stringify` des seuls champs de la section)
 * @returns le brouillon, son modificateur, et s'il diffère de ce qui est enregistré
 */
export function useBrouillon<T>(enregistre: T, cle: string) {
  const [interne, setInterne] = useState<Interne<T>>({ brouillon: enregistre, base: enregistre, cle })

  let courant = interne
  if (interne.cle !== cle) {
    // Ajustement pendant le rendu : les valeurs enregistrées ont changé (restauration, autre section, annulation).
    const propre = memes(interne.brouillon, interne.base)
    courant = { brouillon: propre ? enregistre : interne.brouillon, base: enregistre, cle }
    setInterne(courant)
  }

  const modifier = (f: (b: T) => T) => setInterne((i) => ({ ...i, brouillon: f(i.brouillon) }))
  const reinitialiser = () => setInterne((i) => ({ ...i, brouillon: enregistre }))
  return { brouillon: courant.brouillon, modifier, reinitialiser, modifie: !memes(courant.brouillon, enregistre) }
}
