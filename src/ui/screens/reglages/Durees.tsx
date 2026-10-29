// Réglages › Durées et Journée (spec §6, §11). Les champs sont des brouillons : rien n'est enregistré tant que
// « Enregistrer » n'est pas pressé, et il reste désactivé tant qu'un champ est invalide. Les créneaux existants
// gardent leur durée : seuls les prochains dépôts utilisent les nouvelles valeurs.
import { useState } from 'react'
import { modifierReglages } from '../../../domain/actions-etat'
import type { Reglages } from '../../../domain/types'
import { brutDurees, lireDurees, lireJournee, reglagesPourPas } from '../../../domain/validation'
import { useStore } from '../../store'
import { toast } from '../../Toast'
import { apercuDurees } from '../reglagesLogique'
import { Champ } from './Champ'

/** Le brouillon repart des valeurs enregistrées quand elles changent (restauration, nouveau pas) : voir la clé. */
export const cleDurees = (r: Reglages): string =>
  JSON.stringify([r.rythme, r.dureeMin, r.dureeMax, r.coefsTours, r.pauseMultiple, r.pas])
export const cleJournee = (r: Reglages): string => JSON.stringify([r.journee, r.pas, r.dureeMin, r.dureeMax])

export function Durees() {
  const reglages = useStore((s) => s.etat.reglages)
  const enregistre = brutDurees(reglages)
  const [brut, setBrut] = useState(enregistre)
  const lecture = lireDurees(brut, reglages.pas)
  const erreurs = lecture.ok ? {} : lecture.erreurs
  const modifie = JSON.stringify(brut) !== JSON.stringify(enregistre)

  const maj = (champs: Partial<typeof brut>) => setBrut((b) => ({ ...b, ...champs }))
  const majCoef = (i: number, v: string) => setBrut((b) => ({ ...b, coefs: b.coefs.map((c, k) => (k === i ? v : c)) }))

  const enregistrer = () => {
    if (!lecture.ok) return
    useStore.getState().appliquerSansHistorique((e) => modifierReglages(e, lecture.valeurs))
    toast('Durées enregistrées.')
  }

  return (
    <section className="carte reglage" aria-labelledby="titre-durees">
      <h2 id="titre-durees">Durées</h2>
      <p className="aide">
        Seuls les prochains créneaux déposés utilisent ces valeurs : les créneaux existants gardent leur durée.
      </p>

      <fieldset className="groupe">
        <legend className="etiquette">Rythme</legend>
        <div className="rythme">
          <Champ etiquette="Minutes du rythme" masquee invalide={erreurs.minutes !== undefined} value={brut.minutes} onChange={(v) => maj({ minutes: v })} />
          <span className="suffixe">min pour</span>
          <Champ etiquette="Pages du rythme" masquee invalide={erreurs.pages !== undefined} value={brut.pages} onChange={(v) => maj({ pages: v })} />
          <span className="suffixe">pages</span>
        </div>
        {(erreurs.minutes || erreurs.pages) && <p className="message-erreur">{erreurs.minutes ?? erreurs.pages}</p>}
      </fieldset>

      <div className="grille-champs">
        <Champ
          etiquette="Durée minimale"
          suffixe="min"
          value={brut.dureeMin}
          onChange={(v) => maj({ dureeMin: v })}
          erreur={erreurs.dureeMin}
        />
        <Champ
          etiquette="Durée maximale"
          suffixe="min"
          value={brut.dureeMax}
          onChange={(v) => maj({ dureeMax: v })}
          erreur={erreurs.dureeMax}
        />
        <Champ
          etiquette="Pause du dépôt multiple"
          suffixe="min"
          value={brut.pause}
          onChange={(v) => maj({ pause: v })}
          erreur={erreurs.pause}
        />
      </div>

      <fieldset className="groupe">
        <legend className="etiquette">Coefficients des tours</legend>
        <p className="aide">Le dernier s'applique aussi aux tours suivants.</p>
        <div className="grille-champs">
          {brut.coefs.map((c, i) => (
            <Champ
              key={i}
              etiquette={`Tour ${i + 1}`}
              suffixe="%"
              decimal
              value={c}
              onChange={(v) => majCoef(i, v)}
              erreur={erreurs[`coef${i}`]}
            />
          ))}
        </div>
        {erreurs.coefs && <p className="message-erreur">{erreurs.coefs}</p>}
        <div className="rangee-boutons">
          <button
            type="button"
            className="btn-ajout"
            onClick={() => maj({ coefs: [...brut.coefs, brut.coefs[brut.coefs.length - 1] ?? '25'] })}
          >
            + Tour
          </button>
          <button
            type="button"
            className="btn-texte"
            disabled={brut.coefs.length === 0}
            onClick={() => maj({ coefs: brut.coefs.slice(0, -1) })}
          >
            Retirer le dernier
          </button>
        </div>
      </fieldset>

      <p className="apercu" aria-live="polite" data-testid="apercu-durees">
        {lecture.ok
          ? apercuDurees({ ...reglages, ...lecture.valeurs })
          : "Corrige les champs signalés pour voir l'aperçu."}
      </p>

      <div className="rangee-boutons">
        <button type="button" className="btn-principal" disabled={!lecture.ok || !modifie} onClick={enregistrer}>
          Enregistrer les durées
        </button>
        {modifie && (
          <button type="button" className="btn-texte" onClick={() => setBrut(enregistre)}>
            Annuler
          </button>
        )}
      </div>
    </section>
  )
}

