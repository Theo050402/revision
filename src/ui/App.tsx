import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BarreHaut } from './BarreHaut'
import { Calendrier } from './calendrier/Calendrier'
import { useAujourdhui } from './calendrier/maintenant'
import type { Ecran, Vue } from './ecran'
import { Bibliotheque } from './bibliotheque/Bibliotheque'
import { EmplacementRestauration } from './Emplacements'
import { Feuille } from './Feuille'
import { FicheCreneau } from './feuilles/FicheCreneau'
import { FicheIndispo } from './feuilles/FicheIndispo'
import { sauvegarder } from './sauvegarde'
import { fermerImport, useDemandeImport } from './importDemande'
import { Import } from './screens/Import'
import { Reglages } from './screens/Reglages'
import { TestExport } from './screens/TestExport'
import { ContexteDnd } from './dnd/ContexteDnd'
import { useGlisse } from './dnd/glisse'
import { MESSAGE_QUOTA, useStore } from './store'
import { Toasts } from './Toast'
import { choisirTrou } from './trou'
import { useDisposition } from './useDisposition'
import './ui.css'

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const maj = () => setHash(location.hash)
    window.addEventListener('hashchange', maj)
    return () => window.removeEventListener('hashchange', maj)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()
  const pret = useStore((s) => s.pret)
  const erreur = useStore((s) => s.erreur)
  const theme = useStore((s) => s.etat.reglages.theme)

  // Lecture de la base : une seule fois (le ref survit au double montage de StrictMode).
  const demarre = useRef(false)
  useEffect(() => {
    if (demarre.current) return
    demarre.current = true
    void useStore.getState().initialiser()
  }, [])

  // Le thème suit les réglages (les jetons de couleur sont dans theme/tokens.css).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Page de diagnostic de l'export (tâche 12), indépendante de la base.
  if (hash === '#test-export') return <TestExport />
  if (pret) return <Coque />
  if (erreur !== null) return <EcranLectureImpossible message={erreur} />
  return <Chargement />
}

function Chargement() {
  return (
    <div className="plein-ecran" role="status">
      <span className="chargement-trait" aria-hidden="true" />
      <p className="aide">Chargement…</p>
    </div>
  )
}

/** La base n'a pas pu être lue : aucune commande d'édition, rien n'est écrit par-dessus. */
function EcranLectureImpossible({ message }: { message: string }) {
  return (
    <main className="plein-ecran plein-ecran-erreur">
      <h1>Révisions</h1>
      <p className="bandeau-erreur bandeau-seul" role="alert">
        {message}
      </p>
      <p className="aide">Tes données n'ont pas été modifiées.</p>
      <EmplacementRestauration />
    </main>
  )
}

