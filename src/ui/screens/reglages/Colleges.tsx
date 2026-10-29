// Réglages › Collèges (spec §11) : renommer, couleur, coefficient, réimporter, supprimer (avec confirmation ;
// supprime aussi ses créneaux). Hors historique d'annulation (spec §9.6) : les modifications sont immédiates.
import { useEffect, useState, type CSSProperties } from 'react'
import { modifierCollege, supprimerCollege } from '../../../domain/actions-etat'
import type { College } from '../../../domain/types'
import { lireCoefficient } from '../../../domain/validation'
import { FeuilleConfirmation } from '../../feuilles/FeuilleConfirmation'
import { ouvrirImport, useDemandeImport } from '../../importDemande'
import { useStore } from '../../store'
import { toast } from '../../Toast'
import { Champ } from './Champ'

const COULEURS = ['jaune', 'rose', 'vert', 'orange', 'bleu', 'violet']

const enTexte = (c: number): string => String(c).replace('.', ',')

export function Colleges() {
  const colleges = useStore((s) => s.etat.colleges)
  const liste = Object.values(colleges).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  return (
    <section className="carte reglage" aria-labelledby="titre-colleges">
      <h2 id="titre-colleges">Collèges</h2>
      {liste.length === 0 ? (
        <p className="aide">Aucun collège pour l'instant : importe-en un depuis la bibliothèque (« + Collège »).</p>
      ) : (
        <ul className="liste-reglage liste-colleges">
          {liste.map((c) => (
            <LigneCollege key={c.id} college={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function LigneCollege({ college }: { college: College }) {
  const importOuvert = useDemandeImport((s) => s.ouvert)
  const nbCreneaux = useStore(
    (s) => Object.values(s.etat.creneaux).filter((c) => c.itemId.startsWith(`${college.id}:`)).length,
  )
  const [nom, setNom] = useState(college.nom)
  const [coef, setCoef] = useState(enTexte(college.coefficient))
  const [confirmer, setConfirmer] = useState(false)
  // Un changement venu d'ailleurs (restauration) remplace le brouillon.
  useEffect(() => setNom(college.nom), [college.nom])
  useEffect(() => setCoef(enTexte(college.coefficient)), [college.coefficient])

  const appliquer = useStore.getState().appliquerSansHistorique
  const nomValide = nom.trim() !== ''
  const coefLu = lireCoefficient(coef)

  const validerNom = () => {
    if (nomValide && nom.trim() !== college.nom) appliquer((e) => modifierCollege(e, college.id, { nom: nom.trim() }))
  }
  const validerCoef = () => {
    if (coefLu !== null && coefLu !== college.coefficient) appliquer((e) => modifierCollege(e, college.id, { coefficient: coefLu }))
  }

  const supprimer = () => {
    // Supprimer un collège vide l'historique : annuler ne doit jamais ressusciter ses créneaux.
    appliquer((e) => supprimerCollege(e, college.id), { viderHistorique: true })
    setConfirmer(false)
    toast(`Collège « ${college.nom} » supprimé.`)
  }

  return (
    <li className="ligne-college" data-college={college.id}>
      <div className="college-haut">
        <Champ
          etiquette="Nom du collège"
          value={nom}
          onChange={setNom}
          onBlur={validerNom}
          erreur={nomValide ? undefined : 'Donne un nom.'}
        />
        <Champ
          etiquette="Coefficient"
          decimal
          value={coef}
          onChange={setCoef}
          onBlur={validerCoef}
          erreur={coefLu === null ? 'Entre 0,1 et 5.' : undefined}
        />
      </div>

      <div className="groupe" role="group" aria-label={`Couleur de ${college.nom}`}>
        <div className="pastilles">
          {COULEURS.map((nomCouleur, i) => (
            <button
              key={nomCouleur}
              type="button"
              className="pastille-couleur"
              style={{ '--teinte': `var(--c${i})` } as CSSProperties}
              aria-label={nomCouleur}
              aria-pressed={college.couleur === i}
              onClick={() => appliquer((e) => modifierCollege(e, college.id, { couleur: i }))}
            />
          ))}
        </div>
      </div>

      <div className="rangee-boutons">
        <button
          type="button"
          className="btn-ajout"
          disabled={importOuvert}
          aria-label={`Réimporter ${college.nom}`}
          onClick={() => ouvrirImport(college.id)}
        >
          Réimporter
        </button>
        <button
          type="button"
          className="btn-texte btn-danger-texte"
          aria-label={`Supprimer ${college.nom}`}
          onClick={() => setConfirmer(true)}
        >
          Supprimer
        </button>
      </div>

      {confirmer && (
        <FeuilleConfirmation
          titre={`Supprimer « ${college.nom} » ?`}
          confirmer="Supprimer"
          onConfirmer={supprimer}
          onAnnuler={() => setConfirmer(false)}
        >
          {nbCreneaux === 0
            ? "Ce collège et ses items seront supprimés. Aucun créneau n'est planifié pour lui."
            : nbCreneaux === 1
              ? 'Ce collège, ses items et son créneau planifié seront supprimés. Cette action ne peut pas être annulée.'
              : `Ce collège, ses items et ses ${nbCreneaux} créneaux seront supprimés. Cette action ne peut pas être annulée.`}
        </FeuilleConfirmation>
      )}
    </li>
  )
}
