# Planning de révisions : plan d'implémentation

> **Pour les agents :** sous-skill OBLIGATOIRE : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** une PWA pour iPad et iPhone qui extrait les items des collèges PDF, permet de les répartir par glisser-déposer sur un calendrier avec une durée calculée selon le nombre de pages, et exporte le planning en `.ics` vers le Calendrier Apple.

**Architecture :**
- Toute la logique est pure et testable sous Node : `src/domain`, `src/ics`, et dans `src/import` les fichiers `sommaire.ts` et `catalog.ts`.
- L'état complet (`Etat`) est un objet immuable, tenu dans un store zustand. Chaque mutation passe par une fonction pure de `domain/actions.ts`, ce qui donne l'historique d'annulation gratuitement (instantanés).
- La persistance compare `avant` et `apres` par identité d'objet, puis écrit dans IndexedDB (Dexie).
- L'UI React est fine et ne contient aucune logique métier.

**Pile technique :** React 18, TypeScript (strict), Vite, vite-plugin-pwa, pdfjs-dist (Web Worker), Dexie, zustand, @dnd-kit/core, Vitest, Playwright (WebKit), pdf-lib (dev, PDF de test), @fontsource (Bricolage Grotesque, Atkinson Hyperlegible).

**Spec :** `docs/superpowers/specs/2026-10-28-planning-revisions-design.md`. À lire en entier avant toute tâche : les sections citées (§n) y renvoient.

## Contraintes globales

- Coût nul : aucun service payant ; hébergement GitHub Pages ; aucune requête réseau à l'exécution (polices auto-hébergées).
- Aucune donnée d'Emma ne quitte l'appareil ; aucun PDF dans le dépôt (`*.pdf` est dans `.gitignore`).
- JavaScript initial ≤ 250 Ko gzip, pdf.js exclu (chargé par `import()` dynamique).
- Heures locales Europe/Paris, au format `YYYY-MM-DDTHH:mm` ; durées en minutes ; arithmétique de dates via `Date.UTC` (jamais le fuseau de la machine).
- Identifiants et textes de l'UI en français. Les messages d'erreur sont copiés mot pour mot depuis la §14.
- Valeurs par défaut des réglages (§11) : rythme 60 min / 8 p, min 30, max 180, tours `[1, 0.5, 0.35, 0.25]`, pause 10, journée 07:00–23:00, pas 15, rappel 0, thème `auto`.
- Palette des surligneurs, dans l'ordre : `#FFE45C #FF9AC8 #94E08F #FFB25C #7FD3FF #C6A6FF`.
- Gestes : appui long de 150 ms ; cibles tactiles ≥ 44 px ; `prefers-reduced-motion` respecté.
- Point d'arrêt iPad : la tâche 3 est une validation manuelle par l'utilisateur. Les tâches suivantes peuvent démarrer, mais la tâche 21 utilise sa décision.

## Points de vigilance

1. **Jour de changement d'heure** (28 mars 2027, 31 octobre 2027) : un créneau à 14h doit être exporté `DTSTART;TZID=Europe/Paris:20270328T140000`, sans décalage, et la `VTIMEZONE` doit déclarer les règles d'été et d'hiver. Test dans la tâche 2.
2. **Ligatures et accents dans la recherche** : « oesophage » doit trouver « Tumeurs de l'œsophage », et « coeur » doit trouver « cœur ». `NFD` ne décompose pas `œ` ni `æ`. Test dans la tâche 17.
3. **PDF de collège très gros** (500 pages et plus) : la stratégie A ne doit lire que les 20 premières pages, et la stratégie B doit libérer chaque page après lecture. Test dans la tâche 10.
4. **Supprimer un collège dont des créneaux sont déjà exportés** : ces créneaux doivent produire des suppressions en attente, sinon des événements fantômes restent dans le Calendrier Apple. Test dans la tâche 12.
5. **Créneaux hors des bornes de la journée** après un resserrement des bornes : ils doivent rester visibles et déplaçables, la grille s'étendant pour les inclure. Test dans la tâche 16.

---

### Tâche 1 : socle du projet et déploiement

