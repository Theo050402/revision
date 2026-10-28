// « + Ajouter un item » (§5.6) : recherche dans la liste officielle, puis saisie du nombre de pages.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { chercherOfficiels, type Officiel } from '../../import/recherche'
import { Feuille } from '../Feuille'

const MAX_RESULTATS = 60

type Props = {
  /** Numéros déjà dans la liste : proposés grisés, non sélectionnables. */
  dejaPris: ReadonlySet<number>
  /** Couleur du collège (0..5) pour les pastilles. */
  couleur: number
  onAjouter: (numero: number, titre: string, pages: number) => void
  onFermer: () => void
}

export function RechercheOfficielle({ dejaPris, couleur, onAjouter, onFermer }: Props) {
  const [saisie, setSaisie] = useState('')
  const differee = useDeferredValue(saisie)
  const [choix, setChoix] = useState<Officiel | null>(null)
  const [pages, setPages] = useState('')
  const champ = useRef<HTMLInputElement>(null)

  const resultats = useMemo(() => chercherOfficiels(differee), [differee])

  // Le champ actif change d'une étape à l'autre : le focus le suit (le clavier reste ouvert).
  useEffect(() => {
    champ.current?.focus()
  }, [choix])

  const pagesValides = /^[1-9]\d{0,3}$/.test(pages.trim())

  function valider(ev: FormEvent) {
    ev.preventDefault()
    if (choix && pagesValides) onAjouter(choix.numero, choix.titre, Number(pages.trim()))
  }

  return (
    <Feuille titre="Ajouter un item" onFermer={onFermer} className="feuille-etroite">
      {choix === null ? (
        <div className="recherche">
          <input
            ref={champ}
            type="search"
            className="champ"
            aria-label="Rechercher un item"
            placeholder="Numéro ou mot du titre"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <p className="aide recherche-compte" role="status">
            {resultats.length === 0
              ? 'Aucun item ne correspond.'
              : resultats.length > MAX_RESULTATS
                ? `${resultats.length} items : précise ta recherche pour voir les suivants.`
                : `${resultats.length} ${resultats.length > 1 ? 'items' : 'item'}`}
          </p>
          <ul className="recherche-liste" aria-label="Items de la liste officielle">
            {resultats.slice(0, MAX_RESULTATS).map((o) => {
              const pris = dejaPris.has(o.numero)
              return (
                <li key={o.numero}>
                  <button type="button" className="recherche-ligne" disabled={pris} onClick={() => setChoix(o)}>
                    <span className={`pastille c${couleur}`}>{o.numero}</span>
                    <span className="recherche-titre">{o.titre}</span>
                    {pris && <span className="recherche-pris">déjà dans la liste</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <form className="recherche-pages" onSubmit={valider}>
          <div className="recherche-choisi">
            <span className={`pastille c${couleur}`}>{choix.numero}</span>
            <span className="recherche-titre">{choix.titre}</span>
          </div>
          <label className="etiquette" htmlFor="recherche-pages">
            Nombre de pages
          </label>
          <input
            id="recherche-pages"
            ref={champ}
            className="champ champ-pages"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            autoComplete="off"
            value={pages}
            aria-invalid={pages !== '' && !pagesValides}
            onChange={(e) => setPages(e.target.value)}
          />
          <div className="recherche-actions">
            <button type="button" className="btn-texte" onClick={() => setChoix(null)}>
              Changer d'item
            </button>
            <button type="submit" className="btn-principal" disabled={!pagesValides}>
              Ajouter
            </button>
          </div>
        </form>
      )}
    </Feuille>
  )
}
