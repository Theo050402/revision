# Audit de design `apple-design`

- **Date :** 3 novembre 2026 (tâche 14 des améliorations, spec E)
- **Base :** branche `feat/ameliorations` au commit `9711e96`
- **Suite :** la tâche 15 applique les constats hauts et moyens (les bas s'ils ne touchent pas l'identité).

## Méthode

- **Référence :** skill `apple-design` (§ cités entre crochets, ex. [§12 Matériaux]) et grille de la spec E : 1 hiérarchie et typographie, 2 matériaux, 3 réponse et retours, 4 cohérence spatiale et repères, 5 espacements et alignements, 6 clair et sombre.
- **Captures :** 114 captures Playwright (WebKit), servies par `vite preview` comme les e2e, données de `tests/e2e/graine-calendrier.ts` plus les items et le bac de `bibliotheque.spec.ts`, « maintenant » figé au mercredi 4 nov. 2026, 10 h 30. iPad 1180 × 820, iPhone 393 × 852 (×2). Thème choisi dans Réglages › Apparence, captures prises plus de 300 ms après. Rangées dans `.superpowers/sdd/2026-11-02-ameliorations/shots/audit-<écran>-<ipad|iphone>-<clair|sombre>.png`, où `<écran>` vaut : `calendrier-semaine`, `calendrier-jour`, `calendrier-mois`, `bibliotheque`, `bibliotheque-bas`, `fiche-item`, `fiche-creneau`, `fiche-indispo`, `nouvelle-indispo`, `nouvelle-indispo-erreur`, `toast`, `export`, `export-bas`, `glisser`, `lasso`, `selection`, `reglages-1` à `-6`, `confirmation-vider`, `import`, `verification`, `verification-bas`, `import-erreur`, `vide-calendrier`, `vide-bibliotheque` (iPhone), `erreur-lecture` (base illisible simulée ; thème par `prefers-color-scheme`, la base n'étant pas lisible).
- **Pas capturé :** l'écran « Chargement… » (fugace), le bandeau d'erreur d'écriture (quota), les états `prefers-reduced-transparency` et `prefers-contrast` (rien ne les gère encore, voir M5). Pour le refus de dépôt et la feuille tirée, les captures des tâches 7, 9 et 12 (`task-7-*-refus`, `task-9-iphone-feuille-tiree`, `task-12-*-refus`) restent valables.
- **Limite :** sur Windows, le WebKit de Playwright affiche `<input type="date">` en ISO (`2026-11-04`) sans sélecteur natif. Ce qui touche les champs date est donc à confirmer sur l'iPad et l'iPhone d'Emma.
- **Identité conservée :** « Petits carreaux » en clair (papier quadrillé, surligneurs `--c0…--c5`, encre `#1e2a5a`, marge rouge `--margin`, polices Bricolage Grotesque et Atkinson Hyperlegible), « Garde de nuit » en sombre. Aucun constat ne change la palette ni les polices (hors périmètre de E). Les jetons proposés réutilisent les couleurs existantes.
- **Rangement :** la coque commune (§ 0) est découpée par axe de la grille ; dans les écrans 1 à 14, les constats sont rangés par axe croissant, l'axe étant noté après le titre (*axe N*). Les bilans « Déjà bien » ferment chaque écran.
- **Priorités :** **haute** = visiblement faux ou gênant à l'usage ; **moyenne** = écart net à la règle, sans gêne immédiate ; **basse** = finition. Identifiants : H (haute), M (moyenne), B (basse). Un constat qui revient sur plusieurs écrans est détaillé une seule fois, à sa première apparition, puis cité par son identifiant.

---

## 0. Coque commune : barre du haut, barre du calendrier, feuilles

**1. Hiérarchie et typographie**

- **M1 · Tailles en px, texte agrandi d'iOS ignoré.** *(axe 1)* `tokens.css` fixe `--fs-1…--fs-5` en px (11 / 12,5 / 14 / 17 / 22) et `body { font-size: 14px }` ; aucune unité `rem` dans l'app. Le réglage « Taille du texte » d'iOS n'a donc aucun effet (toutes les captures). *Règle :* [§15] « Respect the user's text-size setting… spacing in rem/em, not fixed px ». *Correction :* voir « Changements de jetons » (§ T1) : racine à 17 px (`html { font-size: 106.25% }`), puis `font: -apple-system-body` sur iOS ; échelle en `calc(N / 17 * 1rem)` ; `body { font-size: var(--fs-3) }`. Les textes de la grille (blocs, heures, en-têtes de jour), dont la géométrie reste en px, sont plafonnés par `min()`. Le `line-height: 15px` / `13px` de `.bloc-titre` / `.bloc-meta` (`calendrier.css`) passe en relatif (1,2). *Priorité :* moyenne.
- **M2 · Interlignage et approche identiques à toutes les tailles.** *(axe 1)* Aucun `letter-spacing` sauf `.copie-heure`. `body` n'a pas d'interlignage (valeur `normal`, ≈ 1,2 avec Atkinson), si bien que les paragraphes `.aide` sont serrés (`audit-reglages-1-ipad-clair` : le texte d'intro de « Durées »), alors que `.export-info` et `.message-info` sont à 1,4–1,45. *Règle :* [§15] interlignage et approche propres à chaque taille : titres serrés, petit texte légèrement espacé. *Correction :* paires `--lh-*` / `--ls-*` (§ T1) ; `body { line-height: var(--lh-3) }` ; `h1, h2, h3` et `.mois`, `.calendrier-periode`, `.jour-tete b` prennent l'approche négative de leur taille. *Priorité :* moyenne.

**2. Matériaux**

- **M3 · Trois filets empilés en tête du calendrier, aucune surface translucide là où le contenu passe dessous.** *(axe 2)* `.barre` (`border-bottom`), `.calendrier-barre` (`border-bottom`) et `.grille-tete` (`border-bottom`) tracent trois filets en 120 px (`audit-calendrier-semaine-ipad-clair`). Seule `.grille-tete` est réellement survolée par le contenu, car la grille défile sous elle. *Règle :* [§12] « Scroll edge effects, not hard dividers… only where floating UI actually overlaps content » ; barres en surfaces translucides avec le contenu dessous. *Correction :*
  - `.barre` et `.calendrier-barre` forment un seul groupe de chrome opaque (rien ne défile dessous, donc pas de flou inutile) : supprimer `border-bottom` sur `.barre` quand elle est suivie de la barre du calendrier, en gardant celui de `.calendrier-barre` ;
  - `.grille-tete` et `.mois-entete` passent en matériau fin : `background: var(--materiau-fin); backdrop-filter: var(--flou-fin)` (§ T3). `border-bottom` est remplacé par une ombre de bord qui n'apparaît qu'une fois la grille défilée : `box-shadow: 0 1px 0 var(--line), 0 6px 12px -8px rgb(0 0 0 / 0.18)` sous `[data-bord-haut]`, attribut posé par un écouteur `scroll` passif sur `.calendrier-defilement` (`Calendrier.tsx`) quand `scrollTop > 0` ;
  - si le flou pèse sur la fluidité du glisser sur iPad (voir le commentaire « Limites de mise en page » de `dnd.css`), garder le fond opaque et seulement l'ombre de bord.

  *Priorité :* moyenne.
- **M5 · Ni `prefers-reduced-transparency` ni `prefers-contrast`.** *(axe 2)* La seule surface translucide (`.barre-selection`, `selection.css`) et celles de M3 et M12 n'ont aucun repli. *Règle :* [§14] surfaces plus opaques et sans flou si la transparence est réduite ; fond quasi plein et bord défini si le contraste est augmenté. *Correction :* blocs de repli communs (§ T3), appliqués aux sélecteurs `.barre-selection, .grille-tete, .mois-entete, .verif-pied, .ecran-entete` ; repli supplémentaire `@supports not (backdrop-filter: blur(1px))` → fond opaque. Note : Safari ne gère pas encore `prefers-reduced-transparency` (le réglage « Réduire la transparence » d'iOS ne l'atteint pas) ; `prefers-contrast: more` correspond bien à « Augmenter le contraste ». Pour l'e2e de la tâche 15, la règle CSS doit exister même si WebKit ne l'émule pas : tester ce cas sous Chromium, ou par `page.emulateMedia({ contrast: 'more' })` pour le contraste. *Priorité :* moyenne.

**3. Réponse et retours**

- Déjà bien : l'appui est instantané partout (`[data-presse]`, `mouvement/appui.ts`, échelle 0,97 ou voile, 100 ms) [§1].

**4. Cohérence spatiale et repères**

- **M13 · « + Indisponibilité » ne se distingue pas de la navigation ; sur iPhone, un « + » encadré ambigu.** *(axe 4)* Sur iPad, les boutons « Aujourd'hui » et « + Indisponibilité » ont exactement le même gabarit (trait 1,5 px d'encre, `calendrier.css` `.btn-aujourdhui` / `.btn-nouvelle-indispo`), bien que le commentaire annonce un « trait plein pour se distinguer ». Sur iPhone, le « + » est un carré encadré à côté des chevrons ‹ › sans cadre (`audit-calendrier-jour-iphone-clair`) : une autre famille de contrôle, et rien ne dit ce qu'il ajoute. *Règle :* [§16 Familiarity] ce qui se ressemble doit se comporter pareil ; [§16] libellés précis. *Correction :* iPad : `.btn-nouvelle-indispo` en bouton teinté, distinct de la navigation : `border-color: transparent; background: var(--field)` (survol : `color-mix(in srgb, var(--accent) 10%, var(--field))`). iPhone (< 600 px) : même teinte, sans trait, 44 × 44, une icône SVG `.icone` (calendrier barré d'un « + », ou « + » au trait de 1,8 comme les autres icônes) à la place du glyphe texte, nom accessible inchangé. *Priorité :* moyenne.
- **M4 · iPhone, vue Jour : le chrome prend 27 % de l'écran et répète la date.** *(axe 4)* Barre du haut sur deux rangs, barre du calendrier, puis en-tête de colonne « mer. 4 » : ≈ 220 pt sur 852 (+ 60 pt de dock). La période « mercredi 4 novembre » est déjà dans la barre du calendrier (`audit-calendrier-jour-iphone-clair`). *Règle :* [§16 Simplicity] chaque élément mérite sa place ; hiérarchie claire. *Correction :* `.grille[data-nb-jours='1'] .grille-tete { display: none }` (vue Jour, iPad et iPhone), ce qui libère 48 px. À vérifier : `calendrier.spec.ts:257` lit `.jour-tete[data-aujourdhui] b` (le texte reste dans le DOM) ; l'éclairage d'en-tête visé (`dnd.css`) n'a pas d'objet en vue Jour. *Priorité :* moyenne.
- **B15 · Hors calendrier, la barre garde le titre « Novembre · semaine 45 ».** *(axe 4)* Dans Réglages et l'import, le titre du mois ne dit pas où l'on est (`audit-reglages-1-ipad-clair`) ; c'est le `h1` de l'écran qui le fait. *Règle :* [§16 Wayfinding]. *Correction :* garder le titre (identité, surligneur) mais estomper `.barre-titre` (`opacity: 0.55`) quand l'écran n'est pas le calendrier : passer `data-ecran` à `.barre` (`BarreHaut.tsx`). *Priorité :* basse.

