// Grille semaine / jour (spec §9.1, §9.3) : une colonne par jour affiché, axe des heures commun.
// Seuls les jours de `jours` sont rendus. `.grille` publie `data-px-heure`, `data-plage-debut` et `data-plage-fin` ;
// chaque `.colonne[data-jour]` commence à la minute `plage.debut` (voir geometrie.ts).
// Gestes : appui long sur un créneau puis glisser (dnd-kit, délégué au corps de la grille), poignée du bord bas
// (durée), tap sur un emplacement libre (« Pour combler ce trou »), appui long sur un emplacement libre puis
// étirer (indisponibilité). Pendant un glisser, les créneaux poussés s'écartent par `translateY` (aperçu, ressort),
// l'emplacement d'atterrissage se pose dans la colonne visée et celle-ci s'éclaire avec son en-tête (`data-visee`).
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ajouterIndispo } from '../../domain/actions-etat'
import type { Intervalle } from '../../domain/cascade'
import { hm, local, minutesDe } from '../../domain/temps'
import type { Etat } from '../../domain/types'
import { Atterrissage, Eclairage } from '../dnd/Atterrissage'
import { SourceGlisse } from '../dnd/ContexteDnd'
import { apercuColonne, cleColonne, useGlisse, useRedim } from '../dnd/glisse'
import { libelleJourCourt } from '../periode'
import { useStore } from '../store'
import { BlocCreneau, BlocIndispo, heureCourte } from './Bloc'
import { FeuilleIndispo } from './FeuilleIndispo'
import { blocsDesJours, minutesVersY, plageDesJours, PX_HEURE_IPAD, type BlocsDuJour } from './geometrie'
import { useAppuiVide, useRedimension, type Trace } from './gestes'
import { LigneMaintenant } from './LigneMaintenant'
import { useAujourdhui } from './maintenant'

type Props = {
  /** Jours affichés, `YYYY-MM-DD`, dans l'ordre. */
  jours: string[]
  /** Pixels par heure (voir geometrie.ts). */
  pxHeure?: number
  /** Tap sur un emplacement libre : `t` est le début du pas touché (minutes). */
  onTapTrou?: (jour: string, t: number) => void
  /** Tap sur un créneau, sans glisser (fiche : tâche 19). */
  onOuvrirCreneau?: (id: string) => void
  /** Tap sur une indisponibilité (tâche 19). */
  onOuvrirIndispo?: (id: string) => void
}

/** Un bloc ne descend jamais sous cette hauteur (px), même pour une durée très courte. */
const HAUTEUR_MIN_BLOC = 14
const rien = () => {}

/** Rappel stable (référence fixe) qui appelle toujours la dernière version : les blocs mémoïsés n'en souffrent pas. */
function useStable<A extends unknown[]>(f: ((...a: A) => void) | undefined): (...a: A) => void {
  const r = useRef(f)
  r.current = f
  return useCallback((...a: A) => r.current?.(...a), [])
}

/** Le bloc saisi pendant un appui long : un créneau (pas sa poignée), le doigt gardant sa prise dans le bloc. */
function trouverBloc(cible: HTMLElement, e: PointerEvent) {
  if (cible.closest('.poignee-redim')) return null
  const bloc = cible.closest<HTMLElement>('.bloc-creneau[data-creneau]')
  if (!bloc) return null
  return {
    source: { type: 'creneau' as const, id: bloc.dataset.creneau as string },
    prise: e.clientY - bloc.getBoundingClientRect().top,
  }
}

