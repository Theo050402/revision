# Test de l'export .ics sur iPad

Valeur retenue : `MODE_EXPORT` dans `src/ics/mode.ts` (à fixer après le test).

## Procédure

Sur l'iPad d'Emma, avec un calendrier « Test » créé dans l'app Calendrier :

1. Ouvrir `https://theo050402.github.io/revision/#test-export` dans Safari.
2. Faire « Partager › Sur l'écran d'accueil », puis ouvrir l'app depuis l'icône.
3. Essayer les boutons 1 et 2, et noter lequel ouvre l'écran d'import du Calendrier.
4. Après l'import, essayer le bouton 3 et noter si `test-1` est **déplacé** à 11 h ou **dupliqué**.

## Résultats

Test sur iPad le 28/10/2026.

- Bouton 1 (partage) : la feuille de partage n'offre pas Calendrier, inutilisable.
- Bouton 2 (téléchargement) : ouvre l'écran d'import natif du Calendrier, événements ajoutés correctement (« Tout ajouter » fonctionne pour les nouveaux événements).
- Bouton 4 (Ouvrir dans Safari) : résultat non noté, sans objet puisque le téléchargement fonctionne.
- Bouton 3 (réexport modifié, en téléchargement) : mise à jour sans doublon (même `UID`, `SEQUENCE` plus élevée), mais iOS demande de valider chaque mise à jour une par une ; « Tout ajouter » ne fonctionne pas pour les mises à jour.

## Décision

- Livraison par téléchargement (`livrerIcs` : téléchargement par défaut, partage seulement si forcé).
- Deux fichiers distincts : `revisions-nouveaux.ics` (« Tout ajouter » dans Calendrier) et `revisions-modifies.ics` (mise à jour une par une). Un troisième, `revisions-tout.ics`, sert au planning complet.
- Pas de `MODE_EXPORT` : les mises à jour fonctionnent (pas de doublon), donc le module `src/ics/mode.ts` est supprimé. Au-delà de 10 créneaux modifiés, la feuille propose en plus « Tout réexporter » : supprimer le calendrier « Révisions » dans Calendrier, le recréer, puis exporter tout le planning.