**5. Espacements et alignements**

- **M17 · Boutons texte décalés de 12 px du bord du contenu.** *(axe 5)* `.btn-texte` a `padding: 0 12px`. Placé en tête de colonne ou de rangée, son texte commence à 12 px du bord d'alignement : « Plus de filtres » (x = 28 au lieu de 16, `audit-bibliotheque-ipad-clair`), « ← Retour » (`audit-fiche-item-ipad-clair`), « Supprimer » et « Annuler » des feuilles (`audit-fiche-creneau-ipad-clair`, `audit-nouvelle-indispo-ipad-clair`), « Sélectionner » (en fin de rangée, `audit-bibliotheque-bas-iphone-sombre`). *Règle :* [§16 Craft] alignements optiques, « nothing is random ». *Correction :* compenser la marge intérieure au lieu de la retirer, pour garder 44 px de cible : `.fiche-retour, .bib-effacer, .bib-plus, .feuille-actions > .btn-texte:first-child, .import-actions > .btn-texte:first-child { margin-inline-start: -12px }` et `… > .btn-texte:last-child { margin-inline-end: -12px }` dans les rangées alignées à droite (`.bib-titre-ligne`). Les `padding: 0 4px` locaux (`.bib-effacer`, `.bib-plus`, `.fiche-retour`) deviennent inutiles. *Priorité :* moyenne.
- **M18 · Une seule ombre et treize rayons.** *(axe 5)* `--ombre` (0 10px 28px navy 18 %) sert au toast, à la corbeille, à la barre de sélection, à l'étiquette d'heure et aux feuilles : petit et grand ont la même profondeur. Les rayons valent 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 28, 99 et 999 px. *Règle :* [§12] « Bigger surfaces should read as thicker » ; spec E5 « rayons et ombres hiérarchisés ». *Correction :* échelles `--ombre-1…3` et `--r-1…5` (§ T2) ; affectation : feuilles et popovers `--ombre-3` / `--r-5` ; toast, barre de sélection, corbeille `--ombre-2` / `--r-4` ; étiquette d'heure `--ombre-1`. Rayons concentriques : rayon intérieur = rayon extérieur − marge (barre de sélection 14 − 6 = 8 pour ses boutons ; toast 14 − 4 = 10). *Priorité :* moyenne.
- **B8 · Espacements hors de la grille de 4 px.** *(axe 5)* `.barre` `padding: 10px 16px` → `8px 16px` ; `.panneau-contenu` `18px 20px 18px 16px`, `gap: 14px` → `16px 20px 16px 16px`, `gap: 16px` ; `.import-carte` / `.fiche` / `.feuille-confirmation` `gap: 14px` → `16px` (ou `12px`) ; `.export-info` `12px 14px` → `12px 16px` ; `.copie-heure` `3px 9px` → `4px 10px` ; `.verif-contenu` `18px 16px 0` → `16px 16px 0`. Les blocs du calendrier (3 et 5 px) restent denses. *Règle :* [§16 Craft]. *Priorité :* basse.
- **B9 · Opacité des boutons inactifs variable.** *(axe 5)* 0,4 (`.btn-principal`, `.btn-ajout`), 0,45 (`.btn-icone`), 0,5 (`.recherche-ligne`), 0,55 (`.btn-secondaire`). *Correction :* `--opacite-inactif: 0.4` partout. *Priorité :* basse.

**6. Clair et sombre**