export function Grille({ jours, pxHeure = PX_HEURE_IPAD, onTapTrou, onOuvrirCreneau, onOuvrirIndispo }: Props) {
  const creneaux = useStore((s) => s.etat.creneaux)
  const indispos = useStore((s) => s.etat.indispos)
  const items = useStore((s) => s.etat.items)
  const colleges = useStore((s) => s.etat.colleges)
  const reglages = useStore((s) => s.etat.reglages)
  const aujourdhui = useAujourdhui()
  const glisse = useGlisse((s) => s.source !== null)
  // Jour visé par le glisser : son en-tête passe en gras (la colonne, elle, lit son propre aperçu).
  const jourVise = useGlisse((s) => (s.survol?.type === 'colonne' ? s.survol.cible.jour : null))
  const viseRefuse = useGlisse((s) => s.survol?.type === 'colonne' && s.apercu !== null && !s.apercu.ok)
  // Surligneur du collège de l'item glissé : il teinte la colonne visée et souligne son en-tête. Posé sur ces seuls
  // éléments (et non sur la grille, dont tout le sous-arbre recalculerait son style à la saisie).
  const itemGlisse = useGlisse((s) => s.fantome?.itemId ?? null)
  const teinteVisee = teinteDuCollege(itemGlisse, items, colleges)
  const redim = useRedim((s) => s.id !== null)
  const [trace, setTrace] = useState<Trace | null>(null)

  const cle = jours.join(',')
  const blocs = useMemo(() => blocsDesJours({ creneaux, indispos }, cle.split(',')), [creneaux, indispos, cle])
  const plage = useMemo(() => plageDesJours(reglages, blocs), [reglages, blocs])
  const bornes = useMemo<Intervalle>(
    () => ({ debut: hm(reglages.journee.debut), fin: hm(reglages.journee.fin) }),
    [reglages.journee.debut, reglages.journee.fin],
  )

  const heures: number[] = []
  for (let m = plage.debut; m < plage.fin; m += 60) heures.push(m)
  const hauteurTotale = minutesVersY(plage.fin, plage, pxHeure)

  // À l'ouverture d'une vue, la grille se cale sur la ligne « maintenant » si elle est affichée, sinon
  // sur le haut. Une seule fois par montage : changer de semaine garde la position de défilement.
  const racine = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const defilement = racine.current?.closest<HTMLElement>('.calendrier-defilement')
    const ligne = racine.current?.querySelector<HTMLElement>('.maintenant')
    if (!defilement) return
    // Haut de journée visible tant que « maintenant » tient à l'écran ; sinon « maintenant » au premier tiers.
    const dehors = ligne !== null && ligne !== undefined && ligne.offsetTop > defilement.clientHeight - 2 * pxHeure
    defilement.scrollTop = dehors ? Math.max(0, ligne.offsetTop - defilement.clientHeight / 3) : 0
  }, [pxHeure])

  const tapTrou = useStable(onTapTrou)
  const ouvrirCreneau = useStable(onOuvrirCreneau ?? rien)
  const ouvrirIndispo = useStable(onOuvrirIndispo ?? rien)

  const creerIndispo = (titre: string) => {
    if (!trace) return
    const t = trace
    useStore.getState().appliquer((e) => ajouterIndispo(e, titre, local(t.jour, t.debut), local(t.jour, t.fin)))
    setTrace(null)
  }

  const style = { '--px-heure': `${pxHeure}px`, '--nb-jours': jours.length } as CSSProperties

  return (
    <div
      ref={racine}
      className="grille"
      style={style}
      data-nb-jours={jours.length}
      data-px-heure={pxHeure}
      data-plage-debut={plage.debut}
      data-plage-fin={plage.fin}
      data-glisse={glisse}
      data-redim={redim}
    >
      <div className="grille-tete">
        <div className="grille-coin" />
        {jours.map((j) => {
          const { nom, numero } = libelleJourCourt(j)
          return (
            <div
              key={j}
              className="jour-tete"
              data-aujourdhui={j === aujourdhui}
              data-visee={j === jourVise || undefined}
              data-refus={(j === jourVise && viseRefuse) || undefined}
              style={j === jourVise && teinteVisee ? ({ '--teinte-visee': teinteVisee } as CSSProperties) : undefined}
            >
              <span>{nom}</span>
              <b>{numero}</b>
            </div>
          )
        })}
      </div>

      <SourceGlisse className="grille-corps" style={{ height: hauteurTotale }} trouver={trouverBloc}>
        <div className="heures" aria-hidden="true">
          {heures.map((m) => (
            <span key={m} className="heure" style={{ top: minutesVersY(m, plage, pxHeure) }}>
              {m / 60}h
            </span>
          ))}
        </div>
        {jours.map((j, i) => (
          <ColonneJour
            key={j}
            indice={i}
            jour={j}
            blocs={blocs[j]}
            plage={plage}
            bornes={bornes}
            pxHeure={pxHeure}
            pas={reglages.pas}
            items={items}
            colleges={colleges}
            aujourdhui={j === aujourdhui}
            trace={trace?.jour === j ? trace : null}
            onTrace={setTrace}
            onTapTrou={tapTrou}
            onOuvrirCreneau={ouvrirCreneau}
            onOuvrirIndispo={ouvrirIndispo}
          />
        ))}
      </SourceGlisse>

      {trace?.fini && <FeuilleIndispo trace={trace} onCreer={creerIndispo} onAnnuler={() => setTrace(null)} />}
    </div>
  )
}

type ColonneProps = {
  /** Rang du jour dans la grille (position de la colonne, voir calendrier.css). */
  indice: number
  jour: string
  blocs: BlocsDuJour
  plage: Intervalle
  bornes: Intervalle
  pxHeure: number
  pas: number
  items: Etat['items']
  colleges: Etat['colleges']
  aujourdhui: boolean
  /** Indisponibilité en cours de tracé dans cette colonne. */
  trace: Trace | null
  onTrace: (t: Trace | null) => void
  onTapTrou: (jour: string, t: number) => void
  onOuvrirCreneau: (id: string) => void
  onOuvrirIndispo: (id: string) => void
}

const AUCUN_REDIM = { id: null, duree: 0 }

/** Surligneur (`var(--cN)`) du collège d'un item, `undefined` s'il est inconnu. */
function teinteDuCollege(itemId: string | null | undefined, items: Etat['items'], colleges: Etat['colleges']): string | undefined {
  const collegeId = itemId ? items[itemId]?.collegeId : undefined
  const couleur = collegeId ? colleges[collegeId]?.couleur : undefined
  return couleur === undefined ? undefined : `var(--c${((couleur % 6) + 6) % 6})`
}

