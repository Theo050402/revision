// Grille semaine / jour (spec §9.1) : une colonne par jour affiché, axe des heures commun.
// Seuls les jours de `jours` sont rendus. Pour le glisser-déposer (tâche 18) : `.grille` publie
// `data-px-heure`, `data-plage-debut` et `data-plage-fin` ; chaque `.colonne[data-jour]` commence à la
// minute `plage.debut` (voir geometrie.ts).
import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { Intervalle } from '../../domain/cascade'
import { hm, minutesDe } from '../../domain/temps'
import type { Etat } from '../../domain/types'
import { libelleJourCourt } from '../periode'
import { useStore } from '../store'
import { BlocCreneau, BlocIndispo } from './Bloc'
import { blocsDesJours, minutesVersY, plageDesJours, PX_HEURE_IPAD, type BlocsDuJour } from './geometrie'
import { LigneMaintenant } from './LigneMaintenant'
import { useAujourdhui } from './maintenant'

type Props = {
  /** Jours affichés, `YYYY-MM-DD`, dans l'ordre. */
  jours: string[]
  /** Pixels par heure (voir geometrie.ts). */
  pxHeure?: number
}

/** Un bloc ne descend jamais sous cette hauteur (px), même pour une durée très courte. */
const HAUTEUR_MIN_BLOC = 14

export function Grille({ jours, pxHeure = PX_HEURE_IPAD }: Props) {
  const creneaux = useStore((s) => s.etat.creneaux)
  const indispos = useStore((s) => s.etat.indispos)
  const items = useStore((s) => s.etat.items)
  const colleges = useStore((s) => s.etat.colleges)
  const reglages = useStore((s) => s.etat.reglages)
  const aujourdhui = useAujourdhui()

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
    >
      <div className="grille-tete">
        <div className="grille-coin" />
        {jours.map((j) => {
          const { nom, numero } = libelleJourCourt(j)
          return (
            <div key={j} className="jour-tete" data-aujourdhui={j === aujourdhui}>
              <span>{nom}</span>
              <b>{numero}</b>
            </div>
          )
        })}
      </div>

      <div className="grille-corps" style={{ height: hauteurTotale }}>
        <div className="heures" aria-hidden="true">
          {heures.map((m) => (
            <span key={m} className="heure" style={{ top: minutesVersY(m, plage, pxHeure) }}>
              {m / 60}h
            </span>
          ))}
        </div>
        {jours.map((j) => (
          <ColonneJour
            key={j}
            jour={j}
            blocs={blocs[j]}
            plage={plage}
            bornes={bornes}
            pxHeure={pxHeure}
            items={items}
            colleges={colleges}
            aujourdhui={j === aujourdhui}
          />
        ))}
      </div>
    </div>
  )
}

type ColonneProps = {
  jour: string
  blocs: BlocsDuJour
  plage: Intervalle
  bornes: Intervalle
  pxHeure: number
  items: Etat['items']
  colleges: Etat['colleges']
  aujourdhui: boolean
}

const ColonneJour = memo(function ColonneJour({
  jour,
  blocs,
  plage,
  bornes,
  pxHeure,
  items,
  colleges,
  aujourdhui,
}: ColonneProps) {
  // Heures hors des bornes de la journée (réglages) mais dans la plage affichée : grisées.
  const avant = Math.max(0, Math.min(bornes.debut, plage.fin) - plage.debut)
  const apres = Math.max(0, plage.fin - Math.max(bornes.fin, plage.debut))
  return (
    <div className="colonne" data-jour={jour} data-aujourdhui={aujourdhui}>
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
            haut={minutesVersY(d, plage, pxHeure)}
            hauteur={Math.max(HAUTEUR_MIN_BLOC, ((f - d) * pxHeure) / 60)}
          />
        )
      })}

      {blocs.creneaux.map((c) => {
        const debut = minutesDe(c.debut as string)
        const item = items[c.itemId]
        const college = item ? colleges[item.collegeId] : undefined
        return (
          <BlocCreneau
            key={c.id}
            creneau={c}
            item={item}
            couleur={college?.couleur ?? 0}
            haut={minutesVersY(debut, plage, pxHeure)}
            hauteur={Math.max(HAUTEUR_MIN_BLOC, (Math.min(c.duree, plage.fin - debut) * pxHeure) / 60)}
          />
        )
      })}

      {aujourdhui && <LigneMaintenant plage={plage} pxHeure={pxHeure} />}
    </div>
  )
})
