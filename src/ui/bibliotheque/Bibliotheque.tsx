// Bibliothèque d'items (spec §8) : progression, bac « À placer », recherche, filtres, suggestions et liste.
// Dans le panneau de gauche (iPad) ou la feuille du bas (iPhone). Les cartes sont sélectionnables ;
// le glisser-déposer (tâche 18) lira la sélection par `onSelectionChange` et l'attribut `data-item-id`.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { libelleHeure } from '../../domain/actions-creneaux'
import { dernierTourParItem, etatToursParItem, progression, type EtatTour } from '../../domain/tours'
import type { Item } from '../../domain/types'
import { useAujourdhui } from '../calendrier/maintenant'
import { formaterDuree } from '../duree'
import { ouvrirImport, useDemandeImport } from '../importDemande'
import { useStore } from '../store'
import { effacerTrou, useTrou } from '../trou'
import { useDisposition } from '../useDisposition'
import { CarteItem } from './CarteItem'
import { FicheItem } from './FicheItem'
import { libelleQuand } from './libelles'
import { FILTRES_VIDES, filtrer, type EtatFiltre, type Filtres, type Longueur } from './recherche'
import { aPlanifier, dureeProchainTour, pourCombler, trouLibre } from './suggestions'
import './bibliotheque.css'

/** Nombre maximal de cartes sous « Pour combler ce trou ». */
const MAX_COMBLER = 8

const ETATS: { valeur: EtatFiltre; libelle: string }[] = [
  { valeur: 'nonvu', libelle: 'Non vus' },
  { valeur: 1, libelle: 'T1' },
  { valeur: 2, libelle: 'T2' },
  { valeur: 3, libelle: 'T3 et plus' },
]
const LONGUEURS: { valeur: Longueur; libelle: string }[] = [
  { valeur: 'court', libelle: 'Court < 10 p' },
  { valeur: 'moyen', libelle: 'Moyen 10–20 p' },
  { valeur: 'long', libelle: 'Long > 20 p' },
]

const parNumero = (a: Item, b: Item): number => a.numero - b.numero || a.collegeId.localeCompare(b.collegeId)
const teinteDe = (couleur: number): string => `var(--c${((couleur % 6) + 6) % 6})`

function basculer<T>(liste: T[], v: T): T[] {
  return liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]
}

type Props = {
  /** Reçoit les identifiants des items cochés (pour le glisser-déposer groupé, tâche 18). */
  onSelectionChange?: (itemIds: string[]) => void
}