- **H3 · Garde de nuit : feuilles et popovers plus sombres que la page, voile inopérant.** *(axe 6)* `.feuille` est sur `--panel` `#241934`, plus sombre que `--bg` `#2b1e3e`. Le voile `rgb(20 14 40 / 0.4)` posé sur `--bg` donne `rgb(34 24 53)`, la feuille `rgb(36 25 52)` : surface et fond assombri sont **indiscernables**. Seul le filet `--margin` du haut les sépare (`audit-confirmation-vider-ipad-sombre`, `audit-fiche-creneau-iphone-sombre`, `audit-fiche-indispo-ipad-sombre`). L'ombre `--ombre` est teintée d'encre navy, invisible sur le violet. *Règle :* [§12] « Dim to focus » ; une surface plus haute paraît plus épaisse. En sombre, l'élévation éclaircit. *Correction :* en sombre seulement (les deux blocs de `tokens.css`) :
  - `--surface-haute: var(--card)` (`#33264a`, déjà validé : encre 11,25:1, `--muted` 5,39:1), à utiliser pour `.feuille`, `.feuille::after`, `.toast` et `.barre-selection` (base du `color-mix`) ; en clair, `--surface-haute: var(--panel)` ;
  - `--voile: rgb(10 6 22 / 0.6)` (clair : `rgb(20 14 40 / 0.4)` inchangé), pour `.feuille-voile` ;
  - ombres en noir (§ T2) et reflet `box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06)` sur les surfaces hautes.

  *Priorité :* haute.
- **M20 · Changement de thème brutal.** *(axe 6)* `App.tsx` pose `data-theme` d'un coup : saut de luminosité plein écran. *Règle :* [§14] « ease dark↔light theme changes ». *Correction :* dans l'effet de thème d'`App.tsx`, si un thème était déjà posé, que `document.startViewTransition` existe (Safari 18+) et que le mouvement n'est pas réduit, faire `document.startViewTransition(() => { document.documentElement.dataset.theme = theme })` ; CSS : `::view-transition-old(root), ::view-transition-new(root) { animation-duration: 250ms; animation-timing-function: ease; }`. Sinon, changement direct comme aujourd'hui. Ne pas ajouter de `transition` de couleurs sur `*` (coût du glisser). *Priorité :* moyenne.
- **B1 · Surligneur du mois boueux en sombre.** *(axe 6)* Le jaune à 40 % sur `#2b1e3e` donne `rgb(128 109 74)`, un kaki (`audit-calendrier-semaine-ipad-sombre`). *Correction :* essayer `rgb(255 228 92 / 0.5)` ou `color-mix(in srgb, var(--c0) 45%, var(--bg))` dans les trois règles `.surligneur` sombres de `ui.css`, et garder la plus lisible. Couleur identique, seul le dosage change. *Priorité :* basse.

---

## 1. Calendrier, vue Semaine

Captures : `audit-calendrier-semaine-{ipad,iphone}-{clair,sombre}`.

- **B3 · Poignée de durée visible sur chaque bloc.** *(axe 1)* Le trait gris de `.poignee-redim::after` (35 % d'encre) est dessiné sur tous les blocs. Il charge la grille et chevauche la méta des blocs courts (« 290 · … 45 min », `audit-calendrier-semaine-ipad-clair`). *Règle :* [§16 Simplicity]. *Correction :* au repos, `background: color-mix(in srgb, var(--ink) 22%, transparent)` ; pleine encre sous `[data-presse]` et `[data-active]` (déjà) ; masquée sur les blocs de moins de 40 px de haut (attribut `data-court` posé par `Bloc.tsx`, la cible tactile reste). *Priorité :* basse.
- **M3** (en-tête des jours translucide, un seul filet), **M1** et **M2** (titres des blocs plafonnés en taille et relatifs en interlignage).
- **H1 · Rouge du « maintenant » utilisé comme texte : contraste sous AA en clair.** *(axe 6)* `.jour-tete[data-aujourdhui='true']` écrit « mer. » (12,5 px, normal) en `--now` `#d9473f` sur `#fcfcfa` : **4,15:1**. Même défaut ailleurs : `.message-erreur` (`reglages.css`, 12,5 px gras) 4,27:1 sur blanc ; texte blanc sur fond `--now` dans `.bib-badge` (11 px gras), `.ligne-glisse` (`import.css`) et `.copie-nombre` (`dnd.css`) : 4,27:1. `scripts/contraste.mjs` ne mesure aucune de ces paires. *Règle :* contraintes globales (AA) ; [§16 Craft] « colors that adapt to light/dark ». *Correction :* jeton `--rouge-texte` : clair `color-mix(in srgb, var(--now) 88%, #000)` (5,29:1 sur blanc, 5,15 sur `--bg`, 4,80 sur `--field`, 4,82 sur le bac teinté), sombre `var(--now)` (7,4 / 8,0 / 6,6:1 sur fond / panneau / carte). L'utiliser pour tout texte rouge (`.jour-tete` aujourd'hui, `.message-erreur`, `.btn-danger-texte`) et comme fond des textes posés sur du rouge (`.bib-badge`, `.ligne-glisse`, `.copie-nombre`, et à la place des `color-mix` en dur de `.btn-danger` et `.barre-selection-supprimer`). La ligne et le point « maintenant », qui ne sont pas du texte, restent en `--now`. Ajouter ces paires à `contraste.mjs`. *Priorité :* haute.
- Déjà bien : les surligneurs en dégradé avec trait d'encre en clair, les cartes à lueur colorée en sombre, les hachures des indisponibilités, la colonne du jour teintée, la ligne « maintenant ». L'identité est nette et lisible.

## 2. Calendrier, vue Jour

Captures : `audit-calendrier-jour-{ipad,iphone}-{clair,sombre}`.

- **M4** (en-tête de colonne redondant sur iPhone), **M13** (« + » ambigu).
- Rien d'autre : en vue Jour, les blocs larges montrent bien la hiérarchie titre / méta.

## 3. Calendrier, vue Mois

Captures : `audit-calendrier-mois-{ipad,iphone}-{clair,sombre}`.

- **B6 · « Novembre » deux fois.** *(axe 4)* Le titre dit « Novembre », la période dit « Novembre 2026 » (`audit-calendrier-mois-iphone-sombre`). *Correction :* en vue Mois, la période n'affiche que l'année si le mois est celui du titre, ou bien le titre prend l'année. *Priorité :* basse.
- **H4 · En sombre, les jours chargés deviennent des carreaux presque blancs.** *(axe 6)* L'encre de charge `.mois-jour::before { background: var(--ink); opacity: var(--charge) }` vaut `#e6e6fa` en sombre : un jour de 8 h devient un carreau blanc éblouissant (9 et 17 nov., `audit-calendrier-mois-ipad-sombre`, `audit-calendrier-mois-iphone-sombre`). La métaphore s'inverse : l'encre devrait assombrir, pas éclairer. *Règle :* [§14] éviter les sauts de luminosité ; [§16 Craft] couleurs adaptées au clair et au sombre. *Correction :* jetons `--charge-encre` (clair `var(--ink)`, sombre `var(--accent)`) et `--charge-max` (clair 1, sombre 0,55) ; `.mois-jour::before { background: var(--charge-encre); opacity: calc(var(--charge, 0) * var(--charge-max)) }`. Au maximum en sombre, le carreau vaut `rgb(106 90 130)`, encore distinct du panneau, sans éblouir. Les pastilles du numéro et de la charge sont pleines : leur contraste ne change pas. *Priorité :* haute.
- Déjà bien : les pastilles pleines sous le numéro et la charge (lisibles à toute densité), aujourd'hui en pastille inversée avec liseré, les jours hors mois estompés.

## 4. Glisser, lasso et mode sélection

Captures : `audit-glisser-*`, `audit-lasso-*`, `audit-selection-*` (et `task-7-*`, `task-12-*` pour les refus).

