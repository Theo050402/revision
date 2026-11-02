// Réglages › Durées et Journée (spec §6, §11). Les champs sont des brouillons : rien n'est enregistré tant que
// « Enregistrer » n'est pas pressé, et il reste désactivé tant qu'un champ est invalide. L'enregistrement recalcule
// les créneaux à venir (`appliquerEtRecalculer`).
import { modifierReglages } from '../../../domain/actions-etat'
import type { Reglages } from '../../../domain/types'
import { brutDurees, lireDurees, lireJournee, reglagesPourPas } from '../../../domain/validation'
import { appliquerEtRecalculer } from '../../recalcul'
import { useStore } from '../../store'
import { toast } from '../../Toast'
import { apercuDurees } from '../reglagesLogique'
import { Champ } from './Champ'
import { useBrouillon } from './useBrouillon'


export function Durees() {
  const reglages = useStore((s) => s.etat.reglages)
  const enregistre = brutDurees(reglages)
  // Le pas n'est pas un champ de cette section : le changer ailleurs ne touche pas au brouillon en cours.
  const { brouillon: brut, modifier, reinitialiser, modifie } = useBrouillon(enregistre, JSON.stringify(enregistre))
  const lecture = lireDurees(brut, reglages.pas)
  const erreurs = lecture.ok ? {} : lecture.erreurs

  const maj = (champs: Partial<typeof brut>) => modifier((b) => ({ ...b, ...champs }))
  const majCoef = (i: number, v: string) => modifier((b) => ({ ...b, coefs: b.coefs.map((c, k) => (k === i ? v : c)) }))

  const enregistrer = () => {
    if (!lecture.ok) return
    toast('Durées enregistrées.')
    // Les réglages s'appliquent aussi aux créneaux à venir (ni faits, ni à durée réglée à la main).
    appliquerEtRecalculer((e) => modifierReglages(e, lecture.valeurs))
  }

  return (
    <section className="carte reglage" aria-labelledby="titre-durees">
      <h2 id="titre-durees">Durées</h2>
      <p className="aide">
        À l'enregistrement, les créneaux à venir sont recalculés avec ces valeurs, sauf ceux déjà faits ou dont la
        durée a été réglée à la main.
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
          <button type="button" className="btn-texte" onClick={reinitialiser}>
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
  const enregistre = { debut: reglages.journee.debut, fin: reglages.journee.fin, pas: reglages.pas }
  const { brouillon, modifier, modifie } = useBrouillon(enregistre, JSON.stringify(enregistre))
  const { debut, fin, pas } = brouillon
  const setDebut = (v: string) => modifier((b) => ({ ...b, debut: v }))
  const setFin = (v: string) => modifier((b) => ({ ...b, fin: v }))
  const setPas = (v: Reglages['pas']) => modifier((b) => ({ ...b, pas: v }))

  const lecture = lireJournee(debut, fin)
  const recale = reglagesPourPas(reglages, pas)
  const recalage = pas !== reglages.pas && (recale.dureeMin !== reglages.dureeMin || recale.dureeMax !== reglages.dureeMax)

  const enregistrer = () => {
    if (!lecture.ok) return
    toast('Journée enregistrée.')
    // Seul un changement de pas touche aux durées : les bornes de la journée ne recalculent rien.
    appliquerEtRecalculer(
      (e) => ({ ...e, reglages: { ...reglagesPourPas(e.reglages, pas), journee: lecture.valeurs } }),
      { portee: (avant, apres) => (apres.reglages.pas !== avant.reglages.pas ? {} : null) },
    )
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
