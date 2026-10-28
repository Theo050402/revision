# Planning de révisions d'Emma : spec de design

- **Date :** 28 octobre 2026
- **Statut :** validée le 28 octobre 2026 (poussée en cascade : sens « insertion »)
- **Nom affiché sur l'écran d'accueil :** « Révisions »

## 1. Objectif

Une web app installable (PWA) pour iPad et iPhone qui permet à Emma, étudiante en médecine préparant l'EDN, de :

1. charger un ou plusieurs collèges en PDF et en extraire automatiquement les items (numéro, titre, nombre de pages) ;
2. répartir ces items sur un calendrier par glisser-déposer, avec une durée de créneau calculée depuis le nombre de pages ;
3. suivre plusieurs tours de révision par item ;
4. exporter le planning vers le Calendrier Apple en un bouton (fichier `.ics`).

L'app doit être légère, intuitive, agréable et satisfaisante à utiliser.

### Critères de réussite

- Importer le collège de cancérologie produit la liste des items 290 à 305 avec un nombre de pages correct pour tous sauf le dernier, signalé « à vérifier ».
- Planifier une semaine complète sur iPad se fait uniquement au doigt, sans saisie au clavier.
- Les créneaux exportés apparaissent dans le Calendrier Apple de l'iPad, puis sur l'iPhone via iCloud.
- L'app fonctionne hors ligne une fois installée.
- Coût total : 0 €.

### Contraintes

| Contrainte | Conséquence |
|---|---|
| Une seule utilisatrice, pas d'App Store | Distribution par un lien web, installation via « Sur l'écran d'accueil » dans Safari |
| Pas de Mac | Développement entièrement sous Windows |
| Gratuit | Pas de compte Apple Developer, donc pas d'app native ; hébergement gratuit |
| Données sur l'appareil | Aucun serveur applicatif, aucun compte, aucune synchro |

### Hors périmètre