export function Bibliotheque({ onSelectionChange }: Props) {
  const etat = useStore((s) => s.etat)
  const disposition = useDisposition()
  const aujourdhui = useAujourdhui()
  // Un seul import à la fois : pendant qu'il est ouvert, un second lancerait une autre cible sur l'état en cours.
  const importOuvert = useDemandeImport((s) => s.ouvert)
  const trou = useTrou((s) => s.trou)

  const [requete, setRequete] = useState('')
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [plusFiltres, setPlusFiltres] = useState(false)
  const [parCollege, setParCollege] = useState(true)
  const [replies, setReplies] = useState<Set<string>>(new Set())
  const [modeSelection, setModeSelection] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [ficheId, setFicheId] = useState<string | null>(null)
  const dernierOuvert = useRef<string | null>(null)

  useEffect(() => {
    onSelectionChange?.([...selection])
  }, [selection, onSelectionChange])

  // Une sélection ne survit pas à un item disparu (réimport).
  useEffect(() => {
    setSelection((s) => {
      const reste = [...s].filter((id) => etat.items[id])
      return reste.length === s.size ? s : new Set(reste)
    })
  }, [etat.items])

  const creneaux = useMemo(() => Object.values(etat.creneaux), [etat.creneaux])

  // Tours, prochain tour et durée de chaque item : une seule passe sur les créneaux par rendu.
  const vues = useMemo(() => {
    const tours = etatToursParItem(creneaux)
    const derniers = dernierTourParItem(creneaux)
    const m = new Map<string, { etats: EtatTour[]; meta: string }>()
    for (const it of Object.values(etat.items)) {
      const prochain = (derniers.get(it.id) ?? 0) + 1
      const duree = formaterDuree(dureeProchainTour(etat, it, derniers))
      m.set(it.id, {
        etats: tours.get(it.id) ?? [],
        meta: `${it.pages} p · ${prochain > 1 ? `T${prochain} ` : ''}${duree}`,
      })
    }
    return m
  }, [etat, creneaux])

  const progres = useMemo(() => progression(etat), [etat])
  const colleges = useMemo(
    () =>
      Object.values(etat.colleges).sort(
        (a, b) => a.importeLe.localeCompare(b.importeLe) || a.nom.localeCompare(b.nom, 'fr'),
      ),
    [etat.colleges],
  )
  const tous = useMemo(
    () => Object.values(etat.items).filter((i) => etat.colleges[i.collegeId]).sort(parNumero),
    [etat.items, etat.colleges],
  )
  const actif = requete.trim() !== '' || filtres.colleges.length + filtres.etats.length + filtres.longueurs.length > 0
  const visibles = useMemo(() => filtrer(tous, requete, filtres, etat), [tous, requete, filtres, etat])

  const bac = useMemo(
    () =>
      creneaux
        .filter((c) => c.debut === null && etat.items[c.itemId])
        .sort(
          (a, b) =>
            etat.items[a.itemId].numero - etat.items[b.itemId].numero ||
            a.tour - b.tour ||
            (a.partie?.i ?? 0) - (b.partie?.i ?? 0),
        ),
    [creneaux, etat.items],
  )
  const suivants = useMemo(() => aPlanifier(etat), [etat])
  const combler = useMemo(() => (trou ? pourCombler(etat, trou.jour, trou.t).slice(0, MAX_COMBLER) : []), [etat, trou])

  const ouvrir = useCallback((id: string) => {
    dernierOuvert.current = id
    setFicheId(id)
  }, [])
  const basculerSelection = useCallback(
    (id: string) =>
      setSelection((s) => {
        const n = new Set(s)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      }),
    [],
  )

  // Retour de la fiche : le focus retourne à la carte ouverte.
  const etaitFiche = useRef(false)
  useEffect(() => {
    if (ficheId === null && etaitFiche.current && dernierOuvert.current) {
      const sel = `.bibliotheque [data-item-id="${CSS.escape(dernierOuvert.current)}"] .carte-corps`
      document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true })
    }
    etaitFiche.current = ficheId !== null
  }, [ficheId])

  if (ficheId !== null) {
    return (
      <div className="bibliotheque">
        <FicheItem
          itemId={ficheId}
          etat={etat}
          disposition={disposition}
          jourParDefaut={aujourdhui}
          onRetour={() => setFicheId(null)}
        />
      </div>
    )
  }

  const carte = (it: Item, extra?: { creneauId?: string; meta?: string }) => {
    const v = vues.get(it.id)
    return (
      <CarteItem
        key={extra?.creneauId ?? it.id}
        item={it}
        couleur={etat.colleges[it.collegeId]?.couleur ?? 0}
        meta={extra?.meta ?? v?.meta ?? ''}
        etats={v?.etats ?? []}
        modeSelection={modeSelection}
        selectionnee={selection.has(it.id)}
        onBasculer={basculerSelection}
        onOuvrir={ouvrir}
        creneauId={extra?.creneauId}
      />
    )
  }

  const pct = Math.round((progres.vus / progres.total) * 100)

  return (
    <div className="bibliotheque">
      <button type="button" className="btn-ajout" disabled={importOuvert} onClick={() => ouvrirImport()}>
        + Collège
      </button>

      <div className="bib-progres">
        <svg className="bib-anneau" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true" focusable="false">
          <circle className="bib-anneau-fond" cx="24" cy="24" r="20" pathLength="100" />
          <circle
            className="bib-anneau-trait"
            cx="24"
            cy="24"
            r="20"
            pathLength="100"
            strokeDasharray={`${pct} ${100 - pct}`}
            transform="rotate(-90 24 24)"
          />
          <text x="24" y="28" textAnchor="middle">
            {pct}%
          </text>
        </svg>
        <div>
          <b className="bib-progres-nombre" data-testid="progression">
            {progres.vus} / {progres.total} items
          </b>
          <small>vus au 1er tour</small>
        </div>
      </div>

      {bac.length > 0 && (
        <section className="bib-section bib-bac" aria-labelledby="bib-bac-titre">
          <h3 id="bib-bac-titre" className="bib-titre">
            À placer{' '}
            <span className="bib-badge" data-testid="badge-bac">
              {bac.length}
            </span>
          </h3>
          <div className="bib-cartes">
            {bac.map((c) => {
              const quand = libelleQuand({ ...c, debut: null }).replace(' · À placer', '')
              return carte(etat.items[c.itemId], { creneauId: c.id, meta: `${quand} · ${formaterDuree(c.duree)}` })
            })}
          </div>
        </section>
      )}

      {colleges.length === 0 ? (
        <p className="aide bib-vide">Aucun collège pour l'instant. Importe un livre avec « + Collège ».</p>
      ) : (
        <>
          <div className="bib-recherche">
            <input
              type="search"
              value={requete}
              onChange={(ev) => setRequete(ev.target.value)}
              placeholder="Rechercher un n° ou un mot…"
              aria-label="Rechercher un item par numéro ou par mot"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="bib-filtres">
            <div className="bib-chips" role="group" aria-label="Filtrer par collège">
              {colleges.map((c) => (
                <Pastille
                  key={c.id}
                  actif={filtres.colleges.includes(c.id)}
                  onClick={() => setFiltres((f) => ({ ...f, colleges: basculer(f.colleges, c.id) }))}
                >
                  <i className="bib-point" style={{ background: teinteDe(c.couleur) }} aria-hidden="true" />
                  {c.nom}
                </Pastille>
              ))}
            </div>
            <button
              type="button"
              className="btn-texte bib-plus"
              aria-expanded={plusFiltres}
              onClick={() => setPlusFiltres((p) => !p)}
            >
              Plus de filtres{filtres.etats.length + filtres.longueurs.length > 0 && ` · ${filtres.etats.length + filtres.longueurs.length}`}
            </button>
            {plusFiltres && (
              <>
                <div className="bib-chips" role="group" aria-label="Filtrer par état">
                  {ETATS.map((x) => (
                    <Pastille
                      key={String(x.valeur)}
                      actif={filtres.etats.includes(x.valeur)}
                      onClick={() => setFiltres((f) => ({ ...f, etats: basculer(f.etats, x.valeur) }))}
                    >
                      {x.libelle}
                    </Pastille>
                  ))}
                </div>
                <div className="bib-chips" role="group" aria-label="Filtrer par longueur">
                  {LONGUEURS.map((x) => (
                    <Pastille
                      key={x.valeur}
                      actif={filtres.longueurs.includes(x.valeur)}
                      onClick={() => setFiltres((f) => ({ ...f, longueurs: basculer(f.longueurs, x.valeur) }))}
                    >
                      {x.libelle}
                    </Pastille>
                  ))}
                </div>
              </>
            )}
            {actif && (
              <button
                type="button"
                className="btn-texte bib-effacer"
                onClick={() => {
                  setRequete('')
                  setFiltres(FILTRES_VIDES)
                }}
              >
                Effacer la recherche et les filtres
              </button>
            )}
          </div>

          {trou && (
            <section className="bib-section" aria-labelledby="bib-trou-titre">
              <div className="bib-titre-ligne">
                <h3 id="bib-trou-titre" className="bib-titre">
                  Pour combler ce trou
                </h3>
                <button type="button" className="btn-texte bib-petit" onClick={effacerTrou}>
                  Effacer
                </button>
              </div>
              <p className="aide bib-sous">{libelleTrou(trou.jour, trou.t, trouLibre(etat, trou.jour, trou.t))}</p>
              {combler.length === 0 ? (
                <p className="aide">Aucun item ne tient dans ce trou.</p>
              ) : (
                <div className="bib-cartes" data-testid="combler">
                  {combler.map((it) => carte(it))}
                </div>
              )}
            </section>
          )}

          {!actif && suivants.length > 0 && (
            <section className="bib-section" aria-labelledby="bib-suivants-titre">
              <h3 id="bib-suivants-titre" className="bib-titre">
                À planifier ensuite
              </h3>
              <div className="bib-cartes" data-testid="suivants">
                {suivants.map((it) => carte(it))}
              </div>
            </section>
          )}

          <section className="bib-section" aria-label="Tous les items">
            <div className="segments bib-segments" role="group" aria-label="Organisation de la liste">
              <button type="button" className="segment" aria-pressed={parCollege} onClick={() => setParCollege(true)}>
                Par collège
              </button>
              <button type="button" className="segment" aria-pressed={!parCollege} onClick={() => setParCollege(false)}>
                Par numéro
              </button>
            </div>
            <div className="bib-titre-ligne">
              <p className="aide bib-compte" role="status">
                {visibles.length} {visibles.length > 1 ? 'items' : 'item'}
                {selection.size > 0 && ` · ${selection.size} sélectionné${selection.size > 1 ? 's' : ''}`}
              </p>
              <button
                type="button"
                className="btn-texte bib-petit"
                aria-pressed={modeSelection}
                onClick={() => {
                  setModeSelection((m) => !m)
                  setSelection(new Set())
                }}
              >
                {modeSelection ? 'Terminer' : 'Sélectionner'}
              </button>
            </div>
            {visibles.length === 0 ? (
              <p className="aide">Aucun item ne correspond.</p>
            ) : parCollege ? (
              colleges.map((c) => {
                const items = visibles.filter((i) => i.collegeId === c.id)
                if (items.length === 0) return null
                // Une recherche ou un filtre actif déplie tout : on ne cache pas un résultat dans un collège replié.
                const ouvert = actif || !replies.has(c.id)
                return (
                  <div className="bib-groupe" key={c.id} data-college={c.id}>
                    <button
                      type="button"
                      className="bib-groupe-tete"
                      aria-expanded={ouvert}
                      onClick={() =>
                        setReplies((s) => {
                          const n = new Set(s)
                          if (n.has(c.id)) n.delete(c.id)
                          else n.add(c.id)
                          return n
                        })
                      }
                    >
                      <svg className="icone bib-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                      <i className="bib-point" style={{ background: teinteDe(c.couleur) }} aria-hidden="true" />
                      <span className="bib-groupe-nom">{c.nom}</span>
                      <span className="bib-groupe-n">{items.length}</span>
                    </button>
                    {ouvert && <div className="bib-cartes">{items.map((it) => carte(it))}</div>}
                  </div>
                )
              })
            ) : (
              <div className="bib-cartes">{visibles.map((it) => carte(it))}</div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="bib-pastille" aria-pressed={actif} onClick={onClick}>
      {children}
    </button>
  )
}

const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** « mer. 4 nov. à 14h · 2h libres ». */
function libelleTrou(jour: string, t: number, libre: number): string {
  const [a, m, j] = jour.split('-').map(Number)
  const quand = `${fmtJour.format(new Date(Date.UTC(a, m - 1, j)))} à ${libelleHeure(t)}`
  return libre > 0 ? `${quand} · ${formaterDuree(libre)} libres` : `${quand} · emplacement occupé`
}