- **B2 · Le voile du lasso salit les surligneurs.** *(axe 2)* `.lasso` (z-index 6) passe au-dessus des blocs. L'accent navy à 12 % fait virer le jaune et le rose au kaki (`audit-lasso-ipad-clair`). *Règle :* [§12] « Never stack… legibility collapses ». La couleur doit rester sur la couche pleine. *Correction :* garder 12 % (spec D.1), mais faire passer le fond sous les blocs et le bord au-dessus : `.lasso { z-index: 0 }`, plus un `::after` (`position: absolute; inset: 0; border: 1.5px solid var(--accent); z-index: 6`) ; à défaut, `background` à 8 %. *Priorité :* basse.
- **B10 · Repli du panneau iPad animé par `grid-template-columns`.** *(axe 3)* `ui.css` `.coque[data-dispo='ipad'] { transition: grid-template-columns 180ms ease }` : une animation de mise en page, contraire à la contrainte « `transform` et `opacity` uniquement ». *Correction (si simple) :* pendant l'animation, faire glisser le panneau en `translateX` et ne changer la colonne qu'une fois, au début (ouverture) ou à la fin (fermeture). Sinon, laisser en l'état. *Priorité :* basse.
- **M12 (sortie de la barre de sélection), voir § 13.**
- Déjà bien, et conforme au skill : copie collée au doigt et soulevée (échelle 1,04, −1,5°, ombre profonde) [§2] ; emplacement d'atterrissage par ressort [§4] ; colonne visée éclairée ; étiquette « mer. 4 · 15h → 17h » ; refus rouge qui tremble [§13] ; barre de sélection translucide avec flou [§12] et entrée par ressort ; anneau et coche de sélection lisibles dans les deux thèmes. Les mouvements (tâches 5 à 12) ne sont pas remis en cause.

## 5. Bibliothèque

Captures : `audit-bibliotheque-*`, `audit-bibliotheque-bas-*`.

- **B7 · Guillemets coupés en fin de ligne.** *(axe 1)* « Importe un livre avec « + / Collège ». » se coupe après « + » (`audit-vide-bibliotheque-iphone-sombre`). *Correction :* espaces insécables fines (U+202F) à l'intérieur des guillemets français dans les textes de l'interface (`Bibliotheque.tsx` et suivants ; une recherche de `« ` / ` »` suffit). *Priorité :* basse.
- **M9 · Le bac « À placer » prend les habits d'une erreur.** *(axe 3)* Trait gauche `--now` et fond rouge teinté (`bibliotheque.css` `.bib-bac`) pour un état normal (des créneaux à poser). C'est le même langage que `.bandeau-erreur`. *Règle :* [§16] « Feedback comes in four kinds: status, completion, warning, error » ; un seul code par type. *Correction :* voir § 14 (encarts à quatre tons) : le bac passe au ton avertissement (`--c3` orange, comme les conflits et « À vérifier »), la pastille du nombre reste rouge (badge de compte). *Priorité :* moyenne.
- **M14 · Feuille « Items » (iPhone) : la fiche d'item s'ouvre dedans sans changer de titre, et la hauteur de la feuille saute.** *(axe 4)* Après le toucher d'une carte, l'en-tête dit toujours « Items », le retour est un « ← Retour » dans le corps, et la feuille passe de 85 % à ≈ 60 % de haut (`audit-bibliotheque-iphone-clair` → `audit-fiche-item-iphone-sombre`). *Règle :* [§16 Wayfinding] « Where am I? How do I get out? » ; [§7] une surface garde sa place. *Correction :* hauteur fixe pour cette feuille : `className="feuille-items"` sur la `<Feuille titre="Items">` d'`App.tsx` et `.feuille-items { height: 85dvh }` ; libellé du retour précis : « ‹ Tous les items » (`FicheItem.tsx`, deux occurrences, à garder synchronisées avec les e2e qui cherchent `/Retour/`). *Priorité :* moyenne.
- **M17** (« Plus de filtres », « Sélectionner » décalés).
- Déjà bien : cartes à pastille de surligneur, anneau de progression, filtres en pastilles de 32 px avec zone d'appui de 46 px, en-têtes de collège repliables.

## 6. Fiche d'item

Captures : `audit-fiche-item-*`.

- **M14** (iPhone : titre et hauteur), **M17** (« Retour » décalé).
- **B11 · Les créneaux listés ressemblent à des cartes touchables, mais ne le sont pas.** *(axe 4)* `.fiche-creneaux li` a un bord, un fond de carte et un rayon de 8 px, comme `.carte-item` qui, elle, se touche et se glisse. *Règle :* [§16 Familiarity] « things that look the same must behave the same ». *Correction :* liste groupée non interactive : `.fiche-creneaux { border: 1px solid var(--line); border-radius: var(--r-3); background: var(--card) }`, `li { border: 0; border-radius: 0; background: none }` et `li + li { border-top: 1px solid var(--line-half) }`. *Priorité :* basse.

## 7. Fiche créneau

Captures : `audit-fiche-creneau-*`.

- **M7 · Titre et date au même rang.** *(axe 1)* Le titre de la feuille (`h2`, Bricolage 700, `--fs-4`) et `.fiche-quand` (Bricolage 700, `--fs-4`) ont la même taille et la même graisse, si bien que la hiérarchie est plate (`audit-fiche-creneau-ipad-clair`). *Règle :* [§15] « Build hierarchy from weight + size + leading as a set ». *Correction :* `.fiche-quand { font-family: 'Atkinson Hyperlegible', system-ui, sans-serif; font-weight: 400; font-size: var(--fs-3); line-height: var(--lh-3); font-variant-numeric: tabular-nums; }`, avec la date en gras (`<b>`) si l'on veut l'accrocher. Le titre garde `--fs-4` 700 avec `--ls-4`. Même règle pour la fiche d'indisponibilité. *Priorité :* moyenne.
- **H2 · « Supprimer » est à l'encre, pas en rouge.** *(axe 3)* `FicheCreneau.tsx` (et `FicheIndispo.tsx`) donnent `className="btn-texte btn-danger-texte"`, mais `.btn-texte { color: var(--ink) }` (`ui.css`, chargé après `feuilles.css`, même spécificité) écrase `.btn-danger-texte { color: var(--now) }`. L'action destructive n'est pas signalée (`audit-fiche-creneau-ipad-clair`, `audit-fiche-indispo-ipad-sombre`). Le collège dans Réglages a le même « Supprimer » à l'encre (`audit-reglages-2-ipad-clair`). *Règle :* [§16] quatre types de retour, avertissement avant une action destructive ; [§16 Familiarity]. *Correction :* `.btn-texte.btn-danger-texte { color: var(--rouge-texte) }` (spécificité supérieure, voir H1 pour le jeton), et `btn-danger-texte` ajouté au « Supprimer » de `Colleges.tsx`. *Priorité :* haute.
- **B4 · Deux sorties qui disent la même chose.** *(axe 4)* Les feuilles à formulaire ou de confirmation ont « Fermer » dans l'en-tête et « Annuler » dans leurs actions (`audit-nouvelle-indispo-ipad-clair`, `audit-confirmation-vider-ipad-sombre`). *Règle :* [§16 Simplicity]. *Correction :* prop `sansFermer` sur `Feuille.tsx` (Échap, voile et tirée ferment toujours), utilisée par `FeuilleNouvelleIndispo` et `FeuilleConfirmation` ; le focus initial va alors au premier champ ou à « Annuler ». *Priorité :* basse.
- **H3** en sombre.
- Déjà bien : popover iPad qui grandit depuis le bloc touché et y retourne ; feuille iPhone par ressort, tirée pour fermer ; poignée ; « ✓ Fait » en grand interrupteur.

