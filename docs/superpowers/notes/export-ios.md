# Test de l'export .ics sur iPad

Valeur retenue : `MODE_EXPORT` dans `src/ics/mode.ts` (à fixer après le test).

## Procédure

Sur l'iPad d'Emma, avec un calendrier « Test » créé dans l'app Calendrier :

1. Ouvrir `https://theo050402.github.io/revision/#test-export` dans Safari.
2. Faire « Partager › Sur l'écran d'accueil », puis ouvrir l'app depuis l'icône.
3. Essayer les boutons 1 et 2, et noter lequel ouvre l'écran d'import du Calendrier.
4. Après l'import, essayer le bouton 3 et noter si `test-1` est **déplacé** à 11 h ou **dupliqué**.

## Résultats

- Bouton 1 (partage) :
- Bouton 2 (téléchargement) :
- Bouton 4 (Ouvrir dans Safari) :
- Bouton 3 (réexport modifié) : déplacé / dupliqué

## Décision

- `MODE_EXPORT` : `'maj'` si déplacé, `'nouveaux'` si dupliqué.
- Ordre de `livrerIcs` : mettre en premier la méthode qui fonctionne.
- Si aucune méthode ne fonctionne depuis l'écran d'accueil mais que l'une fonctionne dans Safari, l'export passera par le lien « Ouvrir dans Safari ».
