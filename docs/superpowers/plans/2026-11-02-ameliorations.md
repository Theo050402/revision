# Améliorations après recette : plan d'implémentation

> **Pour les agents :** sous-skill OBLIGATOIRE : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Cases à cocher (`- [ ]`) pour le suivi. Pour toute tâche d'interface (C, D, E), charger aussi le skill `apple-design`.

**Objectif :** rendre l'export fiable, appliquer les réglages aux créneaux à venir, ajouter « Vider le planning », donner au glisser le ressenti de Calendrier d'Apple, ajouter la sélection au lasso, puis aligner tout le design sur `apple-design`.

**Architecture :** la logique nouvelle reste pure et testée sous Node (`src/domain/recalcul.ts`, `src/domain/selection.ts`, `src/ui/mouvement/ressort.ts`). Le glisser garde son principe « lâcher = aperçu » (`apercu`/`deposer`) ; seule sa présentation change (copie flottante libre + emplacement d'atterrissage animé par ressorts). Les nouvelles opérations sur les créneaux passent par `appliquer` (annulables), les recalculs par `appliquerSansHistorique(f, { viderHistorique: true })`.

**Pile :** inchangée (React 18, TypeScript, Vite, zustand, Dexie, @dnd-kit/core, Vitest, Playwright WebKit). Aucune nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-11-02-ameliorations-design.md` (à lire en entier ; les § cités y renvoient), sur la base de `docs/superpowers/specs/2026-10-28-planning-revisions-design.md`.

## Contraintes globales

- Travail sur `main`, un commit par étape logique ; aucun push sans accord de l'utilisateur.
- Coût nul ; aucune requête réseau à l'exécution ; JavaScript initial ≤ 250 Ko gzip.
- Cibles tactiles ≥ 44 px (exceptions existantes : blocs du calendrier et poignée de durée) ; focus visible ; contraste AA (`node scripts/contraste.mjs` doit sortir 0) ; `prefers-reduced-motion` respecté.
- Mouvements : `transform` et `opacity` uniquement ; ressorts du module `ressort` (pas de transition CSS pour ce qui suit un geste).
- Textes de l'interface en français, à la casse de phrase ; textes de la spec repris mot pour mot.
- Chaque tâche finit avec `npm test`, `npx tsc --noEmit` et les e2e touchés au vert ; e2e complet (`npm run e2e`) en fin de chantier.
- Commits : `git -c user.name="Théo Ravon" -c user.email="theo.ravon@cpe.fr" commit`, dernière ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, chemins explicites (jamais `items_edn.md` ni de PDF).

## Points de vigilance

1. **Recalcul un jour de changement d'heure** (25 oct. 2026, 28 mars 2027) : les heures restent des chaînes locales naïves, aucune heure ne glisse d'une heure. Test dans la tâche 3.
2. **Recalcul avec un créneau déjà hors des bornes de la journée** (bornes resserrées) : un créneau inchangé ne bouge pas et ne part pas dans « À placer ». Test dans la tâche 3.
3. **Lasso puis défilement de la grille** : le rectangle et les créneaux touchés restent justes quand la grille défile pendant le tracé (coordonnées en minutes, pas en pixels écran). Test dans la tâche 10.
4. **Annuler après un déplacement de groupe d'éléments déjà exportés** : un seul pas d'annulation, comptabilité d'export réconciliée (`reconcilierExport`). Test dans la tâche 11.
5. **Fermer l'app pendant la question d'export** : à la réouverture rien n'est marqué et l'export reste proposé. Test dans la tâche 1.

---

## Chantier A

### Tâche 1 : export confirmé par Emma

**Fichiers :** modifier `src/ui/export/FeuilleExport.tsx`, `src/ui/export/export.css`, `src/domain/actions-etat.ts` (retirer `annulerMarquage` et `EnvoyeAvant`), `docs/superpowers/notes/export-ios.md` ; tests `tests/unit/actions-etat.test.ts`, `tests/e2e/export.spec.ts`.

**Interfaces :** consomme `marquerExporte(e, envoyes: Envoye[])`, `viderSuppressions`, `creneauxExportes`, `evenementsExport`, `appliquerSansHistorique`.

- [ ] **Étape 1 : e2e qui échouent** (iPad et iPhone)
  - `télécharger ne marque rien` : 2 créneaux posés → « Ajouter au Calendrier » → téléchargement reçu → badge toujours 2 → la question « Calendrier a bien enregistré ces 2 créneaux ? » est visible.
  - `« Oui, c'est fait » marque` : → badge disparu, toast « 2 créneaux envoyés au Calendrier ».
  - `« Non » ne marque rien` : badge 2, bouton « Ajouter au Calendrier » de retour.
  - `fermer sans répondre` : « Fermer » → rouvrir la feuille → pas de question, badge 2 ; recharger la page → badge 2 (point de vigilance 5).
  - `repartir d'un calendrier vide` : question « Calendrier contient bien tout le planning ? » ; « Oui » vide aussi les suppressions en attente.
  - `le bouton qui ferme la feuille s'appelle « Fermer »`.
- [ ] **Étape 2 : lancer** `npx playwright test tests/e2e/export.spec.ts` → échecs attendus.
- [ ] **Étape 3 : implémenter**
  - État local de la feuille : `enAttente: { portee: Portee | 'vide'; envoyes: Envoye[] } | null`, posé après une livraison `'telechargement'` ou `'partage'` (rien sur `'annule'`), avec les versions capturées au moment du fichier.
  - « Oui, c'est fait » → `appliquerSansHistorique(e => marquerExporte(e, envoyes))` (+ `viderSuppressions` pour `'vide'`) ; toast existant « n créneaux envoyés au Calendrier ». « Non » → `enAttente = null`.
  - Supprimer « Remettre à envoyer », `annulerMarquage`, `EnvoyeAvant` et leurs tests.
  - Bouton de fermeture : bouton texte « Fermer ».
  - `export-ios.md` : section « ✓ d'iOS : ferme l'écran d'import, ne prouve rien » et la nouvelle règle.
- [ ] **Étape 4 : lancer** l'e2e export, `npm test`, `npx tsc --noEmit` → vert.
- [ ] **Étape 5 : commit** `fix(export): marquer « envoyé » seulement après confirmation`

---

## Chantier B

### Tâche 2 : replacement après recalcul (logique pure)

**Fichiers :** créer `src/domain/recalcul.ts` ; test `tests/unit/recalcul.test.ts`.

**Interfaces :**
- Consomme : `dureeTour`, `decouper`/`arrondiPas` (`duration.ts`), `vueJour` (`jour.ts`), le module `temps`.
- Produit :
  ```ts
  export type PorteeRecalcul = { collegeId?: string; itemIds?: string[] }   // absent = tous
  export type BilanRecalcul = { recalcules: number; deplaces: number; versBac: number }
  export function recalculerCreneaux(e: Etat, aujourdhui: string, portee?: PorteeRecalcul): { etat: Etat; bilan: BilanRecalcul }
  export function messageRecalcul(b: BilanRecalcul): string | null
  ```

- [ ] **Étape 1 : tests qui échouent** (réglages par défaut, journée 07:00–23:00, pas 15)
  - `nouvelle durée` : item de 16 p, T1, rythme passé à 45 min / 8 p → durée 90 (au lieu de 120) ; `version` +1.
  - `chevauchement poussé` : A 14:00 (devient 150 min), B 15:30 → B à 16:30 ; `deplaces` = 1.
  - `trou conservé` : A 09:00, B 14:00, A s'allonge sans atteindre 14:00 → B reste à 14:00.
  - `raccourcissement sans remontée` : B garde son heure.
  - `saut d'indisponibilité` : B poussé dans une indispo 17:00–18:00 → B à 18:00.
  - `débordement vers À placer` : un créneau poussé au-delà de 23:00 → `debut` null, `versBac` 1.
  - `intacts` : « Fait », `dureePerso`, créneau d'hier → inchangés (même référence).
  - `parties` : item en 2 parties, total recalculé 300 → chaque partie 150 ; nombre de parties conservé.
  - `bac recalculé sans placement`.
  - `portée collège` : seuls les créneaux de ce collège changent de durée (les autres peuvent être poussés).
  - `hors bornes inchangé` (vigilance 2) : créneau 23:15–23:45 non recalculé, journée finissant à 23:00 → reste en place.
  - `changement d'heure` (vigilance 1) : jour 2026-10-25 et 2027-03-28 → heures attendues exactes.
  - `messageRecalcul` : `{3,2,1}` → « 3 créneaux recalculés · 2 déplacés · 1 mis dans À placer » ; `{1,0,0}` → « 1 créneau recalculé » ; `{0,0,0}` → `null`.
- [ ] **Étape 2 : lancer** `npx vitest run tests/unit/recalcul.test.ts` → échec (module absent).
- [ ] **Étape 3 : implémenter** selon la spec B.2 et B.3 (curseur à minuit, `max(heure actuelle, curseur)`, saut d'indisponibilité en boucle, « À placer » seulement pour un créneau changé qui dépasse la fin de journée). Ne renvoyer de nouveaux objets que pour les créneaux changés.
- [ ] **Étape 4 : lancer** → vert.
- [ ] **Étape 5 : commit** `feat(domain): recalcul des créneaux à venir après un changement de réglage`

### Tâche 3 : déclencher le recalcul

**Fichiers :** modifier `src/ui/screens/reglages/Durees.tsx`, la section Journée (pas) de `src/ui/screens/Reglages.tsx`, `src/ui/screens/reglages/Colleges.tsx` (coefficient), `src/ui/screens/Import.tsx` (réimport), `src/ui/export/FeuilleExport.tsx` (« Repartir d'un calendrier vide » déplié si > 10 modifiés) ; e2e `tests/e2e/reglages.spec.ts`.

**Interfaces :** consomme `recalculerCreneaux`, `messageRecalcul`, `appliquerSansHistorique(f, { viderHistorique: true })`, `toast`.

- [ ] **Étape 1 : e2e qui échouent**
  - `durées recalcule les créneaux à venir` : créneau de 16 p demain 14:00 (2h00) + créneau suivant à 16:00 → Durées « 45 min pour 8 pages » → Enregistrer → bloc de 1h30, le suivant inchangé à 16:00, toast « 1 créneau recalculé », ↶ désactivé.
  - `coefficient d'un collège` : seuls ses créneaux changent.
  - `pas` : passer à 10 → durées arrondies au pas de 10.
  - `réimport` : un item passé de 16 à 24 p → son créneau à venir s'allonge.
  - `rien à recalculer` : pas de toast.
- [ ] **Étape 2 : lancer** → échecs.
- [ ] **Étape 3 : implémenter** : chaque enregistrement concerné applique `modifierReglages`/`modifierCollege`/`reimporterCollege` puis `recalculerCreneaux` (date du jour de Paris via `utcVersLocal`) dans un seul `appliquerSansHistorique(…, { viderHistorique: true })` ; toast `messageRecalcul` s'il n'est pas `null`. Feuille d'export : `<details open>` sur « Repartir d'un calendrier vide » si plus de 10 créneaux modifiés.
- [ ] **Étape 4 : lancer** → vert.
- [ ] **Étape 5 : commit** `feat(reglages): les réglages de durée s'appliquent aux créneaux à venir`

### Tâche 4 : « Vider le planning »

**Fichiers :** modifier `src/domain/actions-creneaux.ts` (ajouter `viderPlanning`), `src/ui/screens/Reglages.tsx` (section Données), réutiliser `src/ui/feuilles/FeuilleConfirmation.tsx` ; tests `tests/unit/actions-creneaux.test.ts`, `tests/e2e/reglages.spec.ts`.

**Interfaces :** produit `viderPlanning(e: Etat): Etat` (supprime tous les créneaux, placés et « À placer », avec les suppressions en attente des exportés, comme `supprimerCreneau`).

- [ ] **Étape 1 : tests qui échouent**
  - unitaire : 3 créneaux dont 1 exporté → 0 créneau, 1 suppression en attente ; collèges, items, indispos, réglages : mêmes références.
  - e2e : bouton rouge « Vider le planning » désactivé sans créneau ; avec 3 créneaux → confirmation « Supprimer les 3 créneaux du planning ? Les collèges, les indisponibilités et les réglages sont conservés. » → bouton destructif → grille vide → ↶ les ramène. Avec un créneau exporté, la ligne « Ils sont aussi dans ton Calendrier : le plus simple est ensuite de supprimer le calendrier « Révisions » et de le recréer. » est présente.
- [ ] **Étape 2 : lancer** → échecs.
- [ ] **Étape 3 : implémenter** (`appliquer(viderPlanning)` ; couleur `--now` pour le bouton et l'action destructive).
- [ ] **Étape 4 : lancer** → vert ; e2e complet.
- [ ] **Étape 5 : commit** `feat(reglages): vider le planning`

---

## Chantier C (charger le skill `apple-design`)

### Tâche 5 : module de ressorts

**Fichiers :** créer `src/ui/mouvement/ressort.ts` ; test `tests/unit/ressort.test.ts`.

**Interfaces :** produit
```ts
export type ParamsRessort = { amortissement: number; reponse: number }   // reponse en secondes
export const RESSORT_DOUX: ParamsRessort        // { amortissement: 1, reponse: 0.25 }
export const RESSORT_RAPIDE: ParamsRessort      // { amortissement: 1, reponse: 0.18 }
export const RESSORT_FEUILLE: ParamsRessort     // { amortissement: 0.8, reponse: 0.3 }
export function pasRessort(x: number, v: number, cible: number, p: ParamsRessort, dt: number): { x: number; v: number }
export function projeter(vitesse: number, deceleration?: number): number       // (v/1000)·d/(1−d), d = 0.998
export type Anim = { vers(cible: number, vitesse?: number): void; arreter(): void; valeur(): number }
export function animerValeur(depart: number, p: ParamsRessort, appliquer: (x: number) => void): Anim   // rAF ; repart de la valeur courante
export function mouvementReduit(): boolean
```
Raideur `k = (2π/reponse)²`, amortissement `c = 4π·amortissement/reponse` (masse 1) ; intégration semi-implicite à pas fixe 1/120 s.

- [ ] **Étape 1 : tests qui échouent** : convergence à ±0,5 en moins de 4×`reponse` ; amortissement 1 sans dépassement ; 0,8 dépasse ; changer de cible en cours repart de la valeur courante sans saut ; une vitesse initiale de 2000 px/s fait dépasser l'arrivée plus tard qu'à 0 ; `projeter(1000)` ≈ 499.
- [ ] **Étape 2 : lancer** → échec.
- [ ] **Étape 3 : implémenter.** `animerValeur` utilise `requestAnimationFrame` (injectable pour les tests) ; si `mouvementReduit()`, `vers` saute directement à la cible.
- [ ] **Étape 4 : lancer** → vert.
- [ ] **Étape 5 : commit** `feat(ui): module de ressorts`

### Tâche 6 : retour haptique

**Fichiers :** créer `src/ui/mouvement/haptique.ts` ; test `tests/unit/haptique.test.ts`.

**Interfaces :** produit `haptique(motif: 'leger' | 'succes' | 'erreur'): void`.

- [ ] **Étape 1 : tests qui échouent** (environnement simulé) : avec `navigator.vibrate` → appelé (`10`, `[10, 40, 10]` pour succès, `[20, 60, 20]` pour erreur) ; sans, un `<input type="checkbox" switch>` caché (aria-hidden, hors écran) est créé une fois et basculé (`label.click()`) : 1 fois pour léger, 2 pour succès et erreur (60 ms d'écart) ; jamais d'exception.
- [ ] **Étape 2 : lancer** → échec. **Étape 3 : implémenter.** **Étape 4 : lancer** → vert.
- [ ] **Étape 5 : commit** `feat(ui): retour haptique`

### Tâche 7 : glisser fluide

**Fichiers :** modifier `src/ui/dnd/ContexteDnd.tsx`, `src/ui/dnd/glisse.ts`, `src/ui/dnd/cibles.ts`, `src/ui/dnd/dnd.css`, `src/ui/calendrier/Grille.tsx`, `src/ui/calendrier/Bloc.tsx` ; créer `src/ui/dnd/CopieFlottante.tsx`, `src/ui/dnd/Atterrissage.tsx` ; e2e `tests/e2e/dnd.spec.ts`.

**Interfaces :** consomme `animerValeur`, `RESSORT_DOUX`, `RESSORT_RAPIDE`, `haptique`, `lire`, `apercu`, `deposer` (inchangés : « lâcher = aperçu »).

- [ ] **Étape 1 : e2e qui échouent** (iPad)
  - `copie continue` : pendant un glisser du lundi au mercredi, la copie flottante prend des positions horizontales intermédiaires (au moins une entre deux colonnes) : elle n'est plus magnétisée.
  - `emplacement d'atterrissage` : `[data-atterrissage]` présent dans la colonne visée, à l'heure magnétisée ; identique au résultat du lâcher (heure et jour).
  - `colonne éclairée` : la colonne visée porte `data-visee`, son en-tête aussi ; aucune autre.
  - `étiquette d'heure` : « mer. 4 · 14h30 → 15h30 » visible pendant le glisser.
  - `refus` : sur un stage, `[data-atterrissage][data-refus]` ; au lâcher, la copie revient à son origine et rien ne change.
  - `origine atténuée` : le bloc d'origine a l'opacité 0,35 pendant le glisser.
  - `mouvement réduit` : aucune animation en cours sur la copie ni l'emplacement.
- [ ] **Étape 2 : lancer** → échecs.
- [ ] **Étape 3 : implémenter** selon la spec C.1 à C.3 :
  - saisie : `haptique('leger')`, soulèvement (échelle 1,04, ombre) et frémissement ±1,5° sur 250 ms puis −1,5° ;
  - la `DragOverlay` devient la copie flottante collée au doigt avec le décalage de saisie (aucun magnétisme) ;
  - l'emplacement d'atterrissage est rendu dans la colonne visée et animé par `RESSORT_RAPIDE` ; colonne `data-visee` avec teinte d'accent 8 % en fondu ;
  - cascade : les décalages `translateY` des blocs poussés passent par `animerValeur` au lieu de la transition CSS ;
  - lâcher : la copie rejoint l'emplacement par `RESSORT_DOUX` en héritant de la vitesse (historique des 5 derniers `pointermove`) puis disparaît ; `haptique('succes')` ; refus ou lâcher hors cible : retour à l'origine, `haptique('erreur')` pour un refus.
- [ ] **Étape 4 : lancer** l'e2e dnd (iPad et iPhone) → vert ; mesure de fluidité Chrome CPU ×4 : aucune tâche > 50 ms (noter le chiffre dans le rapport).
- [ ] **Étape 5 : commit** `feat(dnd): copie flottante libre, emplacement d'atterrissage et colonne éclairée`

### Tâche 8 : bords de la grille pendant un glisser

**Fichiers :** modifier `src/ui/dnd/ContexteDnd.tsx`, `src/ui/calendrier/Calendrier.tsx` ; créer `src/ui/dnd/bords.ts` ; tests `tests/unit/bords.test.ts`, `tests/e2e/dnd.spec.ts`.

**Interfaces :** produit `vitesseDefilement(distanceAuBord: number, zone = 64, max = 900): number` (px/s, 0 hors zone, croissante en approchant) et `useMaintienBord(onChange: (sens: -1 | 1) => void, delai = 600)`.

- [ ] **Étape 1 : tests qui échouent** : unitaire de `vitesseDefilement` (0 à 64 px, max au bord, monotone) ; e2e : maintenir le doigt contre le bord droit 600 ms pendant un glisser → semaine suivante, le glisser continue, dépôt possible ; contre le bas → la grille défile.
- [ ] **Étapes 2 à 4 : lancer, implémenter, lancer** (haptique `leger` au changement de semaine ; vue Jour : jour suivant).
- [ ] **Étape 5 : commit** `feat(dnd): défilement et changement de semaine aux bords`

### Tâche 9 : détails natifs partout

**Fichiers :** modifier `src/ui/ui.css`, `src/ui/Feuille.tsx`, `src/ui/calendrier/Calendrier.tsx` (balayage de semaine), feuilles CSS des écrans ; e2e `tests/e2e/coque.spec.ts`, `tests/e2e/accessibilite.spec.ts`.

- [ ] **Étape 1 : e2e qui échouent** : un bouton pressé (`pointerdown` maintenu) a une échelle < 1 avant le relâchement ; feuille iPhone : glisser vers le bas de plus de 30 % de sa hauteur (ou rapidement) la ferme ; iPad : le popover a `transform-origin` sur le bouton déclencheur ; balayage de semaine : la grille suit le doigt (translateX intermédiaire) avant de se poser ; mouvement réduit : rien de tout cela n'anime (fondu 150 ms).
- [ ] **Étapes 2 à 4 : lancer, implémenter (spec C.6, ressorts `RESSORT_FEUILLE` et projection de vitesse pour la feuille), lancer** ; e2e complet.
- [ ] **Étape 5 : commit** `feat(ui): retours dès l'appui, feuilles et balayage à ressort`

---

## Chantier D (charger le skill `apple-design`)

### Tâche 10 : sélection et dépôt de groupe (logique pure)

**Fichiers :** créer `src/domain/selection.ts` ; test `tests/unit/selection.test.ts`.

**Interfaces :** produit
```ts
export type Zone = { jourDebut: string; jourFin: string; debut: number; fin: number }   // minutes, bornes incluses côté jour
export function creneauxDansZone(e: Etat, z: Zone): string[]                            // créneaux placés qui touchent la zone ; jamais d'indispo
export function deplacerGroupe(e: Etat, ids: string[], decalageJours: number, decalageMinutes: number): Res
export function supprimerGroupe(e: Etat, ids: string[]): Etat
```
`Res` vient de `actions-creneaux.ts`.

- [ ] **Étape 1 : tests qui échouent**
  - `zone sur plusieurs jours` : créneaux lun. 9h et mer. 14h, zone lun.→mer. 8h–15h → les 2 ; un créneau qui touche à peine le bord est inclus ; une indispo dans la zone n'y est pas.
  - `zone exprimée en minutes` (vigilance 3) : même résultat quel que soit le défilement (la fonction ne reçoit que des minutes).
  - `déplacer accepté` : 2 créneaux décalés de +1 jour et +30 min → nouvelles heures, `version` +1 chacun, autres références intactes.
  - `refus` : un membre tomberait sur une indispo, sur un créneau non sélectionné, ou hors journée → `{ ok: false }`.
  - `groupe se chevauchant lui-même` : les membres peuvent se suivre sans conflit entre eux.
  - `supprimerGroupe` : suppressions en attente pour les exportés seulement.
- [ ] **Étapes 2 à 4 : lancer, implémenter, lancer.**
- [ ] **Étape 5 : commit** `feat(domain): sélection par zone et dépôt de groupe`

### Tâche 11 : lasso et mode sélection

**Fichiers :** créer `src/ui/selection/useSelection.ts` (zustand : `ids: Set<string>`, `basculer`, `ajouter`, `vider`), `src/ui/selection/Lasso.tsx`, `src/ui/selection/BarreSelection.tsx`, `src/ui/selection/selection.css` ; modifier `src/ui/calendrier/Grille.tsx`, `src/ui/calendrier/Bloc.tsx`, `src/ui/App.tsx`, `src/ui/dnd/ContexteDnd.tsx` (l'appui long sur vide lance le lasso au lieu de l'indisponibilité) ; e2e `tests/e2e/selection.spec.ts`.

**Interfaces :** consomme `creneauxDansZone`, `supprimerGroupe`, `haptique`, `appliquer`, `toast`.

- [ ] **Étape 1 : e2e qui échouent** (iPad)
  - `lasso sur plusieurs jours` : appui long sur du vide lundi 8h, glisser jusqu'à mercredi 15h → rectangle visible, créneaux touchés `data-selectionne` en direct ; au lâcher, barre « 2 sélectionnés ».
  - `toucher ajoute ou retire` ; `toucher le vide ou ✕ quitte` ; Échap quitte ; un 2e lasso ajoute.
  - `supprimer` : « Supprimer » → créneaux retirés, toast « 2 créneaux supprimés », ↶ les ramène en un pas.
  - `défilement pendant le tracé` (vigilance 3) : la grille défile automatiquement au bas, la sélection reste juste.
  - `défilement simple` : un glisser sans appui long fait défiler la grille, sans lasso.
- [ ] **Étapes 2 à 4 : lancer, implémenter (spec D.1, D.2, D.4 ; barre translucide en bas, bouton Supprimer couleur `--now`), lancer.**
- [ ] **Étape 5 : commit** `feat(ui): sélection au lasso`

### Tâche 12 : déplacer un groupe

**Fichiers :** modifier `src/ui/dnd/ContexteDnd.tsx`, `src/ui/dnd/glisse.ts`, `src/ui/dnd/CopieFlottante.tsx`, `src/ui/dnd/Atterrissage.tsx` ; e2e `tests/e2e/selection.spec.ts`.

**Interfaces :** consomme `deplacerGroupe`, `useSelection`, modules de la tâche 7. La source de glisser gagne `{ type: 'groupe'; ids: string[]; ancre: string }`.

- [ ] **Étape 1 : e2e qui échouent** : appui long sur un créneau sélectionné puis glisser de +1 jour → toutes les copies suivent, un emplacement par créneau ; lâcher → tous déplacés, sélection conservée ; ↶ annule en un pas ; un groupe qui tomberait sur un stage est refusé et revient (vigilance 4 : avec un créneau exporté, ↶ après déplacement le remet « non modifié »).
- [ ] **Étapes 2 à 4 : lancer, implémenter (spec D.3), lancer** ; e2e complet.
- [ ] **Étape 5 : commit** `feat(dnd): déplacer une sélection en groupe`

### Tâche 13 : « + Indisponibilité »

**Fichiers :** créer `src/ui/feuilles/FeuilleNouvelleIndispo.tsx` ; modifier `src/ui/calendrier/Calendrier.tsx` (bouton dans la barre de navigation), retirer le tracé d'indisponibilité à l'appui long (`src/ui/dnd/ContexteDnd.tsx`, composants associés) ; e2e `tests/e2e/dnd.spec.ts`, `tests/e2e/selection.spec.ts`.

**Interfaces :** consomme `ajouterIndispo`, `useTrou` (emplacement libre touché en dernier), `appliquer`.

- [ ] **Étape 1 : e2e qui échouent** : bouton « + Indisponibilité » à côté d'« Aujourd'hui » → feuille Titre, Jour, Début, Fin préremplie (dernier emplacement touché, sinon aujourd'hui de l'heure suivante pendant 1 h) ; fin avant début → message en ligne, « Ajouter » désactivé ; « Ajouter » → bloc hachuré, ↶ le retire. Les anciens tests d'indisponibilité dessinée sont réécrits sur ce parcours.
- [ ] **Étapes 2 à 4 : lancer, implémenter (spec D.5), lancer** ; e2e complet.
- [ ] **Étape 5 : commit** `feat(ui): création d'indisponibilité par bouton`

---

## Chantier E (charger le skill `apple-design`)

### Tâche 14 : audit de design

**Fichiers :** créer `docs/superpowers/notes/audit-design.md`.

- [ ] **Étape 1 :** captures iPad et iPhone, clair et sombre (attendre > 300 ms après un changement de thème), de chaque écran listé en spec E (calendrier semaine/jour/mois, bibliothèque, fiche d'item, fiches créneau et indisponibilité, import et vérification, export, réglages, sélection, états vides, erreurs) dans `.superpowers/sdd/…/shots/audit-*.png`.
- [ ] **Étape 2 :** pour chaque écran, constats classés par axe de la grille E (1 à 6) : ce qui ne va pas, la règle `apple-design` en cause, la correction retenue, sa priorité (haute / moyenne / basse). Identité « Petits carreaux » et « Garde de nuit » conservée.
- [ ] **Étape 3 : commit** `docs: audit de design apple-design`

### Tâche 15 : corrections de design

**Fichiers :** feuilles CSS et composants désignés par l'audit ; `src/ui/theme/tokens.css` (échelle typographique, ombres, matériaux) ; e2e `tests/e2e/accessibilite.spec.ts`.

- [ ] **Étape 1 :** appliquer toutes les corrections de priorité haute et moyenne de l'audit ; les basses si elles ne changent pas l'identité.
- [ ] **Étape 2 :** ajouter à `accessibilite.spec.ts` : `prefers-reduced-transparency: reduce` → barres et feuilles opaques (`backdrop-filter: none`) ; `prefers-contrast: more` → bordures définies.
- [ ] **Étape 3 : vérifier** : `node scripts/contraste.mjs` sort 0 ; `npm test`, `npx tsc --noEmit`, `npm run build` (JS initial ≤ 250 Ko gzip), `npm run e2e` au vert ; nouvelles captures relues et ajoutées à l'audit (avant / après).
- [ ] **Étape 4 : commit** `style: passe de design apple-design`