## 8. Fiche d'indisponibilité et « + Indisponibilité »

Captures : `audit-fiche-indispo-*`, `audit-nouvelle-indispo-*`, `audit-nouvelle-indispo-erreur-*`.

- **H2** (« Supprimer »), **M7** (titre et date), **B4** (Fermer et Annuler), **M13** (bouton d'ouverture).
- **B16 · iPhone : trois champs sur une ligne, la date est tronquée.** *(axe 5)* « Jour », « Début » et « Fin » se partagent 313 px ; la date est coupée (`2026-11-0…`). C'est un artefact du WebKit de Windows ; un « 4 nov. 2026 » natif reste serré au tiers de la largeur. *Correction :* sous 600 px, `ChampQuand` met le jour sur sa propre ligne, puis début – fin. *Priorité :* basse (à confirmer sur l'iPhone).
- **H1** : le message d'erreur en ligne est en `--now` 12,5 px gras, à 4,27:1 (`audit-nouvelle-indispo-erreur-iphone-clair`).
- Déjà bien : validation en ligne (« La fin doit suivre le début. », bouton « Ajouter » désactivé) [§16 « validate inline »] ; préremplissage ; titre en placeholder concret.

## 9. Export

Captures : `audit-export-*`, `audit-export-bas-*`.

- **M10 · Un message passe par-dessus la feuille ouverte.** *(axe 2)* `.toasts` (z-index 30) au-dessus de `.feuille-fond` (20) recouvre « Tout le planning » (`audit-export-bas-iphone-clair`). *Règle :* [§12] « Dim to focus » : la tâche modale passe devant ; [§16] la notification ne doit pas cacher l'action. *Correction :* `body:has(.feuille-fond) .toasts { top: max(16px, env(safe-area-inset-top)); bottom: auto; }`, avec une entrée depuis le haut dans ce cas (`translateY(-8px)`). *Priorité :* moyenne.
- **M19 · Les `<details>` n'ont pas de chevron.** *(axe 4)* « Repartir d'un calendrier vide » (`details.export-alternative`) et « Détail technique » (`.detail-technique`, import) passent `summary` en `display: flex`, ce qui retire le marqueur natif : rien n'indique qu'ils s'ouvrent. Le cadre en tirets de `.export-alternative` est aussi celui des boutons d'ajout. *Règle :* [§16 Familiarity], [§8] « hint in the direction ». *Correction :* `summary::after` avec un chevron SVG en `mask` (`--ink`, 16 px, `margin-left: auto`), qui tourne de 90° quand `[open]` (`transform`, 150 ms) ; `list-style: none` et `summary::-webkit-details-marker { display: none }` ; `.export-alternative { border-style: solid; border-color: var(--line) }`. *Priorité :* moyenne.
- **H6 · L'encart d'introduction paraît rogné.** *(axe 5)* `export.css` `.export > :first-child { padding-top: 0; border-top: 0 }`, écrit pour les sections, touche aussi `.export-info`, premier enfant de `.export` : l'encart perd son bord haut et sa marge intérieure haute, et le texte colle au bord (`audit-export-ipad-clair`, `audit-export-bas-iphone-clair`). *Règle :* [§16 Craft]. *Correction :* `.export > .export-section:first-child { padding-top: 0; border-top: 0 }`. *Priorité :* haute.
- Déjà bien : la question « Calendrier a bien enregistré… ? » à la place du bouton ; « Fermer » en texte (spec A) ; bouton « Exporter » inactif en contour lisible.

## 10. Réglages

Captures : `audit-reglages-1` à `-6` (iPhone), `-1` à `-4` (iPad), `audit-confirmation-vider-*`.

- **H5 · Consigne périmée dans « Indisponibilités ».** *(axe 4)* « Les ponctuelles se tracent dans le calendrier (appui long sur un emplacement libre, puis étirer). » (`Indispos.tsx:82`, `audit-reglages-2-ipad-clair`). Depuis la tâche 13 (spec D.5), l'appui long sur le vide trace un **lasso** ; les ponctuelles s'ajoutent par « + Indisponibilité ». Emma serait envoyée vers le mauvais geste. *Règle :* [§16] libellés directs et justes ; spec D.5. *Correction :* « Les ponctuelles s'ajoutent avec « + Indisponibilité », dans la barre du calendrier. » (guillemets insécables, B7). *Priorité :* haute.
- **M15 · Sur iPhone, le titre et la sortie disparaissent au défilement.** *(axe 4)* Six écrans de réglages ; « Réglages » et « Retour au calendrier » ne sont qu'en haut (`audit-reglages-4-iphone-sombre`). *Règle :* [§16 Wayfinding] ; [§12] barre translucide avec le contenu dessous. *Correction :* `.ecran-reglages .ecran-entete { position: sticky; top: 0; z-index: 5; margin: -20px -16px 0; padding: 12px 16px; background: var(--materiau-fin); backdrop-filter: var(--flou-fin) }` (attention : c'est `main.zone` qui défile), plus l'ombre de bord de M3 et les replis de M5. *Priorité :* moyenne.
- **B5 · Tirets à contresens.** *(axe 4)* `.btn-ajout` (bord en tirets, « ajouter ») habille aussi « Réimporter », « Importer un fichier » et « Restaurer une sauvegarde », qui n'ajoutent rien (`audit-reglages-2-ipad-clair`, `audit-reglages-6-iphone-clair`). *Règle :* [§16 Familiarity]. *Correction :* `btn-secondaire` (trait plein) pour ces trois-là (`Colleges.tsx:110`, `Indispos.tsx:117`, `Restauration.tsx:46`) ; les tirets restent aux vrais ajouts (« + Tour », « + Récurrence », « + Collège », « + Ajouter un item »). *Priorité :* basse.
- **M8 · Garde de nuit : les cartes paraissent creusées.** *(axe 6)* `.carte` est sur `--panel` (`#241934`), plus sombre que le papier `--bg` (`audit-reglages-4-iphone-sombre`, `audit-import-erreur-iphone-sombre`). *Règle :* [§12] élévation, voir H3. *Correction :* `.carte { background: var(--surface-haute) }` (en sombre : `--card`). `.panneau` garde `--panel` : la barre latérale structurelle reste plus sombre, comme le veut [§12] « darker materials separate structural regions ». *Priorité :* moyenne.
- **H2** (« Supprimer » d'un collège à l'encre), **H3** et **B4** (confirmation « Vider le planning » : fond indiscernable en sombre, « Fermer » et « Annuler »).
- Déjà bien : champs à 17 px (pas de zoom de Safari), aperçu de durée en direct, « Vider le planning » rouge plein avec confirmation explicite, cartes posées sur le papier quadrillé.

## 11. Import et vérification

Captures : `audit-import-*`, `audit-verification-*`, `audit-verification-bas-*`.