function Coque() {
  const disposition = useDisposition()
  const erreur = useStore((s) => s.erreur)
  const peutAnnuler = useStore((s) => s.passe.length > 0)
  const peutRetablir = useStore((s) => s.futur.length > 0)

  const [ecranChoisi, setEcran] = useState<Ecran>('calendrier')
  // Le parcours d'import peut être ouvert de partout (bibliothèque, Réglages) : il passe avant l'écran choisi.
  const importOuvert = useDemandeImport((s) => s.ouvert)
  const cibleImport = useDemandeImport((s) => s.collegeId)
  const ecran: Ecran = importOuvert ? 'import' : ecranChoisi
  const [vue, setVue] = useState<Vue>(() => (disposition === 'ipad' ? 'semaine' : 'jour'))
  const [panneauOuvert, setPanneauOuvert] = useState(true)
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  // Jour affiché par le calendrier. « Aujourd'hui » est le vrai jour de Paris, rafraîchi chaque minute :
  // si Emma regarde le jour courant quand minuit passe, l'affichage suit.
  const aujourdhui = useAujourdhui()
  const [jour, setJour] = useState(aujourdhui)
  const veille = useRef(aujourdhui)
  useEffect(() => {
    const precedent = veille.current
    veille.current = aujourdhui
    setJour((j) => (j === precedent ? aujourdhui : j))
  }, [aujourdhui])

  // Fiche ouverte par un tap sur un bloc (créneau ou indisponibilité), et récurrence à modifier dans Réglages.
  const [fiche, setFiche] = useState<{ type: 'creneau' | 'indispo'; id: string } | null>(null)
  const [recurrenceCible, setRecurrenceCible] = useState<string | null>(null)
  const ouvrirCreneau = useCallback((id: string) => setFiche({ type: 'creneau', id }), [])
  const ouvrirIndispo = useCallback((id: string) => setFiche({ type: 'indispo', id }), [])
  const fermerFiche = useCallback(() => setFiche(null), [])
  useEffect(() => {
    if (ecran !== 'reglages') setRecurrenceCible(null)
  }, [ecran])

  const coque = useRef<HTMLDivElement>(null)
  const boutonItems = useRef<HTMLButtonElement>(null)
  const feuilleVisible = feuilleOuverte && disposition === 'iphone'
  const feuilleDejaVue = useRef(false)
  const feuilleVisibleRef = useRef(feuilleVisible)
  feuilleVisibleRef.current = feuilleVisible

  // Pendant que la feuille est ouverte, le reste est inerte (focus et lecteur d'écran) ;
  // à la fermeture, le focus retourne au bouton qui l'a ouverte.
  useEffect(() => {
    const el = coque.current
    if (!el) return
    el.toggleAttribute('inert', feuilleVisible)
    if (feuilleVisible) feuilleDejaVue.current = true
    else if (feuilleDejaVue.current && !useDemandeImport.getState().ouvert) boutonItems.current?.focus({ preventScroll: true })
    return () => el.removeAttribute('inert')
  }, [feuilleVisible])

  // Pendant qu'une fiche est ouverte (rendue hors de la coque), le calendrier est inerte ; à la fermeture, le focus
  // retourne au bloc touché s'il existe encore.
  const blocOuvert = useRef<string | null>(null)
  useEffect(() => {
    const el = coque.current
    if (fiche === null) {
      const sel = blocOuvert.current
      blocOuvert.current = null
      if (sel !== null) requestAnimationFrame(() => document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true }))
      return
    }
    blocOuvert.current = `[data-${fiche.type === 'creneau' ? 'creneau' : 'indispo'}="${CSS.escape(fiche.id)}"]`
    el?.setAttribute('inert', '')
    return () => {
      if (!feuilleVisibleRef.current) el?.removeAttribute('inert')
    }
  }, [fiche])

  // L'import commence depuis la feuille de la bibliothèque (iPhone) : elle se ferme pour laisser place à l'écran.
  useEffect(() => {
    if (importOuvert) setFeuilleOuverte(false)
  }, [importOuvert])

  // Glisser une carte depuis la feuille (iPhone) : la feuille s'efface pendant le geste pour découvrir la grille,
  // qui ne doit plus être inerte (sinon elle échappe aussi au repérage de la cible) ; un dépôt réussi la ferme.
  const glisseDepuisFeuille = useGlisse((s) => s.depuisFeuille)
  useEffect(() => {
    const el = coque.current
    if (el && feuilleVisible) el.toggleAttribute('inert', !glisseDepuisFeuille)
  }, [glisseDepuisFeuille, feuilleVisible])
  const apresDepot = useCallback((depuisFeuille: boolean) => {
    if (depuisFeuille) setFeuilleOuverte(false)
  }, [])

  // Tap sur un emplacement libre : « Pour combler ce trou » s'ouvre dans la bibliothèque (panneau ou feuille).
  const tapTrou = useCallback(
    (j: string, t: number) => {
      choisirTrou(j, t)
      if (disposition === 'iphone') setFeuilleOuverte(true)
      else setPanneauOuvert(true)
    },
    [disposition],
  )

  const fermerFeuille = useCallback(() => setFeuilleOuverte(false), [])
  const { annuler, retablir } = useStore.getState()

  return (
    <ContexteDnd onDepose={apresDepot}>
      <div className="racine" data-dispo={disposition}>
        <div
          className="coque"
          ref={coque}
          data-dispo={disposition}
          data-replie={disposition === 'ipad' && !panneauOuvert}
        >
          {disposition === 'ipad' && (
            <aside id="panneau-bibliotheque" className="panneau" aria-label="Bibliothèque d'items">
              <div className="panneau-contenu">
                <h2 className="panneau-titre">Items</h2>
                <Bibliotheque />
              </div>
            </aside>
          )}

          <div className="principal">
            <BarreHaut
              disposition={disposition}
              jour={jour}
              vue={vue}
              onVue={(v) => {
                setVue(v)
                setEcran('calendrier')
                fermerImport()
              }}
              ecran={ecran}
              onReglages={() => {
                fermerImport()
                setEcran(ecran === 'reglages' ? 'calendrier' : 'reglages')
              }}
              peutAnnuler={peutAnnuler}
              peutRetablir={peutRetablir}
              onAnnuler={annuler}
              onRetablir={retablir}
              panneauOuvert={panneauOuvert}
              onItems={() => setPanneauOuvert((o) => !o)}
            />

            {erreur !== null && (
              // Erreur d'écriture (quota…) : reste affichée tant que l'écriture suivante n'a pas réussi.
              <div className="bandeau-erreur bandeau-action" role="alert">
                <p>{erreur}</p>
                {erreur === MESSAGE_QUOTA && (
                  <button type="button" className="btn-principal" onClick={() => void sauvegarder()}>
                    Sauvegarder
                  </button>
                )}
              </div>
            )}

            <main className={ecran === 'calendrier' ? 'zone zone-calendrier' : 'zone'}>
              {ecran === 'calendrier' && (
                <Calendrier
                  vue={vue}
                  jour={jour}
                  disposition={disposition}
                  onJour={setJour}
                  onOuvrirJour={(j) => {
                    setJour(j)
                    setVue('jour')
                  }}
                  onTapTrou={tapTrou}
                  onOuvrirCreneau={ouvrirCreneau}
                  onOuvrirIndispo={ouvrirIndispo}
                />
              )}
              {ecran === 'reglages' && (
                <Reglages onRetour={() => setEcran('calendrier')} recurrenceInitiale={recurrenceCible} />
              )}
              {ecran === 'import' && (
                <Import
                  // Cible différente (nouveau collège ou réimport d'un autre) : l'écran repart de zéro.
                  key={cibleImport ?? 'nouveau'}
                  onTermine={(enregistre) => {
                    fermerImport()
                    if (enregistre) setEcran('calendrier')
                  }}
                />
              )}
            </main>

            {disposition === 'iphone' && (
              <nav className="dock" aria-label="Bibliothèque">
                <button
                  ref={boutonItems}
                  type="button"
                  className="btn-items"
                  aria-haspopup="dialog"
                  aria-expanded={feuilleVisible}
                  onClick={() => setFeuilleOuverte(true)}
                >
                  <svg className="icone" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                    <path d="M4 6h16M4 12h16M4 18h10" />
                  </svg>
                  Items
                </button>
              </nav>
            )}
          </div>
        </div>

        {fiche?.type === 'creneau' && <FicheCreneau key={fiche.id} id={fiche.id} onFermer={fermerFiche} />}
        {fiche?.type === 'indispo' && (
          <FicheIndispo
            key={fiche.id}
            id={fiche.id}
            onFermer={fermerFiche}
            onModifierRecurrence={(rid) => {
              setFiche(null)
              fermerImport()
              setRecurrenceCible(rid)
              setEcran('reglages')
            }}
          />
        )}
        {feuilleVisible && (
          <Feuille titre="Items" onFermer={fermerFeuille} efface={glisseDepuisFeuille}>
            <Bibliotheque />
          </Feuille>
        )}
        <Toasts />
      </div>
    </ContexteDnd>
  )
}
