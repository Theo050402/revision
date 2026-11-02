# Améliorations après recette : spec de design

- **Date :** 2 novembre 2026
- **Statut :** en relecture
- **Base :** spec initiale `2026-10-28-planning-revisions-design.md`. Ce document la complète et **remplace** ses passages suivants : §6 (« un changement de réglage s'applique aux nouveaux créneaux uniquement »), §9.3 (appui long sur un emplacement vide), §12.1 (marquage des créneaux exportés).
- **Référence de design :** skill `apple-design` (principes Apple traduits pour le web : réponse immédiate, manipulation directe, ressorts interruptibles, retour multimodal, cohérence spatiale, mouvement réduit).

## Objectif

La recette sur iPad et iPhone est bonne sur le fond, mais l'app n'est pas encore « prête à être utilisée par Emma ». Cinq chantiers, livrés dans cet ordre :

| # | Chantier | But |
|---|---|---|
| A | Export fiable | Ne plus marquer « envoyé » ce que Calendrier n'a pas enregistré |
| B | Recalcul et « Vider le planning » | Les réglages s'appliquent aux créneaux à venir ; tout effacer en un geste |
| C | Ressenti natif | Saisir et déplacer un créneau comme dans Calendrier d'Apple |
| D | Sélection par zone | Attraper plusieurs créneaux au lasso, les déplacer ou les supprimer ensemble |
| E | Passe de design | Aligner toute l'app sur les principes `apple-design` |

**Critère de réussite global :** Emma refait la recette sur iPad et iPhone et répond « prête à être utilisée ».

---

## A. Export fiable

**Problème constaté :** après « Mettre à jour dans Calendrier », iOS ouvre son écran d'import ; pour en sortir sans rien mettre à jour, le seul bouton est le ✓ bleu. L'app avait déjà marqué les créneaux comme envoyés au téléchargement : le badge tombe à 0 et la mise à jour n'est plus proposée alors que Calendrier n'a pas changé.

**Règle :** télécharger un fichier ne marque **rien**. Seule la confirmation d'Emma marque les créneaux envoyés.

**Déroulé :**

1. « Ajouter au Calendrier », « Mettre à jour dans Calendrier » ou « Tout exporter » télécharge le fichier, comme aujourd'hui.
2. À la place du bouton utilisé apparaît la question **« Calendrier a bien enregistré ces N créneaux ? »** avec deux boutons :
   - **« Oui, c'est fait »** : `marquerExporte` sur les créneaux du fichier (versions capturées au moment du fichier, règle existante) ; le badge baisse ;
   - **« Non »** : rien ne change ; la question disparaît et le bouton d'export revient.
3. Fermer la feuille, ou l'app, sans répondre : rien n'est marqué ; la question ne réapparaît pas, mais le badge et l'export restent proposés.
4. Pour « Repartir d'un calendrier vide », la question devient « Calendrier contient bien tout le planning ? » ; « Oui » marque tout et vide les suppressions en attente.

**Mise à jour partielle :** si Emma n'a validé qu'une partie des mises à jour dans iOS, elle répond « Non ». Un nouvel export renvoie les mêmes identifiants : rien n'est dupliqué.

**Nettoyage :**
- Le bouton « Remettre à envoyer » et la fonction `annulerMarquage` sont supprimés (devenus inutiles).
- Le bouton qui ferme la feuille d'export est un bouton texte « Fermer », jamais une icône de validation.
- `docs/superpowers/notes/export-ios.md` consigne ce comportement du ✓ d'iOS.

**Tests :** marquage uniquement après « Oui » ; « Non » et la fermeture sans réponse laissent l'état intact ; versions capturées respectées si un créneau change entre le fichier et la réponse ; e2e iPad et iPhone.

---

## B. Recalcul des créneaux et « Vider le planning »

### B.1 Déclencheurs du recalcul

- enregistrement de la section **Durées** des réglages (rythme, durée min, durée max, coefficients des tours) ;
- changement du **pas** de la grille ;
- changement du **coefficient d'un collège** : seuls les créneaux de ce collège ;
- **réimport d'un collège** : les items dont le nombre de pages a changé.

### B.2 Créneaux concernés

Un créneau est recalculé s'il remplit **toutes** ces conditions :
- placé (`debut` non nul) **aujourd'hui ou après** (date locale de Paris) ;
- pas coché « Fait » ;
- durée pas réglée à la main (`dureePerso` faux).

Les créneaux du bac « À placer » qui remplissent les deux dernières conditions sont aussi recalculés (sans placement).

**Nouvelle durée :** `dureeTour(pages, coefficientCollège, tour, réglages)`. Pour un item coupé en *n* parties, le nombre de parties est conservé et chaque partie vaut `max(dureeMin, arrondiPas(total / n))`.

### B.3 Replacement, jour par jour

Pour chaque jour touché, les créneaux placés sont pris dans l'ordre de leur heure de début (recalculés ou non) :

- curseur = minuit (aucun créneau n'est avancé ni recalé sur le début de journée) ;
- chaque créneau commence à `max(son heure actuelle, curseur)` ; s'il chevauche alors une indisponibilité, il saute juste après (en boucle) ;
- un créneau **dont l'heure ou la durée a changé** et qui finit alors après la fin de journée part dans « À placer » (`debut = null`) ; un créneau inchangé reste où il est, même hors des bornes (règle existante des bornes resserrées) ;
- sinon le curseur passe à sa fin.

Conséquences : les trous existants sont conservés ; un raccourcissement ne fait rien remonter ; un créneau non recalculé peut être poussé par un créneau recalculé qui le précède.

Tout créneau dont l'heure ou la durée change voit sa `version` incrémentée (il devient « modifié » pour l'export s'il était déjà envoyé).

### B.4 Effets visibles

- Un message résume : « N créneaux recalculés · M déplacés · K mis dans À placer » (parties omises si nulles ; rien si aucun créneau ne change).
- **L'historique d'annulation est vidé** (même règle que la suppression d'un collège) : sinon ↶ ramènerait d'anciennes durées sous les nouveaux réglages.
- Si le recalcul rend **plus de 10 créneaux déjà exportés** « modifiés », la feuille d'export met en avant « Repartir d'un calendrier vide » (déplié par défaut).

### B.5 « Vider le planning »

- Bouton **rouge** « Vider le planning » dans **Réglages › Données**, sous la sauvegarde.
- Confirmation (feuille, bouton destructif rouge) : « Supprimer les N créneaux du planning ? Les collèges, les indisponibilités et les réglages sont conservés. » Si des créneaux étaient déjà exportés : ligne supplémentaire « Ils sont aussi dans ton Calendrier : le plus simple est ensuite de supprimer le calendrier « Révisions » et de le recréer. »
- Effet : suppression de **tous** les créneaux (placés et « À placer ») via `appliquer` : **↶ Annuler** les ramène. Les créneaux exportés supprimés suivent la règle existante (suppressions en attente), réconciliées par `reconcilierExport` à l'annulation.
- Bouton désactivé s'il n'y a aucun créneau.

**Tests :** règle de replacement (chevauchement, saut d'indisponibilité, débordement vers « À placer », raccourcissement sans effet, « Fait » et durées manuelles intacts, passé intact, parties) ; chaque déclencheur ; message ; historique vidé ; vidage, confirmation, annulation, suppressions en attente ; e2e.

---

## C. Ressenti natif

Modèle : Calendrier d'Apple sur iPad. Principes : réponse dès l'appui, objet collé au doigt, mouvement continu, ressorts interruptibles, retour multimodal au même instant.

### C.1 Saisie (créneau de la grille, carte de la bibliothèque, partie du bac)

Au déclenchement de l'appui long (150 ms, inchangé) :
- **retour haptique** léger (voir C.5) ;
- l'objet se **soulève** : échelle 1,04, ombre plus profonde, ressort critique (amortissement 1, réponse 0,25 s) ;
- un **frémissement** bref : une oscillation de ± 1,5° pendant 250 ms, puis l'objet se stabilise à −1,5° ;
- le créneau d'origine reste en place, atténué à 35 % (on voit d'où il part).

### C.2 Pendant le glisser

- **Copie flottante collée au doigt, 1:1**, en respectant le point de saisie (aucun recentrage) et **sans aucun saut** : elle glisse librement d'un jour à l'autre. Elle n'est plus magnétisée.
- **Emplacement d'atterrissage** distinct : un contour translucide à la couleur du collège, magnétisé au jour et au pas sous le doigt. Il rejoint chaque nouvelle position par un **ressort** (amortissement 1, réponse 0,18 s) au lieu de sauter.
- **Colonne du jour visé éclairée** : teinte d'accent à 8 % sur toute la hauteur, en fondu ressort ; l'en-tête du jour passe en gras.
- **Étiquette d'heure** accrochée à la copie : « mar. 5 · 14h30 → 15h30 ».
- **Aperçu de cascade** : les créneaux poussés glissent par ressort (plus de transition CSS de 180 ms), interruptibles : un changement de cible repart de leur position à l'écran.
- **Bords** : près du haut ou du bas de la grille, défilement automatique progressif ; maintenir le doigt contre le bord gauche ou droit 600 ms change de semaine (ou de jour en vue Jour), avec un retour haptique.
- **Refus** (indisponibilité, hors journée) : l'emplacement passe au rouge et tremble ; au lâcher, la copie revient à son origine par ressort, retour haptique d'erreur.

### C.3 Lâcher

- La copie **rejoint l'emplacement d'atterrissage par ressort en héritant de la vitesse du doigt**, puis cède la place au vrai créneau ; retour haptique de succès.
- Lâcher hors cible : retour à l'origine par ressort, sans changement.

### C.4 Moteur de mouvement

- Un petit module maison de **ressorts** (amortissement + réponse, interruptibles, transmission de vitesse) sur `requestAnimationFrame`, appliqué à `transform` et `opacity` uniquement. Pas de nouvelle dépendance.
- Utilisé par : saisie, emplacement d'atterrissage, cascade, lâcher, retour à l'origine, feuilles (C.6).

### C.5 Retour haptique

- **iPhone (iOS 18 et plus récents)** : Safari n'expose pas l'API de vibration ; on déclenche le retour haptique du système par l'astuce de l'interrupteur (`<input type="checkbox" switch>` caché, basculé par programme). Trois motifs : léger (saisie, changement de jour), succès (lâcher), erreur (deux légers rapprochés).
- **Ailleurs** : `navigator.vibrate` s'il existe, sinon rien.
- **iPad** : la plupart n'ont pas de moteur haptique ; le retour y est visuel (frémissement, éclairage). C'est attendu, pas un défaut.
- Un seul module `haptique` ; à valider à la recette sur l'iPhone d'Emma.

### C.6 Détails natifs partout

- **Appui** : tout élément touchable réagit **dès l'appui** (échelle 0,97 ou fond plus marqué, 100 ms), pas au relâchement.
- **Feuilles** : sur iPhone, entrée et sortie par le bas avec un ressort (amortissement 0,8, réponse 0,3) et tirée vers le bas pour fermer (avec projection de vitesse) ; sur iPad, le popover grandit depuis le bouton qui l'ouvre et y retourne.
- **Changement de semaine** au balayage : la grille suit le doigt puis se pose par ressort (plus de changement instantané).
- **Mouvement réduit** (`prefers-reduced-motion`) : ni frémissement, ni ressort, ni défilement animé ; fondus courts (150 ms). Le retour haptique reste.

**Tests :** module de ressort (convergence, interruption depuis la position courante, transmission de vitesse) et projection ; calcul de l'emplacement d'atterrissage (identique au lâcher, règle existante « lâcher = aperçu ») ; e2e : copie continue entre colonnes (positions intermédiaires hors grille de jours), colonne éclairée, refus, retour à l'origine, mouvement réduit. Le ressenti et l'haptique se jugent à la recette.

---

## D. Sélection par zone

### D.1 Lasso

- **Appui long (150 ms) sur un emplacement vide puis glisser** : un rectangle translucide (accent à 12 %, bord accent) se dessine et peut couvrir plusieurs jours et plusieurs heures. Défilement automatique aux bords comme en C.2.
- **Pendant le tracé**, tout créneau dont le rectangle touche le lasso est mis en surbrillance en direct (anneau d'accent et coche) ; retour haptique léger à chaque créneau ajouté.
- Les **indisponibilités ne sont jamais sélectionnées**.
- Lâcher avec 0 créneau : rien. Avec au moins 1 : **mode sélection**.

### D.2 Mode sélection

- Une **barre d'actions flottante** translucide en bas : « N sélectionnés », **Supprimer** (rouge), **✕** (quitter la sélection).
- Toucher un créneau ajoute ou retire de la sélection ; toucher un emplacement vide ou ✕ quitte le mode ; Échap aussi.
- Un nouveau lasso dans ce mode **ajoute** à la sélection.
- La bibliothèque, l'export et les réglages restent accessibles ; ouvrir un autre écran quitte le mode.

### D.3 Déplacer le groupe

- **Appui long sur un créneau sélectionné puis glisser** : tout le groupe se soulève (C.1) et suit le doigt ; il garde ses écarts relatifs de jours et d'heures (décalage d'heure magnétisé au pas).
- Emplacements d'atterrissage pour chaque créneau du groupe (C.2).
- **Règle de dépôt :** le groupe se pose **seulement si chaque créneau tient librement** : dans les bornes de sa journée, sans chevaucher d'indisponibilité ni de créneau non sélectionné. Sinon refus (C.2) et retour à l'origine. Pas de poussée en cascade pour un groupe (comportement prévisible).
- Un seul pas d'annulation pour tout le groupe ; versions incrémentées.

### D.4 Supprimer le groupe

- « Supprimer » : suppression immédiate (pas de confirmation), **↶ Annuler** la rétablit en un pas ; les créneaux exportés suivent la règle des suppressions en attente. Message « N créneaux supprimés ».

### D.5 Création d'indisponibilité (remplace l'appui long sur vide)

- Bouton **« + Indisponibilité »** dans la barre de navigation du calendrier (à côté d'« Aujourd'hui »).
- Il ouvre une feuille : Titre, Jour, Début, Fin (au pas), préremplie avec l'emplacement libre touché en dernier s'il y en a un, sinon aujourd'hui de l'heure suivante pendant une heure. « Ajouter » crée l'indisponibilité via `appliquer` (annulable). Validation en ligne (fin après début, dans la journée).
- Les indisponibilités récurrentes restent dans Réglages.

**Tests :** fonctions pures (créneaux touchés par un rectangle ; dépôt de groupe accepté ou refusé ; décalage magnétisé) ; e2e : lasso sur plusieurs jours, ajout et retrait au toucher, déplacement accepté, refus sur indisponibilité, suppression et annulation, nouvelle feuille d'indisponibilité ; le défilement simple au doigt ne déclenche pas de lasso.

---

## E. Passe de design

Après C et D, une **revue complète** de l'app avec le skill `apple-design`, puis les corrections. L'identité « Petits carreaux » (papier quadrillé, surligneurs, encre, marge rouge) et « Garde de nuit » est conservée : il s'agit de la servir, pas de la remplacer.

**Grille de revue** (chaque écran : calendrier semaine/jour/mois, bibliothèque, fiche d'item, fiches créneau et indisponibilité, import et vérification, export, réglages, état vide, erreurs) :

1. **Hiérarchie et typographie** : échelle de tailles avec interlignage et approche de lettres propres à chaque taille (titres resserrés, petit texte légèrement espacé), graisse pour hiérarchiser, unités en `rem`, texte agrandi d'iOS respecté.
2. **Matériaux** : barre du haut, barres d'actions et feuilles en surfaces translucides (`backdrop-filter`) avec fondu de bord de défilement au lieu de filets ; jamais translucide sur translucide ; `prefers-reduced-transparency` et `prefers-contrast` gérés.
3. **Réponse et retours** : appui instantané partout (C.6) ; quatre types de retour cohérents (état, réussite, avertissement, erreur) ; validation en ligne.
4. **Cohérence spatiale et repères** : chaque surface sort par où elle est entrée ; chaque écran dit où l'on est et comment en sortir ; libellés précis.
5. **Espacements et alignements** : grille de 4 px, alignements optiques, rayons et ombres hiérarchisés (petits éléments discrets, grandes surfaces plus profondes).
6. **Clair et sombre** : contrastes AA conservés (script `contraste.mjs`), transitions de thème adoucies.

**Livrable :** `docs/superpowers/notes/audit-design.md` (constats par écran, avec la règle `apple-design` en cause et la correction retenue), puis les corrections, vérifiées sur captures iPad et iPhone en clair et en sombre.

**Hors périmètre de E :** nouvelles fonctionnalités ; changement de palette ou de polices de l'identité.

---

## Contraintes inchangées

Coût nul, données sur l'appareil, aucune requête réseau à l'exécution, JavaScript initial ≤ 250 Ko gzip, cibles tactiles ≥ 44 px (exceptions existantes : blocs et poignée de durée), focus visible, AA, mouvement réduit respecté, tests unitaires et e2e iPad et iPhone au vert à chaque chantier, livraison par chantier (déploiement après accord).