- **B14 · Taille du `h1` d'import.** *(axe 1)* `.import-carte h1` n'a pas de taille : `2em` par défaut (28 px), contre `--fs-5` (22 px) pour Réglages, Vérification et l'écran d'erreur (`audit-import-ipad-clair`). *Règle :* [§15] une échelle cohérente. *Correction :* ajouter `.import-carte h1` à la règle `.ecran h1, .plein-ecran h1` d'`ui.css`. *Priorité :* basse.
- **M6 · Pied de vérification opaque, avec filet.** *(axe 2)* `.verif-pied` (sticky) : `--panel` plein et `border-top`, alors que la liste défile dessous (`audit-verification-iphone-clair`). *Règle :* [§12] barre d'actions translucide, bord de défilement au lieu de filet. *Correction :* `background: var(--materiau-epais); backdrop-filter: var(--flou-epais); border-top: 0; box-shadow: 0 -1px 0 var(--line)`, plus les replis de M5. *Priorité :* moyenne.
- **M11 · Glisser une ligne pour la supprimer : le retour est une transition CSS.** *(axe 3)* `.ligne-contenu { transition: transform 180ms ease-out }` (`import.css`) anime le lâcher sans la vitesse du doigt, et l'animation ne se reprend pas si le doigt revient. *Règle :* [§3] « Avoid CSS transitions… for anything gesture-driven » ; [§5] passage de la vitesse ; contrainte globale « ressorts du module `ressort` ». *Correction :* au lâcher, `animerValeur` (`mouvement/ressort.ts`, amortissement 1, réponse 0,3) depuis la position courante, avec la vitesse du geste, vers 0 ou −96 px selon le **signe** de la vitesse ([§ Quick reference] « Decide reverse vs. commit: velocity sign ») ; retirer la transition. Mouvement réduit : position finale directe. *Priorité :* moyenne.
- **B12 · Cadre latéral collé aux bords sur iPhone.** *(axe 5)* `.verif-contenu` a des bords gauche et droit de 1 px, utiles sur iPad, qui dessinent un cadre au ras de l'écran sur iPhone. *Correction :* `@media (max-width: 760px) { .verif-contenu { border-inline: 0 } }`. *Priorité :* basse.
- **H1** (`.ligne-glisse` blanc sur rouge) ; **M19** (« Détail technique » sans chevron).
- Déjà bien : la progression à trait de surligneur ; la ligne « À vérifier » en orange avec sa raison (texte `#8a4b00` / `#ffc47d`, lisible) ; l'ajout manuel bien mis en avant quand la liste est vide.

## 12. États vides

Captures : `audit-vide-calendrier-*`, `audit-vide-bibliotheque-iphone-*`.

