# 50cc LIFE — Architecture et choix techniques

Ce document explique **comment le jeu est construit et pourquoi**. Il évolue à
chaque étape.

## 1. Contraintes du projet

1. Outils 100 % gratuits, sans Unity ni Unreal.
2. Un vrai jeu 3D interactif, pas un site web.
3. PC, Android et iOS, avec un seul code.
4. Optimisé pour les téléphones, **sans sacrifier la qualité PC**.
5. Grand monde ouvert chargé progressivement.
6. Architecture modulaire, développée fonctionnalité par fonctionnalité.

## 2. Pile technique

| Rôle | Outil | Version | Licence |
|---|---|---|---|
| Rendu 3D | Babylon.js (`@babylonjs/core`) | 9.37.0 | Apache-2.0 |
| Physique | Havok (`@babylonjs/havok`, WebAssembly) | 1.3.14 | MIT |
| Langage | TypeScript (compilateur natif 7.x) | 7.0.2 | Apache-2.0 |
| Outil de dev / build | Vite | 8.3.8 | MIT |
| Tests unitaires | Vitest | 5.1.0 | MIT |
| Tests navigateur | Playwright | 1.65.1 | Apache-2.0 |
| Interface | HTML / CSS natifs, sans framework | — | — |

Les versions sont **figées exactement** (`--save-exact`). Babylon publie
presque chaque semaine : on met à jour volontairement, tous les paquets
`@babylonjs/*` ensemble, puis on relance les tests.

## 3. Couches et règle de dépendance

```
 ui/  app/                      ← écrans, HUD, orchestration du jeu
   │
   ▼
 world/ player/ vehicles/ mechanics/ economy/ …   ← fonctionnalités
   │
   ▼
 core/                          ← moteur interne, sans gameplay
   │
   ▼
 Babylon.js · Havok · API du navigateur
```

- Une couche n'importe **que** les couches en dessous d'elle.
- `core/` ne connaît rien du gameplay (ni moto, ni argent).
- Les **modèles purs** (simulation moteur 2 temps, pièces, économie,
  résolution dynamique, détection de l'appareil…) n'importent pas Babylon.
  Ils sont testés dans Node en quelques millisecondes et pourront tourner
  dans un Web Worker si besoin.
- Les modules communiquent par le **bus d'événements typé**
  (`core/events/EventBus.ts`) plutôt qu'en s'important mutuellement.
- Chaque morceau de jeu est un **système** (`GameSystem`) avec `init`,
  `fixedUpdate`, `update` et `dispose`. Il reçoit un `GameContext` (moteur,
  scène, physique, bus, qualité…) : c'est une injection de dépendances
  simple, explicite et typée.

## 4. Arborescence

```
50cc-life/
├── index.html                 entrée du jeu (canvas + couche UI)
├── package.json · tsconfig*.json · vite.config.ts · playwright.config.ts
├── public/                    fichiers servis tels quels (icône, puis assets optimisés)
├── assets-src/                sources lourdes : HORS GIT (voir § 7)
├── tools/check-sizes.mjs      budgets de taille
├── .githooks/pre-commit       refuse les fichiers de plus de 10 Mo
├── docs/ARCHITECTURE.md       ce document
├── tests/
│   ├── unit/                  Vitest (modules purs)
│   └── e2e/                   Playwright (le jeu démarre sur PC + mobile émulé)
└── src/
    ├── main.ts                point d'entrée
    ├── app/                   Game (démarrage, systèmes, cycle de vie), événements
    ├── core/
    │   ├── engine/            création du moteur WebGL2
    │   ├── loop/              boucle à pas fixe
    │   ├── events/            bus d'événements typé
    │   ├── physics/           initialisation Havok
    │   ├── platform/          détection de l'appareil et du GPU
    │   ├── quality/           profils, résolution dynamique
    │   └── save/              préférences (puis sauvegardes IndexedDB)
    ├── world/                 environnement (ciel, lumière, ombres), scène de test
    ├── debug/                 statistiques, API pour les tests
    └── ui/                    écrans HTML/CSS, textes (i18n)
```

Dossiers prévus aux étapes suivantes : `core/input/` (actions clavier, souris,
manette, tactile), `core/assets/`, `core/audio/`, `world/streaming/`,
`player/`, `vehicles/{bike,simulation}/`, `mechanics/`, `economy/`,
`inventory/`, `garage/`, `data/` (pièces et motos décrites en données).

## 5. Boucle de jeu : pas fixe à 60 Hz

**Problème.** Si la physique avance au rythme de l'affichage, une moto se
comporte différemment à 144 i/s sur PC et à 30 i/s sur téléphone, et devient
instable quand l'affichage ralentit.

**Solution.** La simulation avance **toujours par pas de 1/60 s**. Pour ça, on
utilise le mode *deterministic lockstep* intégré à Babylon :

- `fixedUpdate(dt)` est appelé avant chaque pas de physique, de 0 à 4 fois par
  image selon le temps écoulé (4 au maximum, pour éviter la « spirale de la
  mort » sur un appareil lent). C'est là que vont la moto, le moteur et le
  gameplay.
- `update(dt)` est appelé une fois par image rendue, pour la caméra,
  l'interface et les effets.
- `engine.maxFPS` limite le nombre d'images par seconde selon le profil (30 en
  qualité basse) : moins de chauffe et de batterie consommée, avec une
  simulation inchangée.