**Fichiers :**
- Créer : `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/theme/tokens.css`, `src/ui/theme/fonts.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `.github/workflows/deploy.yml`, `tests/unit/smoke.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces :**
- Produit :
  - les scripts npm `dev`, `build`, `test` (`vitest run`), `e2e` (`playwright test`) ;
  - le chemin de base `/revisions/` (le dépôt GitHub s'appelle `revisions`) ;
  - les variables CSS de la §13 sous `:root[data-theme="clair"]` et `:root[data-theme="sombre"]`.

- [ ] **Étape 1 : créer le projet**

Lancer `npm create vite@latest . -- --template react-ts`. Ajouter les dépendances `dexie zustand @dnd-kit/core @dnd-kit/utilities pdfjs-dist @fontsource/bricolage-grotesque @fontsource/atkinson-hyperlegible` et les dépendances de développement `vitest @playwright/test vite-plugin-pwa pdf-lib`. Ensuite, `npx playwright install webkit`.

- [ ] **Étape 2 : configuration**

- `vite.config.ts` : `base: '/revisions/'`, et `VitePWA` avec :
  - `registerType: 'autoUpdate'` ;
  - un manifeste avec `name: 'Révisions'`, `short_name: 'Révisions'`, `display: 'standalone'`, `theme_color: '#1E2A5A'`, `background_color: '#FCFCFA'`, `lang: 'fr'` et les icônes ;
  - `workbox.globPatterns: ['**/*.{js,css,html,woff2,png,json,mjs}']`.
- `tsconfig.json` : `strict: true`.
- `vitest.config.ts` : environnement `node`, `include: ['tests/unit/**/*.test.ts']`.
- `playwright.config.ts` : projets `ipad` (WebKit, viewport 1180×820, `hasTouch`) et `iphone` (WebKit, 393×852, `hasTouch`) ; `webServer` = `npm run build && npx vite preview --port 4173` ; `baseURL: 'http://localhost:4173/revisions/'`.

- [ ] **Étape 3 : thème et polices**

- `tokens.css` : définir pour chaque thème les jetons de la §13.1 et de la §13.2 (`--bg --panel --card --field --ink --muted --line --accent --on-accent --now --lock-bg`, et `--c0`…`--c5` pour les surligneurs, identiques dans les deux thèmes).
- Le thème sombre est appliqué si `data-theme="sombre"`, ou si `data-theme="auto"` et `prefers-color-scheme: dark`.
- `fonts.ts` importe `@fontsource/bricolage-grotesque/{500,700,800}.css` et `@fontsource/atkinson-hyperlegible/{400,700}.css`.
- Ajouter un bloc `@media (prefers-reduced-motion: reduce)` qui ramène toutes les transitions à `0ms`.

- [ ] **Étape 4 : tests de fumée**

`tests/unit/smoke.test.ts` : `expect(1 + 1).toBe(2)`. `tests/e2e/smoke.spec.ts` : la page charge et affiche le texte « Révisions ».

Lancer `npm test`, puis `npm run e2e`. Attendu : les deux passent sur `ipad` et `iphone`.

- [ ] **Étape 5 : workflow GitHub Pages**

`.github/workflows/deploy.yml` : sur un push vers `main`, `npm ci`, `npm test`, `npm run build`, puis `actions/upload-pages-artifact` (`dist`) et `actions/deploy-pages`.

L'utilisateur crée le dépôt public `revisions` sur son compte GitHub (gratuit), l'ajoute comme `origin` et active Pages (source : GitHub Actions).

- [ ] **Étape 6 : commit**

`git add -A`, puis `git commit -m "chore: socle Vite + React + PWA + tests + déploiement Pages"`.

---

### Tâche 2 : temps local et export `.ics`

**Fichiers :**
- Créer : `src/domain/temps.ts`, `src/ics/export.ts`
- Tests : `tests/unit/temps.test.ts`, `tests/unit/ics-export.test.ts`

**Interfaces :**
- Produit (`temps.ts`) :
  - `hm(h: string): number` (« 08:30 » → 510) ;
  - `versHm(min: number): string` ;
  - `jourDe(local: string): string` (`YYYY-MM-DD`) ;
  - `minutesDe(local: string): number` (minutes depuis minuit) ;
  - `local(jour: string, minutes: number): string` ;
  - `ajouterMinutes(local: string, min: number): string` ;
  - `ajouterJours(jour: string, n: number): string` ;
  - `jourSemaine(jour: string): number` (1 = lundi … 7 = dimanche) ;
  - `utcVersLocal(d: Date): string` (via `Intl.DateTimeFormat` avec `timeZone: 'Europe/Paris'`) ;
  - `versIcsLocal(local: string): string` (`20261105T140000`) ;
  - `versIcsUtc(d: Date): string` (`20261105T130000Z`).
- Produit (`export.ts`) :
  - `type EvenementIcs = { uid: string; sequence: number; debut: string; fin: string; resume: string; description: string; categorie: string; rappel: number }` ;
  - `genererIcs(evts: EvenementIcs[], maintenant: Date): string`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
// temps.test.ts
expect(ajouterMinutes('2026-11-05T23:30', 45)).toBe('2026-11-06T00:15')
expect(jourSemaine('2026-11-02')).toBe(1)            // lundi
expect(utcVersLocal(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01T14:00')
expect(utcVersLocal(new Date('2026-12-01T12:00:00Z'))).toBe('2026-12-01T13:00')

// ics-export.test.ts
const e = { uid: 'abc@revisions-emma', sequence: 2, debut: '2026-11-05T14:00', fin: '2026-11-05T16:45',
  resume: '📚 300 · Tumeurs du col utérin, tumeurs du corps utérin · T1',
  description: 'Cancérologie · p. 153–175 (22 p)\nrelire; tableau, TNM', categorie: 'Cancérologie', rappel: 15 }
const ics = genererIcs([e], new Date('2026-11-01T10:00:00Z'))
test('lignes CRLF, aucune ligne > 75 octets', ...)        // toutes les lignes, avec Buffer.byteLength
test('repli sans couper un caractère multi-octets', ...)  // déplier puis comparer à SUMMARY:<resume>
test('VTIMEZONE Europe/Paris avec DAYLIGHT et STANDARD', ...)
test('DTSTART;TZID=Europe/Paris:20261105T140000 et DTEND …T164500', ...)
test('UID, SEQUENCE:2, DTSTAMP:20261101T100000Z, METHOD:PUBLISH', ...)
test('échappement : DESCRIPTION contient "\\nrelire\\; tableau\\, TNM"', ...)
test('VALARM TRIGGER:-PT15M seulement si rappel > 0', ...)
test('changement d\'heure : 2027-03-28T14:00 → DTSTART;TZID=Europe/Paris:20270328T140000', ...)
```

- [ ] **Étape 2 : vérifier l'échec**

`npx vitest run tests/unit/temps.test.ts tests/unit/ics-export.test.ts`. Attendu : FAIL (module introuvable).

- [ ] **Étape 3 : implémenter `temps.ts` et `export.ts`**

- **Format :** RFC 5545 (§12.2). `PRODID:-//Revisions Emma//FR`.
- **`VTIMEZONE` en dur :** `DAYLIGHT` avec `DTSTART:19700329T020000`, `RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU`, `TZOFFSETFROM:+0100`, `TZOFFSETTO:+0200` ; `STANDARD` avec `DTSTART:19701025T030000`, `BYMONTH=10;BYDAY=-1SU`, `+0200` → `+0100`.
- **Repli des lignes :** couper à 75 octets UTF-8 sans couper un point de code (itérer sur `[...str]`), et préfixer chaque suite par une espace.
- **Échappement :** `\` → `\\`, `;` → `\;`, `,` → `\,`, retour à la ligne → `\n`.

- [ ] **Étape 4 : vérifier**

Même commande. Attendu : PASS.

- [ ] **Étape 5 : commit**

`git commit -m "feat(ics): export RFC 5545 avec fuseau Europe/Paris"`

---

### Tâche 3 : test de faisabilité de l'export sur iPad (point d'arrêt)

**Fichiers :**
- Créer : `src/ics/livraison.ts`, `src/ui/screens/TestExport.tsx`, `docs/superpowers/notes/export-ios.md`, `src/ics/mode.ts`
- Modifier : `src/ui/App.tsx` (l'URL `#test-export` affiche `TestExport`)

**Interfaces :**
- Consomme : `genererIcs`.
- Produit :
  - `livrerIcs(contenu: string, nomFichier: string, methode?: 'partage' | 'telechargement'): Promise<'partage' | 'telechargement' | 'annule'>`, qui essaie dans l'ordre de la §12.4 ;
  - `MODE_EXPORT: 'maj' | 'nouveaux'` dans `mode.ts`, qui vaut `'maj'` par défaut et est fixé à l'étape 4.

- [ ] **Étape 1 : implémenter `livrerIcs`**

- Si `navigator.canShare?.({ files: [file] })` : `navigator.share({ files: [file] })`. Un rejet `AbortError` renvoie `'annule'`.
- Sinon : un `<a download>` pointant vers `URL.createObjectURL(new Blob([contenu], { type: 'text/calendar' }))`.
- Le paramètre `methode` force une méthode, pour le test.

- [ ] **Étape 2 : écran `TestExport`**

L'écran contient quatre boutons :

| Bouton | Contenu |
|---|---|
| « 1. Exporter (partage) » | 2 événements, UID fixes `test-1@revisions-emma` et `test-2@revisions-emma`, `SEQUENCE:1`, le lendemain à 10h et 14h |
| « 2. Exporter (téléchargement) » | Les mêmes, par téléchargement |
| « 3. Réexporter modifié » | Les mêmes UID, `SEQUENCE:2`, avec `test-1` décalé à 11h |
| « 4. Ouvrir dans Safari » | Un lien `target="_blank"` vers `#test-export` |

Un texte explique de créer d'abord un calendrier « Test » dans l'app Calendrier.

- [ ] **Étape 3 : déployer et faire tester**

Pousser sur `main`. Puis demander à l'utilisateur, sur l'iPad d'Emma, de :
1. ouvrir `https://<compte>.github.io/revisions/#test-export` dans Safari ;
2. faire « Partager › Sur l'écran d'accueil », puis ouvrir l'app depuis l'icône ;
3. essayer les boutons 1 et 2, et noter lequel ouvre l'écran d'import du Calendrier ;
4. après l'import, essayer le bouton 3 et noter si `test-1` est **déplacé** à 11h ou **dupliqué**.

**Attendre la réponse de l'utilisateur.**

- [ ] **Étape 4 : consigner la décision**

Écrire les résultats dans `notes/export-ios.md`. Régler `MODE_EXPORT` (`'maj'` si l'événement est déplacé, `'nouveaux'` s'il est dupliqué) et l'ordre de `livrerIcs` (mettre en premier la méthode qui fonctionne).

Si aucune méthode ne fonctionne depuis l'écran d'accueil mais que l'une fonctionne dans Safari, l'export passera par le lien « Ouvrir dans Safari ». Le consigner aussi.

`git commit -m "chore: test de faisabilité de l'export iOS et décision"`

---

### Tâche 4 : modèle de données et calcul de durée

**Fichiers :**
- Créer : `src/domain/types.ts`, `src/domain/duration.ts`, `src/domain/defaults.ts`
- Test : `tests/unit/duration.test.ts`

**Interfaces :**
- Produit (`types.ts`) :
  - les types de la §4, mot pour mot (`College`, `Item`, `Creneau`, `Indispo`, `Recurrence`, `SuppressionEnAttente`, `Reglages`) ;
  - `type Etat = { colleges: Record<string, College>; items: Record<string, Item>; creneaux: Record<string, Creneau>; indispos: Record<string, Indispo>; recurrences: Record<string, Recurrence>; suppressions: Record<string, SuppressionEnAttente>; reglages: Reglages; premierExportFait: boolean }` (`suppressions` est indexé par `creneauId`).
- Produit (`defaults.ts`) : `REGLAGES_DEFAUT: Reglages` ; `etatVide(): Etat`.
- Produit (`duration.ts`) :
  - `arrondiPas(min: number, pas: number): number` (au plus proche, `.5` arrondi vers le haut) ;
  - `dureeTour(pages: number, coefCollege: number, tour: number, r: Reglages): number` (§6, après arrondi et minimum) ;
  - `decouper(duree: number, r: Reglages): number[]`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
const r = REGLAGES_DEFAUT
expect(dureeTour(18, 1, 1, r)).toBe(135)
expect(dureeTour(18, 1, 2, r)).toBe(75)      // 67,5 → 75
expect(dureeTour(18, 1, 3, r)).toBe(45)      // 47,25 → 45
expect(dureeTour(18, 1, 7, r)).toBe(30)      // le coef 0,25 vaut pour les tours ≥ 4 ; 33,75 → 30
expect(dureeTour(2, 1, 1, r)).toBe(30)       // minimum
expect(dureeTour(18, 1.2, 1, r)).toBe(165)   // 162 → 165
expect(decouper(300, r)).toEqual([150, 150]) // 40 p au T1
expect(decouper(180, r)).toEqual([180])
expect(decouper(400, r)).toEqual([135, 135, 135]) // 133,3 → 135
expect(dureeTour(18, 1, 1, { ...r, pas: 10 })).toBe(140)
```

- [ ] **Étape 2 : lancer et vérifier l'échec**

`npx vitest run tests/unit/duration.test.ts`. Attendu : FAIL.

- [ ] **Étape 3 : implémenter les trois fichiers selon la §6**

`decouper` : si `duree <= dureeMax`, renvoyer `[duree]` ; sinon `n = ceil(duree / dureeMax)`, et renvoyer *n* fois `max(dureeMin, arrondiPas(duree / n, pas))`.

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 5 : commit** `feat(domain): types et calcul de durée`

---

### Tâche 5 : tours et progression

**Fichiers :**
- Créer : `src/domain/tours.ts`
- Test : `tests/unit/tours.test.ts`

**Interfaces :**
- Consomme : `Etat`, `Creneau`, `Item`.
- Produit :
  - `prochainTour(creneaux: Creneau[], itemId: string): number` ;
  - `type EtatTour = 'planifie' | 'fait'` ;
  - `etatTours(creneaux: Creneau[], itemId: string): EtatTour[]` (index 0 = T1 ; tableau vide = non vu) ;
  - `progression(etat: Etat): { vus: number; total: 367 }`.

- [ ] **Étape 1 : écrire les tests qui échouent**

- `prochainTour` vaut 1 sans créneau, et 3 si les tours 1 et 2 existent.
- Si le T2 est supprimé mais que le T3 existe, `prochainTour` vaut 4 (pas de renumérotation).
- Un T1 en 2 parties dont une seule est faite donne `etatTours` = `['planifie']` ; les deux parties faites donnent `['fait']`.
- `progression` compte les **numéros distincts** : l'item 300 fait au T1 dans 2 collèges compte 1. Un T2 fait sans T1 fait ne compte pas.

- [ ] **Étape 2 : lancer et vérifier l'échec.** `npx vitest run tests/unit/tours.test.ts`

- [ ] **Étape 3 : implémenter selon la §7**

Un créneau n'est compté que s'il existe dans `etat.creneaux`, qu'il soit placé ou dans le bac.

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 5 : commit** `feat(domain): tours et progression`

---

### Tâche 6 : placement et poussée en cascade

**Fichiers :**
- Créer : `src/domain/cascade.ts`
- Test : `tests/unit/cascade.test.ts`

**Interfaces :**
- Produit :
  ```ts
  type Intervalle = { debut: number; fin: number }          // minutes depuis minuit
  type Pose = { id: string; debut: number; duree: number }
  type EntreePlacement = { poses: Pose[]; verrous: Intervalle[]; bornes: Intervalle;
    nouveau: { id: string; duree: number }; t: number;
    cibleId: string | null; moitie: 'haute' | 'basse' }
  type ResultatPlacement = { ok: true; debuts: Record<string, number> } | { ok: false }
  function placer(e: EntreePlacement): ResultatPlacement   // debuts : nouveau + chaque pose dont le début change
  ```
  L'appelant retire au préalable le créneau déplacé de `poses`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Bornes 420–1380, pas de verrou, sauf mention contraire. Chaque test porte le nom de son cas.

| Cas | Entrée | Résultat attendu |
|---|---|---|
| libre | A 600–660, nouveau N 90 min à t=720 | `{ N: 720 }` |
| insertion avant (haute) | A 840–960, B 960–1020 ; N 60 à t=840, cible A haute | `{ N: 840, A: 900, B: 1020 }` |
| insertion après (basse) | A 840–960 ; N 60 à t=930, cible A basse | `{ N: 930, A: 810 }` |
| basse, suite poussée vers le bas | A 840–960, B 960–1020 ; N 60 à t=930, cible A basse | `{ N: 930, A: 810, B: 990 }` |
| saut de verrou | verrou 1020–1080 ; A 900–990 ; N 60 à t=900, cible A haute | A saute à 1080 : `{ N: 900, A: 1080 }` |
| refus sur verrou | verrou 480–780 ; N 60 à t=600 | `{ ok: false }` |
| refus aux bornes | A 1260–1380 ; N 60 à t=1260, cible A haute | A finirait à 1440 : `{ ok: false }` |
| refus de N hors bornes | N 60 à t=1350 | `{ ok: false }` |
| sans cible, chevauchement | A 780–840 ; N 120 à t=720, cible null | `{ N: 720, A: 840 }` (premier chevauché, haute) |
| poussée vers le haut avec saut | verrou 480–780 ; A 780–840 ; N 60 à t=800, cible A basse | A devrait finir à 800 et commencer à 740, ce qui chevauche le verrou : saut à 420–480, donc `{ N: 800, A: 420 }` |

- [ ] **Étape 2 : lancer et vérifier l'échec.** `npx vitest run tests/unit/cascade.test.ts`

- [ ] **Étape 3 : implémenter `placer`**

```
S = [t, t + d]. Si S sort des bornes ou chevauche un verrou → refus.
Si aucune pose ne chevauche S → { S }.
C = pose cibleId (si elle chevauche S) sinon première pose chevauchée (moitie := 'haute').
haute : avant = poses avec debut < C.debut ; apres = les autres (C inclus).
basse : avant = poses avec debut <= C.debut (C inclus) ; apres = les autres.
Bas : curseur = S.fin ; pour p de apres trié par debut croissant :
  si p.debut < curseur : nd = curseur ; tant que [nd, nd+p.duree] chevauche un verrou v : nd = v.fin
  sinon nd = p.debut
  si nd + p.duree > bornes.fin → refus ; curseur = nd + p.duree
Haut : symétrique (curseur = S.debut, trié par debut décroissant, saut : nf = v.debut, refus si nf - duree < bornes.debut).
```

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 5 : commit** `feat(domain): placement et poussée en cascade`

---

### Tâche 7 : dépôt multiple

**Fichiers :**
- Créer : `src/domain/multidrop.ts`
- Test : `tests/unit/multidrop.test.ts`

**Interfaces :**
- Consomme : `Intervalle` (tâche 6).
- Produit : `deposerSerie(e: { occupes: Intervalle[]; bornes: Intervalle; t: number; durees: { id: string; duree: number }[]; pause: number }): { places: { id: string; debut: number }[]; restants: string[] }`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Bornes 420–1380 sauf mention contraire.

| Cas | Entrée | Résultat attendu |
|---|---|---|
| enchaînement avec pause | t=840, durées 60 et 60 | 840 et 910 |
| saut d'un occupé trop court | occupé 900–960 ; t=840, durée 90 | 960 (840–900 est trop court) |
| débordement et ordre conservé | bornes 420–1020 ; t=840, durées 120, 30, 30 | 840, 970 ; reste le troisième (1030 > 1020), dans l'ordre |
| arrêt au premier qui ne tient pas | bornes 420–1020 ; t=900, durées 180, 30 | le premier ne tient pas, donc `restants = [id1, id2]` |

- [ ] **Étape 2 : lancer et vérifier l'échec.**
- [ ] **Étape 3 : implémenter selon la §9.5** (curseur ; premier intervalle libre ≥ durée à partir du curseur ; `curseur = fin + pause` ; au premier échec, tout le reste va dans `restants`).
- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(domain): dépôt multiple en série`

---

### Tâche 8 : liste officielle des items et catalogue

**Fichiers :**
- Créer : `src/import/items-edn.json`, `src/import/catalog.ts`
- Test : `tests/unit/catalog.test.ts`

**Interfaces :**
- Produit :
  - `items-edn.json` : `{ numero: number; titre: string }[]` ;
  - `type EntreeSommaire = { numeros: number[]; pageDebut: number }` ;
  - `type ItemExtrait = { numero: number; titre: string; pageDebut: number; pages: number; aVerifier: boolean; raison: string | null }` ;
  - `OFFICIELS: Map<number, string>` ;
  - `construireItems(entrees: EntreeSommaire[], officiels?: Map<number, string>): ItemExtrait[]` ;
  - `nomDepuisFichier(nomFichier: string): string`.

- [ ] **Étape 1 : constituer `items-edn.json`**

- Source : la liste officielle des 367 items de connaissance de l'EDN (R2C), telle que publiée (arrêté et annexe), récupérée sur le web.
- Contrôle de cohérence obligatoire avec le collège de cancérologie. Les intitulés de la liste doivent correspondre au sommaire pour :

  | Item | Intitulé attendu |
  |---|---|
  | 290 | « Épidémiologie, facteurs de risque, prévention et dépistage des cancers » |
  | 291 | Cancérogenèse, oncogénétique |
  | 299 | Tumeurs intracrâniennes |
  | 300 | Tumeurs du col utérin, tumeurs du corps utérin |
  | 301 | Tumeurs du côlon et du rectum |
  | 302 | Tumeurs cutanées, épithéliales et mélaniques |
  | 303 | Tumeurs de l'estomac |
  | 304 | Tumeurs du foie, primitives et secondaires |
  | 305 | Tumeurs de l'œsophage |

- **Si la numérotation de la liste trouvée diffère de celle du collège : s'arrêter et le signaler à l'utilisateur**, car les collèges d'Emma pourraient suivre une autre version de la liste.

- [ ] **Étape 2 : écrire les tests qui échouent**

```ts
expect(OFFICIELS.size).toBe(367)                     // numéros 1..367 tous présents
const sommaire = [[290,13],[291,27],[292,45],[293,61],[294,73],[295,101],[297,111],[298,121],
  [299,135],[300,153],[301,175],[302,193],[303,213],[304,229],[305,249]]
  .map(([n,p]) => ({ numeros: [n], pageDebut: p }))
const r = construireItems(sommaire)
expect(r.map(i => i.pages)).toEqual([14,18,16,12,28,10,10,14,18,22,18,20,16,20,17])
expect(r.at(-1)).toMatchObject({ numero: 305, aVerifier: true, raison: 'dernier item' })
expect(r[9].titre).toBe(OFFICIELS.get(300))
// chapitre à 2 items : [{numeros:[10,11],pageDebut:50},{numeros:[12],pageDebut:70}] → pages 10 et 10, même pageDebut
// anomalies, raisons exactes : 'pages ≤ 0', 'plus de 60 pages', 'hors liste officielle' (titre 'Item 400'), doublon gardé une fois
// entrées non triées → triées par pageDebut
expect(nomDepuisFichier('CANCERO 4e college_extract.pdf')).toBe('Cancérologie')
expect(nomDepuisFichier('cardio.pdf')).toBe('Cardiologie')
expect(nomDepuisFichier('mon livre.pdf')).toBe('Mon')
```

- [ ] **Étape 3 : lancer et vérifier l'échec.** `npx vitest run tests/unit/catalog.test.ts`

- [ ] **Étape 4 : implémenter selon la §5.5**

- Médiane d'un nombre pair de valeurs : moyenne des deux valeurs centrales, arrondie.
- Table d'abréviations de `nomDepuisFichier`, sur le premier mot en majuscules et sans accents :
  - CANCERO → Cancérologie ; CARDIO → Cardiologie ; PNEUMO → Pneumologie ;
  - GYNECO → Gynécologie-obstétrique ; HGE, HEPATO, GASTRO → Hépato-gastro-entérologie ;
  - NEURO → Neurologie ; PEDIATRIE, PEDIA → Pédiatrie ; DERMATO → Dermatologie ;
  - URO → Urologie ; NEPHRO → Néphrologie ; ENDOCRINO, ENDO → Endocrinologie ;
  - RHUMATO → Rhumatologie ; ORL → ORL ; OPHTALMO, OPH → Ophtalmologie ;
  - PSYCHIATRIE, PSY → Psychiatrie ; INFECTIO, MIT → Maladies infectieuses ;
  - HEMATO → Hématologie ; GERIATRIE → Gériatrie ; URGENCES → Médecine d'urgence ;
  - SP → Santé publique ; ANAPATH → Anatomie pathologique ; IMMUNO → Immunologie ;
  - GENETIQUE → Génétique ; NUTRITION → Nutrition ; PHARMACO → Pharmacologie.
- Sinon : le premier mot, avec une majuscule initiale.

- [ ] **Étape 5 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 6 : commit** `feat(import): liste officielle EDN et calcul des pages`

---

### Tâche 9 : analyse du sommaire (stratégies A et B)

**Fichiers :**
- Créer : `src/import/sommaire.ts`, `scripts/extraire-fixture.mjs`, `tests/fixtures/sommaire-cancero.json`
- Test : `tests/unit/sommaire.test.ts`

**Interfaces :**
- Consomme : `EntreeSommaire`.
- Produit :
  - `type Fragment = { str: string; x: number; y: number; h: number }` (points, **origine en haut** de la page) ;
  - `type PageTexte = { page: number; hauteur: number; fragments: Fragment[] }` (`page` à partir de 1) ;
  - `type Ligne = { x: number; y: number; texte: string }` ;
  - `grouperLignes(f: Fragment[]): Ligne[]` ;
  - `analyserSommaire(pages: PageTexte[]): EntreeSommaire[]` ;
  - `analyserTitres(pages: PageTexte[]): EntreeSommaire[]` ;
  - `extraireEntrees(pagesDebut: PageTexte[], lireToutes: () => Promise<PageTexte[]>): Promise<{ entrees: EntreeSommaire[]; strategie: 'sommaire' | 'titres' | 'aucune' }>`.

- [ ] **Étape 1 : produire la fixture**

`scripts/extraire-fixture.mjs <chemin.pdf> <sortie.json>` : charger `pdfjs-dist/legacy/build/pdf.mjs` sous Node, appeler `getTextContent()` sur chaque page, et convertir chaque élément en `Fragment` (`x = transform[4]`, `y = hauteurPage - transform[5]`, `h = height`).

Le lancer sur `CANCERO 4e college_extract.pdf`, qui est à la racine et ignoré par git. Committer uniquement le JSON produit.

- [ ] **Étape 2 : écrire les tests qui échouent**

```ts
const pages: PageTexte[] = fixture
expect(analyserSommaire(pages)).toEqual([[290,13],[291,27],[292,45],[293,61],[294,73],[295,101],[297,111],
  [298,121],[299,135],[300,153],[301,175],[302,193],[303,213],[304,229],[305,249]]
  .map(([n,p]) => ({ numeros: [n], pageDebut: p })))
// synthétique : fragments « Chapitre 9 » (x=60) à la même hauteur qu'un titre (x=190) → le 9 n'est jamais pris pour une page
// synthétique : « Items 10, 11 » → numeros [10, 11]
// synthétique : moins de 3 « Item N » dans les 20 premières pages → analyserSommaire renvoie []
// analyserTitres : page 5 avec « Item 12 – … » en haut (y < hauteur/3) → { numeros: [12], pageDebut: 5 } ; « Item 12 » en bas de page ignoré
// extraireEntrees : bascule vers 'titres' si A trouve moins de 3 entrées ; 'aucune' si B ne trouve rien
```

- [ ] **Étape 3 : lancer et vérifier l'échec.** `npx vitest run tests/unit/sommaire.test.ts`

- [ ] **Étape 4 : implémenter selon les §5.2 à 5.4**

- **`grouperLignes` :** `|Δy| ≤ 3`, fragments triés par `x`, joints par une espace.
- **Analyse d'une page de sommaire**, pour chaque ligne qui correspond à `/Items?\s+(\d{1,3})((?:\s*(?:,|et|-)\s*\d{1,3})*)/i` :
  1. soit `xItem` le `x` du fragment qui commence par « Item » ;
  2. prendre les fragments dont `x >= xItem - 20` et dont `y` est dans `[yItem - 4 × h, yItem)` ;
  3. les regrouper en lignes ;
  4. parcourir ces lignes de bas en haut et retenir la première qui correspond à `/[.\s…-]*(\d{1,4})\s*$/` ;
  5. cette valeur donne `pageDebut`.

  Le critère de colonne écarte les « Chapitre N » placés à gauche.

- [ ] **Étape 5 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 6 : commit** `feat(import): analyse du sommaire par coordonnées`

---

### Tâche 10 : lecture des PDF dans un worker

**Fichiers :**
- Créer : `src/import/pdf.worker.ts`, `src/import/lirePdf.ts`, `src/import/textePdf.ts`
- Test : `tests/unit/textePdf.test.ts`

**Interfaces :**
- Consomme : `PageTexte`, `extraireEntrees`.
- Produit :
  - `textePdf.ts` : `pagesTexte(doc: PDFDocumentProxy, numeros: number[], onPage?: (n: number) => void): Promise<PageTexte[]>`, partagé par le worker et les tests. Il appelle `page.cleanup()` après chaque page ;
  - `lirePdf.ts` : `class ErreurPdf extends Error { code: 'illisible' }` ;
  - `lirePdf(fichier: File, onProgres: (fait: number, total: number) => void): Promise<{ entrees: EntreeSommaire[]; strategie: 'sommaire' | 'titres' | 'aucune'; nbPages: number }>`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Avec `pdf-lib`, générer en mémoire un PDF de 30 pages. La page 1 contient un sommaire de 3 items (titre, points, numéro, puis « Item N » en dessous), et les pages 10, 20 et 25 commencent par « Item N ».

- `pagesTexte` sur la page 1 donne des fragments dont `y` est croissant de haut en bas.
- `pagesTexte` sur 30 pages appelle `cleanup` 30 fois (vérifié avec un espion sur `getPage`).
- Avec `extraireEntrees`, le PDF donne la stratégie `'sommaire'` sans jamais lire au-delà de la page 20 (espion sur `getPage`, aucun appel avec `n > 20`).

- [ ] **Étape 2 : lancer et vérifier l'échec.** `npx vitest run tests/unit/textePdf.test.ts`

- [ ] **Étape 3 : implémenter**

- **Worker :** il reçoit `{ buffer, pages: 'debut' | 'toutes' }` et répond `{ type: 'progres', fait, total }`, puis `{ type: 'pages', pages, nbPages }`.
- **`lirePdf` :**
  - crée le worker avec `new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })`, et `GlobalWorkerOptions.workerSrc` via l'import `?url` ;
  - les 20 premières pages d'abord, puis toutes si nécessaire ;
  - `PasswordException` ou `InvalidPDFException` → `ErreurPdf('illisible')`.
- **Chargement :** pdfjs n'est importé que dans le worker, ce qui garde le bundle initial léger.

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS. Puis `npm run build` et vérifier dans la sortie que pdf.js est dans un chunk séparé.

- [ ] **Étape 5 : commit** `feat(import): lecture PDF en worker`

---

### Tâche 11 : actions sur les créneaux

**Fichiers :**
- Créer : `src/domain/actions-creneaux.ts`, `src/domain/jour.ts`
- Test : `tests/unit/actions-creneaux.test.ts`

**Interfaces :**
- Consomme : `Etat`, `dureeTour`, `decouper`, `prochainTour`, `placer`, `deposerSerie`, le module `temps`.
- Produit :
  - `type Res = { ok: true; etat: Etat; versBac: number } | { ok: false }` ;
  - `type Cible = { jour: string; t: number; cibleId: string | null; moitie: 'haute' | 'basse' }` ;
  - `vueJour(e: Etat, jour: string, exclureId?: string): { poses: Pose[]; verrous: Intervalle[]; bornes: Intervalle }` (bornes = réglages de la journée) ;
  - `deposerItem(e: Etat, itemId: string, c: Cible, id?: () => string): Res` : tour suivant, découpage ; la partie 1 passe par `placer`, les autres vont au bac ;
  - `deplacerCreneau(e: Etat, creneauId: string, c: Cible): Res` (gère aussi un créneau qui sort du bac) ;
  - `deposerItemsSerie(e: Etat, itemIds: string[], jour: string, t: number, id?: () => string): Res` (ordre des numéros ; `versBac` = nombre de restants) ;
  - `redimensionner(e: Etat, creneauId: string, duree: number): Etat` (bornée par le bloc suivant et la fin de journée, au moins `pas`) ;
  - `supprimerCreneau(e: Etat, creneauId: string): Etat` ;
  - `basculerFait(e: Etat, creneauId: string): Etat` ;
  - `modifierNote(e: Etat, creneauId: string, note: string): Etat`.
  - **Toute modification d'heure, de durée, de tour ou de note incrémente `version`** ; `fait` ne l'incrémente pas (§12.3).

- [ ] **Étape 1 : écrire les tests qui échouent**

On part d'un état avec le collège Cancérologie (coefficient 1) et les items 300 (22 p) et 291 (18 p).

- `deposerItem(300, mardi 14:00)` crée T1, `duree` 165, `version` 1, `versionExportee` null, `debut` `…T14:00`.
- Un 2e dépôt de 300 crée T2 (`duree` 90, car 82,5 arrondi à 90).
- Un item de 40 p donne la partie 1/2 placée et la partie 2/2 avec `debut` null ; `versBac` vaut 1.
- Un dépôt sur un créneau existant, moitié haute : le créneau existant est décalé et sa `version` passe à 2.
- Un dépôt sur une indisponibilité donne `{ ok: false }`, et l'état d'origine est inchangé (même référence).
- `deplacerCreneau` depuis le bac donne `debut` non nul.
- `redimensionner` à 300 min avec un bloc suivant 30 min plus loin est plafonné à l'écart ; `dureePerso` passe à true.
- `supprimerCreneau` d'un créneau exporté ajoute une suppression dont le `libelle` vaut « 300 · T1 · mardi 5 nov. 14h » ; un créneau jamais exporté n'en ajoute pas.
- `basculerFait` ne change pas `version`.
- **Immuabilité :** les objets non modifiés gardent la même référence (`etatApres.items === etatAvant.items`).

- [ ] **Étape 2 : lancer et vérifier l'échec.**

- [ ] **Étape 3 : implémenter**

- Les libellés de date utilisent `Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })` sur une `Date.UTC` construite depuis l'heure locale.
- Les heures s'affichent `14h` ou `14h30`.

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.

- [ ] **Étape 5 : commit** `feat(domain): actions sur les créneaux`

---

### Tâche 12 : collèges, indisponibilités, export et import `.ics`

**Fichiers :**
- Créer : `src/domain/actions-etat.ts`, `src/ics/import.ts`
- Tests : `tests/unit/actions-etat.test.ts`, `tests/unit/ics-import.test.ts`

**Interfaces :**
- Consomme : `ItemExtrait`, `EvenementIcs`, `genererIcs`, `MODE_EXPORT`.
- Produit (`actions-etat.ts`) :
  - `ajouterCollege(e: Etat, nom: string, items: ItemExtrait[], id?: () => string): Etat` (couleur = nombre de collèges existants modulo 6) ;
  - `reimporterCollege(e: Etat, collegeId: string, items: ItemExtrait[]): Etat` ;
  - `modifierCollege(e: Etat, collegeId: string, champs: Partial<Pick<College, 'nom' | 'couleur' | 'coefficient'>>): Etat` ;
  - `supprimerCollege(e: Etat, collegeId: string): Etat` (supprime aussi ses items et ses créneaux, avec les suppressions en attente pour ceux qui ont été exportés) ;
  - `ajouterIndispo(e: Etat, titre: string, debut: string, fin: string, id?: () => string): Etat` ;
  - `modifierIndispo(e: Etat, id: string, champs: Partial<Pick<Indispo, 'titre' | 'debut' | 'fin'>>): Etat` ;
  - `supprimerIndispo(e: Etat, id: string): Etat` ;
  - `enregistrerRecurrence(e: Etat, r: Recurrence): Etat` (crée ou remplace, et régénère les `Indispo` de `source: 'recurrente'`, `sourceId = r.id`) ;
  - `supprimerRecurrence(e: Etat, id: string): Etat` ;
  - `importerIndisposIcs(e: Etat, nomFichier: string, evts: { titre: string; debut: string; fin: string }[]): Etat` (`sourceId = nomFichier` ; remplace l'import précédent du même fichier) ;
  - `conflits(e: Etat): { indispoId: string; creneauIds: string[] }[]` ;
  - `changementsEnAttente(e: Etat): { creneaux: Creneau[]; modifiesNonExportables: Creneau[]; suppressions: SuppressionEnAttente[] }` (avec `MODE_EXPORT === 'nouveaux'`, `creneaux` ne garde que ceux où `versionExportee === null`, et `modifiesNonExportables` liste les créneaux déjà exportés puis modifiés ; avec `'maj'`, `modifiesNonExportables` est vide) ;
  - `evenementsExport(e: Etat, portee: 'changements' | 'tout'): EvenementIcs[]` ;
  - `marquerExporte(e: Etat, creneauIds: string[]): Etat` (met aussi `premierExportFait` à true) ;
  - `viderSuppressions(e: Etat): Etat` ;
  - `modifierReglages(e: Etat, champs: Partial<Reglages>): Etat`.
- Produit (`ics/import.ts`) : `lireIcs(texte: string, aujourdhui: string): { evenements: { titre: string; debut: string; fin: string }[]; ignores: number }`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`actions-etat` :
- Une récurrence « Stage », lundi à vendredi, 08:00–13:00, du 2026-11-02 au 2026-11-15, produit 10 indisponibilités ; la modifier en 08:00–12:00 les remplace toutes.
- `conflits` signale un créneau à 9h un lundi de stage.
- **`supprimerCollege` avec 1 créneau exporté et 1 non exporté donne 1 seule suppression en attente.**
- `evenementsExport` produit `SUMMARY` `📚 300 · <titre officiel> · T1`, et ` · 1/2` pour une partie ; `DESCRIPTION` `Cancérologie · p. 153–175 (22 p)` suivie de la note si elle n'est pas vide ; le bac est exclu.
- `changementsEnAttente` après `marquerExporte` est vide.
- `reimporterCollege` garde les créneaux liés par numéro.

`ics-import` :
- `RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T235959Z` est développée correctement.
- Un `DTSTART` en `Z` est converti en heure de Paris.
- `FREQ=MONTHLY` est ignoré et `ignores` vaut 1.
- Les lignes repliées sont dépliées.
- `COUNT=3` donne 3 occurrences ; `INTERVAL=2` est respecté.
- Le développement s'arrête à 12 mois après `aujourdhui`.

- [ ] **Étape 2 : lancer et vérifier l'échec.**
- [ ] **Étape 3 : implémenter selon les §10 et §12.**
- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(domain): collèges, indisponibilités, export ; import .ics`

---

### Tâche 13 : persistance, sauvegarde et store avec annulation

**Fichiers :**
- Créer : `src/storage/db.ts`, `src/storage/backup.ts`, `src/ui/store.ts`
- Tests : `tests/unit/backup.test.ts`, `tests/unit/diff.test.ts`

**Interfaces :**
- Produit :
  - `db.ts` : la classe Dexie `RevisionsDB`, en version 1, avec les tables `colleges items creneaux indispos recurrences suppressions` (clé `id`, ou `creneauId` pour `suppressions`) et `meta` (clé `cle`, qui contient les entrées `reglages` et `premierExportFait`) ;
  - `chargerTout(): Promise<Etat>` ;
  - `diff(avant: Etat, apres: Etat): { table: string; puts: unknown[]; deletes: string[] }[]` (pure, par identité d'objet) ;
  - `enregistrer(avant: Etat, apres: Etat): Promise<void>` (une transaction) ;
  - `demanderPersistance(): Promise<boolean>`.
- `backup.ts` :
  - `exporterSauvegarde(e: Etat): string` (`{ schemaVersion: 1, exporteLe, ...tables }`) ;
  - `lireSauvegarde(texte: string): { ok: true; etat: Etat } | { ok: false; raison: string }`.
- `store.ts` (zustand) :
  - état : `{ etat: Etat; passe: Etat[]; futur: Etat[]; pret: boolean; erreur: string | null }` ;
  - `appliquer(f: (e: Etat) => Etat | null): boolean` (`null` = refus, aucun effet ; sinon empile au plus 50 niveaux, vide `futur` et persiste) ;
  - `annuler()` et `retablir()` (persistent aussi) ;
  - `initialiser(): Promise<void>`.
  - Un échec d'écriture (`QuotaExceededError`) met `erreur` au texte de la §14.

- [ ] **Étape 1 : écrire les tests qui échouent**

- **`diff` :**
  - un créneau modifié donne 1 `put` ;
  - un créneau supprimé donne 1 `delete` ;
  - aucune table touchée donne une liste vide ;
  - un changement de réglages donne un `put` dans `meta`.
- **`lireSauvegarde` :**
  - l'aller-retour donne un état égal en profondeur ;
  - un JSON invalide donne la raison « fichier illisible » ;
  - `schemaVersion: 2` donne la raison « version non prise en charge » ;
  - un créneau sans `itemId` donne la raison « créneau invalide ».

- [ ] **Étape 2 : lancer et vérifier l'échec.**
- [ ] **Étape 3 : implémenter.** Validation manuelle, table par table, sur les champs obligatoires et leurs types, sans bibliothèque de schéma.
- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(storage): IndexedDB, sauvegarde, store avec annuler/rétablir`

---

### Tâche 14 : coque de l'app

**Fichiers :**
- Créer : `src/ui/App.tsx` (remplacement), `src/ui/BarreHaut.tsx`, `src/ui/useDisposition.ts`, `src/ui/ui.css`, `src/ui/Toast.tsx`
- Test : `tests/e2e/coque.spec.ts`

**Interfaces :**
- Consomme : le store.
- Produit :
  - `useDisposition(): 'ipad' | 'iphone'` (`'ipad'` si largeur ≥ 900 px) ;
  - `type Ecran = 'calendrier' | 'reglages' | 'import'` ;
  - `<BarreHaut>`, qui affiche le mois et la semaine, ↶ ↷ (désactivés sans historique), le sélecteur de vue Semaine / Jour / Mois, la roue des réglages et l'emplacement du bouton Exporter (tâche 20) ;
  - `toast(texte: string)` ;
  - la classe CSS globale `.tremble` (200 ms).
- **Thème :** `document.documentElement.dataset.theme = reglages.theme`.

- [ ] **Étape 1 : test e2e**

L'app s'ouvre sur le calendrier. Sur `ipad`, le panneau gauche est visible ; sur `iphone`, il est absent et le bouton « Items » est présent. ↶ est désactivé. Le passage au thème sombre dans les réglages met `data-theme="sombre"`.

- [ ] **Étape 2 : implémenter**

Disposition : sur iPad, une grille à deux colonnes (`340px 1fr`, la première repliable) ; sur iPhone, une colonne, avec la bibliothèque dans une feuille du bas.

- [ ] **Étape 3 : lancer** `npx playwright test tests/e2e/coque.spec.ts`. Attendu : PASS.
- [ ] **Étape 4 : commit** `feat(ui): coque, disposition iPad/iPhone, thème`

---

### Tâche 15 : import et vérification à l'écran

**Fichiers :**
- Créer : `src/ui/screens/Import.tsx`, `src/ui/screens/Verification.tsx`, `src/ui/components/RechercheOfficielle.tsx`
- Test : `tests/e2e/import.spec.ts`

**Interfaces :**
- Consomme : `lirePdf`, `ErreurPdf`, `construireItems`, `nomDepuisFichier`, `dureeTour`, `ajouterCollege`, `reimporterCollege`, `OFFICIELS`.
- Produit : `ouvrirImport(collegeId?: string)`, qui est aussi le point d'entrée du réimport.

- [ ] **Étape 1 : test e2e**

`setInputFiles` avec un PDF généré par `pdf-lib` dans le test (un sommaire de 4 items). Vérifier :
- la barre de progression, puis 4 lignes ;
- la dernière ligne en orange avec la raison « dernier item » ;
- une correction des pages qui met à jour la durée affichée ;
- après « Valider », les 4 items présents dans la bibliothèque.

Puis un PDF sans texte : le message exact « Aucun item trouvé dans ce PDF. Ajoute-les à la main depuis la liste officielle. » s'affiche. Enfin un fichier corrompu affiche le message « illisible » de la §14.

- [ ] **Étape 2 : implémenter selon la §5.6**

Le champ « pages » ouvre le clavier numérique (`inputmode="numeric"`). Un glissement vers la gauche fait apparaître le bouton Supprimer. Le nom du collège est modifiable en tête d'écran.

- [ ] **Étape 3 : lancer.** Attendu : PASS.
- [ ] **Étape 4 : commit** `feat(ui): import de collège et écran de vérification`

---

### Tâche 16 : grille du calendrier

**Fichiers :**
- Créer : `src/ui/calendrier/Grille.tsx`, `src/ui/calendrier/Bloc.tsx`, `src/ui/calendrier/VueMois.tsx`, `src/ui/calendrier/geometrie.ts`
- Test : `tests/unit/geometrie.test.ts`

**Interfaces :**
- Consomme : `Etat`, `vueJour`, le module `temps`.
- Produit (`geometrie.ts`, pur) :
  - `plageAffichee(r: Reglages, debutsFins: Intervalle[]): Intervalle` (union des bornes et des blocs du jour, alignée sur l'heure) ;
  - `minutesVersY(min: number, plage: Intervalle, pxHeure: number): number` ;
  - `yVersMinutes(y: number, plage: Intervalle, pxHeure: number, pas: number): number` (magnétisé) ;
  - `jourSousX(x: number, colonnes: { jour: string; gauche: number; largeur: number }[]): string | null` ;
  - `chargeJour(e: Etat, jour: string): number` (minutes planifiées).
- Produit (composants) :
  - `<Grille jours={string[]} />`, où chaque colonne porte `data-jour` et chaque bloc porte `data-creneau` ou `data-indispo` ;
  - `<VueMois mois="YYYY-MM" />`.

- [ ] **Étape 1 : écrire les tests qui échouent**

- `plageAffichee` avec un créneau 06:00–07:00 et des bornes 07:00–23:00 donne 360–1380.
- `yVersMinutes` magnétise au pas de 15.
- `chargeJour` additionne les durées.

- [ ] **Étape 2 : lancer et vérifier l'échec.**

- [ ] **Étape 3 : implémenter**

- **Créneau** (§9.2, §13) : surligneur `var(--cN)`, trait d'encre de 3 px (lueur en sombre), « 300 · titre… » tronqué, ligne « T1 · 22 p · 2h45 », point si non exporté, coche si fait.
- **Indisponibilité :** hachures.
- **Ligne « maintenant »** rafraîchie chaque minute ; zone hors bornes grisée.
- **Navigation :** balayage horizontal pour changer de semaine (`touch-action: pan-y` sur la grille), et bouton « Aujourd'hui ».
- **Vue Mois :** teinte d'encre à opacité `min(1, charge / 480)`.
- **Performance :** seuls les jours affichés sont rendus.

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(ui): grille semaine/jour/mois`

---

### Tâche 17 : bibliothèque d'items

**Fichiers :**
- Créer : `src/ui/bibliotheque/Bibliotheque.tsx`, `src/ui/bibliotheque/CarteItem.tsx`, `src/ui/bibliotheque/FicheItem.tsx`, `src/ui/bibliotheque/recherche.ts`, `src/ui/bibliotheque/suggestions.ts`
- Tests : `tests/unit/recherche.test.ts`, `tests/unit/suggestions.test.ts`

**Interfaces :**
- Consomme : `progression`, `etatTours`, `prochainTour`, `dureeTour`.
- Produit (purs) :
  - `normaliser(s: string): string` ;
  - `filtrer(items: Item[], requete: string, filtres: { colleges: string[]; etats: ('nonvu' | 1 | 2 | 3)[]; longueurs: ('court' | 'moyen' | 'long')[] }, e: Etat): Item[]` ;
  - `aPlanifier(e: Etat, n = 5): Item[]` (pour chaque collège, les items non vus par numéro croissant, puis fusion triée par numéro) ;
  - `pourCombler(e: Etat, jour: string, t: number): Item[]` ;
  - `trouLibre(e: Etat, jour: string, t: number): number` (minutes jusqu'au prochain bloc ou à la fin de la journée).
- **Sélection multiple :** `selection: Set<string>` dans le store de la bibliothèque (local au composant, via `useState`), exposée au glisser-déposer par le contexte de la tâche 18.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
expect(normaliser("Tumeurs de l'Œsophage")).toBe("tumeurs de l'oesophage")
expect(filtrer(items, 'oesophage', vide, e).map(i => i.numero)).toEqual([305])
expect(normaliser('Cœur et vaisseaux')).toBe('coeur et vaisseaux')       // ligature
expect(filtrer(items, 'colon', vide, e).map(i => i.numero)).toContain(301) // accent
expect(filtrer(items, 'estomca', vide, e).map(i => i.numero)).toEqual([303]) // 1 faute, mot ≥ 5 lettres
expect(filtrer(items, '30', vide, e).map(i => i.numero)).toEqual([300,301,302,303,304,305]) // préfixe
// longueurs : court < 10, moyen 10–20, long > 20 ; état 'nonvu' = etatTours vide
// pourCombler : trou de 120 min → items dont la durée du prochain tour ≤ 120, triés par durée décroissante
```

`normaliser` : `œ` → `oe`, `æ` → `ae`, puis NFD sans diacritiques, en minuscules.

- [ ] **Étape 2 : lancer et vérifier l'échec.**

- [ ] **Étape 3 : implémenter les fonctions pures, puis les composants selon la §8**

- Anneau SVG `124 / 367 items` avec le libellé « vus au 1er tour ».
- Bac « À placer » avec badge.
- Pastilles de filtres.
- Bascule « par collège / par numéro ».
- Bouton « Sélectionner » qui affiche les cases à cocher.
- Fiche d'item au tap.
- Sur iPhone, la fiche d'item propose un bouton « Planifier… ». Un sélecteur de jour et d'heure (au pas de la grille) appelle `deposerItem` avec `cibleId: null` et `moitie: 'haute'`. Un refus affiche le toast « Pas de place à cette heure ».

- [ ] **Étape 4 : lancer et vérifier.** Attendu : PASS.
- [ ] **Étape 5 : commit** `feat(ui): bibliothèque, recherche, suggestions`

---

### Tâche 18 : glisser-déposer

**Fichiers :**
- Créer : `src/ui/dnd/ContexteDnd.tsx`, `src/ui/dnd/apercu.ts`, `src/ui/dnd/Corbeille.tsx`
- Modifier : `Grille.tsx`, `Bloc.tsx`, `CarteItem.tsx`, `VueMois.tsx`
- Test : `tests/e2e/dnd.spec.ts`

**Interfaces :**
- Consomme : `deposerItem`, `deplacerCreneau`, `deposerItemsSerie`, `redimensionner`, `supprimerCreneau`, `ajouterIndispo`, `placer`, `vueJour`, `yVersMinutes`, `jourSousX`.
- Produit :
  - `apercu(e: Etat, source: { type: 'item'; itemIds: string[] } | { type: 'creneau'; id: string }, c: Cible): { ok: boolean; positions: Record<string, string> }` (pur) : l'état projeté pour l'animation, qui appelle les mêmes actions que le lâcher, sans persister ;
  - `onTapTrou(jour, t)` : un tap sur un emplacement libre ouvre « Pour combler ce trou » dans la bibliothèque, via `pourCombler`.

- [ ] **Étape 1 : test e2e** (projet `ipad`, gestes tactiles via `page.touchscreen` et le mouvement du pointeur)

| Geste | Résultat attendu |
|---|---|
| Glisser la carte 300 sur mardi 14h | Un bloc `data-creneau` de 165 px × (pxHeure / 60) apparaît |
| Glisser 291 sur la moitié haute du bloc 300 | 300 descend |
| Lâcher sur « Stage » | La colonne reçoit `.tremble` et rien ne change |
| Tirer le bord bas | La durée change et `dureePerso` est vrai |
| Glisser vers la corbeille | Le créneau disparaît |
| ↶ | Le créneau revient |
| Sélectionner 3 items et les déposer | 3 blocs espacés de 10 min |
| Déposer sur un jour de la vue Mois | Placement à la première heure libre |
| Appui long sur une zone vide et étirer | Une feuille « Titre de l'indisponibilité » s'ouvre, puis un bloc hachuré est créé |

- [ ] **Étape 2 : implémenter**

- **dnd-kit :** `PointerSensor` avec `activationConstraint: { delay: 150, tolerance: 6 }`. La source a une rotation de −1,5° et une ombre. L'aperçu est recalculé à chaque changement de minute magnétisée, de cible ou de moitié.
- **Mouvement :** les blocs se déplacent par `transform: translateY` en 180 ms. Un refus met la colonne en `.tremble` avec une teinte `--now` à 20 %.
- **Cible et moitié :** déterminées par `elementFromPoint`, `data-creneau`, et la position relative au milieu du bloc.

- [ ] **Étape 3 : lancer.** `npx playwright test tests/e2e/dnd.spec.ts --project=ipad`. Attendu : PASS.

- [ ] **Étape 4 : vérification manuelle de fluidité**

Dans l'onglet Performance de Chrome, avec un CPU ralenti ×4 pendant un glissement : aucune tâche longue de plus de 50 ms.

- [ ] **Étape 5 : commit** `feat(ui): glisser-déposer avec aperçu de cascade`

---

### Tâche 19 : fiches et réglages

**Fichiers :**
- Créer : `src/ui/feuilles/FicheCreneau.tsx`, `src/ui/feuilles/FicheIndispo.tsx`, `src/ui/screens/Reglages.tsx`, `src/ui/components/Feuille.tsx`
- Test : `tests/e2e/reglages.spec.ts`

**Interfaces :**
- Consomme : `basculerFait`, `modifierNote`, `supprimerCreneau`, `modifierIndispo`, `supprimerIndispo`, `enregistrerRecurrence`, `supprimerRecurrence`, `lireIcs`, `importerIndisposIcs`, `conflits`, `modifierCollege`, `supprimerCollege`, `modifierReglages`, `exporterSauvegarde`, `lireSauvegarde`, `livrerIcs` (pour livrer la sauvegarde avec le type `application/json`, renommé `livrerFichier(contenu, nom, type)` à cette tâche), `dureeTour`.
- Produit : `<Feuille>`, une feuille modale qui monte du bas sur iPhone et s'affiche en popover centré sur iPad.

- [ ] **Étape 1 : test e2e**

- **Fiche créneau :** « ✓ Fait » fait avancer l'anneau.
- **Réglages › Durées :** passer le rythme à « 60 min pour 6 pages » change l'aperçu en « Item de 18 p → T1 : 3h00 · T2 : 1h30 · T3 : 1h00 ». Les créneaux existants gardent leur durée.
- **Récurrence :** créer « Stage lun→ven 8h–13h » fait apparaître des blocs hachurés ; un créneau en conflit est signalé « 1 créneau chevauche “Stage” ».
- **Sauvegarde :** la sauvegarde produit un téléchargement JSON ; une restauration invalide affiche le message de la §14, et les données restent inchangées.
- **Collèges :** la suppression d'un collège demande une confirmation.
- **Import `.ics` :** un fichier illisible affiche « Ce fichier de calendrier n'a pas pu être lu. ». Un fichier avec une règle mensuelle affiche « 1 règle de répétition non prise en charge, ignorée ».
- **Persistance :** si `demanderPersistance()` renvoie false, Réglages › Données affiche « Pense à sauvegarder régulièrement : iOS peut effacer les données de l'app si l'espace manque. »

- [ ] **Étape 2 : implémenter selon les §10 et §11**

`livrerIcs` est généralisée en `livrerFichier(contenu, nom, type)`, et `livrerIcs` devient un appel de `livrerFichier` avec le type `text/calendar`.

- [ ] **Étape 3 : lancer.** Attendu : PASS.
- [ ] **Étape 4 : commit** `feat(ui): fiches, indisponibilités, réglages, sauvegarde`

---

### Tâche 20 : export

**Fichiers :**
- Créer : `src/ui/export/BoutonExport.tsx`, `src/ui/export/FeuilleExport.tsx`
- Test : `tests/e2e/export.spec.ts`

**Interfaces :**
- Consomme : `changementsEnAttente`, `evenementsExport`, `genererIcs`, `livrerIcs`, `marquerExporte`, `viderSuppressions`, `MODE_EXPORT`, `meta.premierExportFait` (stocké dans la table `meta`).

- [ ] **Étape 1 : test e2e**

- Le badge vaut 2 après 2 dépôts.
- La feuille propose « Changements (2) » par défaut, et « Tout le planning ».
- Le premier export affiche l'encart « Crée un calendrier “Révisions”… ».
- Le fichier téléchargé contient 2 `VEVENT`, puis le badge passe à 0.
- Déplacer un créneau puis réexporter : `SEQUENCE:2`, même UID.
- Supprimer un créneau exporté : la liste « À supprimer à la main dans Calendrier : … » apparaît après l'export ; « C'est fait » la vide.
- Avec `MODE_EXPORT = 'nouveaux'` (simulé), un créneau modifié affiche la procédure « Tout réexporter ».

- [ ] **Étape 2 : implémenter selon la §12**, avec la méthode de livraison retenue à la tâche 3.
- [ ] **Étape 3 : lancer.** Attendu : PASS.
- [ ] **Étape 4 : commit** `feat(ui): export vers Calendrier Apple`

---

### Tâche 21 : iPhone, finitions et recette

**Fichiers :**
- Modifier : composants UI selon les écarts constatés
- Créer : `tests/e2e/parcours.spec.ts`, `docs/superpowers/notes/recette.md`

- [ ] **Étape 1 : parcours complet e2e, sur les deux projets**

Importer, valider, déposer 3 items, en marquer 1 fait, exporter, recharger la page : tout persiste.

Sur `iphone` : la bibliothèque s'ouvre en feuille, « Planifier… » choisit un jour et une heure, et la vue par défaut est Jour.

- [ ] **Étape 2 : contrôles qualité**

- **Poids :** `npm run build` ; le chunk d'entrée fait ≤ 250 Ko gzip (le noter).
- **Contraste :** vérifier que chaque surligneur, avec l'encre `#1E2A5A`, atteint au moins 4,5:1. En sombre, vérifier `#E6E6FA` sur `#33264A`.
- **Accessibilité :** cibles ≥ 44 px, focus visible, `prefers-reduced-motion`.

- [ ] **Étape 3 : déployer, puis recette sur l'iPad et l'iPhone d'Emma** (checklist dans `recette.md`)

- installation sur l'écran d'accueil ;
- mode avion, puis l'app s'ouvre et les données sont là ;
- import d'un vrai collège ;
- glisser au doigt ;
- export, puis apparition sur l'iPhone via iCloud ;
- thème sombre le soir.

**Attendre le retour de l'utilisateur.**

- [ ] **Étape 4 : commit** `chore: recette et finitions`