- **M16 · Au premier lancement, la grille vide ne dit rien.** *(axe 4)* Seule une ligne grise de 14 px dans la bibliothèque guide (« Aucun collège pour l'instant… ») ; sur iPhone, elle est cachée derrière « Items » (`audit-vide-calendrier-ipad-clair`, `audit-vide-bibliotheque-iphone-sombre`). *Règle :* [§16 Simplicity] « Show the common path first » ; [§16 Wayfinding] « Where can I go? ». *Correction :* sans aucun collège, une `.carte .carte-vide` centrée sur la grille (`Calendrier.tsx`, dans `.calendrier-vue`, sans bloquer le défilement) : `h1` « Commence par un collège », phrase « Importe le PDF d'un collège : ses items arrivent dans la bibliothèque. », bouton `btn-principal` « + Collège », qui appelle la même demande d'import que la bibliothèque (`importDemande.ts`). Dans la bibliothèque, « + Collège » devient `btn-principal` tant qu'il n'y a aucun collège. *Priorité :* moyenne.
- Déjà bien : « Exporter » inactif en contour pâle mais lisible ; anneau à 0 %.

## 13. Notifications (toasts)

Captures : `audit-toast-*`, `audit-export-bas-iphone-clair`, `audit-selection-*`.

- **M12 · Ce qui entre en glissant sort en disparaissant.** *(axe 4)* Le toast entre par `@keyframes monter-toast` (8 px vers le haut et fondu), puis est retiré du DOM d'un coup (`Toast.tsx`). La barre de sélection entre par ressort, puis `BarreSelection` rend `null` : elle s'éteint. *Règle :* [§7] « If something disappears one way, we expect it to emerge from where it came » ; spec E4. *Correction :* garder l'élément monté le temps de la sortie : toast par `fondu` (`mouvement/geste.ts`) et `translateY(8px)` en 150 ms ; barre de sélection par le même `RESSORT_DOUX` vers `translateY(24px)` et opacité 0, puis démontage ; mouvement réduit : fondu de 150 ms seul. *Priorité :* moyenne.
- **M10** (toast au-dessus des feuilles), **M18** (ombre du toast : `--ombre-2`), **H3** (toast sur `--surface-haute` en sombre).
- Déjà bien : un toast par message, fermable, 5 s, trois au plus, au-dessus du dock et de la barre de sélection.

## 14. Erreurs et quatre types de retour

Captures : `audit-import-erreur-*`, `audit-erreur-lecture-*`, `audit-nouvelle-indispo-erreur-*`.

- **M9 · Quatre types de retour sans code commun.** *(axe 3)* Aujourd'hui :
  - *info* : `.export-info` et `.message-info`, trait `--margin` ;
  - *avertissement* : `.conflits`, `.fiche-alerte`, ligne « À vérifier » (orange, chacun à sa façon), mais aussi le bac « À placer » (rouge) ;
  - *erreur* : `.bandeau-erreur` (trait `--now`), `.message-erreur` ;
  - *réussite* : toast plein `--accent`.

  Mêmes intentions, rendus différents (fond `--field` ou teinté, trait de 3 ou 4 px, rayon de 6 ou 8 px). *Règle :* [§16] « Feedback comes in four kinds… », de façon cohérente (spec E3). *Correction :* une classe `.encart` avec `data-ton="info|avertissement|erreur"` (trait gauche de 4 px, `border-radius: var(--r-2)`, `padding: 12px 16px`, fond `color-mix(in srgb, var(--ton) 10%, var(--surface-haute))`, texte `--ink`), où `--ton` vaut `--margin`, `--c3` ou `--now`. Elle remplace les six classes ci-dessus et le style du bac. La réussite reste le toast. *Priorité :* moyenne.
- **B13 · Écran « lecture impossible » : tirets dans des tirets.** *(axe 5)* `.emplacement` (cadre en tirets) contient `.btn-ajout` (tirets) (`audit-erreur-lecture-iphone-clair`). *Correction :* l'emplacement en `.carte` pleine, ou le bouton en `btn-principal` : c'est la seule action de l'écran. *Priorité :* basse.
- **H1** pour le texte rouge.
- Déjà bien : les messages de la §14 sont précis et rassurants (« Tes données n'ont pas été modifiées. ») ; le détail technique est repliable.

---

## Ce qui est déjà bien (bref)

- Réponse dès l'appui sur tout ce qui se touche, avec un voile sans échelle en mouvement réduit [§1].
- Glisser natif : copie collée au doigt avec respect de la prise, soulèvement, frémissement, emplacement magnétisé par ressort, cascade interruptible, retour à l'origine par ressort, bords actifs, haptique au même instant [§2–§6, §13].
- Feuilles : ressort de 0,8 / 0,3 et tirée avec projection sur iPhone, popover qui grandit depuis le déclencheur sur iPad, voile qui suit l'avancée, focus rendu [§7, §12].
- Barre de sélection : seul vrai matériau translucide, et il est juste (flou de 20 px, saturation 180 %, panneau à 78 %, ombre) [§12].
- Mouvement réduit respecté partout (fondus de 150 ms, pas de tremblement, ressorts coupés) [§14].
- Cibles de 44 px, focus visible, champs à 16 px et plus, marges de zone sûre, script de contraste.
- Identité forte et cohérente : marge rouge du cahier (panneau, dock, feuilles), surligneur sous le mois, papier quadrillé, blocs en surligneurs ; en sombre, cartes à lueur colorée.

---

## Liste d'actions consolidée

Par priorité ; « Fichiers » = où corriger. Chaque ligne renvoie au constat détaillé plus haut.

### Haute (6)

| # | Action | Fichiers |
|---|---|---|
| H1 | Jeton `--rouge-texte` (clair : `--now` assombri de 12 % ; sombre : `--now`) pour tout texte rouge et tout fond rouge portant du texte : `.jour-tete` du jour, `.message-erreur`, `.btn-danger-texte`, `.bib-badge`, `.ligne-glisse`, `.copie-nombre`, `.btn-danger`, `.barre-selection-supprimer`. Paires ajoutées à `contraste.mjs`. | `tokens.css`, `calendrier.css`, `reglages.css`, `feuilles.css`, `bibliotheque.css`, `import.css`, `dnd.css`, `selection.css`, `scripts/contraste.mjs` |
| H2 | `.btn-texte.btn-danger-texte { color: var(--rouge-texte) }` ; ajouter `btn-danger-texte` au « Supprimer » d'un collège. | `feuilles.css`, `Colleges.tsx` |
| H3 | Garde de nuit : `--surface-haute` (`--card` en sombre) pour feuilles, popovers, toasts et barre de sélection ; `--voile` à 0,6 en sombre ; ombres noires et reflet haut. | `tokens.css`, `ui.css`, `selection.css` |
| H4 | Vue Mois : `--charge-encre` (accent en sombre) et `--charge-max` (0,55 en sombre). | `tokens.css`, `calendrier.css` |
| H5 | Corriger la consigne des indisponibilités ponctuelles (« + Indisponibilité »). | `reglages/Indispos.tsx` |
| H6 | `.export > .export-section:first-child` au lieu de `:first-child`. | `export.css` |

### Moyenne (20)

| # | Action | Fichiers |
|---|---|---|
| M1 | Échelle typographique en `rem` (base 17 px, `-apple-system-body` sur iOS), plafonds `min()` pour la grille, interlignage relatif des blocs (§ T1). | `tokens.css`, `calendrier.css` |
| M2 | Interlignage et approche par taille (`--lh-*`, `--ls-*`), `body { line-height }`, titres resserrés (§ T1). | `tokens.css`, `ui.css` et feuilles de titres |
| M3 | Un seul filet sous le chrome du calendrier ; `.grille-tete` / `.mois-entete` en matériau fin avec ombre de bord après défilement (`data-bord-haut`). | `ui.css`, `calendrier.css`, `Calendrier.tsx` |
| M4 | Vue Jour : masquer `.grille-tete` (doublon de la période). | `calendrier.css` |
| M5 | Replis `prefers-reduced-transparency`, `prefers-contrast: more` et `@supports not (backdrop-filter)` pour toutes les surfaces translucides (§ T3). | `tokens.css`, `selection.css`, `calendrier.css`, `import.css`, `reglages.css` |
| M6 | `.verif-pied` en matériau épais, bord de défilement. | `import.css` |
| M7 | `.fiche-quand` en Atkinson 400, `--fs-3`, chiffres tabulaires : titre et date hiérarchisés. | `feuilles.css` |
| M8 | `.carte` sur `--surface-haute` (cartes plus claires que le papier en sombre). | `ui.css` |
| M9 | `.encart[data-ton]` pour info, avertissement et erreur ; le bac « À placer » passe au ton avertissement. | `ui.css` + composants des six encarts |
| M10 | Toasts en haut de l'écran quand une feuille est ouverte. | `ui.css` |
| M11 | Ligne de vérification : lâcher par ressort avec vitesse, décision par le signe de la vitesse. | `import.css`, `Verification.tsx` |
| M12 | Sortie symétrique du toast et de la barre de sélection (fondu et translation, ressort). | `Toast.tsx`, `BarreSelection.tsx`, `ui.css` |
| M13 | « + Indisponibilité » teinté (iPad) et icône sans cadre (iPhone). | `calendrier.css`, `Calendrier.tsx` |
| M14 | Feuille « Items » à hauteur fixe (85dvh) ; retour « ‹ Tous les items ». | `App.tsx`, `ui.css`, `FicheItem.tsx` |
| M15 | En-tête des réglages collant, en matériau fin. | `reglages.css` |
| M16 | État vide du calendrier (carte « Commence par un collège » + bouton) ; « + Collège » plein tant qu'aucun collège. | `Calendrier.tsx`, `Bibliotheque.tsx`, `ui.css` |
| M17 | Alignement optique des boutons texte (marges négatives de 12 px). | `ui.css`, `bibliotheque.css`, `feuilles.css`, `import.css` |
| M18 | Ombres `--ombre-1…3` et rayons `--r-1…5` hiérarchisés, rayons concentriques (§ T2). | `tokens.css` et toutes les feuilles CSS |
| M19 | Chevron des `<details>` ; `.export-alternative` en trait plein. | `export.css`, `import.css` |
| M20 | Transition de thème en fondu de 250 ms (`startViewTransition`), sauf mouvement réduit. | `App.tsx`, `tokens.css` |

### Basse (16)

| # | Action | Fichiers |
|---|---|---|
| B1 | Surligneur du mois en sombre moins boueux (dosage à 45–50 %). | `ui.css` |
| B2 | Fond du lasso sous les blocs, bord au-dessus. | `selection.css` |
| B3 | Poignée de durée discrète au repos, masquée sur les blocs courts. | `dnd.css`, `Bloc.tsx` |
| B4 | Pas de « Fermer » dans les feuilles qui ont « Annuler » (`sansFermer`). | `Feuille.tsx`, `FeuilleNouvelleIndispo.tsx`, `FeuilleConfirmation.tsx` |
| B5 | Trait plein (`btn-secondaire`) pour Réimporter, Importer un fichier, Restaurer une sauvegarde. | `Colleges.tsx`, `Indispos.tsx`, `Restauration.tsx` |
| B6 | Vue Mois : pas de « Novembre » deux fois. | `Calendrier.tsx` |
| B7 | Espaces fines insécables dans les guillemets. | textes `*.tsx` |
| B8 | Espacements sur la grille de 4 px (liste plus haut). | `ui.css`, `export.css`, `import.css`, `dnd.css` |
| B9 | `--opacite-inactif: 0.4` pour tous les boutons inactifs. | `tokens.css` + boutons |
| B10 | Repli du panneau iPad sans animation de mise en page (si simple). | `ui.css` |
| B11 | Créneaux de la fiche d'item en liste groupée non interactive. | `bibliotheque.css` |
| B12 | iPhone : pas de bords latéraux à `.verif-contenu`. | `import.css` |
| B13 | Lecture impossible : pas de tirets dans des tirets. | `ui.css` / `Emplacements.tsx` |
| B14 | `h1` d'import à `--fs-5`. | `ui.css` |
| B15 | Titre du mois estompé hors du calendrier. | `BarreHaut.tsx`, `ui.css` |
| B16 | iPhone : jour sur sa propre ligne dans « Quand » (à confirmer sur l'appareil). | `ChampQuand.tsx`, `feuilles.css` |

---

## Changements de jetons transversaux

### T1. Échelle typographique (M1, M2)

```css
/* Racine à 17 px : 1rem = corps d'iOS à la taille de texte par défaut. */
html { font-size: 106.25%; }
/* iOS / iPadOS : la racine suit « Taille du texte » (Dynamic Type). */
@supports (font: -apple-system-body) and (-webkit-touch-callout: none) {
  html { font: -apple-system-body; }
}

:root {
  /*            taille (17 px = 1rem)       interligne        approche */
  --fs-1: calc(11 / 17 * 1rem);   --lh-1: 1.25;  --ls-1: 0.02em;    /* 11 px : heures, méta des blocs, badges */
  --fs-2: calc(12.5 / 17 * 1rem); --lh-2: 1.3;   --ls-2: 0.01em;    /* 12,5 px : étiquettes, pastilles, titres de bloc */
  --fs-3: calc(14 / 17 * 1rem);   --lh-3: 1.45;  --ls-3: 0;         /* 14 px : corps, aide, boutons */
  --fs-4: 1rem;                   --lh-4: 1.3;   --ls-4: -0.01em;   /* 17 px : titres de section, de feuille */
  --fs-5: calc(22 / 17 * 1rem);   --lh-5: 1.2;   --ls-5: -0.015em;  /* 22 px : titres d'écran, mois */
}

body { font-size: var(--fs-3); line-height: var(--lh-3); }
h1, .mois { line-height: var(--lh-5); letter-spacing: var(--ls-5); }
h2, h3, .calendrier-periode, .jour-tete b { line-height: var(--lh-4); letter-spacing: var(--ls-4); }
```

- L'approche négative ne s'applique qu'aux titres en Bricolage ; le corps en Atkinson reste à 0, et les petites tailles (`--fs-1`, `--fs-2`) prennent l'approche positive.
- **Grille, géométrie en px :** `.bloc-titre { font-size: min(var(--fs-2), 15px); line-height: 1.2 }`, `.bloc-meta { font-size: min(var(--fs-1), 13px); line-height: 1.2 }`, `.heure { font-size: min(var(--fs-1), 13px) }`, `.jour-tete { font-size: min(var(--fs-2), 15px) }`. Les blocs ne débordent donc pas aux grandes tailles de texte. La barre du haut peut plafonner `.mois` à `min(var(--fs-5), 26px)`.
- `.bib-anneau text { font-size: 11px }` (SVG) et `.detail-technique { font-size: 12.5px }` passent sur les jetons. Les champs à `16px` en dur (`bibliotheque.css`) deviennent `max(16px, var(--fs-4))`, pour ne jamais passer sous 16 px (zoom de Safari).
- À vérifier après coup : barre iPhone à 393 px avec la taille de texte « Grande » (pas de débordement horizontal ; e2e `indispo.spec.ts` à 375 px).

### T2. Ombres et rayons (M18, H3)

```css
:root {
  --r-1: 4px;    /* blocs, lasso, emplacement d'atterrissage */
  --r-2: 8px;    /* pastilles, encarts, petits champs */
  --r-3: 10px;   /* boutons, champs, cartes d'item (= --rayon actuel) */
  --r-4: 14px;   /* cartes d'écran, barre de sélection, toast, corbeille */
  --r-5: 18px;   /* feuilles et popovers */
  --r-pilule: 999px;

  --ombre-1: 0 1px 2px rgb(30 42 90 / 0.08), 0 1px 1px rgb(30 42 90 / 0.04);
  --ombre-2: 0 4px 14px -2px rgb(30 42 90 / 0.14), 0 1px 3px rgb(30 42 90 / 0.08);
  --ombre-3: 0 20px 48px -12px rgb(30 42 90 / 0.3), 0 6px 16px -4px rgb(30 42 90 / 0.12);
  --ombre-soulevee: 0 18px 36px -10px rgb(0 0 0 / 0.38), 0 4px 12px -2px rgb(0 0 0 / 0.2); /* copie glissée, inchangée */
  --reflet: none;
  --surface-haute: var(--panel);
  --voile: rgb(20 14 40 / 0.4);
}
/* Dans les deux blocs sombres (data-theme='sombre' et auto + prefers-color-scheme: dark) : */
  --ombre-1: 0 1px 2px rgb(0 0 0 / 0.3);
  --ombre-2: 0 4px 14px -2px rgb(0 0 0 / 0.45), 0 1px 3px rgb(0 0 0 / 0.3);
  --ombre-3: 0 24px 56px -12px rgb(0 0 0 / 0.6), 0 6px 16px -4px rgb(0 0 0 / 0.35);
  --reflet: inset 0 1px 0 rgb(255 255 255 / 0.06);
  --surface-haute: var(--card);
  --voile: rgb(10 6 22 / 0.6);
```

- `--ombre` disparaît (remplacée selon M18). `--rayon` devient un alias de `--r-3` le temps de la migration.
- Surfaces hautes : `box-shadow: var(--ombre-3), var(--reflet)`. Les blocs restent à `3px`, compacts : c'est une exception assumée de la grille.

### T3. Matériaux (M3, M5, M6, M15)

```css
:root {
  --materiau-fin: color-mix(in srgb, var(--bg) 72%, transparent);            /* en-têtes collants */
  --materiau-epais: color-mix(in srgb, var(--surface-haute) 82%, transparent); /* barres d'actions flottantes */
  --flou-fin: blur(12px) saturate(160%);
  --flou-epais: blur(20px) saturate(180%);
}
.grille-tete, .mois-entete, .ecran-reglages .ecran-entete {
  background: var(--materiau-fin);
  -webkit-backdrop-filter: var(--flou-fin);
  backdrop-filter: var(--flou-fin);
}
.barre-selection, .verif-pied {
  background: var(--materiau-epais);
  -webkit-backdrop-filter: var(--flou-epais);
  backdrop-filter: var(--flou-epais);
}

/* Replis (M5) : opaques, sans flou ; bord défini si le contraste est augmenté. */
@media (prefers-reduced-transparency: reduce) {
  .grille-tete, .mois-entete, .ecran-reglages .ecran-entete { background: var(--bg); -webkit-backdrop-filter: none; backdrop-filter: none; }
  .barre-selection, .verif-pied { background: var(--surface-haute); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  /* mêmes règles que ci-dessus */
}
@media (prefers-contrast: more) {
  .grille-tete, .mois-entete, .ecran-reglages .ecran-entete,
  .barre-selection, .verif-pied { background: var(--surface-haute); -webkit-backdrop-filter: none; backdrop-filter: none; border-color: var(--ink); }
  .barre-selection { border: 1px solid var(--ink); }
  .grille-tete, .mois-entete { border-bottom: 1px solid var(--ink); }
}
```

- **Jamais translucide sur translucide :** la barre de sélection flotte sur la grille (opaque) ; les toasts restent pleins ; aucun matériau ne passe sur un autre.
- **Lisibilité sur matériau :** les textes de `.grille-tete` sont déjà en gras (`b`, 700) ; les libellés gris (`--muted`) de l'en-tête des jours passent en 500 (« vibrancy », [§12]).
- `contraste.mjs` : ajouter `texte de la barre de sélection` sur `--card` à 82 % (sombre) et `--ink` sur `--materiau-fin` composé sur un surligneur à 85 % (cas le plus clair sous l'en-tête).

---

## Notes pour la tâche 15

- Après H1, H3 et H4, `node scripts/contraste.mjs` doit couvrir les nouvelles paires : `--rouge-texte` sur `--bg`, `--panel`, `--field`, bac ; texte sur `--rouge-texte` ; ink et muted sur `--surface-haute` ; pastilles du mois sur `--charge-encre` × `--charge-max`.
- M3 et M15 touchent des zones qui défilent sous `contain: strict` (`dnd.css`) : vérifier la fluidité du glisser avec défilement automatique sur iPad avant de garder le flou ; sinon, repli opaque avec l'ombre de bord seule.
- M4 et M14 changent des libellés ou des visibilités lus par les e2e (`calendrier.spec.ts:257`, `bibliotheque.spec.ts` « Retour »).
- Captures après correction : mêmes noms, préfixe `apres-`, puis ajout d'une section avant / après à ce document (étape 3 de la tâche 15).