const ColonneJour = memo(function ColonneJour({
  indice,
  jour,
  blocs,
  plage,
  bornes,
  pxHeure,
  pas,
  items,
  colleges,
  aujourdhui,
  trace,
  onTrace,
  onTapTrou,
  onOuvrirCreneau,
  onOuvrirIndispo,
}: ColonneProps) {
  // Aperçu du glisser en cours, réduit à ce jour : la colonne ne se redessine que si ce qui la concerne change.
  const cle = useGlisse((s) => cleColonne(s, jour))
  const { idSource, debuts, fantomes, refus, visee } = useMemo(() => apercuColonne(useGlisse.getState(), jour), [cle, jour])
  const teinteVisee = visee ? teinteDuCollege(useGlisse.getState().fantome?.itemId, items, colleges) : undefined
  const redim = useRedim((s) => (s.id !== null && blocs.creneaux.some((c) => c.id === s.id) ? s : AUCUN_REDIM))

  const appuiVide = useAppuiVide(jour, { plage, pxHeure, pas }, onTapTrou, onTrace)
  const redimensionner = useRedimension({ plage, pxHeure, pas })

  const y = (m: number) => minutesVersY(m, plage, pxHeure)
  const hauteurDe = (debut: number, duree: number) =>
    Math.max(HAUTEUR_MIN_BLOC, (Math.min(duree, plage.fin - debut) * pxHeure) / 60)

  // Heures hors des bornes de la journée (réglages) mais dans la plage affichée : grisées.
  const avant = Math.max(0, Math.min(bornes.debut, plage.fin) - plage.debut)
  const apres = Math.max(0, plage.fin - Math.max(bornes.fin, plage.debut))
  return (
    <div
      className="colonne"
      style={{ '--i': indice } as CSSProperties}
      data-jour={jour}
      data-aujourdhui={aujourdhui}
      data-refus={refus || undefined}
      data-visee={visee || undefined}
      onPointerDown={appuiVide}
    >
      <Eclairage visee={visee} teinte={teinteVisee} />
      {avant > 0 && <div className="hors-bornes" style={{ top: 0, height: (avant * pxHeure) / 60 }} />}
      {apres > 0 && <div className="hors-bornes" style={{ bottom: 0, height: (apres * pxHeure) / 60 }} />}

      {blocs.indispos.map(({ indispo, debut, fin }) => {
        const d = Math.max(debut, plage.debut)
        const f = Math.min(fin, plage.fin)
        if (f <= d) return null // entièrement hors de la plage affichée
        return (
          <BlocIndispo
            key={indispo.id}
            indispo={indispo}
            debut={debut}
            fin={fin}
            haut={y(d)}
            hauteur={Math.max(HAUTEUR_MIN_BLOC, ((f - d) * pxHeure) / 60)}
            onOuvrir={onOuvrirIndispo}
          />
        )
      })}

      {blocs.creneaux.map((c) => {
        const debut = minutesDe(c.debut as string)
        const item = items[c.itemId]
        const college = item ? colleges[item.collegeId] : undefined
        const decalage = c.id in debuts ? y(debuts[c.id]) - y(debut) : 0
        const duree = redim.id === c.id ? redim.duree : c.duree
        const hauteur = hauteurDe(debut, duree)
        return (
          <BlocCreneau
            key={c.id}
            creneau={c}
            item={item}
            couleur={college?.couleur ?? 0}
            haut={y(debut)}
            hauteur={hauteur}
            decalage={decalage}
            source={c.id === idSource}
            onOuvrir={onOuvrirCreneau}
          />
        )
      })}

      {/* Poignées du bord bas (durée) : zone tactile de 24 px à cheval sur le bord, trait fin visible. */}
      {blocs.creneaux.map((c) => {
        const debut = minutesDe(c.debut as string)
        const duree = redim.id === c.id ? redim.duree : c.duree
        const bas = y(debut) + hauteurDe(debut, duree)
        const dedans = Math.min(14, hauteurDe(debut, duree) / 2)
        return (
          <div
            key={`p-${c.id}`}
            className="poignee-redim"
            data-poignee={c.id}
            data-active={redim.id === c.id || undefined}
            style={{ top: bas - dedans }}
            aria-hidden="true"
            onPointerDown={(e) => redimensionner(e, c.id, c.duree)}
          />
        )
      })}

      {fantomes.map((f) => {
        const item = items[f.creneau.itemId]
        return (
          <Atterrissage
            key={`f-${f.creneau.id}`}
            cle={f.creneau.id}
            jour={jour}
            debut={f.debut}
            haut={y(f.debut)}
            hauteur={hauteurDe(f.debut, f.creneau.duree)}
            couleur={(item && colleges[item.collegeId]?.couleur) ?? 0}
            refus={f.refus}
            principal={f.principal}
          />
        )
      })}

      {trace && (
        <div className="trace-indispo" style={{ top: y(trace.debut), height: y(trace.fin) - y(trace.debut) }} aria-hidden="true">
          <span className="bloc-meta">
            {heureCourte(trace.debut)}–{heureCourte(trace.fin)}
          </span>
        </div>
      )}

      {aujourdhui && <LigneMaintenant plage={plage} pxHeure={pxHeure} />}
    </div>
  )
})

