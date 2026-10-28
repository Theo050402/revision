// Écran de vérification (§5.6) : Emma contrôle et corrige les items extraits avant l'enregistrement.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { dureeTour } from '../../domain/duration'
import type { College } from '../../domain/types'
import type { ItemExtrait } from '../../import/catalog'
import { RechercheOfficielle } from '../components/RechercheOfficielle'
import { formaterDuree } from '../duree'
import { useStore } from '../store'

/** Texte de la §14 quand l'extraction ne trouve rien. */
export const MESSAGE_AUCUN_ITEM = 'Aucun item trouvé dans ce PDF. Ajoute-les à la main depuis la liste officielle.'

type Ligne = {
  numero: number
  titre: string
  pageDebut: number
  pages: number
  /** Ce que contient le champ (peut être provisoirement invalide pendant la frappe). */
  saisie: string
  /** Valeur d'origine, pour savoir si Emma a corrigé la ligne. */
  pagesOrigine: number
  aVerifierOrigine: boolean
  raison: string | null
}

const PAGES_VALIDES = /^[1-9]\d{0,3}$/

const enLigne = (x: ItemExtrait): Ligne => ({
  numero: x.numero,
  titre: x.titre,
  pageDebut: x.pageDebut,
  pages: x.pages,
  saisie: String(x.pages),
  pagesOrigine: x.pages,
  aVerifierOrigine: x.aVerifier,
  raison: x.raison,
})

/** Une ligne reste orange tant que ses pages n'ont pas été corrigées : y toucher vaut vérification. */
const aVerifier = (l: Ligne) => l.aVerifierOrigine && l.pages === l.pagesOrigine

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

/** Largeur du bouton « Supprimer » découvert par le glissement. */
const LARGEUR_GLISSEMENT = 96

type PropsLigne = {
  ligne: Ligne
  couleur: number
  duree: string
  ouverte: boolean
  onOuvrir: () => void
  onFermer: () => void
  onPages: (saisie: string) => void
  onPagesFin: () => void
  onSupprimer: () => void
}

function LigneItem({ ligne, couleur, duree, ouverte, onOuvrir, onFermer, onPages, onPagesFin, onSupprimer }: PropsLigne) {
  const [dx, setDx] = useState<number | null>(null)
  const geste = useRef<{ x: number; base: number } | null>(null)
  // Position courante du glissement, lue par fin() : l'état React peut être en retard sur les événements.
  const courant = useRef<number | null>(null)
  const invalide = !PAGES_VALIDES.test(ligne.saisie.trim())
  const orange = aVerifier(ligne)

  function debut(ev: PointerEvent<HTMLDivElement>) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    if ((ev.target as HTMLElement).closest('input,button')) return
    geste.current = { x: ev.clientX, base: ouverte ? -LARGEUR_GLISSEMENT : 0 }
  }
  function bouge(ev: PointerEvent<HTMLDivElement>) {
    const g = geste.current
    if (!g) return
    const delta = ev.clientX - g.x
    if (courant.current === null) {
      if (Math.abs(delta) < 6) return
      ev.currentTarget.setPointerCapture(ev.pointerId)
    }
    courant.current = Math.max(-LARGEUR_GLISSEMENT - 24, Math.min(0, g.base + delta))
    setDx(courant.current)
  }
  function fin() {
    if (geste.current && courant.current !== null) {
      if (courant.current < -LARGEUR_GLISSEMENT / 2) onOuvrir()
      else onFermer()
    }
    geste.current = null
    courant.current = null
    setDx(null)
  }

  const decalage = dx ?? (ouverte ? -LARGEUR_GLISSEMENT : 0)
  return (
    <li className="ligne" data-a-verifier={orange} data-numero={ligne.numero} data-revele={ouverte || dx !== null}>
      <div className="ligne-fond">
        {/* Doublon tactile du bouton « Supprimer » ci-dessous : hors arbre d'accessibilité et de tabulation. */}
        <button type="button" className="ligne-glisse" aria-hidden="true" tabIndex={-1} onClick={onSupprimer}>
          Supprimer
        </button>
      </div>
      <div
        className="ligne-contenu"
        data-glisse={dx !== null}
        style={{ transform: decalage === 0 ? undefined : `translateX(${decalage}px)` }}
        onPointerDown={debut}
        onPointerMove={bouge}
        onPointerUp={fin}
        onPointerCancel={fin}
      >
        <span className={`pastille c${couleur}`} aria-label={`Item ${ligne.numero}`}>
          {ligne.numero}
        </span>
        <div className="ligne-texte">
          <span className="ligne-titre">{ligne.titre}</span>
          {orange && (
            <span className="ligne-raison">
              <svg className="icone" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="M12 4 3 20h18L12 4Z" />
                <path d="M12 10v4.5M12 17.2v.1" />
              </svg>
              À vérifier : {ligne.raison}
            </span>
          )}
        </div>
        <div className="ligne-mesures">
          <label className="ligne-pages">
            <input
              className="champ"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label={`Pages de l'item ${ligne.numero}`}
              aria-invalid={invalide}
              value={ligne.saisie}
              onChange={(e) => onPages(e.target.value)}
              onBlur={onPagesFin}
              onFocus={(e) => e.target.select()}
            />
            <span aria-hidden="true">p.</span>
          </label>
          <span className="ligne-duree" data-duree={invalide ? '' : duree}>
            <span className="sr-only">Durée du 1er tour : </span>
            {invalide ? '—' : duree}
          </span>
        </div>
        <button type="button" className="btn-icone ligne-supprimer" aria-label={`Supprimer l'item ${ligne.numero}`} onClick={onSupprimer}>
          <Icone>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7" />
          </Icone>
        </button>
      </div>
    </li>
  )
}

