import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { jourDe, utcVersLocal } from '../domain/temps'
import { BarreHaut } from './BarreHaut'
import type { Ecran, Vue } from './ecran'
import { EmplacementBibliotheque, EmplacementCalendrier, EmplacementImport, EmplacementRestauration } from './Emplacements'
import { Feuille } from './Feuille'
import { Reglages } from './screens/Reglages'
import { TestExport } from './screens/TestExport'
import { useStore } from './store'
import { Toasts } from './Toast'
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

  const [ecran, setEcran] = useState<Ecran>('calendrier')
  const [vue, setVue] = useState<Vue>(() => (disposition === 'ipad' ? 'semaine' : 'jour'))
  const [panneauOuvert, setPanneauOuvert] = useState(true)
  const [feuilleOuverte, setFeuilleOuverte] = useState(false)
  // Jour affiché par le calendrier (aujourd'hui, en heure de Paris) ; le calendrier le pilotera.
  const [jour] = useState(() => jourDe(utcVersLocal(new Date())))

  const coque = useRef<HTMLDivElement>(null)
  const boutonItems = useRef<HTMLButtonElement>(null)
  const feuilleVisible = feuilleOuverte && disposition === 'iphone'
  const feuilleDejaVue = useRef(false)

  // Pendant que la feuille est ouverte, le reste est inerte (focus et lecteur d'écran) ;
  // à la fermeture, le focus retourne au bouton qui l'a ouverte.
  useEffect(() => {
    const el = coque.current
    if (!el) return
    el.toggleAttribute('inert', feuilleVisible)
    if (feuilleVisible) feuilleDejaVue.current = true
    else if (feuilleDejaVue.current) boutonItems.current?.focus({ preventScroll: true })
    return () => el.removeAttribute('inert')
  }, [feuilleVisible])

  const fermerFeuille = useCallback(() => setFeuilleOuverte(false), [])
  const { annuler, retablir } = useStore.getState()

  return (
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
              <EmplacementBibliotheque />
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
            }}
            ecran={ecran}
            onReglages={() => setEcran((e) => (e === 'reglages' ? 'calendrier' : 'reglages'))}
            peutAnnuler={peutAnnuler}
            peutRetablir={peutRetablir}
            onAnnuler={annuler}
            onRetablir={retablir}
            panneauOuvert={panneauOuvert}
            onItems={() => setPanneauOuvert((o) => !o)}
          />

          {erreur !== null && (
            // Erreur d'écriture (quota…) : reste affichée tant que l'écriture suivante n'a pas réussi.
            // Le bouton « Sauvegarder » de la §14 viendra avec la tâche 19.
            <p className="bandeau-erreur" role="alert">
              {erreur}
            </p>
          )}

          <main className="zone">
            {ecran === 'calendrier' && <EmplacementCalendrier vue={vue} />}
            {ecran === 'reglages' && <Reglages onRetour={() => setEcran('calendrier')} />}
            {ecran === 'import' && <EmplacementImport />}
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

      {feuilleVisible && (
        <Feuille titre="Items" onFermer={fermerFeuille}>
          <EmplacementBibliotheque />
        </Feuille>
      )}
      <Toasts />
    </div>
  )
}
