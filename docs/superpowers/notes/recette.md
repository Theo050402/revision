# Recette (tâche 21)

Deux parties : les contrôles automatiques (faits, avec les chiffres) et la recette sur les appareils d'Emma (à cocher, résultats à remplir).

## 1. Contrôles de qualité automatiques

Faits le 01/11/2026 sur la branche `feat/app`, build de production (`npm run build`).

### Poids

- JavaScript initial : `dist/assets/index-*.js`, 438,2 Ko brut, **140,1 Ko gzip** (138,3 Ko avec `gzip -9`) pour un plafond de 250 Ko. `registerSW.js` : 0,15 Ko.
- pdf.js reste hors du chunk d'entrée : `pdf.worker-*.js` (432 Ko) et `pdf.worker.min-*.mjs` (1,26 Mo) sont chargés à la demande, au premier import d'un PDF.
- CSS : 49,3 Ko brut, 9,6 Ko gzip. Polices auto-hébergées, aucune requête réseau à l'exécution.
- Précache du service worker : 25 entrées, 2,3 Mo (dont pdf.js, pour que l'import marche hors ligne).

### Contraste (WCAG, seuil 4,5:1)

Calculé par `node scripts/contraste.mjs` (code de sortie non nul au moindre échec ; l'opacité du bas du dégradé se passe en argument).

| Couple | Rapport |
|---|---|
| Encre `#1E2A5A` sur jaune `#FFE45C` | 10,76 |
| sur rose `#FF9AC8` | 6,98 |
| sur vert `#94E08F` | 8,68 |
| sur orange `#FFB25C` | 7,68 |
| sur bleu `#7FD3FF` | 8,26 |
| sur violet `#C6A6FF` | 6,71 (le plus faible) |
| Bas du dégradé (surligneur à 0,6 sur `#FCFCFA`), jaune / rose / vert / orange / bleu / violet | 11,65 / 9,05 / 10,29 / 9,56 / 9,99 / 8,96 |
| Sombre : `#E6E6FA` sur la carte `#33264A` | 11,25 |
| Sombre : `#E6E6FA` sur le fond `#2B1E3E` | 12,57 |

Tout passe, **aucune couleur modifiée** : l'opacité minimale du dégradé (`--bloc-a2: 60%`) reste à 0,6, qui éclaircit le fond du bloc et améliore même le rapport.

À titre indicatif (hors seuil demandé), le texte secondaire `--muted` : `#6B7493` sur `#FCFCFA` 4,50 (limite), sur la carte blanche 4,62, **sur un champ `#F1F4F9` 4,19** ; `#A99BC4` en sombre 5,39 sur la carte, 6,02 sur le fond. Seul le texte secondaire posé sur un champ clair est sous 4,5 ; à reprendre si Emma le trouve pâle.

### Accessibilité (tests e2e, `tests/e2e/accessibilite.spec.ts`, iPad et iPhone)

- **Cibles tactiles ≥ 44 px** : balayage de tous les boutons, champs, cases et liens visibles du calendrier (Semaine, Jour, Mois), de la barre du haut, de la bibliothèque (liste, filtres dépliés, mode sélection, fiche d'un item, « Planifier… » sur iPhone), de la fiche d'un créneau, de la feuille d'export, des réglages et du choix du PDF d'import. La taille prise en compte est celle de la mise en page, agrandie de la zone de toucher prolongée par un `::after`. Aucun écart.
  - Exception assumée : la **poignée de durée** d'un bloc (`.poignee-redim`) fait 24 px de haut, car un bloc de 30 min n'en fait que 24 ; c'est un geste de glissé, pas un bouton.
- **Focus visible** : 40 appuis sur Tab depuis le calendrier ; chaque contrôle atteint correspond à `:focus-visible` et a un contour d'au moins 2 px (jeton : 3 px, décalé de 2 px).
- **`prefers-reduced-motion`** : avec `reducedMotion: 'reduce'`, les blocs, boutons et l'anneau de progression ont des durées de transition et d'animation nulles ; un bloc poussé par la prévisualisation de cascade (`translateY`) n'a aucune transition ni animation en cours, et la feuille « Items » de l'iPhone apparaît sans animation. Le même bloc a bien une transition sans le réglage (la vérification n'est donc pas vide).

### Parcours complet (tests e2e, `tests/e2e/parcours.spec.ts`, iPad et iPhone)

Import d'un PDF fabriqué (4 items) → validation → 3 items posés l'après-midi du mercredi 4 nov. (iPad : glisser-déposer ; iPhone : « Planifier… », bibliothèque en feuille, vue Jour par défaut) → un créneau marqué « Fait » → « Ajouter au Calendrier » (fichier `revisions-nouveaux.ics`, 3 événements) → rechargement : les 3 créneaux, leurs heures et durées, le « Fait », le badge d'export à 0 et l'anneau de progression (1 / 367 items) sont conservés.

## 2. Recette sur les appareils (à faire avec Emma)

Renseigner le résultat de chaque ligne (OK / KO / remarque). Appareil : iPad ☐ iPhone ☐ — iOS : ________ — Date : ________

### Installation et hors ligne

- [ ] Ouvrir `https://theo050402.github.io/revision/` dans Safari, puis « Partager › Sur l'écran d'accueil » (iPad, puis iPhone). Résultat : ________
- [ ] L'icône et le nom « Révisions » s'affichent ; l'app s'ouvre en plein écran, sans barre de Safari. Résultat : ________
- [ ] Mode avion activé, fermer l'app puis la rouvrir depuis l'écran d'accueil : elle s'ouvre et les données (collèges, créneaux) sont là. Résultat : ________
- [ ] Toujours en mode avion : ajouter un créneau, fermer, rouvrir : il est conservé. Résultat : ________

### Import d'un vrai collège

- [ ] « + Collège », choisir le vrai PDF d'un collège (Fichiers ou iCloud Drive) : la barre d'analyse avance, puis l'écran « Vérifier les items » s'ouvre. Résultat : ________
- [ ] Les items et leurs numéros sont ceux du sommaire ; les lignes orange (à vérifier) sont bien celles qui sont douteuses. Résultat : ________
- [ ] Corriger un nombre de pages au clavier numérique : la durée se met à jour. Valider : le collège apparaît dans la bibliothèque. Résultat : ________

### Glisser au doigt (iPad)

- [ ] Appui long (environ 150 ms) sur une carte puis glisser vers la grille : la carte se détache, la grille ne défile pas. Résultat : ________
- [ ] **Pas de sélection de texte ni de loupe/menu « Copier » pendant l'appui long** (cartes, blocs, grille). Résultat : ________
- [ ] Un créneau posé sur un autre : l'aperçu de cascade (blocs repoussés) correspond exactement à ce qui se passe au lâcher. Résultat : ________
- [ ] Déposer sur « Stage » ou une indisponibilité : la colonne tremble, rien ne change. Résultat : ________
- [ ] Poignée de durée au bord bas d'un bloc : tirer change la durée par pas de 15 min. Résultat : ________
- [ ] Glisser un bloc vers la corbeille : il disparaît ; ↶ Annuler le ramène. Résultat : ________
- [ ] **Poser un second doigt pendant un glisser ne casse rien** (le geste continue, ou s'annule proprement, sans bloc fantôme). Résultat : ________
- [ ] Défiler la grille au doigt, sans appui long : aucun glisser n'est déclenché. Résultat : ________
- [ ] Appui long sur une zone vide puis étirer : titre demandé, indisponibilité créée. Résultat : ________

### Parcours iPhone

- [ ] La vue par défaut est Jour ; la bibliothèque s'ouvre en feuille par « Items ». Résultat : ________
- [ ] « Planifier… » : choisir un jour et une heure, « Placer » crée le créneau (ou « Pas de place à cette heure »). Résultat : ________
- [ ] Glisser un bloc d'une heure à l'autre dans la vue Jour. Résultat : ________

### Export vers Calendrier

- [ ] Créer d'abord un calendrier « Révisions » dans l'app Calendrier. Poser quelques créneaux, ouvrir Exporter : l'encart « Nouveaux créneaux » est là. Résultat : ________
- [ ] « Ajouter au Calendrier » : l'écran d'import de Calendrier s'ouvre ; « Tout ajouter » crée les événements dans « Révisions ». Résultat : ________
- [ ] Le badge d'export retombe à 0 ; le message « N créneaux envoyés au Calendrier » s'affiche. Résultat : ________
- [ ] Déplacer un créneau déjà exporté : « Créneaux modifiés (1) » apparaît. « Mettre à jour dans Calendrier » : iOS demande de valider chaque mise à jour, une par une ; l'événement est **déplacé**, pas dupliqué. Résultat : ________
- [ ] Supprimer un créneau exporté : la liste « à supprimer » apparaît ; supprimer l'événement à la main dans Calendrier, puis « C'est fait » vide la liste. Résultat : ________
- [ ] **Les événements arrivent sur l'iPhone via iCloud** (calendrier « Révisions » synchronisé) avec le bon titre, la bonne heure et la note. Résultat : ________

### Thème sombre

- [ ] Réglages › Apparence › Sombre : fond « Garde de nuit », cartes violettes, texte lisible, blocs avec bord et lueur de la couleur du collège. Résultat : ________
- [ ] Apparence « Auto » : le thème suit l'apparence de l'iPad/iPhone (essayer le passage clair/sombre le soir). Résultat : ________
- [ ] Rien d'illisible en sombre : fiches, feuille d'export, réglages, import. Résultat : ________

### Sauvegarde et réglages

- [ ] Réglages › Données › Sauvegarder : la feuille de partage s'ouvre ; l'enregistrer dans Fichiers (ou l'envoyer à soi-même). Résultat : ________
- [ ] Réglages › Données › Restaurer cette sauvegarde (après avoir modifié quelque chose) : l'état revient à celui de la sauvegarde, avec confirmation avant. Résultat : ________
- [ ] Réglages, validation des champs (Durées, Journée) : une valeur hors limites (rythme, durées min/max, pause, début/fin de journée, pas) est refusée avec le message de la §14, sans rien enregistrer. Résultat : ________
- [ ] Les réglages modifiés sont encore là après fermeture et réouverture de l'app. Résultat : ________

### Verdict

- [ ] Prête à être utilisée par Emma. Remarques : ________________________________