const PAS: ReadonlyArray<Reglages['pas']> = [5, 10, 15]

export function Journee() {
  const reglages = useStore((s) => s.etat.reglages)
  const [debut, setDebut] = useState(reglages.journee.debut)
  const [fin, setFin] = useState(reglages.journee.fin)
  const [pas, setPas] = useState<Reglages['pas']>(reglages.pas)

  const lecture = lireJournee(debut, fin)
  const modifie = debut !== reglages.journee.debut || fin !== reglages.journee.fin || pas !== reglages.pas
  const recale = reglagesPourPas(reglages, pas)
  const recalage = pas !== reglages.pas && (recale.dureeMin !== reglages.dureeMin || recale.dureeMax !== reglages.dureeMax)

  const enregistrer = () => {
    if (!lecture.ok) return
    useStore.getState().appliquerSansHistorique((e) => ({
      ...e,
      reglages: { ...reglagesPourPas(e.reglages, pas), journee: lecture.valeurs },
    }))
    toast('Journée enregistrée.')
  }

  return (
    <section className="carte reglage" aria-labelledby="titre-journee">
      <h2 id="titre-journee">Journée</h2>
      <p className="aide">Le calendrier grise ce qui est hors de ces bornes.</p>

      <div className="grille-champs">
        <Champ etiquette="Début de journée" type="time" value={debut} onChange={setDebut} />
        <Champ etiquette="Fin de journée" type="time" value={fin} onChange={setFin} />
      </div>
      {!lecture.ok && <p className="message-erreur">{lecture.erreur}</p>}

      <div className="groupe" role="group" aria-labelledby="titre-pas">
        <span id="titre-pas" className="etiquette">
          Pas de la grille
        </span>
        <div className="segments">
          {PAS.map((p) => (
            <button key={p} type="button" className="segment" aria-pressed={pas === p} onClick={() => setPas(p)}>
              {p} min
            </button>
          ))}
        </div>
        {recalage && (
          <p className="aide">
            Les durées minimale et maximale passeront à {recale.dureeMin} et {recale.dureeMax} min, pour rester sur la
            grille.
          </p>
        )}
      </div>

      <div className="rangee-boutons">
        <button type="button" className="btn-principal" disabled={!lecture.ok || !modifie} onClick={enregistrer}>
          Enregistrer la journée
        </button>
      </div>
    </section>
  )
}
