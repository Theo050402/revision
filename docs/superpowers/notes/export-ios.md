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
- Bouton 2 (téléchargement) : ouvre l'écran d'import natif du Calendrier, événements ajoutés correctement.
- Bouton 4 (Ouvrir dans Safari) :
- Bouton 3 (réexport modifié) : à retester en téléchargement (mise à jour ou doublon ?).

## Décision

- Livraison par téléchargement (`livrerIcs` : téléchargement par défaut, partage seulement si forcé).
- `MODE_EXPORT` : en attente du retest du bouton 3 (`'maj'` si déplacé, `'nouveaux'` si dupliqué).