*À surveiller :* sur un écran 120/144 Hz, un objet rapide peut sembler saccadé,
car la position n'est pas interpolée entre deux pas. On ajoutera une
interpolation visuelle à l'étape « moto » si on le constate.

## 6. Qualité graphique : un jeu, plusieurs réglages

| | Basse | Moyenne | Haute | Ultra |
|---|---|---|---|---|
| Plafond pixel ratio | 1 | 1,5 | 2 | 3 |
| Antialiasing | — | FXAA | MSAA | MSAA |
| Ombres | — | nettes 1024 | douces 2048 | douces 4096 |
| Distance de vue | 120 m | 250 m | 500 m | 900 m |
| Images/s visées | 30 | 60 | illimité | illimité |
| Résolution dynamique min. | 60 % | 60 % | 70 % | 85 % |

- **Détection automatique** au premier lancement, à partir du GPU (nom lu via
  WebGL), du type d'appareil et de la mémoire. Sur mobile, le maximum est
  « Moyenne ». « Ultra » n'est jamais choisi automatiquement.
- Le joueur peut changer de profil (choix mémorisé). Le jeu redémarre alors,
  car le MSAA est fixé à la création du contexte WebGL.
- **Résolution dynamique.** Si le jeu rame, la résolution baisse par paliers
  de 10 %. Elle remonte prudemment après une période stable. Si une remontée
  fait ramer, on revient en arrière et on attend deux fois plus longtemps
  avant de réessayer, parce qu'avec la synchro verticale la marge du GPU
  n'est pas mesurable directement. Le calcul se base sur la médiane de
  30 images, ce qui ignore les à-coups ponctuels.
- **Tone mapping** « Khronos PBR Neutral » : il respecte la vraie couleur des
  matériaux, comme une peinture de cyclo.
- **Brouillard** calé sur la distance de vue : il masquera le chargement
  progressif du monde.

## 7. Stockage gratuit : ce qui va où

Le principe : **Git ne contient que des fichiers légers.** Pas de Git LFS,
dont le quota gratuit (stockage et bande passante mensuelle) s'épuise vite,
car chaque version et chaque clone comptent.

| Type | Exemples | Emplacement |
|---|---|---|
| Code et données | `.ts`, `.json`, `.css` | Git |
| Assets optimisés du jeu | `.glb` compressés, `.ktx2`, `.ogg` | Git (`public/assets/`), dans le budget |
| Sources lourdes | `.blend`, textures 4K, `.wav`, `.psd` | **Hors Git** : `assets-src/` + sauvegarde cloud gratuite |
| Assets tiers CC0 | Poly Haven, ambientCG, Kenney… | Non stockés : manifeste (URL, licence, empreinte) + script de téléchargement |
| Build | `dist/` | Jamais commité, reconstruit par la CI |

### Budgets (vérifiés par `npm run check:sizes` et la CI)

| Budget | Limite | Raison |
|---|---|---|
| Un fichier dans Git | 10 Mio | L'historique Git est permanent |
| `public/assets/` au total | 300 Mio | Téléchargement sur mobile |
| Un fichier du build | 25 Mio | Limite par fichier de Cloudflare Pages |
| Build total | 500 Mio | Limite des jeux HTML5 sur itch.io |
| Démarrage transféré | < 8 Mio (objectif) | Temps de chargement sur 4G |