type Props = {
  items: ItemExtrait[]
  nomInitial: string
  /** Collège réimporté (§5.7) ; `null` pour un nouveau collège. */
  college: College | null
  /** Couleur de la pastille : celle du collège (réimport) ou celle que recevra le nouveau collège. */
  couleur: number
  onAnnuler: () => void
  onValider: (nom: string, items: ItemExtrait[]) => void
}

export function Verification({ items, nomInitial, college, couleur, onAnnuler, onValider }: Props) {
  const reglages = useStore((s) => s.etat.reglages)
  const [nom, setNom] = useState(nomInitial)
  const [lignes, setLignes] = useState<Ligne[]>(() => items.map(enLigne))
  const [ouverte, setOuverte] = useState<number | null>(null)
  const [recherche, setRecherche] = useState(false)
  const [annonce, setAnnonce] = useState('')

  const contenu = useRef<HTMLDivElement>(null)
  const boutonAjout = useRef<HTMLButtonElement>(null)
  const liste = useRef<HTMLUListElement>(null)
  const dernierAjout = useRef<number | null>(null)

  // Pendant la recherche (feuille modale), le reste de l'écran est inerte ; le focus revient au bouton.
  const rechercheVue = useRef(false)
  useEffect(() => {
    const el = contenu.current
    if (!el) return
    el.toggleAttribute('inert', recherche)
    if (recherche) rechercheVue.current = true
    else if (rechercheVue.current) boutonAjout.current?.focus({ preventScroll: true })
    return () => el.removeAttribute('inert')
  }, [recherche])

  // Une ligne ajoutée à la main apparaît en bas de liste : on l'amène à l'écran.
  useEffect(() => {
    if (dernierAjout.current === null) return
    liste.current?.querySelector(`[data-numero="${dernierAjout.current}"]`)?.scrollIntoView({ block: 'nearest' })
    dernierAjout.current = null
  }, [lignes])

  const coef = college?.coefficient ?? 1
  const duree = (pages: number) => formaterDuree(dureeTour(pages, coef, 1, reglages))
  const saisiesValides = lignes.every((l) => PAGES_VALIDES.test(l.saisie.trim()))
  const nomValide = college !== null || nom.trim() !== ''
  const peutValider = lignes.length > 0 && saisiesValides && nomValide
  const vide = lignes.length === 0
  const totalPages = lignes.reduce((n, l) => n + l.pages, 0)
  const nbAVerifier = lignes.filter(aVerifier).length

  function modifierPages(numero: number, saisie: string) {
    setLignes((ls) =>
      ls.map((l) => {
        if (l.numero !== numero) return l
        const pages = PAGES_VALIDES.test(saisie.trim()) ? Number(saisie.trim()) : l.pages
        return { ...l, saisie, pages }
      }),
    )
  }
  function finSaisie(numero: number) {
    // À la sortie du champ, une saisie invalide revient à la dernière valeur valable.
    setLignes((ls) => ls.map((l) => (l.numero === numero ? { ...l, saisie: String(l.pages) } : l)))
  }
  function supprimer(numero: number) {
    setLignes((ls) => ls.filter((l) => l.numero !== numero))
    setOuverte(null)
    setAnnonce(`Item ${numero} retiré de la liste`)
    liste.current?.focus()
  }
  function ajouter(numero: number, titre: string, pages: number) {
    // Item ajouté à la main : page de début inconnue (0), aucune anomalie à signaler.
    setLignes((ls) =>
      ls.some((l) => l.numero === numero)
        ? ls
        : [...ls, enLigne({ numero, titre, pageDebut: 0, pages, aVerifier: false, raison: null })],
    )
    dernierAjout.current = numero
    setRecherche(false)
    setAnnonce(`Item ${numero} ajouté`)
  }
  function valider() {
    if (!peutValider) return
    onValider(
      nom.trim(),
      lignes.map((l) => ({
        numero: l.numero,
        titre: l.titre,
        pageDebut: l.pageDebut,
        pages: l.pages,
        aVerifier: aVerifier(l),
        raison: aVerifier(l) ? l.raison : null,
      })),
    )
  }

  return (
    <section className="verif" aria-labelledby="titre-verif">
      <div className="verif-contenu" ref={contenu}>
        <header className="verif-entete">
          <h1 id="titre-verif">{college ? 'Réimporter le collège' : 'Vérifier les items'}</h1>
          {college ? (
            <p className="aide">
              <strong>{college.nom}</strong> : les items sont remplacés par numéro. Les créneaux existants restent liés.
            </p>
          ) : (
            <div className="verif-nom">
              <label className="etiquette" htmlFor="nom-college">
                Nom du collège
              </label>
              <div className="verif-nom-champ">
                <span className="pastille-nom" style={{ background: `var(--c${couleur})` }} aria-hidden="true" />
                <input
                  id="nom-college"
                  className="champ"
                  value={nom}
                  autoComplete="off"
                  aria-invalid={!nomValide}
                  onChange={(e) => setNom(e.target.value)}
                />
              </div>
            </div>
          )}
          {!vide && (
            <p className="aide verif-resume" role="status">
              {lignes.length} {lignes.length > 1 ? 'items' : 'item'} · {totalPages} {totalPages > 1 ? 'pages' : 'page'}
              {nbAVerifier > 0 && ` · ${nbAVerifier} à vérifier`}
            </p>
          )}
        </header>

        {vide && (
          <p className="verif-vide" role="status">
            {MESSAGE_AUCUN_ITEM}
          </p>
        )}

        <ul className="lignes" ref={liste} tabIndex={-1} aria-label="Items extraits" hidden={vide}>
          {lignes.map((l) => (
            <LigneItem
              key={l.numero}
              ligne={l}
              couleur={couleur}
              duree={duree(l.pages)}
              ouverte={ouverte === l.numero}
              onOuvrir={() => setOuverte(l.numero)}
              onFermer={() => setOuverte((o) => (o === l.numero ? null : o))}
              onPages={(s) => modifierPages(l.numero, s)}
              onPagesFin={() => finSaisie(l.numero)}
              onSupprimer={() => supprimer(l.numero)}
            />
          ))}
        </ul>

        <button
          ref={boutonAjout}
          type="button"
          className={vide ? 'btn-principal verif-ajout verif-ajout-vide' : 'btn-ajout verif-ajout'}
          aria-haspopup="dialog"
          onClick={() => setRecherche(true)}
        >
          + Ajouter un item
        </button>

        <p className="sr-only" role="status">
          {annonce}
        </p>

        <footer className="verif-pied">
          <button type="button" className="btn-texte" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="button" className="btn-principal" disabled={!peutValider} onClick={valider}>
            Valider
          </button>
        </footer>
      </div>

      {recherche && (
        <RechercheOfficielle
          dejaPris={new Set(lignes.map((l) => l.numero))}
          couleur={couleur}
          onAjouter={ajouter}
          onFermer={() => setRecherche(false)}
        />
      )}
    </section>
  )
}