- Synchronisation entre appareils (l'iPhone reçoit les créneaux par le Calendrier Apple via iCloud).
- Lecture directe du Calendrier Apple (impossible pour une web app).
- OCR de PDF sans couche de texte.
- Rappels espacés automatiques (J+7, J+30).
- Recalcul en masse des créneaux existants quand un réglage change.

## 2. Plateforme et pile technique

- **Langage et framework :** React 18 + TypeScript, bundler Vite.
- **PWA :** `vite-plugin-pwa` (manifeste, icônes, service worker en précache, fonctionnement hors ligne, `display: standalone`).
- **Lecture des PDF :** `pdfjs-dist`, exécuté dans un Web Worker et chargé à la demande (import dynamique), uniquement au moment d'un import.
- **Persistance :** IndexedDB via Dexie. Au premier lancement, l'app demande `navigator.storage.persist()`.
- **Glisser-déposer :** `@dnd-kit/core`, avec des capteurs tactiles et pointeur.
- **Grille horaire :** composant maison, pas de bibliothèque de calendrier.
- **`.ics` :** génération et lecture maison, sans dépendance.
- **Tests :** Vitest (logique) et Playwright avec le moteur WebKit (parcours).
- **Hébergement :** GitHub Pages, déployé par GitHub Actions.
  - Le dépôt est public, mais il ne contient que du code et la liste officielle des items. Aucune donnée d'Emma et aucun PDF n'y figurent : `*.pdf` est exclu par `.gitignore`.
- **Polices auto-hébergées** (fichiers `woff2` dans l'app) : Bricolage Grotesque et Atkinson Hyperlegible. Aucune requête externe.

### Budgets de performance

- JavaScript initial ≤ 250 Ko gzip, pdf.js exclu.
- Glisser-déposer à 60 images/s sur iPad. Les déplacements passent par `transform` CSS, jamais par `top` pendant le geste.
- Seule la période affichée est rendue.

## 3. Architecture

```
src/
  domain/          logique pure, sans React ni navigateur
    types.ts       modèle de données
    duration.ts    calcul de durée et découpage
    tours.ts       attribution du tour suivant, progression
    cascade.ts     placement, collisions, poussée en cascade
    multidrop.ts   dépôt multiple en série
  import/
    pdf.worker.ts      extraction du texte avec coordonnées (pdf.js)
    sommaire.ts        analyse du sommaire (stratégie A) et des titres (stratégie B)
    catalog.ts         fusion avec la liste officielle, calcul des pages
    items-edn.json     liste officielle des items de l'EDN (1 à 367)
  ics/
    export.ts      génération du .ics
    import.ts      lecture d'un .ics (événements verrouillés)
  storage/
    db.ts          schéma Dexie et accès
    backup.ts      sauvegarde et restauration JSON
  ui/
    App.tsx, écrans (Calendrier, Import, Vérification, Réglages), composants, thème
tests/
  unit/ (Vitest)   e2e/ (Playwright)   fixtures/
```

**Règle de dépendance :** `domain`, `ics` et `import/sommaire.ts` + `import/catalog.ts` ne dépendent ni de React ni du DOM, et sont entièrement testables sous Node. L'UI appelle le domaine, qui renvoie un nouvel état ; l'UI l'enregistre ensuite via `storage`.

**Flux principaux :**

- **Import :** PDF → `pdf.worker` (texte et coordonnées) → `sommaire` → `catalog` → écran de vérification → `storage`.
- **Planification :** geste dnd-kit → `cascade` / `multidrop` → nouvel état → historique d'annulation → `storage`.
- **Export :** `storage` → `ics/export` → feuille de partage ou téléchargement iOS → marquage des créneaux exportés.

## 4. Modèle de données

Toutes les heures sont des heures locales (Europe/Paris), stockées au format `YYYY-MM-DDTHH:mm`. Les durées sont en minutes.

```ts
type College = {
  id: string;            // uuid
  nom: string;           // « Cancérologie », modifiable
  couleur: number;       // index dans la palette des surligneurs
  coefficient: number;   // 1.0 par défaut
  importeLe: string;
};

type Item = {
  id: string;            // `${collegeId}:${numero}`
  collegeId: string;
  numero: number;        // 1..367
  titre: string;         // titre officiel (liste EDN)
  pageDebut: number;     // page imprimée dans le livre
  pages: number;         // >= 1
  aVerifier: boolean;    // anomalie détectée à l'import
};

type Creneau = {
  id: string;            // uuid, sert aussi d'UID dans le .ics
  itemId: string;
  tour: number;          // 1, 2, 3…
  partie: { i: number; n: number } | null;   // découpage, ex. 1/2
  debut: string | null;  // null = dans le bac « À placer »
  duree: number;
  dureePerso: boolean;   // true après redimensionnement manuel
  fait: boolean;
  note: string;
  version: number;       // incrémentée à chaque modification exportable
  versionExportee: number | null;
};

type Indispo = {
  id: string;
  titre: string;
  source: 'ponctuelle' | 'recurrente' | 'ics';
  sourceId: string | null;      // id de la récurrence ou du fichier .ics
  debut: string;
  fin: string;
};

type Recurrence = {
  id: string;
  titre: string;
  jours: number[];        // 1 = lundi … 7 = dimanche
  heureDebut: string;     // « 08:00 »
  heureFin: string;
  du: string;             // date de début (incluse)
  au: string;             // date de fin (incluse)
};

type SuppressionEnAttente = {
  creneauId: string;
  libelle: string;        // « 300 · T1 · mardi 5 nov. 14h »
};

type Reglages = {
  rythme: { minutes: number; pages: number };   // 60 min pour 8 pages
  dureeMin: number;        // 30
  dureeMax: number;        // 180
  coefsTours: number[];    // [1, 0.5, 0.35, 0.25], le dernier vaut pour les tours suivants
  pauseMultiple: number;   // 10
  journee: { debut: string; fin: string };      // 07:00 – 23:00
  pas: 5 | 10 | 15;        // 15
  rappel: 0 | 5 | 15 | 30; // 0 = aucun
  theme: 'auto' | 'clair' | 'sombre';
};
```

Les indisponibilités récurrentes sont matérialisées en `Indispo` (une par jour concerné) à leur création et à leur modification.

L'historique d'annulation est gardé en mémoire uniquement : 50 niveaux, perdus au rechargement.

## 5. Import des PDF

### 5.1 Parcours

1. Emma touche « + Collège » et choisit un PDF (`<input type="file" accept="application/pdf">`, qui ouvre l'app Fichiers).
2. Le nom proposé est tiré du nom de fichier : on garde le premier mot, on le met en forme et on le passe par une table d'abréviations (`CANCERO` → « Cancérologie », `CARDIO` → « Cardiologie »…). Il reste modifiable.
3. Une barre de progression s'affiche pendant l'analyse dans le worker.
4. L'écran de vérification s'ouvre.

Le PDF n'est pas conservé : seuls les items extraits sont enregistrés.

### 5.2 Extraction du texte

Le worker renvoie, pour chaque page analysée, les fragments de texte avec leurs coordonnées (`str`, `x`, `y`, hauteur). Les fragments sont regroupés en lignes : même `y` à ±3 points près, triés par `x`. **L'ordre du flux de texte n'est jamais utilisé**, car l'OCR le mélange.

### 5.3 Stratégie A : le sommaire (prioritaire)

- On analyse les 20 premières pages. Une page de sommaire est une page contenant au moins 3 occurrences de `Items?\s+\d{1,3}`.
- Pour chaque ligne contenant `Items?\s+(\d{1,3})(\s*[,et-]\s*\d{1,3})*`, on extrait le ou les numéros.
- On cherche ensuite la ligne la plus proche **au-dessus**, dans la même colonne et à moins de 4 lignes, qui se termine par un numéro de page : motif `[.\s…-]*(\d{1,4})\s*$`. On tolère les points de conduite et le bruit d'OCR (`- 45`, `,.`).
- Le résultat est une liste `{ numeros: number[], pageDebut: number }`, triée par `pageDebut`.

### 5.4 Stratégie B : les titres (repli)

Elle s'applique si A trouve moins de 3 items. On parcourt tout le document : pour chaque numéro, la page de début est la première page où une ligne commence par `Item N` en haut de page (tiers supérieur). La page est alors l'index dans le PDF, pas la page imprimée.

### 5.5 Calcul des pages

- Les entrées sont triées par `pageDebut`. Pour l'entrée *k* : `pages = pageDebut(k+1) − pageDebut(k)`.
- Une entrée qui regroupe *n* items voit ses pages réparties équitablement (arrondi à l'entier, au moins 1), tous les items ayant la même page de début.
- **Dernier item :** il reçoit la médiane des longueurs des autres items, et `aVerifier = true`.
- **Anomalies** (`aVerifier = true`) :
  - pages ≤ 0 ou > 60 ;
  - numéro absent de la liste officielle (il est alors gardé avec le titre « Item N ») ;
  - numéro en double dans le même collège (on garde la première occurrence).
- **Titres :** ils viennent toujours de `items-edn.json`. Ce fichier contient la liste officielle des 367 items de l'EDN avec leurs intitulés ; il est constitué une fois à partir de la liste publiée et vérifié pendant l'implémentation.

### 5.6 Écran de vérification

- Une ligne par item : pastille avec le numéro à la couleur du collège, titre officiel, nombre de pages modifiable d'un tap (clavier numérique), durée estimée du 1er tour.
- Les lignes `aVerifier` sont surlignées en orange, avec la raison.
- Un glissement vers la gauche supprime la ligne. « + Ajouter un item » ouvre une recherche dans la liste officielle, suivie de la saisie des pages.
- **Si aucun item n'est trouvé :** « Aucun item trouvé dans ce PDF. Ajoute-les à la main depuis la liste officielle. » La liste est vide et le bouton « + Ajouter un item » est mis en avant.
- « Valider » enregistre le collège et ses items.

### 5.7 Réimport d'un collège

Depuis Réglages › Collèges › Réimporter, les items sont remplacés par numéro. Les créneaux existants restent liés via `itemId = collegeId:numero` ; un créneau dont l'item disparaît garde un titre figé et est signalé dans la bibliothèque.

## 6. Durée des créneaux

```
base   = pages × (rythme.minutes / rythme.pages) × coefficientCollège × coefTour(tour)
arrondi = arrondi au plus proche multiple de `pas`
duree  = max(dureeMin, arrondi)
```

`coefTour(t) = coefsTours[min(t, coefsTours.length) − 1]`

**Découpage :** si `duree > dureeMax`, alors `n = ceil(duree / dureeMax)` et chaque partie dure `arrondi(duree / n)`, sans descendre sous `dureeMin`.

- La partie 1 est placée à l'endroit du dépôt.
- Les parties 2 à n vont dans le bac « À placer » (`debut = null`), avec `partie = { i, n }`.

**Exemple avec les réglages par défaut :** item de 18 pages.
- T1 : 18 × 7,5 = 135 min, soit **2h15**.
- T2 : 67,5 min, arrondis à **1h15**.
- T3 : 47 min, arrondis à **45 min**.

**Redimensionnement manuel :** la durée est libre (au pas de la grille), `dureePerso = true`, et elle n'est plus recalculée.

**Changement de réglage :** il s'applique aux nouveaux créneaux uniquement.

## 7. Tours et progression

- Le tour d'un nouveau créneau vaut `1 + max(tour)` des créneaux existants du même item (même collège et même numéro), ou 1 s'il n'en existe pas.
- **États d'un item, affichés par des points ●○○ :**
  - non vu : aucun créneau ;
  - planifié : créneau sans « Fait » ;
  - fait : tous les créneaux du tour (toutes ses parties) sont cochés « Fait ».
- **Anneau de progression :** nombre de numéros d'items distincts, tous collèges confondus, ayant au moins un créneau T1 « Fait », sur 367.
- Supprimer un créneau ne renumérote pas les autres tours.

## 8. Bibliothèque d'items

**Disposition :** sur iPad (largeur ≥ 900 px), un panneau de 340 px à gauche, repliable. Sur iPhone, une feuille qui monte du bas de l'écran.

**Contenu, de haut en bas :**

1. **Anneau de progression**, avec le libellé « 124 / 367 items vus au 1er tour ».
2. **Bac « À placer »**, visible seulement s'il n'est pas vide, avec un badge du nombre de créneaux.
3. **Recherche :**
   - Un nombre seul filtre par numéro exact ou par préfixe.
   - Un texte filtre sur le titre : normalisé sans accents ni casse, et tolérant à une faute par mot de 5 lettres ou plus (distance de Levenshtein ≤ 1).
4. **Filtres en pastilles**, combinables :
   - collèges ;
   - état (non vus, T1, T2, T3 et plus) ;
   - longueur : court < 10 p, moyen 10–20 p, long > 20 p.
5. **Suggestions :**
   - « À planifier ensuite » : les 5 premiers items non vus, dans l'ordre des numéros, par collège.
   - « Pour combler ce trou » : apparaît quand Emma touche un emplacement libre de la grille. Elle liste les items dont la durée du prochain tour tient dans le trou (trou = de l'emplacement touché jusqu'au prochain bloc ou à la fin de la journée), en commençant par ceux qui le remplissent le mieux.
6. **Liste :** groupée par collège (sections repliables) ou triée par numéro (bascule).

**Carte d'item :**
- pastille avec le numéro, à la couleur du collège ;
- titre sur 2 lignes ;
- « 18 p · 2h15 » (durée du prochain tour) ;
- points des tours.

Un tap ouvre la fiche : pages, historique des créneaux, dates.

**Sélection multiple :** le bouton « Sélectionner » fait apparaître des cases à cocher. On glisse le groupe en déposant n'importe laquelle des cartes cochées.

## 9. Calendrier

### 9.1 Vues

| Vue | Usage |
|---|---|
| **Semaine** (défaut sur iPad) | 7 colonnes ; balayage horizontal pour changer de semaine ; bouton « Aujourd'hui » |
| **Jour** (défaut sur iPhone) | Ajustements fins ; 3 jours sur iPhone en paysage |
| **Mois** | Charge par jour (teinte proportionnelle aux heures planifiées) ; un tap ouvre le jour ; c'est aussi une cible de dépôt (première heure libre, sinon refus) |

- La grille s'étend sur `journee.debut`–`journee.fin`, au pas `pas`.
- Une ligne « maintenant » rouge traverse le jour en cours.

### 9.2 Blocs

- **Créneau :**
  - fond surligneur à la couleur du collège, trait d'encre à gauche, coins de 3 px ;
  - texte « 300 · » suivi du titre officiel tronqué par une ellipse, puis « T1 · 22 p · 2h45 » ;
  - « · 1/2 » si c'est une partie ;
  - un point s'il n'a pas encore été exporté ;
  - une coche s'il est « Fait ».
- **Bloc verrouillé** (indisponibilité) : hachures grises, titre. Il n'est pas déplaçable par glisser ; un tap ouvre son édition ou sa suppression.

### 9.3 Gestes

| Geste | Effet |
|---|---|
| Glisser une carte de la bibliothèque | Crée un créneau (tour suivant) au dépôt |
| Appui long (150 ms) sur un créneau, puis glisser | Le déplace (autre heure ou autre jour) |
| Tirer le bord bas d'un créneau | Le redimensionne au pas de la grille, sans descendre sous un pas ; il s'arrête au début du bloc suivant ou à la fin de la journée |
| Glisser un créneau vers la corbeille (visible pendant le geste) | Le supprime |
| Tap sur un créneau | Ouvre sa fiche : Fait, durée, tour, note, Supprimer |
| Tap sur un emplacement libre | Active « Pour combler ce trou » |
| Appui long sur un emplacement libre, puis étirer | Dessine une indisponibilité ponctuelle (titre demandé ensuite) |

**Aperçu en direct :** pendant le geste, un bloc fantôme suit le doigt à l'heure magnétisée. Le résultat de `cascade` est calculé à chaque changement de position et affiché en animation, avant le lâcher.

### 9.4 Placement et poussée en cascade (`domain/cascade.ts`)

Entrée : l'état du jour, le créneau déposé S (durée d), l'heure magnétisée t, et la position du doigt.

1. S occupe `[t, t + d]`. Si S chevauche un bloc verrouillé ou sort des bornes de la journée : **refus**.
2. Si S ne chevauche aucun créneau : placement direct.
3. Sinon, soit C le créneau sous le doigt (à défaut, le premier créneau chevauché, traité comme « moitié haute ») :
   - **doigt sur la moitié haute de C** : S s'insère avant C. C et les créneaux qui le suivent sont poussés **vers le bas** ;
   - **doigt sur la moitié basse de C** : S s'insère après C. C et les créneaux qui le précèdent sont poussés **vers le haut**.
4. **Poussée vers le bas :** chaque créneau poussé commence à la fin du précédent (S ou le créneau poussé avant lui). S'il chevauche alors un bloc verrouillé, il **saute** pour commencer à la fin de ce bloc. On continue tant qu'un chevauchement subsiste. La poussée vers le haut est symétrique.
5. Si un créneau poussé dépasse les bornes de la journée : **refus** de l'ensemble. La zone passe en rouge, avec un tremblement de 200 ms, et l'état reste inchangé.
6. Un créneau poussé garde sa durée, et `version` est incrémentée s'il a changé d'heure.

Un déplacement d'un créneau existant suit la même logique, après l'avoir retiré de sa position d'origine.

### 9.5 Dépôt multiple (`domain/multidrop.ts`)

Les créneaux sont placés dans l'ordre des numéros, à partir de t. Chacun prend le premier intervalle libre suffisant (en sautant créneaux et blocs verrouillés), avec `pauseMultiple` entre deux créneaux. Dès qu'un créneau ne tient pas avant la fin de la journée, lui et tous les suivants vont dans le bac « À placer » (l'ordre est conservé), et un toast l'indique : « 2 items mis dans À placer ». **Le dépôt multiple ne pousse jamais les créneaux existants.**

### 9.6 Annuler / Rétablir

Les boutons ↶ ↷ sont toujours visibles. Toute opération qui modifie les créneaux ou les indisponibilités est annulable.

## 10. Indisponibilités

- **Ponctuelles :** dessinées sur la grille (voir 9.3).
- **Récurrentes :** créées dans Réglages › Indisponibilités par un formulaire (titre, jours, heures, du/au). La modifier régénère ses blocs ; la supprimer les retire.
- **Import `.ics`** (optionnel), dans Réglages › Indisponibilités › Importer un fichier :
  - les `VEVENT` deviennent des blocs verrouillés `source = 'ics'` ;
  - les `RRULE` avec `FREQ=DAILY|WEEKLY` (`BYDAY`, `UNTIL`, `COUNT`, `INTERVAL`) sont développées sur 12 mois au maximum ; les autres règles sont ignorées, et leur nombre est affiché ;
  - les dates `Z` (UTC), `TZID=Europe/Paris` ou flottantes sont converties en heure locale ;
  - réimporter le même fichier (même nom) remplace ses blocs.

**Si un créneau existant chevauche une nouvelle indisponibilité :** l'indisponibilité est créée quand même, et les créneaux en conflit sont listés en orange : « 2 créneaux chevauchent “Stage” ». Emma les déplace elle-même.

## 11. Réglages

Sections et valeurs par défaut :

| Section | Contenu |
|---|---|
| **Durées** | Rythme (60 min pour 8 pages), min (30 min), max (3 h), coefficients des tours (100 / 50 / 35 / 25 %), pause du dépôt multiple (10 min). Aperçu en direct : « Item de 18 p → T1 : 2h15 · T2 : 1h15 · T3 : 45 min » |
| **Journée** | Bornes (7h–23h), pas de la grille (15 min) |
| **Indisponibilités** | Liste des récurrentes, création, import `.ics` |
| **Collèges** | Renommer, couleur, coefficient, réimporter, supprimer (avec confirmation ; supprime aussi ses créneaux) |
| **Export** | Rappel (aucun) |
| **Apparence** | Automatique / clair / sombre |
| **Données** | Sauvegarder, restaurer |

**Sauvegarde :** un fichier `revisions-AAAA-MM-JJ.json` contenant toutes les tables, avec un champ `schemaVersion`. Il est livré par la feuille de partage (AirDrop, Fichiers).

**Restauration :** le schéma est validé avant toute écriture. Un fichier invalide est refusé avec la raison, sans toucher aux données. Un fichier valide remplace tout, après confirmation.

## 12. Export vers le Calendrier Apple

### 12.1 Interaction

- Le bouton « Exporter » est dans la barre du haut, avec un badge du nombre de changements en attente : créneaux placés avec `versionExportee !== version`, plus les suppressions en attente.
- **Feuille d'export :**
  - choix « Changements (n) », par défaut, ou « Tout le planning » ;
  - au premier export, un encart explique de créer un calendrier « Révisions » dans le Calendrier Apple et de le choisir à l'import.
- Après la livraison :
  - les créneaux exportés passent `versionExportee = version` ;
  - si des suppressions étaient en attente, une liste s'affiche : « À supprimer à la main dans Calendrier : … ». Elle est vidée quand Emma touche « C'est fait ».
- Les créneaux du bac « À placer » ne sont jamais exportés.
- Supprimer un créneau déjà exporté (`versionExportee !== null`) ajoute une `SuppressionEnAttente`. Supprimer un créneau jamais exporté n'en ajoute pas.

### 12.2 Contenu du fichier

- `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//Revisions Emma//FR`, `METHOD:PUBLISH`, et un bloc `VTIMEZONE` Europe/Paris (heure d'été et d'hiver).
- Un `VEVENT` par créneau, avec :

| Champ | Valeur |
|---|---|
| `UID` | `<creneau.id>@revisions-emma` |
| `SEQUENCE` | `<version>` |
| `DTSTAMP` | heure de l'export, en UTC |
| `DTSTART` / `DTEND` | `TZID=Europe/Paris` |
| `SUMMARY` | `📚 300 · Tumeurs du col utérin, tumeurs du corps utérin · T1` (titre officiel complet, et ` · 1/2` pour une partie) |
| `DESCRIPTION` | `Cancérologie · p. 153–175 (22 p)`, puis la note |
| `CATEGORIES` | nom du collège |
| `VALARM` | si un rappel est réglé : `TRIGGER:-PT15M`, `ACTION:DISPLAY` |

- Format conforme à la RFC 5545 : fins de ligne CRLF, repli des lignes à 75 octets, échappement de `\ ; , ` et des retours à la ligne.

### 12.3 Ce qui modifie `version`

Elle est incrémentée par un changement d'heure, de durée, de tour ou de note. Cocher « Fait » ne l'incrémente pas.

### 12.4 Livraison et inconnues à lever

L'ordre d'essai est le suivant :

1. `navigator.share({ files: [File('revisions.ics', 'text/calendar')] })` ;
2. sinon, lien de téléchargement d'un `Blob` `text/calendar` ;
3. sinon, lien de secours qui ouvre l'export dans Safari.

**Test de départ obligatoire, sur l'iPad d'Emma, avant de construire le reste :**

- a) quelle méthode de livraison déclenche l'écran d'import du Calendrier depuis l'app installée ;
- b) si réimporter un événement avec le même `UID` et une `SEQUENCE` plus élevée le met à jour ou le duplique.

**Si (b) duplique :** l'export « Changements » devient réservé aux nouveaux créneaux. Pour un créneau modifié, la feuille d'export propose la procédure « Tout réexporter » : supprimer le calendrier « Révisions », le recréer, puis exporter tout le planning. L'app explique les étapes.

## 13. Direction visuelle

### 13.1 Mode clair : « Petits carreaux »

| Jeton | Valeur |
|---|---|
| Fond | `#FCFCFA` |
| Panneau | `#FFFFFF` |
| Champs | `#F1F4F9` |
| Encre | `#1E2A5A` |
| Texte secondaire | `#6B7493` |
| Lignes de grille | `#DCE4EF` (heures), `#EEF2F8` (demi-heures) |
| Marge, « maintenant », alerte | `#D9473F` (marge du panneau : `#F3B9B4`) |
| Bouton principal | fond encre, texte blanc |

- **Surligneurs des collèges**, attribués dans l'ordre : jaune `#FFE45C`, rose `#FF9AC8`, vert `#94E08F`, orange `#FFB25C`, bleu `#7FD3FF`, violet `#C6A6FF`, puis le cycle recommence.
- Les blocs utilisent un dégradé de la couleur du surligneur (opacité 0,85 → 0,6) avec un trait d'encre de 3 px à gauche.

### 13.2 Mode sombre : « Garde de nuit »

| Jeton | Valeur |
|---|---|
| Fond | `#2B1E3E` |
| Panneau | `#241934` |
| Cartes | `#33264A` |
| Champs | `#3A2D53` |
| Texte | `#E6E6FA` |
| Texte secondaire | `#A99BC4` |
| Lignes | `#43365E` |
| Accent | `#A490C2` |
| « Maintenant » et alerte | `#F29E8E` |

- Les blocs sont des cartes `#33264A` avec un bord gauche de 4 px et une lueur interne à **la même teinte de collège qu'en mode clair**. La teinte identifie le collège dans les deux modes.

### 13.3 Typographie et mouvement

- **Polices :**
  - Bricolage Grotesque (500, 700, 800) pour les titres, les numéros d'items et les heures ;
  - Atkinson Hyperlegible (400, 700) pour le texte.
- **Échelle :** 11 / 12,5 / 14 / 17 / 22 px.
- **Mouvement, uniquement en réponse à Emma :**
  - la carte se soulève avec une rotation de −1,5° et une ombre ;
  - les créneaux poussés s'écartent (180 ms) ;
  - un refus déclenche un tremblement (200 ms) et une teinte rouge ;
  - l'anneau se remplit quand elle coche « Fait ».
- `prefers-reduced-motion` est respecté : les transitions sont alors instantanées.
- **Accessibilité :**
  - contraste AA pour le texte, l'encre sur surligneur étant vérifiée pour chaque couleur ;
  - cibles tactiles d'au moins 44 px ;
  - focus visible.

## 14. Erreurs

| Situation | Message ou comportement |
|---|---|
| Aucun item trouvé | « Aucun item trouvé dans ce PDF. Ajoute-les à la main depuis la liste officielle. » |
| PDF illisible ou chiffré | « Ce fichier ne s'ouvre pas. Vérifie qu'il s'agit bien d'un PDF non protégé. » |
| Échec d'écriture IndexedDB (quota) | « Plus d'espace pour enregistrer. Sauvegarde tes données puis libère de la place. » Bouton Sauvegarder. |
| `storage.persist()` refusé | Rappel discret dans Réglages › Données : sauvegarder régulièrement |
| Restauration invalide | « Ce fichier n'est pas une sauvegarde de Révisions (raison). Tes données n'ont pas été modifiées. » |
| `.ics` importé illisible | « Ce fichier de calendrier n'a pas pu être lu. » |
| Dépôt refusé | Retour visuel uniquement (teinte rouge et tremblement), sans message |

## 15. Tests

### Unitaires (Vitest)

- **`duration` :** rythme, coefficients du collège et du tour, arrondi, minimum, découpage (exemple de 40 p au T1 → 2 × 2h30), dernier coefficient appliqué aux tours suivants.
- **`tours` :** attribution du tour suivant, états, progression sur 367.
- **`cascade` :**
  - placement libre ;
  - insertion avant et après (moitié haute ou basse) ;
  - poussée en chaîne ;
  - saut d'un bloc verrouillé ;
  - refus aux bornes ;
  - refus sur un bloc verrouillé ;
  - incrément de `version`.
- **`multidrop` :** remplissage des trous, pause, débordement vers « À placer ».
- **`sommaire` :** fixture du texte réel du sommaire de cancérologie avec ses coordonnées (bruit d'OCR compris), qui doit donner 290→13, 291→27, 292→45… 305→249 ; chapitre à plusieurs items ; stratégie B.
- **`catalog` :** calcul des pages, médiane pour le dernier item, anomalies.
- **`ics/export` :** structure, `VTIMEZONE`, repli des lignes, échappement, stabilité des `UID`.
- **`ics/import` :** `RRULE` hebdomadaire avec `BYDAY` et `UNTIL`, UTC, règle non gérée ignorée.
- **`backup` :** aller-retour, rejet d'un schéma invalide.

### Bout en bout (Playwright, WebKit, viewport iPad 1180×820 et iPhone 393×852)

- Import d'un PDF de test synthétique (généré par le test, avec un sommaire), vérification, puis validation.
- Glisser un item sur la semaine, créneau créé avec la bonne durée.
- Déposer sur un créneau occupé, poussée observée.
- Export, contenu du fichier téléchargé.

### Manuel, sur iPad (premier jalon)

- Installation sur l'écran d'accueil et fonctionnement hors ligne.
- Inconnues (a) et (b) de la section 12.4.
- Fluidité du glisser-déposer au doigt.

## 16. Jalons

1. **Test de faisabilité de l'export :** PWA minimale déployée sur GitHub Pages, avec un bouton qui exporte deux événements, puis les mêmes modifiés. Test sur l'iPad pour lever les inconnues de la section 12.4.
2. **Domaine et import :** logique pure testée, liste officielle des items, extraction et écran de vérification.
3. **Calendrier et bibliothèque :** grille, glisser-déposer, cascade, sélection multiple, annuler.
4. **Réglages, indisponibilités, export et sauvegarde.**
5. **Finitions visuelles et thème sombre, puis test complet sur iPad et iPhone.**