Au démarrage de l'étape 0, le build pèse **4,1 Mio, soit environ 1,1 Mio
transféré** (Havok WASM : 2 Mio bruts).

Un jeu léger est **la même contrainte** que la performance mobile. Pour rester
dans les budgets : génération procédurale (terrain, routes, placement de la
végétation), textures répétables et partagées, compression (meshopt, KTX2,
Opus) et instanciation.

### Garde-fous

1. `.gitignore` exclut les formats sources lourds et `assets-src/`.
2. `.githooks/pre-commit` refuse tout fichier de plus de 10 Mo. Il s'active
   une fois avec `npm run hooks:install`.
3. La CI échoue si un budget est dépassé.

## 8. Hébergement gratuit (à mettre en place plus tard)

| Hébergeur | Points clés |
|---|---|
| **Cloudflare Pages** (choix principal) | Gratuit, 20 000 fichiers, 25 Mio par fichier, en-têtes HTTP personnalisés possibles (utile pour la physique multithread) |
| GitHub Pages | Gratuit sur un dépôt public, site de 1 Go maximum, 100 Go par mois |
| itch.io | Visibilité auprès des joueurs ; 500 Mo et environ 1 000 fichiers : il faudra regrouper les morceaux du monde |

Distribution mobile : **PWA d'abord** (installation depuis le navigateur,
gratuite), puis **Capacitor** pour des applications Android/iOS. Les outils
sont gratuits ; seule la publication sur les stores est payante (Google Play :
25 $ une fois ; App Store : 99 $/an et un Mac).

## 9. Tests et intégration continue

- **Unitaires (Vitest)** : modules purs (bus d'événements, résolution
  dynamique, détection GPU, choix du profil…).
- **Démarrage (Playwright)** : sur le build de production, profils « PC » et
  « téléphone émulé ». Ils vérifient que le jeu démarre, que la physique
  avance (la caisse témoin tombe), que le bouton fonctionne et qu'il n'y a
  aucune erreur console.
- **CI GitHub Actions** (`.github/workflows/50cc-life.yml`) : types, tests,
  build, budgets, démarrage. Elle ne se déclenche que si `50cc-life/` change.
- *Limite :* la CI fait le rendu sans vrai GPU (SwiftShader). Les mesures de
  performance se font **sur de vrais appareils** : PC, Android d'entrée ou de
  milieu de gamme, iPhone.

## 10. Journal des décisions

| # | Décision | Raison |
|---|---|---|
| D1 | Sous-dossier `50cc-life/` dans le dépôt `le-qg` | Ne rien toucher au projet Le QG ; migration possible vers un dépôt dédié en gardant l'historique (`git subtree split`) |
| D2 | WebGL2 d'abord, WebGPU plus tard en option PC | WebGL2 est disponible partout ; WebGPU n'est pas encore universel sur mobile |
| D3 | Imports Babylon ciblés (`@babylonjs/core/…/fichier`) | Seul le code utilisé est inclus (bundle plus léger sur mobile) |
| D4 | Pas de temps fixe via le *lockstep* de Babylon | Physique identique sur tous les appareils, sans réinventer la roue |
| D5 | Résolution gérée par le jeu (`adaptToDeviceRatio: false`) | Plafond par profil + résolution dynamique |
| D6 | Interface en HTML/CSS natif, sans framework | Léger, accessible, aucune dépendance |
| D7 | Code en anglais, textes du jeu en français via `ui/i18n` | Convention du code, traduction possible plus tard |
| D8 | Pas de Git LFS, sources lourdes hors Git | Rester gratuit sans quota à surveiller |
| D9 | TypeScript 7 (compilateur natif) | Vérification des types beaucoup plus rapide ; Vite et Vitest ne dépendent pas de son API |

## 11. Feuille de route

0. ✅ **Fondations** : moteur, physique, boucle, profils de qualité, stats, tests, CI.
1. **Joueur** : déplacement à la première personne, abstraction des entrées (clavier/souris + tactile), interaction.
2. **Prototype moto conduisible** (le risque technique n°1, traité tôt).
3. **Streaming** des morceaux du monde + origine flottante.
4. **Garage et pièces** : démontage et remontage, piloté par les données.
5. **Simulation moteur 2 temps** reliée à la conduite.
6. **Économie, inventaire, sauvegarde** (IndexedDB).
7. Ensuite : chaîne d'assets semi-réalistes, audio, PWA, Capacitor, contenu.
